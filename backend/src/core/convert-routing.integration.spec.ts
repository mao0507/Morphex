import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertFile } from './convert';
import { FFMPEG_PATH } from './ffmpeg-binaries';

// 「這是什麼檔、交給哪個 engine、能轉成什麼」的路由規則，用小型真實 fixture 驗證
describe('轉檔路由 (整合測試，實際呼叫 sharp/ffmpeg/ffprobe)', () => {
  let workDir: string;

  function ffmpeg(args: string[]) {
    const result = spawnSync(FFMPEG_PATH, ['-y', '-v', 'error', ...args]);
    expect(result.status).toBe(0);
  }

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'morphex-route-'));
    const at = (name: string) => join(workDir, name);
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=16x16',
      '-frames:v',
      '1',
      at('static.png'),
    ]);
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=16x16',
      '-frames:v',
      '1',
      at('static.gif'),
    ]);
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=d=1:s=16x16:r=5',
      at('animated.gif'),
    ]);
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=d=1',
      '-i',
      at('static.png'),
      '-map',
      '0',
      '-map',
      '1',
      '-c:a',
      'libmp3lame',
      '-c:v',
      'png',
      '-disposition:v',
      'attached_pic',
      at('cover.mp3'),
    ]);
  });

  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  it.each([
    ['動態 gif → mp4', 'animated.gif', 'mp4', 'video'],
    ['動態 gif → gif', 'animated.gif', 'gif', 'video'],
    ['gif → png', 'static.gif', 'png', 'image'],
    ['帶封面的 mp3 → mp3', 'cover.mp3', 'mp3', 'audio'],
  ])(
    '%s：成功',
    async (_label, input, target, expectedKind) => {
      const outputPath = join(workDir, `${input}-to.${target}`);
      const result = await convertFile({
        inputPath: join(workDir, input),
        outputPath,
        targetFormatId: target,
      });
      expect(result.inputKind).toBe(expectedKind);
      expect(existsSync(outputPath)).toBe(true);
    },
    30_000,
  );

  it.each([
    ['靜態 png → mp4', 'static.png', 'mp4'],
    ['靜態 gif → mp4', 'static.gif', 'mp4'],
    ['mp3 → png', 'cover.mp3', 'png'],
  ])(
    '%s：UNSUPPORTED_COMBINATION',
    async (_label, input, target) => {
      await expect(
        convertFile({
          inputPath: join(workDir, input),
          outputPath: join(workDir, `${input}-bad.${target}`),
          targetFormatId: target,
        }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_COMBINATION' });
    },
    30_000,
  );
});
