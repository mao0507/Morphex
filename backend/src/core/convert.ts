import type sharp from 'sharp';
import { FormatDefinition } from './types';
import { assertTuningSupported, getFormatById } from './formats';
import { probeFile } from './probe';
import { detectMediaKind } from './detect';
import { stat } from 'fs/promises';
import {
  buildFfmpegArgs,
  expectedOutputDurationSec,
  targetSizeBytes,
} from './ffmpeg-args';
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
  // 輸出副檔名要等目標格式解析完才知道（壓縮模式沿用來源格式），
  // 所以也可以給一個「副檔名 → 路徑」的函式
  outputPath: string | ((ext: string) => string);
  // 不指定 = 圖片壓縮模式：用來源檔案本身的格式當目標格式
  targetFormatId?: string;
  tuning?: ConvertTuning;
  onProgress?: (percent: number) => void;
}

export interface ConvertResult {
  inputKind: MediaKind;
  outputFormatId: string;
}

export type EnginePlan =
  // durationSec：預期輸出長度（進度分母），見 expectedOutputDurationSec
  // maxBytes：有指定目標大小時的輸出上限，轉完超過就是 TARGET_SIZE_EXCEEDED
  | {
      engine: 'ffmpeg';
      args: string[];
      outputPath: string;
      durationSec?: number;
      maxBytes?: number;
    }
  | SharpConversionPlan;

export interface PreparedConversion {
  plan: EnginePlan;
  inputKind: MediaKind;
  outputFormatId: string;
  outputPath: string;
}

interface ResolvedTargetFormat {
  targetFormat: FormatDefinition;
  // 順手把讀到的 image metadata 帶出去，prepareConversion 收到就不用重讀一次
  imageMeta?: sharp.Metadata;
}

// 決定這次轉檔的目標格式：有明確指定就直接查表；圖片壓縮模式（未指定格式）
// 則用來源檔案本身的格式當目標格式（單純壓縮、不換格式）
async function resolveTargetFormat(
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
// 先同步取得驗證結果。目標格式解析、輸出路徑、engine 選擇都在這一步完成
export async function prepareConversion(
  options: Omit<ConvertOptions, 'onProgress'>,
): Promise<PreparedConversion> {
  const { targetFormat, imageMeta } = await resolveTargetFormat(
    options.inputPath,
    options.targetFormatId,
  );
  const outputPath =
    typeof options.outputPath === 'function'
      ? options.outputPath(targetFormat.ext)
      : options.outputPath;
  assertTuningSupported(targetFormat, options.tuning);

  const { engine } = await chooseEngine(
    options.inputPath,
    targetFormat,
    imageMeta,
  );
  if (engine === 'sharp') {
    return {
      plan: {
        engine: 'sharp',
        inputPath: options.inputPath,
        outputPath,
        targetFormat,
        tuning: options.tuning ?? {},
      },
      inputKind: 'image',
      outputFormatId: targetFormat.id,
      outputPath,
    };
  }

  const probe = await probeFile(options.inputPath);
  const inputKind = detectMediaKind(probe);

  const sourceSec = Number(probe.format?.duration);
  const durationSec = expectedOutputDurationSec(
    Number.isFinite(sourceSec) ? sourceSec : undefined,
    options.tuning,
  );
  const args = buildFfmpegArgs(
    options.inputPath,
    outputPath,
    inputKind,
    targetFormat,
    options.tuning,
    durationSec,
  );
  const targetSizeMB = options.tuning?.targetSizeMB;

  return {
    plan: {
      engine: 'ffmpeg',
      args,
      outputPath,
      durationSec,
      maxBytes:
        targetSizeMB !== undefined ? targetSizeBytes(targetSizeMB) : undefined,
    },
    inputKind,
    outputFormatId: targetFormat.id,
    outputPath,
  };
}

export async function runPreparedConversion(
  prepared: PreparedConversion,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const { plan } = prepared;
  if (plan.engine === 'sharp') {
    return runSharpJob(plan, onProgress);
  }
  await runFfmpegJob(plan.args, {
    durationSec: plan.durationSec,
    onProgress,
  });
  if (plan.maxBytes !== undefined) {
    const { size } = await stat(plan.outputPath);
    if (size > plan.maxBytes) {
      throw new ConversionError(
        'TARGET_SIZE_EXCEEDED',
        '輸出檔案超過目標大小，請調高目標大小',
        `${size} > ${plan.maxBytes} bytes`,
      );
    }
  }
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
