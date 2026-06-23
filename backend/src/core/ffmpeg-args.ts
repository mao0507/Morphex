import {
  AudioCodecChoice,
  ConvertTuning,
  FormatDefinition,
  MediaKind,
  VideoCodecChoice,
} from './types';
import { ConversionError } from './errors';

const VIDEO_CODEC_MAP: Record<VideoCodecChoice, string> = {
  h264: 'libx264',
  h265: 'libx265',
  vp9: 'libvpx-vp9',
  av1: 'libaom-av1',
  mpeg4: 'mpeg4',
  copy: 'copy',
};

const AUDIO_CODEC_MAP: Record<AudioCodecChoice, string> = {
  aac: 'aac',
  mp3: 'libmp3lame',
  opus: 'libopus',
  flac: 'flac',
  vorbis: 'libvorbis',
  copy: 'copy',
};

const ROTATE_FILTER: Record<90 | 180 | 270, string> = {
  90: 'transpose=1',
  180: 'transpose=2,transpose=2',
  270: 'transpose=2',
};

// -crf / -preset 是個別編碼器的私有選項，傳給不支援的編碼器會讓 ffmpeg 直接報錯退出
const CRF_CODECS = new Set(['libx264', 'libx265', 'libvpx-vp9', 'libaom-av1']);
const PRESET_CODECS = new Set(['libx264', 'libx265']);

export function validateCombination(
  inputKind: MediaKind,
  targetFormat: FormatDefinition,
): void {
  if (inputKind === 'audio' && targetFormat.kind === 'video') {
    throw new ConversionError(
      'UNSUPPORTED_COMBINATION',
      '不支援將音訊檔轉換為影片格式',
    );
  }
}

// atempo 單次只支援 0.5–2.0 倍速，超出範圍需串接多個 atempo 濾鏡
function atempoChain(speed: number): string[] {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push('atempo=2.0');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(3)}`);
  return filters;
}

export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  inputKind: MediaKind,
  targetFormat: FormatDefinition,
  tuning: ConvertTuning = {},
): string[] {
  validateCombination(inputKind, targetFormat);

  const args = ['-y'];

  if (tuning.trimStartSec !== undefined) {
    args.push('-ss', String(tuning.trimStartSec));
  }

  args.push('-i', inputPath);

  if (tuning.trimEndSec !== undefined) {
    const duration = tuning.trimEndSec - (tuning.trimStartSec ?? 0);
    if (duration > 0) args.push('-t', String(duration));
  }

  if (tuning.stripMetadata) {
    args.push('-map_metadata', '-1');
  }

  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  if (targetFormat.kind === 'audio') {
    args.push('-vn');
    const audioCodec = tuning.audioCodec
      ? AUDIO_CODEC_MAP[tuning.audioCodec]
      : targetFormat.audioCodec;
    if (audioCodec) args.push('-c:a', audioCodec);
  } else {
    const videoCodec = tuning.videoCodec
      ? VIDEO_CODEC_MAP[tuning.videoCodec]
      : targetFormat.videoCodec;
    if (videoCodec) args.push('-c:v', videoCodec);
    const audioCodec = tuning.audioCodec
      ? AUDIO_CODEC_MAP[tuning.audioCodec]
      : targetFormat.audioCodec;
    if (audioCodec) args.push('-c:a', audioCodec);

    if (tuning.resolution) {
      videoFilters.push(`scale=${tuning.resolution.replace('x', ':')}`);
    }
    if (tuning.frameRateFps) {
      args.push('-r', String(tuning.frameRateFps));
    }
    if (tuning.videoBitrateKbps) {
      args.push('-b:v', `${tuning.videoBitrateKbps}k`);
    }
    if (tuning.crf !== undefined && videoCodec && CRF_CODECS.has(videoCodec)) {
      args.push('-crf', String(tuning.crf));
    }
    if (tuning.preset && videoCodec && PRESET_CODECS.has(videoCodec)) {
      args.push('-preset', tuning.preset);
    }
    if (tuning.deinterlace) {
      videoFilters.push('yadif');
    }
    if (tuning.denoise) {
      videoFilters.push('hqdn3d');
    }
    if (tuning.rotate) {
      videoFilters.push(ROTATE_FILTER[tuning.rotate]);
    }
    if (tuning.flipHorizontal) {
      videoFilters.push('hflip');
    }
    if (tuning.flipVertical) {
      videoFilters.push('vflip');
    }
    if (
      tuning.brightness !== undefined ||
      tuning.contrast !== undefined ||
      tuning.saturation !== undefined
    ) {
      const eqParts: string[] = [];
      if (tuning.brightness !== undefined) eqParts.push(`brightness=${tuning.brightness}`);
      if (tuning.contrast !== undefined) eqParts.push(`contrast=${tuning.contrast}`);
      if (tuning.saturation !== undefined) eqParts.push(`saturation=${tuning.saturation}`);
      videoFilters.push(`eq=${eqParts.join(':')}`);
    }
    if (tuning.speed) {
      videoFilters.push(`setpts=PTS/${tuning.speed}`);
    }
  }

  if (tuning.audioBitrateKbps) {
    args.push('-b:a', `${tuning.audioBitrateKbps}k`);
  }
  if (tuning.audioChannels) {
    args.push('-ac', String(tuning.audioChannels));
  }
  if (tuning.sampleRateHz) {
    args.push('-ar', String(tuning.sampleRateHz));
  }
  if (tuning.normalizeAudio) {
    audioFilters.push('loudnorm');
  }
  if (tuning.speed && tuning.speed !== 1) {
    audioFilters.push(...atempoChain(tuning.speed));
  }

  if (videoFilters.length) args.push('-vf', videoFilters.join(','));
  if (audioFilters.length) args.push('-af', audioFilters.join(','));

  if (targetFormat.extraArgs?.length) {
    args.push(...targetFormat.extraArgs);
  }

  args.push(outputPath);
  return args;
}
