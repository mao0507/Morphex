import {
  assertTuningSupported,
  FORMATS,
  getFormatById,
  unsupportedTuningOf,
} from './formats';

describe('FORMATS', () => {
  it('每個格式 id 唯一', () => {
    const ids = FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getFormatById 找到已知格式', () => {
    expect(getFormatById('mp4')?.kind).toBe('video');
    expect(getFormatById('wav')?.kind).toBe('audio');
  });

  it('getFormatById 對未知格式回傳 undefined', () => {
    expect(getFormatById('not-a-format')).toBeUndefined();
  });

  it('目標大小只限影片目標：音訊/圖片格式一律不支援', () => {
    expect(unsupportedTuningOf(getFormatById('mp4')!)).not.toContain(
      'targetSizeMB',
    );
    expect(unsupportedTuningOf(getFormatById('mp3')!)).toContain(
      'targetSizeMB',
    );
    expect(unsupportedTuningOf(getFormatById('png')!)).toContain(
      'targetSizeMB',
    );
    expect(() =>
      assertTuningSupported(getFormatById('mp3')!, { targetSizeMB: 5 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  // 「這個欄位對這個目標有沒有用」的唯一出處；engine 不再靜默略過
  it.each([
    ['avi', undefined, ['crf', 'preset', 'quality']], // mpeg4 不吃 crf/preset
    ['avi', 'h264', ['quality']], // 改選 H.264 就吃
    ['webm', undefined, ['preset', 'quality']], // vp9 吃 crf 不吃 preset
    ['mp4', undefined, ['quality']],
  ] as const)('%s（影片編碼 %s）不支援 %j', (id, codec, expected) => {
    expect(unsupportedTuningOf(getFormatById(id)!, codec).sort()).toEqual(
      [...expected].sort(),
    );
  });

  it('音訊目標用不到影片欄位，圖片目標只吃縮放/畫質/翻轉/中繼資料', () => {
    const mp3 = unsupportedTuningOf(getFormatById('mp3')!);
    expect(mp3).toEqual(
      expect.arrayContaining(['resolution', 'crf', 'rotate', 'videoCodec']),
    );
    expect(mp3).not.toContain('audioBitrateKbps');
    expect(mp3).not.toContain('speed');

    const png = unsupportedTuningOf(getFormatById('png')!);
    for (const key of [
      'resolution',
      'quality',
      'stripMetadata',
      'flipHorizontal',
      'flipVertical',
    ] as const) {
      expect(png).not.toContain(key);
    }
    expect(png).toEqual(expect.arrayContaining(['crf', 'trimStartSec']));
  });

  it('videoCodec=copy 不能搭配需要重新編碼的欄位', () => {
    const mp4 = getFormatById('mp4')!;
    expect(unsupportedTuningOf(mp4, 'copy')).toEqual(
      expect.arrayContaining(['resolution', 'crf', 'speed', 'targetSizeMB']),
    );
    expect(() =>
      assertTuningSupported(mp4, { videoCodec: 'copy', rotate: 90 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() =>
      assertTuningSupported(mp4, { videoCodec: 'copy', audioBitrateKbps: 128 }),
    ).not.toThrow();
  });

  it('送了目標用不到的欄位就拒絕，不靜默略過', () => {
    expect(() =>
      assertTuningSupported(getFormatById('avi')!, { crf: 20 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() =>
      assertTuningSupported(getFormatById('avi')!, {
        crf: 20,
        videoCodec: 'h264',
      }),
    ).not.toThrow();
    expect(() =>
      assertTuningSupported(getFormatById('mp3')!, { resolution: '640x360' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
});
