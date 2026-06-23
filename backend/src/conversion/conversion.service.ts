import {
  BadRequestException,
  HttpException,
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
import { prepareConversion, runPreparedConversion } from '../core/convert';
import { ConvertTuning } from '../core/types';
import { FORMATS, getFormatById } from '../core/formats';
import { ensureStorageDirs, OUTPUTS_DIR } from './storage.paths';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  formatId: string;
  outputPath?: string;
  error?: { code: string; message: string };
  createdAt: number;
}

const OUTPUT_TTL_MS = 30 * 60 * 1000; // 暫存輸出檔案最長保留 30 分鐘
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ConversionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversionService.name);
  private readonly jobs = new Map<string, Job>();
  private sweepTimer?: NodeJS.Timeout;

  onModuleInit(): void {
    ensureStorageDirs();
    this.sweepTimer = setInterval(() => {
      void this.sweepExpiredJobs();
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  listFormats() {
    return FORMATS.map(({ id, label, ext, kind }) => ({
      id,
      label,
      ext,
      kind,
    }));
  }

  // 同步完成格式驗證、probe 與 ffmpeg 參數組裝（快），失敗就直接回 4xx；
  // 真正耗時的 ffmpeg 編碼則在背景執行，透過 job 的 progress 供前端輪詢
  async convert(
    file: Express.Multer.File,
    targetFormatId: string,
    tuning?: ConvertTuning,
  ): Promise<{ id: string; status: JobStatus; progress: number }> {
    const targetFormat = getFormatById(targetFormatId);
    if (!targetFormat) {
      await this.removeQuietly(file.path);
      throw new BadRequestException(`不支援的目標格式：${targetFormatId}`);
    }

    const id = randomUUID();
    const outputPath = join(OUTPUTS_DIR, `${id}.${targetFormat.ext}`);

    let prepared: Awaited<ReturnType<typeof prepareConversion>>;
    try {
      prepared = await prepareConversion({
        inputPath: file.path,
        outputPath,
        targetFormatId,
        tuning,
      });
    } catch (err) {
      await this.removeQuietly(file.path);
      throw this.toHttpException(err);
    }

    const job: Job = {
      id,
      status: 'processing',
      progress: 0,
      formatId: targetFormat.id,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);

    void this.runJob(job, prepared, file.path, outputPath);

    return { id: job.id, status: job.status, progress: job.progress };
  }

  getStatus(id: string) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException('找不到轉檔工作');
    }

    const format = getFormatById(job.formatId);
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      ...(job.status === 'done'
        ? { downloadUrl: `/download/${job.id}`, ext: format?.ext }
        : {}),
      ...(job.status === 'error' ? { error: job.error } : {}),
    };
  }

  getOutputForDownload(id: string): { path: string; ext: string } {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'done' || !job.outputPath) {
      throw new NotFoundException('找不到轉檔結果，可能已過期或下載連結錯誤');
    }
    const format = getFormatById(job.formatId);
    return { path: job.outputPath, ext: format?.ext ?? 'bin' };
  }

  async releaseOutput(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    if (job.outputPath) await this.removeQuietly(job.outputPath);
  }

  private async runJob(
    job: Job,
    prepared: Awaited<ReturnType<typeof prepareConversion>>,
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    try {
      await runPreparedConversion(prepared, (percent) => {
        job.progress = percent;
      });
      job.status = 'done';
      job.progress = 100;
      job.outputPath = outputPath;
    } catch (err) {
      await this.removeQuietly(outputPath);
      job.status = 'error';
      job.error = this.toErrorPayload(err);
    } finally {
      // 輸入檔案轉檔完成（無論成功或失敗）即可清除，僅輸出檔案需保留供下載
      await this.removeQuietly(inputPath);
    }
  }

  private toErrorPayload(err: unknown): { code: string; message: string } {
    if (err instanceof ConversionError) {
      this.logger.error(`轉檔失敗 [${err.code}] ${err.message}`, err.details);
      return { code: err.code, message: err.message };
    }
    this.logger.error(
      '未預期的轉檔錯誤',
      err instanceof Error ? err.stack : String(err),
    );
    return { code: 'FFMPEG_FAILED', message: '轉檔過程發生錯誤，請稍後再試' };
  }

  private toHttpException(err: unknown): HttpException {
    const payload = this.toErrorPayload(err);
    switch (payload.code) {
      case 'INVALID_INPUT':
      case 'UNSUPPORTED_COMBINATION':
      case 'PROBE_FAILED':
        return new BadRequestException(payload.message);
      case 'TIMEOUT':
        return new RequestTimeoutException(payload.message);
      case 'FFMPEG_FAILED':
      default:
        return new InternalServerErrorException('轉檔過程發生錯誤，請稍後再試');
    }
  }

  private async removeQuietly(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch (err) {
      this.logger.warn(
        `清除暫存檔失敗: ${path}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async sweepExpiredJobs(): Promise<void> {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > OUTPUT_TTL_MS) {
        this.jobs.delete(id);
        if (job.outputPath) await this.removeQuietly(job.outputPath);
      }
    }

    // 額外保護：掃描輸出資料夾，清除任何未被 registry 追蹤但已過期的殘留檔案
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(OUTPUTS_DIR);
      for (const name of files) {
        const fullPath = join(OUTPUTS_DIR, name);
        const isTracked = [...this.jobs.values()].some(
          (job) => job.outputPath === fullPath,
        );
        if (isTracked) continue;
        const info = await stat(fullPath).catch(() => null);
        if (info && now - info.mtimeMs > OUTPUT_TTL_MS) {
          await this.removeQuietly(fullPath);
        }
      }
    } catch (err) {
      this.logger.warn(
        '掃描殘留輸出檔案失敗',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
