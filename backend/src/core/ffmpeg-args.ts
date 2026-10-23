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
// 這些編碼器沒指定位元率時預設只有 200kbps，畫面會糊；改用固定品質 -q:v（2–31，越小越好）
const QSCALE_CODECS = new Set(['mpeg2video']);
const DEFAULT_QSCALE = '3';

export function validateCombination(
  inputKind: MediaKind,
  targetFormat: FormatDefinition,
): void {
  // 圖片一律走獨立的 sharp pipeline（見 core/image-convert.ts），
  // 影音來源永遠不該落到這個 ffmpeg 分支還去組出圖片格式的參數
  if (targetFormat.kind === 'image') {
    throw new ConversionError(
      'UNSUPPORTED_COMBINATION',
      '影音檔案無法轉換為圖片格式',
    );
  }
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

// 預期輸出長度（秒），也就是進度百分比的分母：裁切區間 ÷ 播放倍率。
// ffmpeg 回報的 time= 是輸出時間，所以分母不能直接用來源長度。
// 來源長度未知又沒有完整裁切區間時回 undefined（不回報進度）
export function expectedOutputDurationSec(
  sourceSec: number | undefined,
  tuning: ConvertTuning = {},
): number | undefined {
  const start = tuning.trimStartSec ?? 0;
  if (sourceSec !== undefined && start >= sourceSec) {
    throw new ConversionError('INVALID_INPUT', '裁切開始時間超過檔案長度');
  }
  const end = Math.min(tuning.trimEndSec ?? Infinity, sourceSec ?? Infinity);
  if (!Number.isFinite(end)) return undefined;
  return (end - start) / (tuning.speed || 1);
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

  // 容錯旗標是 input option，必須在 -i 前面才會作用在讀取來源上
  if (tuning.repair) {
    args.push('-err_detect', 'ignore_err', '-fflags', '+genpts+discardcorrupt');
  }

  if (tuning.trimStartSec !== undefined) {
    args.push('-ss', String(tuning.trimStartSec));
  }

  // -t 必須放在 -i 前面當 input option，限制讀取的「來源」長度；放在後面會變成
  // 限制輸出長度，搭配 speed 加速時就會多吃掉一段來源
  if (tuning.trimEndSec !== undefined) {
    const duration = tuning.trimEndSec - (tuning.trimStartSec ?? 0);
    if (duration <= 0) {
      throw new ConversionError(
        'INVALID_INPUT',
        '裁切結束時間必須晚於開始時間',
      );
    }
    args.push('-t', String(duration));
  }

  args.push('-i', inputPath);

  // 語意契約見 ConvertTuning.stripMetadata（types.ts）；ffmpeg 預設就是保留，
  // 這裡不用額外做什麼，只有勾了才主動移除
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
    } else if (videoCodec && QSCALE_CODECS.has(videoCodec)) {
      args.push('-q:v', DEFAULT_QSCALE);
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
      if (tuning.brightness !== undefined)
        eqParts.push(`brightness=${tuning.brightness}`);
      if (tuning.contrast !== undefined)
        eqParts.push(`contrast=${tuning.contrast}`);
      if (tuning.saturation !== undefined)
        eqParts.push(`saturation=${tuning.saturation}`);
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
