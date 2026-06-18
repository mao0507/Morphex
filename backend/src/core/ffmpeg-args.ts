import { FormatDefinition, MediaKind } from './types';
import { ConversionError } from './errors';

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

export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  inputKind: MediaKind,
  targetFormat: FormatDefinition,
): string[] {
  validateCombination(inputKind, targetFormat);

  const args = ['-y', '-i', inputPath];

  if (targetFormat.kind === 'audio') {
    args.push('-vn');
    if (targetFormat.audioCodec) args.push('-c:a', targetFormat.audioCodec);
  } else {
    if (targetFormat.videoCodec) args.push('-c:v', targetFormat.videoCodec);
    if (targetFormat.audioCodec) args.push('-c:a', targetFormat.audioCodec);
  }

  if (targetFormat.extraArgs?.length) {
    args.push(...targetFormat.extraArgs);
  }

  args.push(outputPath);
  return args;
}
