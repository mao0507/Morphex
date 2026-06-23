import { ConvertTuning } from '../core/types';

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
}

const RESOLUTION_RE = /^\d+x\d+$/;

function parsePositiveNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseFlag(value?: string): boolean | undefined {
  return value === 'true' ? true : undefined;
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
  };
}
