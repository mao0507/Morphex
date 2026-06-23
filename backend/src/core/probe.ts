import { spawn } from 'child_process';
import { ConversionError } from './errors';
import { FFPROBE_PATH } from './ffmpeg-binaries';

export interface ProbeStream {
  index: number;
  codec_type: string;
  codec_name: string;
  disposition?: Record<string, number>;
  [key: string]: unknown;
}

export interface ProbeResult {
  streams: ProbeStream[];
  format?: Record<string, unknown>;
}

const DEFAULT_PROBE_TIMEOUT_MS = 10_000;

export function probeFile(
  filePath: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];
    const child = spawn(FFPROBE_PATH, args);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new ConversionError('PROBE_FAILED', 'ffprobe 無法啟動', err.message),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new ConversionError('TIMEOUT', 'ffprobe 偵測逾時', stderr));
        return;
      }
      if (code !== 0) {
        reject(
          new ConversionError(
            'PROBE_FAILED',
            '無法偵測檔案內容，檔案可能損毀或非媒體檔',
            stderr,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as ProbeResult;
        if (!parsed.streams || parsed.streams.length === 0) {
          reject(
            new ConversionError(
              'PROBE_FAILED',
              '檔案不含任何可用的媒體串流',
              stderr,
            ),
          );
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new ConversionError('PROBE_FAILED', 'ffprobe 輸出解析失敗', stderr),
        );
      }
    });
  });
}
