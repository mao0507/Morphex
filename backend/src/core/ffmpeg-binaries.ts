import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { spawnSync } from 'child_process';

export const FFMPEG_PATH = ffmpegInstaller.path;
export const FFPROBE_PATH = ffprobeInstaller.path;

// 各平台的 ffmpeg build 編進的編碼器不同（例：macOS 版沒有 libopencore_amrnb），
// 啟動時查一次，formats.ts 據此濾掉這台機器做不出來的格式
export const FFMPEG_ENCODERS: ReadonlySet<string> = new Set(
  [
    ...spawnSync(FFMPEG_PATH, ['-hide_banner', '-encoders'], {
      encoding: 'utf8',
    }).stdout.matchAll(/^ [VAS][\w.]{5} (\S+)/gm),
  ].map((match) => match[1]),
);
