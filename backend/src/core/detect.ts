import { MediaKind } from './types';
import { ProbeResult, ProbeStream } from './probe';
import { ConversionError } from './errors';

// 常見「縮圖偽裝成 video stream」的編碼：封面圖、附加圖片等，不視為實際影片內容
const THUMBNAIL_CODECS = new Set(['mjpeg', 'png', 'bmp', 'gif']);

function isThumbnailVideoStream(stream: ProbeStream): boolean {
  if (stream.disposition?.attached_pic === 1) return true;
  return THUMBNAIL_CODECS.has(stream.codec_name);
}

export function detectMediaKind(probe: ProbeResult): MediaKind {
  const hasRealVideo = probe.streams.some(
    (stream) => stream.codec_type === 'video' && !isThumbnailVideoStream(stream),
  );
  if (hasRealVideo) return 'video';

  const hasAudio = probe.streams.some((stream) => stream.codec_type === 'audio');
  if (hasAudio) return 'audio';

  throw new ConversionError(
    'PROBE_FAILED',
    '檔案不含可用的影音串流（可能僅含封面縮圖）',
  );
}
