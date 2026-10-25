import sharp from 'sharp';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertFile } from './convert';
import { FFMPEG_PATH } from './ffmpeg-binaries';
import { getFormatById } from './formats';
import { probeFile } from './probe';

// 格式工廠對標補上的輸出格式（BMP/ICO/MPG/AMR）、RMVB 來源，以及嘗試修復、影片翻轉，
// 用小型真實 fixture 驗證輸出內容
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
    // moov 在前、每 5 格一個關鍵格，砍掉後 40% 仍讀得到前段：模擬下載中斷的檔案
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=d=4:s=160x120:r=10',
      '-g',
      '5',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      at('full.mp4'),
    ]);
    const full = readFileSync(at('full.mp4'));
    writeFileSync(
      at('truncated.mp4'),
      full.subarray(0, Math.floor(full.length * 0.6)),
    );
    // 左半紅、右半藍的 1 秒影片：驗翻轉後左上角變藍
    const redBlue = Buffer.alloc(64 * 48 * 3);
    for (let i = 0; i < 64 * 48; i++) {
      redBlue.set(i % 64 < 32 ? [255, 0, 0] : [0, 0, 255], i * 3);
    }
    await sharp(redBlue, { raw: { width: 64, height: 48, channels: 3 } })
      .png()
      .toFile(at('red-blue.png'));
    ffmpeg([
      '-loop',
      '1',
      '-i',
      at('red-blue.png'),
      '-t',
      '1',
      '-pix_fmt',
      'yuv420p',
      at('red-blue.mp4'),
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

  // 這份截斷檔不勾修復也轉得過（ffmpeg 本來就會略過壞尾巴），所以只驗勾了修復
  // 能輸出、時長落在「有東西但不超過原片」的合理範圍
  it('repair：截斷的 mp4 仍輸出前段內容', async () => {
    const probe = await probeFile(
      await convert('truncated.mp4', 'mp4', { repair: true }),
    );
    const duration = Number(probe.format?.duration);
    expect(duration).toBeGreaterThan(0.5);
    expect(duration).toBeLessThanOrEqual(4);
  }, 30_000);

  it('flipHorizontal：影片左上角換成右半的藍色', async () => {
    const output = await convert('red-blue.mp4', 'mp4', {
      flipHorizontal: true,
    });
    const frame = spawnSync(FFMPEG_PATH, [
      '-v',
      'error',
      '-i',
      output,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ]).stdout;
    // 取 (8, 8)，避開邊緣的色度取樣誤差
    const [r, , b] = frame.subarray((8 * 64 + 8) * 3);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(100);
  }, 30_000);
});
