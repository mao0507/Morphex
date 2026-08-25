import { getFormatById } from './formats';
import { probeFile } from './probe';
import { detectMediaKind } from './detect';
import { buildFfmpegArgs } from './ffmpeg-args';
import { runFfmpegJob } from './run-job';
import {
  runSharpJob,
  tryReadImageMetadata,
  validateImageCombination,
  SharpConversionPlan,
} from './image-convert';
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

export type EnginePlan =
  | { engine: 'ffmpeg'; args: string[]; durationSec?: number }
  | SharpConversionPlan;

export interface PreparedConversion {
  plan: EnginePlan;
  inputKind: MediaKind;
  outputFormatId: string;
}

// 只做驗證 + 組裝轉檔計畫，不真正啟動 ffmpeg/sharp；讓呼叫端能在排入轉檔工作前
// 先同步取得驗證結果。是不是圖片由 sharp 自己讀不讀得出 metadata 決定（跟
// ffprobe 對影音的角色一樣），讀得出來就整段走獨立的 sharp pipeline，
// 讀不出來才退回原本的 ffprobe + ffmpeg 流程
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

  const imageMeta = await tryReadImageMetadata(options.inputPath);
  if (imageMeta) {
    validateImageCombination(targetFormat);
    return {
      plan: {
        engine: 'sharp',
        inputPath: options.inputPath,
        outputPath: options.outputPath,
        targetFormat,
        tuning: options.tuning ?? {},
      },
      inputKind: 'image',
      outputFormatId: targetFormat.id,
    };
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
    plan: {
      engine: 'ffmpeg',
      args,
      durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
    },
    inputKind,
    outputFormatId: targetFormat.id,
  };
}

export function runPreparedConversion(
  prepared: PreparedConversion,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const { plan } = prepared;
  if (plan.engine === 'sharp') {
    return runSharpJob(plan, onProgress);
  }
  return runFfmpegJob(plan.args, {
    durationSec: plan.durationSec,
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
