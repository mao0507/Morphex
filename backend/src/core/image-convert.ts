import sharp from 'sharp';
import { ConversionError } from './errors';
import { ConvertTuning, FormatDefinition } from './types';

const SHARP_FORMAT: Record<string, keyof sharp.FormatEnum | 'avif'> = {
  jpg: 'jpeg',
  png: 'png',
  webp: 'webp',
  tiff: 'tiff',
  avif: 'avif',
};

export interface SharpConversionPlan {
  engine: 'sharp';
  inputPath: string;
  outputPath: string;
  targetFormat: FormatDefinition;
  tuning: ConvertTuning;
}

// 用 sharp 本身能不能讀出 metadata 來判斷「這是不是圖片」，跟 ffprobe 對影音的
// 角色一樣：後端自己驗證，不信任副檔名或前端宣稱的類型
export async function tryReadImageMetadata(
  inputPath: string,
): Promise<sharp.Metadata | undefined> {
  try {
    return await sharp(inputPath, { failOn: 'none' }).metadata();
  } catch {
    return undefined;
  }
}

export function validateImageCombination(targetFormat: FormatDefinition): void {
  if (targetFormat.kind !== 'image') {
    throw new ConversionError(
      'UNSUPPORTED_COMBINATION',
      '圖片檔案只能轉換為圖片格式',
    );
  }
}

export async function runSharpJob(
  plan: SharpConversionPlan,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const sharpFormat = SHARP_FORMAT[plan.targetFormat.id];
  if (!sharpFormat) {
    throw new ConversionError(
      'INVALID_INPUT',
      `不支援的圖片格式：${plan.targetFormat.id}`,
    );
  }

  onProgress?.(0);

  try {
    let pipeline = sharp(plan.inputPath, { failOn: 'none' });

    if (plan.tuning.resolution) {
      const [width, height] = plan.tuning.resolution.split('x').map(Number);
      pipeline = pipeline.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // sharp 預設輸出就會去掉 EXIF/ICC 等 metadata，跟 ffmpeg 預設「保留」相反；
    // 這裡刻意反過來接，讓「去除 metadata」勾選框在兩條 pipeline 語意一致：
    // 沒勾 = 保留原始 metadata（呼叫 withMetadata() 蓋掉 sharp 的預設行為）
    if (!plan.tuning.stripMetadata) {
      pipeline = pipeline.withMetadata();
    }

    const quality = plan.tuning.quality;
    pipeline = pipeline.toFormat(
      sharpFormat,
      quality !== undefined ? { quality } : undefined,
    );

    await pipeline.toFile(plan.outputPath);
    onProgress?.(100);
  } catch (err) {
    if (err instanceof ConversionError) throw err;
    throw new ConversionError(
      'IMAGE_CONVERT_FAILED',
      '圖片轉檔失敗',
      err instanceof Error ? err.message : String(err),
    );
  }
}
