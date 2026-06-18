import { spawn } from 'child_process';
import { ConversionError } from './errors';
import { FFMPEG_PATH } from './ffmpeg-binaries';

const DEFAULT_FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

export function runFfmpegJob(
  args: string[],
  timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args);

    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new ConversionError('FFMPEG_FAILED', 'ffmpeg 無法啟動', err.message));
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
      resolve();
    });
  });
}
