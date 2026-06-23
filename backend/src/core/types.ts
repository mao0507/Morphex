export type MediaKind = 'video' | 'audio';

export interface FormatDefinition {
  id: string;
  label: string;
  ext: string;
  kind: MediaKind;
  videoCodec?: string;
  audioCodec?: string;
  extraArgs?: string[];
  mimeTypes: string[];
}

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
}
