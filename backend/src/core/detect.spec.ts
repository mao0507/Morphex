import { detectMediaKind } from './detect';
import { ProbeResult } from './probe';
import { ConversionError } from './errors';

function probe(streams: ProbeResult['streams']): ProbeResult {
  return { streams };
}

describe('detectMediaKind', () => {
  it('回傳 video，當存在正常 video stream', () => {
    const result = detectMediaKind(
      probe([
        { index: 0, codec_type: 'video', codec_name: 'h264' },
        { index: 1, codec_type: 'audio', codec_name: 'aac' },
      ]),
    );
    expect(result).toBe('video');
  });

  it('回傳 audio，當只有 audio stream', () => {
    const result = detectMediaKind(probe([{ index: 0, codec_type: 'audio', codec_name: 'mp3' }]));
    expect(result).toBe('audio');
  });

  it('排除 mjpeg 縮圖 video stream，視為 audio', () => {
    const result = detectMediaKind(
      probe([
        { index: 0, codec_type: 'video', codec_name: 'mjpeg' },
        { index: 1, codec_type: 'audio', codec_name: 'mp3' },
      ]),
    );
    expect(result).toBe('audio');
  });

  it('排除 attached_pic 封面圖 video stream，視為 audio', () => {
    const result = detectMediaKind(
      probe([
        { index: 0, codec_type: 'video', codec_name: 'png', disposition: { attached_pic: 1 } },
        { index: 1, codec_type: 'audio', codec_name: 'flac' },
      ]),
    );
    expect(result).toBe('audio');
  });

  it('丟出 ConversionError(PROBE_FAILED)，當無任何可用 stream', () => {
    expect(() => detectMediaKind(probe([{ index: 0, codec_type: 'video', codec_name: 'mjpeg' }]))).toThrow(
      ConversionError,
    );
    try {
      detectMediaKind(probe([{ index: 0, codec_type: 'video', codec_name: 'mjpeg' }]));
    } catch (err) {
      expect((err as ConversionError).code).toBe('PROBE_FAILED');
    }
  });
});
