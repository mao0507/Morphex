import { getFormatById } from './formats';
import { probeFile } from './probe';
import { detectMediaKind } from './detect';
import { buildFfmpegArgs } from './ffmpeg-args';
import { runFfmpegJob } from './run-job';
import { ConversionError } from './errors';
import { MediaKind } from './types';

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  targetFormatId: string;
}

export interface ConvertResult {
  inputKind: MediaKind;
  outputFormatId: string;
}

export async function convertFile(options: ConvertOptions): Promise<ConvertResult> {
  const targetFormat = getFormatById(options.targetFormatId);
  if (!targetFormat) {
    throw new ConversionError(
      'INVALID_INPUT',
      `不支援的目標格式：${options.targetFormatId}`,
    );
  }

  const probe = await probeFile(options.inputPath);
  const inputKind = detectMediaKind(probe);

  const args = buildFfmpegArgs(options.inputPath, options.outputPath, inputKind, targetFormat);
  await runFfmpegJob(args);

  return { inputKind, outputFormatId: targetFormat.id };
}
