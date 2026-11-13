import { prepareConversion, runPreparedConversion } from '../core/convert';
import type { ConversionEngine } from './conversion.service';

// 正式環境的 engine adapter：格式解析 + probe + 參數組裝在 prepare（快、同步失敗），
// 真正的 ffmpeg/sharp 編碼延到 run
export const coreEngine: ConversionEngine = {
  async prepare({ inputPath, targetFormatId, tuning, outputPathFor }) {
    const prepared = await prepareConversion({
      inputPath,
      outputPath: outputPathFor,
      targetFormatId,
      tuning,
    });
    return {
      formatId: prepared.outputFormatId,
      outputPath: prepared.outputPath,
      run: (onProgress) => runPreparedConversion(prepared, onProgress),
    };
  },
};
