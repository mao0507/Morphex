import {
  AudioCodecChoice,
  ConvertTuning,
  FfmpegPreset,
  VideoCodecChoice,
} from '../core/types';

// multipart/form-data 一律以字串送達，這裡負責解析、過濾無效值
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
}

const RESOLUTION_RE = /^\d+x\d+$/;
const VIDEO_CODECS: VideoCodecChoice[] = ['h264', 'h265', 'vp9', 'av1', 'mpeg4', 'copy'];
const AUDIO_CODECS: AudioCodecChoice[] = ['aac', 'mp3', 'opus', 'flac', 'vorbis', 'copy'];
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
const ROTATIONS = [90, 180, 270];
const AUDIO_CHANNEL_CHOICES = [1, 2];

function parsePositiveNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseNumberInRange(value: string | undefined, min: number, max: number): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function parseFlag(value?: string): boolean | undefined {
  return value === 'true' ? true : undefined;
}

function parseEnum<T extends string>(value: string | undefined, allowed: T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function parseIntChoice(value: string | undefined, allowed: number[]): number | undefined {
  const n = Number(value);
  return allowed.includes(n) ? n : undefined;
}

export function parseTuningOptions(body: ConvertRequestBody): ConvertTuning {
  return {
    resolution:
      body.resolution && RESOLUTION_RE.test(body.resolution)
        ? body.resolution
        : undefined,
    frameRateFps: parsePositiveNumber(body.frameRate),
    videoBitrateKbps: parsePositiveNumber(body.videoBitrate),
    audioBitrateKbps: parsePositiveNumber(body.audioBitrate),
    trimStartSec: parsePositiveNumber(body.trimStart),
    trimEndSec: parsePositiveNumber(body.trimEnd),
    normalizeAudio: parseFlag(body.normalizeAudio),
    stripMetadata: parseFlag(body.stripMetadata),
    videoCodec: parseEnum(body.videoCodec, VIDEO_CODECS),
    audioCodec: parseEnum(body.audioCodec, AUDIO_CODECS),
    crf: parseNumberInRange(body.crf, 0, 51),
    preset: parseEnum(body.preset, PRESETS),
    audioChannels: parseIntChoice(body.audioChannels, AUDIO_CHANNEL_CHOICES),
    sampleRateHz: parsePositiveNumber(body.sampleRate),
    rotate: parseIntChoice(body.rotate, ROTATIONS) as 90 | 180 | 270 | undefined,
    flipHorizontal: parseFlag(body.flipHorizontal),
    flipVertical: parseFlag(body.flipVertical),
    speed: parseNumberInRange(body.speed, 0.25, 4),
    deinterlace: parseFlag(body.deinterlace),
    denoise: parseFlag(body.denoise),
    brightness: parseNumberInRange(body.brightness, -1, 1),
    contrast: parseNumberInRange(body.contrast, 0, 2),
    saturation: parseNumberInRange(body.saturation, 0, 3),
  };
}
