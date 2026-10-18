import { ConversionError } from '../core/errors';
import {
  AudioCodecChoice,
  ConvertTuning,
  FfmpegPreset,
  VideoCodecChoice,
} from '../core/types';

// multipart/form-data 一律以字串送達（同名欄位重複時 multer 會給陣列），這裡負責解析
export interface ConvertRequestBody {
  format?: string;
  resolution?: string;
  frameRate?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  trimStart?: string;
  trimEnd?: string;
  normalizeAudio?: string;
  stripMetadata?: string;
  videoCodec?: string;
  audioCodec?: string;
  crf?: string;
  preset?: string;
  audioChannels?: string;
  sampleRate?: string;
  rotate?: string;
  flipHorizontal?: string;
  flipVertical?: string;
  speed?: string;
  deinterlace?: string;
  denoise?: string;
  brightness?: string;
  contrast?: string;
  saturation?: string;
  quality?: string;
}

const RESOLUTION_RE = /^\d+x\d+$/;
const VIDEO_CODECS: VideoCodecChoice[] = [
  'h264',
  'h265',
  'vp9',
  'av1',
  'mpeg4',
  'copy',
];
const AUDIO_CODECS: AudioCodecChoice[] = [
  'aac',
  'mp3',
  'opus',
  'flac',
  'vorbis',
  'copy',
];
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

type Field = keyof ConvertRequestBody;
type Parser<T> = (raw: string) => T | undefined;

// 空字串/未提供 = 使用預設值；有值卻不合法就直接回 INVALID_INPUT，
// 不靜默丟掉——否則使用者的設定會悄悄失效
function invalid(field: Field): never {
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

export function parseConvertRequest(body: ConvertRequestBody): {
  targetFormatId?: string;
  tuning: ConvertTuning;
} {
  const on = (field: Field) => read(body, field, flag) || undefined;
  return {
    targetFormatId: read(body, 'format', (raw) => raw),
    tuning: {
      resolution: read(body, 'resolution', (raw) =>
        RESOLUTION_RE.test(raw) ? raw : undefined,
      ),
      frameRateFps: read(body, 'frameRate', positive),
      videoBitrateKbps: read(body, 'videoBitrate', positive),
      audioBitrateKbps: read(body, 'audioBitrate', positive),
      trimStartSec: read(body, 'trimStart', nonNegative),
      trimEndSec: read(body, 'trimEnd', positive),
      normalizeAudio: on('normalizeAudio'),
      stripMetadata: on('stripMetadata'),
      videoCodec: read(body, 'videoCodec', oneOf(VIDEO_CODECS)),
      audioCodec: read(body, 'audioCodec', oneOf(AUDIO_CODECS)),
      crf: read(body, 'crf', numberIn(0, 51)),
      preset: read(body, 'preset', oneOf(PRESETS)),
      audioChannels: read(body, 'audioChannels', oneOf(AUDIO_CHANNEL_CHOICES)),
      sampleRateHz: read(body, 'sampleRate', positive),
      rotate: read(body, 'rotate', oneOf(ROTATIONS)),
      flipHorizontal: on('flipHorizontal'),
      flipVertical: on('flipVertical'),
      speed: read(body, 'speed', numberIn(0.25, 4)),
      deinterlace: on('deinterlace'),
      denoise: on('denoise'),
      brightness: read(body, 'brightness', numberIn(-1, 1)),
      contrast: read(body, 'contrast', numberIn(0, 2)),
      saturation: read(body, 'saturation', numberIn(0, 3)),
      quality: read(body, 'quality', numberIn(1, 100)),
    },
  };
}
