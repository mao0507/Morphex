import { HttpException, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough, Writable } from 'stream';
import { ConversionError } from '../core/errors';
import {
  ConversionEngine,
  ConversionService,
  JOB_TTL_MS,
} from './conversion.service';

// 假 engine：prepare 依 targetFormatId 決定成功或失敗，run 由測試控制何時結束
function fakeEngine(opts: { failPrepare?: ConversionError } = {}) {
  let finishRun: (err?: Error) => void = () => {};
  const engine: ConversionEngine = {
    prepare({ outputPathFor }) {
      if (opts.failPrepare) return Promise.reject(opts.failPrepare);
      const outputPath = outputPathFor('mp3');
      return Promise.resolve({
        formatId: 'mp3',
        outputPath,
        run: async (onProgress) => {
          const finished = new Promise<void>((resolve, reject) => {
            finishRun = (err) => (err ? reject(err) : resolve());
          });
          onProgress(50);
          await writeFile(outputPath, 'converted');
          await finished;
        },
      });
    },
  };
  return { engine, finishRun: (err?: Error) => finishRun(err) };
}

// 背景 job 與檔案清除是非同步的，輪詢直到條件成立（真實磁碟 I/O，給 1 秒）
async function waitUntil(cond: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('條件逾時未成立');
}

const waitForStatus = (
  service: ConversionService,
  id: string,
  status: string,
) => waitUntil(() => service.getStatus(id).status === status);

const isEmpty = async (dir: string) => (await readdir(dir)).length === 0;

function collect(): { dest: Writable; done: Promise<string> } {
  const dest = new PassThrough();
  const chunks: Buffer[] = [];
  dest.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<string>((resolve) =>
    dest.on('end', () => resolve(Buffer.concat(chunks).toString())),
  );
  return { dest, done };
}

describe('ConversionService', () => {
  let root: string;
  let uploadsDir: string;
  let outputsDir: string;
  let clock: number;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'morphex-svc-'));
    uploadsDir = join(root, 'uploads');
    outputsDir = join(root, 'outputs');
    await mkdir(uploadsDir);
    await mkdir(outputsDir);
    clock = 1_000_000;
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  function makeService(engine: ConversionEngine) {
    return new ConversionService({
      engine,
      uploadsDir,
      outputsDir,
      now: () => clock,
    });
  }

  async function upload(name = 'input'): Promise<Express.Multer.File> {
    const path = join(uploadsDir, name);
    await writeFile(path, 'source');
    return { path } as Express.Multer.File;
  }

  it('完成並下載後，input 與 output 都被刪除，job 消失', async () => {
    const { engine, finishRun } = fakeEngine();
    const service = makeService(engine);
    const file = await upload();

    const { id } = await service.convert(file, 'mp3');
    await new Promise((r) => setImmediate(r));
    expect(service.getStatus(id).progress).toBe(50);
    finishRun();
    await waitForStatus(service, id, 'done');

    const download = await service.openDownload(id);
    expect(download.ext).toBe('mp3');
    const { dest, done } = collect();
    download.pipeTo(dest);
    expect(await done).toBe('converted');
    await waitUntil(() => isEmpty(outputsDir));

    expect(existsSync(file.path)).toBe(false);
    expect(await readdir(outputsDir)).toEqual([]);
    expect(() => service.getStatus(id)).toThrow(HttpException);
  });

  it('engine 執行失敗時刪除 input 與 output，status 帶錯誤碼', async () => {
    const { engine, finishRun } = fakeEngine();
    const service = makeService(engine);
    const file = await upload();

    const { id } = await service.convert(file, 'mp3');
    finishRun(new ConversionError('TIMEOUT', '轉檔逾時'));
    await waitForStatus(service, id, 'error');

    expect(service.getStatus(id).error).toEqual({
      code: 'TIMEOUT',
      message: '轉檔逾時',
    });
    expect(await readdir(uploadsDir)).toEqual([]);
    expect(await readdir(outputsDir)).toEqual([]);
  });

  it('prepare 失敗時刪除 input 並拋出帶 code 的 400', async () => {
    const { engine } = fakeEngine({
      failPrepare: new ConversionError('UNSUPPORTED_COMBINATION', '不支援'),
    });
    const service = makeService(engine);
    const file = await upload();

    const err = await service.convert(file, 'mp4').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(400);
    expect((err as HttpException).getResponse()).toEqual({
      code: 'UNSUPPORTED_COMBINATION',
      message: '不支援',
    });
    expect(existsSync(file.path)).toBe(false);
  });

  it('sweep 清掉過期 job 與未追蹤的孤兒檔，保留還在追蹤的檔案', async () => {
    const { engine, finishRun } = fakeEngine();
    const service = makeService(engine);
    const { id: oldId } = await service.convert(await upload('old'), 'mp3');
    finishRun();
    await waitForStatus(service, oldId, 'done');

    // 孤兒檔的 mtime 設成很久以前，sweep 用 mtime 判斷是否過期
    const ancient = new Date(0);
    const orphanUpload = join(uploadsDir, 'orphan');
    const orphanOutput = join(outputsDir, 'orphan.mp3');
    await writeFile(orphanUpload, 'x');
    await writeFile(orphanOutput, 'x');
    await utimes(orphanUpload, ancient, ancient);
    await utimes(orphanOutput, ancient, ancient);

    clock += JOB_TTL_MS + 1;
    const { id: freshId } = await service.convert(await upload('fresh'), 'mp3');
    finishRun();
    await waitForStatus(service, freshId, 'done');
    const [freshOutput] = await readdir(outputsDir).then((names) =>
      names.filter((n) => n.startsWith(freshId)),
    );
    await utimes(join(outputsDir, freshOutput), ancient, ancient);

    await service.sweep();

    expect(() => service.getStatus(oldId)).toThrow(HttpException);
    expect(service.getStatus(freshId).status).toBe('done');
    expect(await readdir(uploadsDir)).toEqual([]);
    expect(await readdir(outputsDir)).toEqual([freshOutput]);
  });

  it('下載中途中斷時保留 output，直到 TTL 過期', async () => {
    const { engine, finishRun } = fakeEngine();
    const service = makeService(engine);
    const { id } = await service.convert(await upload(), 'mp3');
    finishRun();
    await waitForStatus(service, id, 'done');

    const download = await service.openDownload(id);
    const dest = new PassThrough();
    download.pipeTo(dest);
    dest.destroy();
    await new Promise((r) => setImmediate(r));

    expect(service.getStatus(id).status).toBe('done');
    expect(await readdir(outputsDir)).toHaveLength(1);

    clock += JOB_TTL_MS + 1;
    await service.sweep();
    expect(await readdir(outputsDir)).toEqual([]);
  });
});
