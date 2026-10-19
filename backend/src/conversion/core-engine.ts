import {
  prepareConversion,
  resolveTargetFormat,
  runPreparedConversion,
} from '../core/convert';
import type { ConversionEngine } from './conversion.service';

// 正式環境的 engine adapter：格式解析 + probe + 參數組裝在 prepare（快、同步失敗），
// 真正的 ffmpeg/sharp 編碼延到 run
export const coreEngine: ConversionEngine = {
  async prepare({ inputPath, targetFormatId, tuning, outputPathFor }) {
    // 有帶 format 就直接查表；沒帶（圖片壓縮模式）則用來源檔案本身的格式
    // 當目標格式，讀到的 imageMeta 順便帶給 prepareConversion 用，不用重讀一次
    const { targetFormat, imageMeta } = await resolveTargetFormat(
      inputPath,
      targetFormatId,
    );
    const outputPath = outputPathFor(targetFormat.ext);
    const prepared = await prepareConversion({
      inputPath,
      outputPath,
      targetFormatId: targetFormat.id,
      tuning,
      knownImageMeta: imageMeta,
    });
    return {
      formatId: targetFormat.id,
      outputPath,
      run: (onProgress) => runPreparedConversion(prepared, onProgress),
    };
  },
};
