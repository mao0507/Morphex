import { ConvertTuning, FormatDefinition, MediaKind } from './types';
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

  if (targetFormat.kind === 'audio') {
    args.push('-vn');
    if (targetFormat.audioCodec) args.push('-c:a', targetFormat.audioCodec);
  } else {
    if (targetFormat.videoCodec) args.push('-c:v', targetFormat.videoCodec);
    if (targetFormat.audioCodec) args.push('-c:a', targetFormat.audioCodec);

    if (tuning.resolution) {
      args.push('-vf', `scale=${tuning.resolution.replace('x', ':')}`);
    }
    if (tuning.frameRateFps) {
      args.push('-r', String(tuning.frameRateFps));
    }
    if (tuning.videoBitrateKbps) {
      args.push('-b:v', `${tuning.videoBitrateKbps}k`);
    }
  }

  if (tuning.audioBitrateKbps) {
    args.push('-b:a', `${tuning.audioBitrateKbps}k`);
  }
  if (tuning.normalizeAudio) {
    args.push('-af', 'loudnorm');
  }

  if (targetFormat.extraArgs?.length) {
    args.push(...targetFormat.extraArgs);
  }

  args.push(outputPath);
  return args;
}
