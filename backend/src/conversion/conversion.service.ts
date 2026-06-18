import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  RequestTimeoutException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { rm, stat } from 'fs/promises';
import { join } from 'path';
import { ConversionError } from '../core/errors';
import { convertFile } from '../core/convert';
import { FORMATS, getFormatById } from '../core/formats';
import { ensureStorageDirs, OUTPUTS_DIR } from './storage.paths';

interface OutputEntry {
  path: string;
  formatId: string;
  createdAt: number;
}

const OUTPUT_TTL_MS = 30 * 60 * 1000; // 暫存輸出檔案最長保留 30 分鐘
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ConversionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversionService.name);
  private readonly outputs = new Map<string, OutputEntry>();
  private sweepTimer?: NodeJS.Timeout;

  onModuleInit(): void {
    ensureStorageDirs();
    this.sweepTimer = setInterval(() => this.sweepExpiredOutputs(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  listFormats() {
    return FORMATS.map(({ id, label, ext, kind }) => ({ id, label, ext, kind }));
  }

  async convert(file: Express.Multer.File, targetFormatId: string) {
    const targetFormat = getFormatById(targetFormatId);
    if (!targetFormat) {
      await this.removeQuietly(file.path);
      throw new BadRequestException(`不支援的目標格式：${targetFormatId}`);
    }

    const id = randomUUID();
    const outputPath = join(OUTPUTS_DIR, `${id}.${targetFormat.ext}`);

    try {
      await convertFile({
        inputPath: file.path,
        outputPath,
        targetFormatId: targetFormat.id,
      });
    } catch (err) {
      await this.removeQuietly(outputPath);
      throw this.mapConversionError(err);
    } finally {
      // 輸入檔案轉檔完成（無論成功或失敗）即可清除，僅輸出檔案需保留供下載
      await this.removeQuietly(file.path);
    }

    this.outputs.set(id, { path: outputPath, formatId: targetFormat.id, createdAt: Date.now() });

    return {
      id,
      format: targetFormat.id,
      ext: targetFormat.ext,
      downloadUrl: `/download/${id}`,
    };
  }

  getOutputForDownload(id: string): { path: string; ext: string } {
    const entry = this.outputs.get(id);
    if (!entry) {
      throw new NotFoundException('找不到轉檔結果，可能已過期或下載連結錯誤');
    }
    const format = getFormatById(entry.formatId);
    return { path: entry.path, ext: format?.ext ?? 'bin' };
  }

  async releaseOutput(id: string): Promise<void> {
    const entry = this.outputs.get(id);
    if (!entry) return;
    this.outputs.delete(id);
    await this.removeQuietly(entry.path);
  }

  private mapConversionError(err: unknown): Error {
    if (err instanceof ConversionError) {
      this.logger.error(`轉檔失敗 [${err.code}] ${err.message}`, err.details);
      switch (err.code) {
        case 'INVALID_INPUT':
        case 'UNSUPPORTED_COMBINATION':
        case 'PROBE_FAILED':
          return new BadRequestException(err.message);
        case 'TIMEOUT':
          return new RequestTimeoutException(err.message);
        case 'FFMPEG_FAILED':
        default:
          return new InternalServerErrorException('轉檔過程發生錯誤，請稍後再試');
      }
    }
    this.logger.error('未預期的轉檔錯誤', err instanceof Error ? err.stack : String(err));
    return new InternalServerErrorException('轉檔過程發生錯誤，請稍後再試');
  }

  private async removeQuietly(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch (err) {
      this.logger.warn(`清除暫存檔失敗: ${path}`, err instanceof Error ? err.message : String(err));
    }
  }

  private async sweepExpiredOutputs(): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.outputs.entries()) {
      if (now - entry.createdAt > OUTPUT_TTL_MS) {
        this.outputs.delete(id);
        await this.removeQuietly(entry.path);
      }
    }

    // 額外保護：掃描輸出資料夾，清除任何未被 registry 追蹤但已過期的殘留檔案
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(OUTPUTS_DIR);
      for (const name of files) {
        const fullPath = join(OUTPUTS_DIR, name);
        const isTracked = [...this.outputs.values()].some((entry) => entry.path === fullPath);
        if (isTracked) continue;
        const info = await stat(fullPath).catch(() => null);
        if (info && now - info.mtimeMs > OUTPUT_TTL_MS) {
          await this.removeQuietly(fullPath);
        }
      }
    } catch (err) {
      this.logger.warn('掃描殘留輸出檔案失敗', err instanceof Error ? err.message : String(err));
    }
  }
}
