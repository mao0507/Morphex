import { getFormatById } from './formats';
import { probeFile } from './probe';
import { detectMediaKind } from './detect';
import { buildFfmpegArgs } from './ffmpeg-args';
import { runFfmpegJob } from './run-job';
import { ConversionError } from './errors';
import { ConvertTuning, MediaKind } from './types';

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  targetFormatId: string;
  tuning?: ConvertTuning;
  onProgress?: (percent: number) => void;
}

export interface ConvertResult {
  inputKind: MediaKind;
  outputFormatId: string;
}

export interface PreparedConversion {
  args: string[];
  inputKind: MediaKind;
  outputFormatId: string;
  durationSec?: number;
}

// 只做 probe + 驗證 + 組裝 ffmpeg 參數，不啟動 ffmpeg；讓呼叫端能在排入轉檔工作前先同步取得驗證結果
export async function prepareConversion(
  options: Omit<ConvertOptions, 'onProgress'>,
): Promise<PreparedConversion> {
  const targetFormat = getFormatById(options.targetFormatId);
  if (!targetFormat) {
    throw new ConversionError(
      'INVALID_INPUT',
      `不支援的目標格式：${options.targetFormatId}`,
    );
  }

  const probe = await probeFile(options.inputPath);
  const inputKind = detectMediaKind(probe);

  const args = buildFfmpegArgs(
    options.inputPath,
    options.outputPath,
    inputKind,
    targetFormat,
    options.tuning,
  );

  const durationSec = Number(probe.format?.duration);

  return {
    args,
    inputKind,
    outputFormatId: targetFormat.id,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
  };
}

export function runPreparedConversion(
  prepared: PreparedConversion,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return runFfmpegJob(prepared.args, {
    durationSec: prepared.durationSec,
    onProgress,
  });
}

export async function convertFile(
  options: ConvertOptions,
): Promise<ConvertResult> {
  const prepared = await prepareConversion(options);
  await runPreparedConversion(prepared, options.onProgress);
  return {
    inputKind: prepared.inputKind,
    outputFormatId: prepared.outputFormatId,
  };
}
