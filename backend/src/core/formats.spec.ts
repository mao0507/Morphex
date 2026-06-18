import { FORMATS, getFormatById } from './formats';

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
});
