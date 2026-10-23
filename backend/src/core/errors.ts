export type ConversionErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_COMBINATION'
  | 'PROBE_FAILED'
  | 'FFMPEG_FAILED'
  | 'IMAGE_CONVERT_FAILED'
  | 'TIMEOUT'
  // 指定了目標大小，但一趟 ABR 編完仍超過（極短片、高複雜度畫面時可能發生）
  | 'TARGET_SIZE_EXCEEDED';

export class ConversionError extends Error {
  constructor(
    public readonly code: ConversionErrorCode,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}
