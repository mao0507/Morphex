import { FormatDefinition } from './types';

export const FORMATS: FormatDefinition[] = [
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
];

export function getFormatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((format) => format.id === id);
}
