import { ConversionError } from './errors';
import { FFMPEG_ENCODERS } from './ffmpeg-binaries';
import {
  ConvertTuning,
  FormatDefinition,
  MediaKind,
  VideoCodecChoice,
} from './types';

const ALL_FORMATS: FormatDefinition[] = [
  {
    id: 'mp4',
    label: 'MP4 (H.264 / AAC)',
    ext: 'mp4',
    kind: 'video',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    extraArgs: ['-pix_fmt', 'yuv420p'],
    mimeTypes: ['video/mp4'],
  },
  {
    id: 'webm',
    label: 'WebM (VP9 / Opus)',
    ext: 'webm',
    kind: 'video',
    videoCodec: 'libvpx-vp9',
    audioCodec: 'libopus',
    mimeTypes: ['video/webm'],
  },
  {
    id: 'mov',
    label: 'MOV (H.264 / AAC)',
    ext: 'mov',
    kind: 'video',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    extraArgs: ['-pix_fmt', 'yuv420p'],
    mimeTypes: ['video/quicktime'],
  },
  {
    id: 'avi',
    label: 'AVI (MPEG-4 / MP3)',
    ext: 'avi',
    kind: 'video',
    videoCodec: 'mpeg4',
    audioCodec: 'libmp3lame',
    mimeTypes: ['video/x-msvideo'],
  },
  {
    id: 'mp3',
    label: 'MP3',
    ext: 'mp3',
    kind: 'audio',
    audioCodec: 'libmp3lame',
    mimeTypes: ['audio/mpeg'],
  },
  {
    id: 'wav',
    label: 'WAV (PCM 16-bit)',
    ext: 'wav',
    kind: 'audio',
    audioCodec: 'pcm_s16le',
    mimeTypes: ['audio/wav', 'audio/x-wav'],
  },
  {
    id: 'flac',
    label: 'FLAC',
    ext: 'flac',
    kind: 'audio',
    audioCodec: 'flac',
    mimeTypes: ['audio/flac', 'audio/x-flac'],
  },
  {
    id: 'm4a',
    label: 'M4A / AAC',
    ext: 'm4a',
    kind: 'audio',
    audioCodec: 'aac',
    mimeTypes: ['audio/mp4', 'audio/aac'],
  },
  {
    id: 'mkv',
    label: 'MKV (H.264 / AAC)',
    ext: 'mkv',
    kind: 'video',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    extraArgs: ['-pix_fmt', 'yuv420p'],
    mimeTypes: ['video/x-matroska'],
  },
  {
    id: 'flv',
    label: 'FLV (H.264 / AAC)',
    ext: 'flv',
    kind: 'video',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    extraArgs: ['-pix_fmt', 'yuv420p', '-ar', '44100'],
    mimeTypes: ['video/x-flv'],
  },
  {
    id: 'wmv',
    label: 'WMV',
    ext: 'wmv',
    kind: 'video',
    videoCodec: 'wmv2',
    audioCodec: 'wmav2',
    mimeTypes: ['video/x-ms-wmv'],
  },
  {
    id: 'ts',
    label: 'MPEG-TS (H.264 / AAC)',
    ext: 'ts',
    kind: 'video',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    extraArgs: ['-pix_fmt', 'yuv420p'],
    mimeTypes: ['video/mp2t'],
  },
  {
    id: '3gp',
    label: '3GP (H.264 / AAC)',
    ext: '3gp',
    kind: 'video',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    extraArgs: [
      '-profile:v',
      'baseline',
      '-level',
      '3.0',
      '-pix_fmt',
      'yuv420p',
    ],
    mimeTypes: ['video/3gpp'],
  },
  {
    id: 'ogv',
    label: 'OGV (Theora / Vorbis)',
    ext: 'ogv',
    kind: 'video',
    videoCodec: 'libtheora',
    audioCodec: 'libvorbis',
    mimeTypes: ['video/ogg'],
  },
  {
    // DVD 相容的 MPEG-PS；mpeg2video 不吃 -crf（見 CRF_CODECS），畫質由 ffmpeg-args 的 -q:v 控制
    id: 'mpg',
    label: 'MPG (MPEG-2 / MP2)',
    ext: 'mpg',
    kind: 'video',
    videoCodec: 'mpeg2video',
    audioCodec: 'mp2',
    extraArgs: ['-pix_fmt', 'yuv420p'],
    mimeTypes: ['video/mpeg'],
  },
  {
    id: 'gif',
    label: 'GIF 動圖',
    ext: 'gif',
    kind: 'video',
    extraArgs: ['-an', '-loop', '0'],
    mimeTypes: ['image/gif'],
  },
  {
    id: 'ogg',
    label: 'OGG (Vorbis)',
    ext: 'ogg',
    kind: 'audio',
    audioCodec: 'libvorbis',
    mimeTypes: ['audio/ogg'],
  },
  {
    id: 'opus',
    label: 'Opus',
    ext: 'opus',
    kind: 'audio',
    audioCodec: 'libopus',
    mimeTypes: ['audio/opus'],
  },
  {
    id: 'wma',
    label: 'WMA',
    ext: 'wma',
    kind: 'audio',
    audioCodec: 'wmav2',
    mimeTypes: ['audio/x-ms-wma'],
  },
  {
    id: 'aiff',
    label: 'AIFF (PCM 16-bit)',
    ext: 'aiff',
    kind: 'audio',
    audioCodec: 'pcm_s16be',
    mimeTypes: ['audio/aiff', 'audio/x-aiff'],
  },
  {
    // AMR-NB 規格只有 8kHz 單聲道、最高 12.2kbps
    id: 'amr',
    label: 'AMR (AMR-NB)',
    ext: 'amr',
    kind: 'audio',
    audioCodec: 'libopencore_amrnb',
    extraArgs: ['-ar', '8000', '-ac', '1', '-b:a', '12.2k'],
    unsupportedTuning: ['sampleRateHz', 'audioChannels', 'audioBitrateKbps'],
    mimeTypes: ['audio/amr'],
  },
  {
    id: 'jpg',
    label: 'JPEG',
    ext: 'jpg',
    kind: 'image',
    mimeTypes: ['image/jpeg'],
    sharpFormat: 'jpeg',
  },
  {
    id: 'png',
    label: 'PNG',
    ext: 'png',
    kind: 'image',
    mimeTypes: ['image/png'],
    sharpFormat: 'png',
  },
  {
    id: 'webp',
    label: 'WebP',
    ext: 'webp',
    kind: 'image',
    mimeTypes: ['image/webp'],
    sharpFormat: 'webp',
  },
  {
    id: 'tiff',
    label: 'TIFF',
    ext: 'tiff',
    kind: 'image',
    mimeTypes: ['image/tiff'],
    sharpFormat: 'tiff',
  },
  {
    id: 'avif',
    label: 'AVIF',
    ext: 'avif',
    kind: 'image',
    mimeTypes: ['image/avif'],
    sharpFormat: 'avif',
  },
  // sharp 寫不出 BMP/ICO：沒有 sharpFormat，由 image-convert.ts 用 sharp 解碼後自己編碼
  {
    id: 'bmp',
    label: 'BMP',
    ext: 'bmp',
    kind: 'image',
    mimeTypes: ['image/bmp'],
    unsupportedTuning: ['quality'],
  },
  {
    id: 'ico',
    label: 'ICO',
    ext: 'ico',
    kind: 'image',
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'],
    // 尺寸固定 16/32/48/256
    unsupportedTuning: ['quality', 'resolution'],
  },
];

// ponytail: 查不到編碼器清單（spawn 失敗）就全保留，交給轉檔時的 FFMPEG_FAILED 回報
const isEncodable = (codec?: string) =>
  codec === undefined ||
  FFMPEG_ENCODERS.size === 0 ||
  FFMPEG_ENCODERS.has(codec);

// 只列這台機器的 ffmpeg 編得出來的格式，/formats 與 getFormatById 都以此為準
export const FORMATS: FormatDefinition[] = ALL_FORMATS.filter(
  (format) => isEncodable(format.videoCodec) && isEncodable(format.audioCodec),
);

export const VIDEO_CODEC_MAP: Record<VideoCodecChoice, string> = {
  h264: 'libx264',
  h265: 'libx265',
  vp9: 'libvpx-vp9',
  av1: 'libaom-av1',
  mpeg4: 'mpeg4',
  copy: 'copy',
};

// -crf / -preset 是個別編碼器的私有選項，傳給不支援的編碼器會讓 ffmpeg 直接報錯退出
const CRF_CODECS = new Set(['libx264', 'libx265', 'libvpx-vp9', 'libaom-av1']);
const PRESET_CODECS = new Set(['libx264', 'libx265']);

// 每個 tuning 欄位對哪種目標有作用。新增欄位時型別會逼你在這裡分類——
// 「這個欄位對這個目標有沒有用」只在這個檔案回答，engine 不再各自靜默略過
const TUNING_TARGETS: Record<keyof ConvertTuning, readonly MediaKind[]> = {
  resolution: ['video', 'image'],
  frameRateFps: ['video'],
  videoBitrateKbps: ['video'],
  audioBitrateKbps: ['video', 'audio'],
  trimStartSec: ['video', 'audio'],
  trimEndSec: ['video', 'audio'],
  normalizeAudio: ['video', 'audio'],
  stripMetadata: ['video', 'audio', 'image'],
  videoCodec: ['video'],
  audioCodec: ['video', 'audio'],
  crf: ['video'],
  preset: ['video'],
  audioChannels: ['video', 'audio'],
  sampleRateHz: ['video', 'audio'],
  rotate: ['video'],
  flipHorizontal: ['video', 'image'],
  flipVertical: ['video', 'image'],
  speed: ['video', 'audio'],
  deinterlace: ['video'],
  denoise: ['video'],
  brightness: ['video'],
  contrast: ['video'],
  saturation: ['video'],
  repair: ['video', 'audio'],
  targetSizeMB: ['video'],
  quality: ['image'],
};
const TUNING_KEYS = Object.keys(TUNING_TARGETS) as (keyof ConvertTuning)[];

// 直接複製影片串流（videoCodec=copy）時不能重新編碼，也就不能套濾鏡或控制位元率
const NEEDS_VIDEO_ENCODE: (keyof ConvertTuning)[] = [
  'resolution',
  'frameRateFps',
  'videoBitrateKbps',
  'crf',
  'preset',
  'rotate',
  'flipHorizontal',
  'flipVertical',
  'speed',
  'deinterlace',
  'denoise',
  'brightness',
  'contrast',
  'saturation',
  'targetSizeMB',
];
// ponytail: audioCodec=copy 搭配音訊濾鏡/位元率同樣無效，目前仍交給 ffmpeg 報錯；
// 要補就比照 NEEDS_VIDEO_ENCODE 加一份，/formats 也得多一個維度

// 這個目標用不到的 tuning 欄位：格式寫死的、目標種類用不到的、影片編碼器不吃的。
// videoCodec 是使用者選的影片編碼（沒選就用格式預設），crf/preset 跟著它變
export function unsupportedTuningOf(
  format: FormatDefinition,
  videoCodec?: VideoCodecChoice,
): (keyof ConvertTuning)[] {
  const unsupported = new Set(format.unsupportedTuning ?? []);
  for (const key of TUNING_KEYS) {
    if (!TUNING_TARGETS[key].includes(format.kind)) unsupported.add(key);
  }
  if (format.kind === 'video') {
    const codec = videoCodec ? VIDEO_CODEC_MAP[videoCodec] : format.videoCodec;
    if (!codec || !CRF_CODECS.has(codec)) unsupported.add('crf');
    if (!codec || !PRESET_CODECS.has(codec)) unsupported.add('preset');
    if (videoCodec === 'copy') {
      for (const key of NEEDS_VIDEO_ENCODE) unsupported.add(key);
    }
  }
  return [...unsupported];
}

export function assertTuningSupported(
  format: FormatDefinition,
  tuning: ConvertTuning = {},
): void {
  for (const field of unsupportedTuningOf(format, tuning.videoCodec)) {
    if (tuning[field] !== undefined && tuning[field] !== false) {
      throw new ConversionError(
        'INVALID_INPUT',
        `${format.id} 不能調整：${field}`,
      );
    }
  }
}

export function getFormatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((format) => format.id === id);
}
