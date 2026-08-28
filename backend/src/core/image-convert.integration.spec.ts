import sharp from 'sharp';
import { spawnSync } from 'child_process';
import { mkdtempSync, existsSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertFile, resolveTargetFormat } from './convert';
import { ConversionError } from './errors';
import { FFMPEG_PATH } from './ffmpeg-binaries';
import { formatIdForSharpFormat } from './image-convert';

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

  it('png 壓縮模式（quality + palette）：輸出檔案明顯變小', async () => {
    const inputPath = join(workDir, 'sample-noisy.png');
    const outputLossless = join(workDir, 'sample-noisy-lossless.png');
    const outputCompressed = join(workDir, 'sample-noisy-compressed.png');

    // 用雜訊圖而非單色圖，單色圖不管有沒有 palette 量化都會被 PNG 壓到差不多小，
    // 沒辦法看出兩者差異
    const noise = Buffer.alloc(200 * 150 * 3);
    for (let i = 0; i < noise.length; i++)
      noise[i] = Math.floor(Math.random() * 256);
    await sharp(noise, { raw: { width: 200, height: 150, channels: 3 } })
      .png()
      .toFile(inputPath);

    await convertFile({
      inputPath,
      outputPath: outputLossless,
      targetFormatId: 'png',
    });
    await convertFile({
      inputPath,
      outputPath: outputCompressed,
      targetFormatId: 'png',
      tuning: { quality: 50 },
    });

    const losslessSize = statSync(outputLossless).size;
    const compressedSize = statSync(outputCompressed).size;
    expect(compressedSize).toBeLessThan(losslessSize);
  }, 15_000);

  it('formatIdForSharpFormat：sharp 偵測到的格式對應回 FORMATS id（壓縮模式自動選格式用）', () => {
    expect(formatIdForSharpFormat('jpeg')).toBe('jpg');
    expect(formatIdForSharpFormat('png')).toBe('png');
    expect(formatIdForSharpFormat('webp')).toBe('webp');
    expect(formatIdForSharpFormat('heif')).toBeUndefined();
  });

  describe('resolveTargetFormat（深模組介面測試）', () => {
    it('有帶 format：直接查表，不讀 image metadata', async () => {
      const inputPath = join(workDir, 'resolve-explicit.jpg');
      await generateSampleImage(inputPath);

      const resolved = await resolveTargetFormat(inputPath, 'webp');

      expect(resolved.targetFormat.id).toBe('webp');
      expect(resolved.imageMeta).toBeUndefined();
    });

    it('沒帶 format＋圖片：用來源格式自動當目標格式，回傳讀到的 imageMeta 供重用', async () => {
      const inputPath = join(workDir, 'resolve-compress.jpg');
      await generateSampleImage(inputPath);

      const resolved = await resolveTargetFormat(inputPath);

      expect(resolved.targetFormat.id).toBe('jpg');
      expect(resolved.imageMeta?.format).toBe('jpeg');
    });

    it('沒帶 format＋非圖片檔案：丟出 ConversionError(INVALID_INPUT)', async () => {
      const inputPath = join(workDir, 'resolve-video.mp4');
      generateSampleVideo(inputPath);

      await expect(resolveTargetFormat(inputPath)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('沒帶 format＋sharp 讀得出但不支援輸出的圖片格式（gif）：丟出 ConversionError(INVALID_INPUT)', async () => {
      const inputPath = join(workDir, 'resolve-gif.gif');
      const result = spawnSync(FFMPEG_PATH, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=16x16:d=1',
        '-frames:v',
        '1',
        inputPath,
      ]);
      expect(result.status).toBe(0);

      await expect(resolveTargetFormat(inputPath)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('明確指定不支援的格式：丟出 ConversionError(INVALID_INPUT)', async () => {
      const inputPath = join(workDir, 'resolve-bad-format.jpg');
      await generateSampleImage(inputPath);

      await expect(
        resolveTargetFormat(inputPath, 'does-not-exist'),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

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
