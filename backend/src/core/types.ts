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
