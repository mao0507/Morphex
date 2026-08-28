export type MediaKind = 'video' | 'audio' | 'image';

export interface FormatDefinition {
  id: string;
  label: string;
  ext: string;
  kind: MediaKind;
  videoCodec?: string;
  audioCodec?: string;
  extraArgs?: string[];
  mimeTypes: string[];
  // 圖片格式專用：對應 sharp 的 toFormat() 名稱（多數跟 id 同名，jpg 例外是 'jpeg'）。
  // image-convert.ts 用這個欄位衍生正查/反查表，FORMATS 是唯一要維護的清單
  sharpFormat?: string;
}

export type VideoCodecChoice = 'h264' | 'h265' | 'vp9' | 'av1' | 'mpeg4' | 'copy';
export type AudioCodecChoice = 'aac' | 'mp3' | 'opus' | 'flac' | 'vorbis' | 'copy';
export type FfmpegPreset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

// 進階轉檔參數，皆為選填；未提供則沿用格式預設值/原始檔案參數
export interface ConvertTuning {
  resolution?: string; // 例如 "1920x1080"
  frameRateFps?: number;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  normalizeAudio?: boolean;
  stripMetadata?: boolean;
  videoCodec?: VideoCodecChoice;
  audioCodec?: AudioCodecChoice;
  crf?: number; // 0-51，數字越小畫質越高
  preset?: FfmpegPreset;
  audioChannels?: number; // 1=單聲道 2=立體聲
  sampleRateHz?: number;
  rotate?: 90 | 180 | 270;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  speed?: number; // 播放速度倍率，套用到影像(setpts)與音訊(atempo)
  deinterlace?: boolean;
  denoise?: boolean;
  brightness?: number; // -1..1
  contrast?: number; // 0..2
  saturation?: number; // 0..3
  quality?: number; // 1-100，僅圖片格式使用（jpeg/webp/avif/tiff 壓縮品質；png 會連帶開啟調色盤量化）
}
