import { ConversionError } from '../core/errors';
import {
  ConvertRequestBody,
  parseConvertRequest,
  REQUEST_FIELD_BY_TUNING_KEY,
} from './tuning.parser';

const tuningOf = (body: ConvertRequestBody) => parseConvertRequest(body).tuning;

describe('parseConvertRequest', () => {
  it('空 body：沒有目標格式、所有 tuning 都是 undefined', () => {
    const { targetFormatId, tuning } = parseConvertRequest({});
    expect(targetFormatId).toBeUndefined();
    expect(Object.values(tuning).every((v) => v === undefined)).toBe(true);
  });

  it.each<[keyof ConvertRequestBody, string, string, unknown]>([
    ['resolution', '1280x720', 'resolution', '1280x720'],
    ['frameRate', '30', 'frameRateFps', 30],
    ['videoBitrate', '2500', 'videoBitrateKbps', 2500],
    ['audioBitrate', '192', 'audioBitrateKbps', 192],
    ['trimStart', '0', 'trimStartSec', 0],
    ['trimStart', '5.5', 'trimStartSec', 5.5],
    ['trimEnd', '10', 'trimEndSec', 10],
    ['normalizeAudio', 'true', 'normalizeAudio', true],
    ['stripMetadata', 'false', 'stripMetadata', undefined],
    ['videoCodec', 'vp9', 'videoCodec', 'vp9'],
    ['audioCodec', 'opus', 'audioCodec', 'opus'],
    ['crf', '0', 'crf', 0],
    ['crf', '51', 'crf', 51],
    ['preset', 'slow', 'preset', 'slow'],
    ['audioChannels', '1', 'audioChannels', 1],
    ['sampleRate', '44100', 'sampleRateHz', 44100],
    ['rotate', '270', 'rotate', 270],
    ['speed', '0.25', 'speed', 0.25],
    ['brightness', '-1', 'brightness', -1],
    ['contrast', '0', 'contrast', 0],
    ['saturation', '3', 'saturation', 3],
    ['quality', '80', 'quality', 80],
    ['repair', 'true', 'repair', true],
    ['targetSize', '9.5', 'targetSizeMB', 9.5],
  ])('%s=%s → %s', (field, value, key, expected) => {
    const tuning = tuningOf({ [field]: value });
    expect(tuning[key as keyof typeof tuning]).toEqual(expected);
    // 反向對照表（/formats 用）要跟解析一致
    expect(REQUEST_FIELD_BY_TUNING_KEY[key as keyof typeof tuning]).toBe(field);
  });

  it.each<[keyof ConvertRequestBody, unknown]>([
    ['resolution', '1280*720'],
    ['frameRate', '0'],
    ['frameRate', 'abc'],
    ['videoBitrate', '-1'],
    ['trimStart', '-1'],
    ['trimEnd', '0'],
    ['normalizeAudio', 'yes'],
    ['repair', '1'],
    ['targetSize', '0'],
    ['videoCodec', 'divx'],
    ['crf', '52'],
    ['preset', 'turbo'],
    ['audioChannels', '6'],
    ['rotate', '45'],
    ['speed', '8'],
    ['brightness', '2'],
    ['quality', '0'],
    ['format', ['mp3', 'mp4']],
    ['crf', ['1', '2']],
  ])('%s=%j → INVALID_INPUT 並帶欄位名稱', (field, value) => {
    const body = { [field]: value } as ConvertRequestBody;
    expect(() => parseConvertRequest(body)).toThrow(ConversionError);
    expect(() => parseConvertRequest(body)).toThrow(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        message: expect.stringContaining(field) as string,
      }),
    );
  });

  it('format 原樣帶出', () => {
    expect(parseConvertRequest({ format: 'mp3' }).targetFormatId).toBe('mp3');
  });
});
