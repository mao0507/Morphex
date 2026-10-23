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
});
