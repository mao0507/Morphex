import { spawnSync } from 'child_process';
import { FFPROBE_PATH } from './ffmpeg-binaries';
import { mkdtempSync, existsSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  convertFile,
  prepareConversion,
  runPreparedConversion,
} from './convert';
import { ConversionError } from './errors';
import { FFMPEG_PATH } from './ffmpeg-binaries';

// 這組測試實際呼叫本機 ffmpeg/ffprobe，驗證 core 模組與真實二進位檔的整合行為
describe('convertFile (整合測試，需本機已安裝 ffmpeg/ffprobe)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'convertflow-test-'));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function generateSampleVideo(path: string) {
    const result = spawnSync(FFMPEG_PATH, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=64x64:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      path,
    ]);
    expect(result.status).toBe(0);
  }

  it('video 轉 webm：成功產出檔案', async () => {
    const inputPath = join(workDir, 'sample.mp4');
    const outputPath = join(workDir, 'sample.webm');
    generateSampleVideo(inputPath);

    const result = await convertFile({
      inputPath,
      outputPath,
      targetFormatId: 'webm',
    });

    expect(result.inputKind).toBe('video');
    expect(existsSync(outputPath)).toBe(true);
  }, 30_000);

  it('targetSizeMB：輸出不超過目標大小', async () => {
    const inputPath = join(workDir, 'sample-size.mp4');
    const outputPath = join(workDir, 'sample-size.mp4.out.mp4');
    generateSampleVideo(inputPath);

    await convertFile({
      inputPath,
      outputPath,
      targetFormatId: 'mp4',
      tuning: { targetSizeMB: 0.1 },
    });

    expect(statSync(outputPath).size).toBeLessThanOrEqual(0.1 * 1024 * 1024);
  }, 30_000);

  it('輸出超過目標大小：TARGET_SIZE_EXCEEDED', async () => {
    const inputPath = join(workDir, 'sample-over.mp4');
    const outputPath = join(workDir, 'sample-over.out.mp4');
    generateSampleVideo(inputPath);
    const prepared = await prepareConversion({
      inputPath,
      outputPath,
      targetFormatId: 'mp4',
    });
    // ponytail: 直接把上限壓到 1 byte，真實輸出必定超標
    const plan = { ...prepared.plan, maxBytes: 1 };

    await expect(
      runPreparedConversion({ ...prepared, plan }),
    ).rejects.toMatchObject({ code: 'TARGET_SIZE_EXCEEDED' });
  }, 30_000);

  it('video 轉 mp3：成功抽取音訊', async () => {
    const inputPath = join(workDir, 'sample2.mp4');
    const outputPath = join(workDir, 'sample2.mp3');
    generateSampleVideo(inputPath);

    const result = await convertFile({
      inputPath,
      outputPath,
      targetFormatId: 'mp3',
    });

    expect(result.inputKind).toBe('video');
    expect(existsSync(outputPath)).toBe(true);
  }, 30_000);

  it('損毀檔案：丟出 ConversionError(PROBE_FAILED)', async () => {
    const inputPath = join(workDir, 'broken.mp4');
    require('fs').writeFileSync(inputPath, 'not a real media file');
    const outputPath = join(workDir, 'broken-out.mp3');

    await expect(
      convertFile({ inputPath, outputPath, targetFormatId: 'mp3' }),
    ).rejects.toThrow(ConversionError);
  }, 15_000);

  it('不支援的目標格式：丟出 ConversionError(INVALID_INPUT)', async () => {
    const inputPath = join(workDir, 'sample3.mp4');
    generateSampleVideo(inputPath);
    const outputPath = join(workDir, 'sample3.out');

    await expect(
      convertFile({ inputPath, outputPath, targetFormatId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  }, 15_000);

  it('裁切 + 加速：只讀取裁切區間，輸出長度為區間 ÷ 倍率', async () => {
    const inputPath = join(workDir, 'long.wav');
    const outputPath = join(workDir, 'long-out.wav');
    const gen = spawnSync(FFMPEG_PATH, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=40',
      inputPath,
    ]);
    expect(gen.status).toBe(0);

    await convertFile({
      inputPath,
      outputPath,
      targetFormatId: 'wav',
      tuning: { trimStartSec: 5, trimEndSec: 15, speed: 2 },
    });

    const probe = spawnSync(FFPROBE_PATH, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      outputPath,
    ]);
    expect(Number(probe.stdout.toString())).toBeCloseTo(5, 0);
  }, 30_000);
});
