export type ConversionErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_COMBINATION'
  | 'PROBE_FAILED'
  | 'FFMPEG_FAILED'
  | 'TIMEOUT';

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
