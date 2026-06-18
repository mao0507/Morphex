import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { UPLOADS_DIR } from './storage.paths';

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

export const multerOptions: MulterOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    // 上傳檔案一律以 UUID 命名，不使用原始檔名，避免 path traversal 與檔名衝突
    filename: (_req, _file, cb) => {
      cb(null, randomUUID());
    },
  }),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES) || DEFAULT_MAX_UPLOAD_BYTES,
  },
};
