import type sharp from 'sharp';
import { FormatDefinition } from './types';
import { assertTuningSupported, getFormatById } from './formats';
import { probeFile } from './probe';
import { detectMediaKind } from './detect';
import { buildFfmpegArgs, expectedOutputDurationSec } from './ffmpeg-args';
import { runFfmpegJob } from './run-job';
import {
  formatIdForSharpFormat,
  runSharpJob,
  tryReadImageMetadata,
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
  // durationSec：預期輸出長度（進度分母），見 expectedOutputDurationSec
  | { engine: 'ffmpeg'; args: string[]; durationSec?: number }
  | SharpConversionPlan;

export interface PreparedConversion {
  plan: EnginePlan;
  inputKind: MediaKind;
  outputFormatId: string;
}

export interface ResolvedTargetFormat {
  targetFormat: FormatDefinition;
  // 順手把讀到的 image metadata 帶出去，prepareConversion 收到就不用重讀一次
  imageMeta?: sharp.Metadata;
}

// 決定這次轉檔的目標格式：有明確指定就直接查表；圖片壓縮模式（未指定格式）
// 則用來源檔案本身的格式當目標格式（單純壓縮、不換格式）。呼叫端（API 層）
// 靠這個結果組出 outputPath 的副檔名，之後才能呼叫 prepareConversion
export async function resolveTargetFormat(
  inputPath: string,
  requestedFormatId?: string,
): Promise<ResolvedTargetFormat> {
  if (requestedFormatId) {
    const targetFormat = getFormatById(requestedFormatId);
    if (!targetFormat) {
      throw new ConversionError(
        'INVALID_INPUT',
        `不支援的目標格式：${requestedFormatId}`,
      );
    }
    return { targetFormat };
  }

  const imageMeta = await tryReadImageMetadata(inputPath);
  const formatId = imageMeta?.format
    ? formatIdForSharpFormat(imageMeta.format)
    : undefined;
  const targetFormat = formatId ? getFormatById(formatId) : undefined;
  if (!targetFormat) {
    throw new ConversionError('INVALID_INPUT', '請指定輸出格式');
  }
  return { targetFormat, imageMeta };
}

// 路由規則的唯一出處：依「目標格式種類」+「sharp 讀不讀得出、是不是動態圖」決定 engine。
// - 目標是圖片：來源必須是 sharp 讀得出的圖片
// - 目標是影音：靜態圖片不行；動態圖（例如動態 GIF，pages > 1）與一般影音走 ffprobe + ffmpeg
// 是不是圖片由 sharp 自己讀不讀得出 metadata 決定，不信任副檔名或前端宣稱的類型
async function chooseEngine(
  inputPath: string,
  targetFormat: FormatDefinition,
  knownImageMeta?: sharp.Metadata,
): Promise<{ engine: 'sharp' } | { engine: 'ffmpeg' }> {
  const imageMeta = knownImageMeta ?? (await tryReadImageMetadata(inputPath));
  if (targetFormat.kind === 'image') {
    if (!imageMeta) {
      throw new ConversionError(
        'UNSUPPORTED_COMBINATION',
        '影音檔案無法轉換為圖片格式',
      );
    }
    return { engine: 'sharp' };
  }
  if (imageMeta && (imageMeta.pages ?? 1) <= 1) {
    throw new ConversionError(
      'UNSUPPORTED_COMBINATION',
      '靜態圖片只能轉換為圖片格式',
    );
  }
  return { engine: 'ffmpeg' };
}

// 只做驗證 + 組裝轉檔計畫，不真正啟動 ffmpeg/sharp；讓呼叫端能在排入轉檔工作前
// 先同步取得驗證結果。knownImageMeta 選填，呼叫端如果已經透過 resolveTargetFormat
// 讀過一次就傳進來，這裡不會再讀第二次
export async function prepareConversion(
  options: Omit<ConvertOptions, 'onProgress'> & {
    knownImageMeta?: sharp.Metadata;
  },
): Promise<PreparedConversion> {
  const targetFormat = getFormatById(options.targetFormatId);
  if (!targetFormat) {
    throw new ConversionError(
      'INVALID_INPUT',
      `不支援的目標格式：${options.targetFormatId}`,
    );
  }
  assertTuningSupported(targetFormat, options.tuning);

  const { engine } = await chooseEngine(
    options.inputPath,
    targetFormat,
    options.knownImageMeta,
  );
  if (engine === 'sharp') {
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

  const sourceSec = Number(probe.format?.duration);

  return {
    plan: {
      engine: 'ffmpeg',
      args,
      durationSec: expectedOutputDurationSec(
        Number.isFinite(sourceSec) ? sourceSec : undefined,
        options.tuning,
      ),
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
