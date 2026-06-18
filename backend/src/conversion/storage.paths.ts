import { join } from 'path';
import { mkdirSync } from 'fs';

export const UPLOADS_DIR = join(process.cwd(), 'tmp', 'uploads');
export const OUTPUTS_DIR = join(process.cwd(), 'tmp', 'outputs');

export function ensureStorageDirs(): void {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  mkdirSync(OUTPUTS_DIR, { recursive: true });
}
