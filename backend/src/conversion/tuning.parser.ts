import { ConversionError } from '../core/errors';
import { AUDIO_CODEC_MAP } from '../core/ffmpeg-args';
import { VIDEO_CODEC_MAP } from '../core/formats';
import {
  AudioCodecChoice,
  ConvertTuning,
  FfmpegPreset,
  VideoCodecChoice,
} from '../core/types';

const RESOLUTION_RE = /^\d+x\d+$/;
const VIDEO_CODECS = Object.keys(VIDEO_CODEC_MAP) as VideoCodecChoice[];
const AUDIO_CODECS = Object.keys(AUDIO_CODEC_MAP) as AudioCodecChoice[];
const PRESETS: FfmpegPreset[] = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
];
const ROTATIONS = [90, 180, 270] as const;
const AUDIO_CHANNEL_CHOICES = [1, 2];

type Parser<T> = (raw: string) => T | undefined;

// 空字串/未提供 = 使用預設值；有值卻不合法就直接回 INVALID_INPUT，
// 不靜默丟掉——否則使用者的設定會悄悄失效
function invalid(field: string): never {
  throw new ConversionError('INVALID_INPUT', `無效的參數：${field}`);
}

function read<T>(body: ConvertRequestBody, field: Field, parse: Parser<T>) {
  const raw: unknown = body[field];
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') invalid(field);
  const value = parse(raw);
  return value === undefined ? invalid(field) : value;
}

const numberIn =
  (min: number, max: number, { exclusiveMin = false } = {}): Parser<number> =>
  (raw) => {
    const n = Number(raw);
    const aboveMin = exclusiveMin ? n > min : n >= min;
    return Number.isFinite(n) && aboveMin && n <= max ? n : undefined;
  };

const positive = numberIn(0, Infinity, { exclusiveMin: true });
const nonNegative = numberIn(0, Infinity);

const oneOf =
  <T extends string | number>(allowed: readonly T[]): Parser<T> =>
  (raw) =>
    allowed.find((v) => String(v) === raw);

const flag: Parser<boolean> = (raw) =>
  raw === 'true' ? true : raw === 'false' ? false : undefined;

const resolution: Parser<string> = (raw) =>
  RESOLUTION_RE.test(raw) ? raw : undefined;

// 每個 tuning 欄位的唯一定義：multipart 欄位名 + 怎麼解析。request body 型別、
// 欄位名對照表、parseConvertRequest 都從這張表衍生；型別會逼新欄位在這裡補一列
const TUNING_FIELDS = {
  resolution: { field: 'resolution', parse: resolution },
  frameRateFps: { field: 'frameRate', parse: positive },
  videoBitrateKbps: { field: 'videoBitrate', parse: positive },
  audioBitrateKbps: { field: 'audioBitrate', parse: positive },
  trimStartSec: { field: 'trimStart', parse: nonNegative },
  trimEndSec: { field: 'trimEnd', parse: positive },
  normalizeAudio: { field: 'normalizeAudio', parse: flag },
  stripMetadata: { field: 'stripMetadata', parse: flag },
  videoCodec: { field: 'videoCodec', parse: oneOf(VIDEO_CODECS) },
  audioCodec: { field: 'audioCodec', parse: oneOf(AUDIO_CODECS) },
  crf: { field: 'crf', parse: numberIn(0, 51) },
  preset: { field: 'preset', parse: oneOf(PRESETS) },
  audioChannels: {
    field: 'audioChannels',
    parse: oneOf(AUDIO_CHANNEL_CHOICES),
  },
  sampleRateHz: { field: 'sampleRate', parse: positive },
  rotate: { field: 'rotate', parse: oneOf(ROTATIONS) },
  flipHorizontal: { field: 'flipHorizontal', parse: flag },
  flipVertical: { field: 'flipVertical', parse: flag },
  speed: { field: 'speed', parse: numberIn(0.25, 4) },
  deinterlace: { field: 'deinterlace', parse: flag },
  denoise: { field: 'denoise', parse: flag },
  brightness: { field: 'brightness', parse: numberIn(-1, 1) },
  contrast: { field: 'contrast', parse: numberIn(0, 2) },
  saturation: { field: 'saturation', parse: numberIn(0, 3) },
  quality: { field: 'quality', parse: numberIn(1, 100) },
  repair: { field: 'repair', parse: flag },
  targetSizeMB: { field: 'targetSize', parse: positive },
} as const satisfies {
  [K in keyof ConvertTuning]-?: {
    field: string;
    parse: Parser<NonNullable<ConvertTuning[K]>>;
  };
};

type TuningKey = keyof typeof TUNING_FIELDS;
type Field = 'format' | (typeof TUNING_FIELDS)[TuningKey]['field'];
const TUNING_KEYS = Object.keys(TUNING_FIELDS) as TuningKey[];

// multipart/form-data 一律以字串送達（同名欄位重複時 multer 會給陣列，read 會擋掉）
export type ConvertRequestBody = Partial<Record<Field, string>>;

// ConvertTuning 欄位 → multipart 欄位名；/formats 回報不支援的欄位時用前端認得的名字
export const REQUEST_FIELD_BY_TUNING_KEY = Object.fromEntries(
  TUNING_KEYS.map((key) => [key, TUNING_FIELDS[key].field]),
) as Record<keyof ConvertTuning, Exclude<Field, 'format'>>;

export function parseConvertRequest(body: ConvertRequestBody): {
  targetFormatId?: string;
  tuning: ConvertTuning;
} {
  const tuning: Record<string, unknown> = {};
  for (const key of TUNING_KEYS) {
    const { field, parse } = TUNING_FIELDS[key];
    const value = read<unknown>(body, field, parse);
    // 開關送 'false' 等同沒送：undefined 才代表「用預設值」
    tuning[key] = value === false ? undefined : value;
  }
  return {
    targetFormatId: read(body, 'format', (raw) => raw),
    tuning,
  };
}
