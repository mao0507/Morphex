import { spawn } from 'child_process';
import { ConversionError } from './errors';
import { FFMPEG_PATH } from './ffmpeg-binaries';

const DEFAULT_FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;
const PROGRESS_TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

export interface RunFfmpegJobOptions {
  timeoutMs?: number;
  durationSec?: number;
  onProgress?: (percent: number) => void;
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

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      if (onProgress && durationSec && durationSec > 0) {
        const match = text.match(PROGRESS_TIME_RE);
        if (match) {
          const elapsed =
            Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
          const percent = Math.min(
            99,
            Math.max(0, Math.round((elapsed / durationSec) * 100)),
          );
          onProgress(percent);
        }
      }
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
