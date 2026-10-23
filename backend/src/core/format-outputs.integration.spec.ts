import sharp from 'sharp';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertFile } from './convert';
import { FFMPEG_PATH } from './ffmpeg-binaries';
import { getFormatById } from './formats';
import { probeFile } from './probe';

// 格式工廠對標補上的輸出格式（BMP/ICO/MPG/AMR）與 RMVB 來源，用小型真實 fixture 驗證輸出內容
// macOS 的 ffmpeg build 沒有 libopencore_amrnb，AMR 會被 FORMATS 濾掉
const itAmr = getFormatById('amr') ? it : it.skip;

describe('補充格式 (整合測試，實際呼叫 sharp/ffmpeg/ffprobe)', () => {
  let workDir: string;
  const at = (name: string) => join(workDir, name);

  function ffmpeg(args: string[]) {
    const result = spawnSync(FFMPEG_PATH, ['-y', '-v', 'error', ...args]);
    expect(result.status).toBe(0);
  }

  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'morphex-formats-'));
    // 40x20 非正方形、左半不透明紅、右半全透明：驗 ICO 補透明邊、BMP 白底
    const half = Buffer.alloc(40 * 20 * 4);
    for (let i = 0; i < 40 * 20; i++) {
      if (i % 40 < 20) half.set([255, 0, 0, 255], i * 4);
    }
    await sharp(half, { raw: { width: 40, height: 20, channels: 4 } })
      .png()
      .toFile(at('half.png'));
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=d=1:s=64x48:r=10',
      '-f',
      'lavfi',
      '-i',
      'sine=d=1:sample_rate=44100',
      '-shortest',
      '-pix_fmt',
      'yuv420p',
      at('clip.mp4'),
    ]);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=d=1', at('tone.wav')]);
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=d=1:s=64x48:r=10',
      '-c:v',
      'rv20',
      '-an',
      '-f',
      'rm',
      at('old.rmvb'),
    ]);
  }, 30_000);

  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  async function convert(input: string, target: string, tuning = {}) {
    const outputPath = at(`${input}-to.${target}`);
    await convertFile({
      inputPath: at(input),
      outputPath,
      targetFormatId: target,
      tuning,
    });
    return outputPath;
  }

  it('png → bmp：24-bit、尺寸不變、透明處補白', async () => {
    const bmp = readFileSync(await convert('half.png', 'bmp'));
    expect(bmp.toString('ascii', 0, 2)).toBe('BM');
    expect(bmp.readUInt32LE(2)).toBe(bmp.length);
    expect(bmp.readInt32LE(18)).toBe(40);
    expect(bmp.readInt32LE(22)).toBe(20);
    expect(bmp.readUInt16LE(28)).toBe(24);

    const rowSize = Math.ceil((40 * 3) / 4) * 4;
    const pixel = (x: number, y: number) => {
      const offset = bmp.readUInt32LE(10) + (19 - y) * rowSize + x * 3;
      return [bmp[offset + 2], bmp[offset + 1], bmp[offset]];
    };
    expect(pixel(0, 0)).toEqual([255, 0, 0]);
    expect(pixel(39, 0)).toEqual([255, 255, 255]);
  }, 30_000);

  it('png → ico：包含 16/32/48/256 四種尺寸，非正方形補透明邊', async () => {
    const ico = readFileSync(await convert('half.png', 'ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const entries = Array.from({ length: count }, (_, i) => {
      const base = 6 + i * 16;
      return {
        size: ico[base] || 256,
        bytes: ico.readUInt32LE(base + 8),
        offset: ico.readUInt32LE(base + 12),
      };
    });
    expect(entries.map((e) => e.size)).toEqual([16, 32, 48, 256]);

    const largest = entries[3];
    const png = ico.subarray(largest.offset, largest.offset + largest.bytes);
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([256, 256]);
    // contain：40x20 縮成 256x128 置中，上方 64 列是透明補邊
    expect(data[(10 * 256 + 128) * 4 + 3]).toBe(0);
    expect(data[(128 * 256 + 10) * 4]).toBe(255);
  }, 30_000);

  it('mp4 → mpg：MPEG-2 視訊 + MP2 音訊', async () => {
    const probe = await probeFile(await convert('clip.mp4', 'mpg'));
    const codecs = probe.streams.map((s) => s.codec_name).sort();
    expect(codecs).toEqual(['mp2', 'mpeg2video']);
  }, 30_000);

  itAmr(
    'wav → amr：AMR-NB、8kHz、單聲道',
    async () => {
      const probe = await probeFile(await convert('tone.wav', 'amr'));
      expect(probe.streams).toHaveLength(1);
      expect(probe.streams[0]).toMatchObject({
        codec_name: 'amr_nb',
        sample_rate: '8000',
        channels: 1,
      });
    },
    30_000,
  );

  itAmr.each([
    ['tone.wav', 'amr', 'sampleRateHz', { sampleRateHz: 44100 }],
    ['tone.wav', 'amr', 'audioChannels', { audioChannels: 2 }],
    ['tone.wav', 'amr', 'audioBitrateKbps', { audioBitrateKbps: 128 }],
  ])('%s → %s 搭配 %s：INVALID_INPUT', async (input, target, field, tuning) => {
    await expect(convert(input, target, tuning)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining(field) as string,
    });
  });

  it.each([
    ['clip.mp4', 'mpg', 'crf', { crf: 20 }],
    ['half.png', 'bmp', 'quality', { quality: 80 }],
    ['half.png', 'ico', 'resolution', { resolution: '64x64' }],
  ])('%s → %s 搭配 %s：INVALID_INPUT', async (input, target, field, tuning) => {
    await expect(convert(input, target, tuning)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining(field) as string,
    });
  });

  it('rmvb → mp4：RealMedia 來源可讀', async () => {
    const probe = await probeFile(await convert('old.rmvb', 'mp4'));
    expect(probe.streams.map((s) => s.codec_name)).toContain('h264');
  }, 30_000);
});
