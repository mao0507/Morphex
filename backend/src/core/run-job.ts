import { spawn } from 'child_process';
import { ConversionError } from './errors';
import { FFMPEG_PATH } from './ffmpeg-binaries';

const DEFAULT_FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;
const PROGRESS_TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

export interface RunFfmpegJobOptions {
  timeoutMs?: number;
  durationSec?: number; // 預期輸出長度（見 expectedOutputDurationSec），不是來源長度
  onProgress?: (percent: number) => void;
}

// ffmpeg 的進度列以 \r 分隔，chunk 邊界可能切在 time= 中間，所以未完成的行
// 留到下一個 chunk 再解析；一個 chunk 有多行時取最後一個 time=（最新的進度）。
// 上限 99，100 只在 ffmpeg 正常結束時回報
export function createProgressTracker(durationSec: number | undefined) {
  let pending = '';
  return {
    feed(chunk: string): number | undefined {
      if (!durationSec || durationSec <= 0) return undefined;
      const lines = (pending + chunk).split(/[\r\n]/);
      pending = lines.pop() ?? '';

      let elapsed: number | undefined;
      for (const line of lines) {
        const match = PROGRESS_TIME_RE.exec(line);
        if (match) {
          elapsed =
            Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        }
      }
      if (elapsed === undefined) return undefined;
      return Math.min(
        99,
        Math.max(0, Math.round((elapsed / durationSec) * 100)),
      );
    },
  };
}

export function runFfmpegJob(
  args: string[],
  options: RunFfmpegJobOptions = {},
): Promise<void> {
  const {
    timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS,
    durationSec,
    onProgress,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args);

    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const progress = createProgressTracker(durationSec);
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      const percent = progress.feed(text);
      if (percent !== undefined) onProgress?.(percent);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new ConversionError('FFMPEG_FAILED', 'ffmpeg 無法啟動', err.message),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new ConversionError('TIMEOUT', 'ffmpeg 轉檔逾時', stderr));
        return;
      }
      if (code !== 0) {
        reject(new ConversionError('FFMPEG_FAILED', 'ffmpeg 轉檔失敗', stderr));
        return;
      }
      onProgress?.(100);
      resolve();
    });
  });
}
