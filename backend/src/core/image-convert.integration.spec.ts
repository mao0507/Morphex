import sharp from 'sharp';
import { spawnSync } from 'child_process';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertFile } from './convert';
import { ConversionError } from './errors';
import { FFMPEG_PATH } from './ffmpeg-binaries';

// 這組測試實際呼叫本機 sharp/ffmpeg，驗證圖片 pipeline 跟既有影音 pipeline 的分流行為
describe('convertFile - 圖片 pipeline（整合測試）', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'convertflow-image-test-'));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  async function generateSampleImage(path: string) {
    await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 10, g: 120, b: 200 },
      },
    })
      .jpeg()
      .toFile(path);
  }

  function generateSampleVideo(path: string) {
    const result = spawnSync(FFMPEG_PATH, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=64x64:rate=10',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      path,
    ]);
    expect(result.status).toBe(0);
  }

  it('jpg 轉 webp：成功產出檔案，判定為 image', async () => {
    const inputPath = join(workDir, 'sample.jpg');
    const outputPath = join(workDir, 'sample.webp');
    await generateSampleImage(inputPath);

    const result = await convertFile({
      inputPath,
      outputPath,
      targetFormatId: 'webp',
    });

    expect(result.inputKind).toBe('image');
    expect(existsSync(outputPath)).toBe(true);
  }, 15_000);

  it('套用縮放與品質選項：輸出尺寸符合預期', async () => {
    const inputPath = join(workDir, 'sample-resize.jpg');
    const outputPath = join(workDir, 'sample-resize.png');
    await generateSampleImage(inputPath);

    await convertFile({
      inputPath,
      outputPath,
      targetFormatId: 'png',
      tuning: { resolution: '32x24', quality: 80 },
    });

    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(24);
  }, 15_000);

  it('圖片轉影片格式：丟出 ConversionError(UNSUPPORTED_COMBINATION)', async () => {
    const inputPath = join(workDir, 'sample-bad-target.jpg');
    await generateSampleImage(inputPath);
    const outputPath = join(workDir, 'sample-bad-target.mp4');

    await expect(
      convertFile({ inputPath, outputPath, targetFormatId: 'mp4' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_COMBINATION' });
  }, 15_000);

  it('影片轉圖片格式：丟出 ConversionError(UNSUPPORTED_COMBINATION)', async () => {
    const inputPath = join(workDir, 'sample.mp4');
    generateSampleVideo(inputPath);
    const outputPath = join(workDir, 'sample-from-video.jpg');

    await expect(
      convertFile({ inputPath, outputPath, targetFormatId: 'jpg' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_COMBINATION' });
  }, 15_000);

  it('損毀檔案：仍走原本 ffprobe 分支並丟出 PROBE_FAILED，而非誤判成圖片', async () => {
    const inputPath = join(workDir, 'broken.jpg');
    require('fs').writeFileSync(inputPath, 'not a real image file');
    const outputPath = join(workDir, 'broken-out.png');

    await expect(
      convertFile({ inputPath, outputPath, targetFormatId: 'png' }),
    ).rejects.toThrow(ConversionError);
  }, 15_000);
});
