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

const FORMAT_ID_BY_SHARP_FORMAT = Object.fromEntries(
  Object.entries(SHARP_FORMAT).map(([id, sharpFormat]) => [sharpFormat, id]),
);

// 圖片壓縮模式（未指定目標格式）用來把 sharp 讀出的來源格式反查回 FORMATS 的 id，
// 讀不出來或不是我們支援的圖片格式就回傳 undefined，交由呼叫端要求使用者手動選格式
export function formatIdForSharpFormat(
  sharpFormat: string,
): string | undefined {
  return FORMAT_ID_BY_SHARP_FORMAT[sharpFormat];
}

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
    // PNG 是無損格式，quality 選項本身無效；要真的壓縮須搭配 palette（調色盤量化，
    // 效果類似 pngquant/TinyPNG），所以目標是 png 時一併開啟
    pipeline = pipeline.toFormat(
      sharpFormat,
      quality !== undefined
        ? sharpFormat === 'png'
          ? { quality, palette: true }
          : { quality }
        : undefined,
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
