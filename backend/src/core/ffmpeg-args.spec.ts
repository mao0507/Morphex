import { buildFfmpegArgs, validateCombination } from './ffmpeg-args';
import { getFormatById } from './formats';
import { ConversionError } from './errors';

describe('validateCombination', () => {
  it('丟出 UNSUPPORTED_COMBINATION，當 audio 輸入要轉成 video 格式', () => {
    const mp4 = getFormatById('mp4')!;
    expect(() => validateCombination('audio', mp4)).toThrow(ConversionError);
    try {
      validateCombination('audio', mp4);
    } catch (err) {
      expect((err as ConversionError).code).toBe('UNSUPPORTED_COMBINATION');
    }
  });

  it('允許 video 轉 audio', () => {
    const mp3 = getFormatById('mp3')!;
    expect(() => validateCombination('video', mp3)).not.toThrow();
  });

  it('允許 audio 轉 audio', () => {
    const wav = getFormatById('wav')!;
    expect(() => validateCombination('audio', wav)).not.toThrow();
  });
});

describe('buildFfmpegArgs', () => {
  it('video 轉 video：帶 -c:v 與 -c:a', () => {
    const mp4 = getFormatById('mp4')!;
    const args = buildFfmpegArgs('/tmp/in.mov', '/tmp/out.mp4', 'video', mp4);
    expect(args).toEqual([
      '-y',
      '-i',
      '/tmp/in.mov',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-pix_fmt',
      'yuv420p',
      '/tmp/out.mp4',
    ]);
  });

  it('video 轉 audio：帶 -vn 且不含 video codec', () => {
    const mp3 = getFormatById('mp3')!;
    const args = buildFfmpegArgs('/tmp/in.mp4', '/tmp/out.mp3', 'video', mp3);
    expect(args).toEqual(['-y', '-i', '/tmp/in.mp4', '-vn', '-c:a', 'libmp3lame', '/tmp/out.mp3']);
  });

  it('audio 轉 audio：帶 -vn', () => {
    const flac = getFormatById('flac')!;
    const args = buildFfmpegArgs('/tmp/in.wav', '/tmp/out.flac', 'audio', flac);
    expect(args).toEqual(['-y', '-i', '/tmp/in.wav', '-vn', '-c:a', 'flac', '/tmp/out.flac']);
  });

  it('audio 轉 video：丟出 UNSUPPORTED_COMBINATION，不組裝參數', () => {
    const webm = getFormatById('webm')!;
    expect(() => buildFfmpegArgs('/tmp/in.mp3', '/tmp/out.webm', 'audio', webm)).toThrow(ConversionError);
  });
});
