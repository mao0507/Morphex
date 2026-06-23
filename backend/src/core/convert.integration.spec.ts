import { spawnSync } from 'child_process';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertFile } from './convert';
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
});
