import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  RequestTimeoutException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { open, readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { pipeline, Writable } from 'stream';
import { ConversionError } from '../core/errors';
import { ConvertTuning } from '../core/types';
import {
  ConvertRequestBody,
  parseConvertRequest,
  REQUEST_FIELD_BY_TUNING_KEY,
} from './tuning.parser';
import { FORMATS, getFormatById, unsupportedTuningOf } from '../core/formats';
import { coreEngine } from './core-engine';
import { OUTPUTS_DIR, UPLOADS_DIR } from './storage.paths';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface PreparedJob {
  formatId: string;
  outputPath: string;
  run: (onProgress: (percent: number) => void) => Promise<void>;
}

// Engine seam：prepare 失敗代表輸入/組合不合法（同步回 4xx），run 是背景編碼。
// 正式環境是 core-engine.ts，測試用假 engine
export interface ConversionEngine {
  prepare: (request: {
    inputPath: string;
    targetFormatId?: string;
    tuning?: ConvertTuning;
    outputPathFor: (ext: string) => string;
  }) => Promise<PreparedJob>;
}

export interface ConversionDeps {
  engine: ConversionEngine;
  uploadsDir: string;
  outputsDir: string;
  now: () => number;
}

export const CONVERSION_DEPS = Symbol('CONVERSION_DEPS');

interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  formatId: string;
  outputPath?: string;
  error?: { code: string; message: string };
  createdAt: number;
}

export const JOB_TTL_MS = 30 * 60 * 1000; // 暫存輸出檔案最長保留 30 分鐘
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Job 生命週期的唯一 owner：job registry、上傳/輸出暫存檔的刪除時機、
// 一次性下載、TTL 與孤兒檔清除、錯誤形狀都在這裡。controller 只做 HTTP 轉譯
@Injectable()
export class ConversionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversionService.name);
  private readonly jobs = new Map<string, Job>();
  private readonly deps: ConversionDeps;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @Optional() @Inject(CONVERSION_DEPS) deps: Partial<ConversionDeps> = {},
  ) {
    this.deps = {
      engine: coreEngine,
      uploadsDir: UPLOADS_DIR,
      outputsDir: OUTPUTS_DIR,
      now: Date.now,
      ...deps,
    };
  }

  onModuleInit(): void {
    mkdirSync(this.deps.uploadsDir, { recursive: true });
    mkdirSync(this.deps.outputsDir, { recursive: true });
    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  listFormats() {
    return FORMATS.map((format) => ({
      id: format.id,
      label: format.label,
      ext: format.ext,
      kind: format.kind,
      unsupportedFields: unsupportedTuningOf(format).map(
        (key) => REQUEST_FIELD_BY_TUNING_KEY[key],
      ),
    }));
  }

  // 同步完成格式解析、probe 與參數組裝（快），失敗就直接回 4xx；
  // 真正耗時的編碼則在背景執行，透過 job 的 progress 供前端輪詢
  // 解析 body 也在 try 裡：不合法的參數跟 prepare 失敗一樣，刪掉上傳檔、回 { code, message }
  async convert(
    file: Express.Multer.File,
    body: ConvertRequestBody,
  ): Promise<{ id: string; status: JobStatus; progress: number }> {
    const id = randomUUID();

    let prepared: PreparedJob;
    try {
      const { targetFormatId, tuning } = parseConvertRequest(body);
      prepared = await this.deps.engine.prepare({
        inputPath: file.path,
        targetFormatId,
        tuning,
        outputPathFor: (ext) => join(this.deps.outputsDir, `${id}.${ext}`),
      });
    } catch (err) {
      await this.removeQuietly(file.path);
      throw this.toHttpException(err);
    }

    const job: Job = {
      id,
      status: 'processing',
      progress: 0,
      formatId: prepared.formatId,
      createdAt: this.deps.now(),
    };
    this.jobs.set(id, job);

    void this.runJob(job, prepared, file.path);

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

  // 一次性下載：先打開檔案（失敗就在送 header 前回 404），pipeTo 完整寫完才刪檔、
  // 移除 job；中途中斷則保留到 TTL，讓 sweep 收拾
  async openDownload(
    id: string,
  ): Promise<{ ext: string; pipeTo: (dest: Writable) => void }> {
    const job = this.jobs.get(id);
    const handle =
      job?.status === 'done' && job.outputPath
        ? await open(job.outputPath).catch(() => null)
        : null;
    if (!job || !handle) {
      throw new NotFoundException('找不到轉檔結果，可能已過期或下載連結錯誤');
    }

    return {
      ext: getFormatById(job.formatId)?.ext ?? 'bin',
      pipeTo: (dest) => {
        const source = handle.createReadStream();
        pipeline(source, dest, (err) => {
          if (err) {
            this.logger.warn(`下載未完成 (${id}): ${err.message}`);
            return;
          }
          // 等 fd 關掉才刪：Windows 上刪除仍開著的檔案，檔案會殘留到 handle 關閉
          if (source.closed) void this.releaseOutput(id);
          else source.once('close', () => void this.releaseOutput(id));
        });
      },
    };
  }

  // 清除過期 job（連同 output）與兩個暫存資料夾裡沒被追蹤、已過期的孤兒檔
  async sweep(): Promise<void> {
    const now = this.deps.now();
    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > JOB_TTL_MS) {
        this.jobs.delete(id);
        if (job.outputPath) await this.removeQuietly(job.outputPath);
      }
    }

    const tracked = new Set(
      [...this.jobs.values()].map((job) => job.outputPath),
    );
    await this.sweepOrphans(this.deps.outputsDir, tracked, now);
    // 上傳檔案理論上會在 job 結束時立即刪除，殘留且過期的必是 removeQuietly 失敗留下的孤兒
    await this.sweepOrphans(this.deps.uploadsDir, new Set(), now);
  }

  private async releaseOutput(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    if (job.outputPath) await this.removeQuietly(job.outputPath);
  }

  // 先清掉 input（成功失敗都不再需要）再更新最終狀態，呼叫端看到 done/error 時暫存檔已收拾好
  private async runJob(
    job: Job,
    prepared: PreparedJob,
    inputPath: string,
  ): Promise<void> {
    let failure: unknown;
    try {
      await prepared.run((percent) => {
        job.progress = percent;
      });
    } catch (err) {
      failure = err ?? new Error('轉檔失敗');
    }
    await this.removeQuietly(inputPath);

    if (failure) {
      await this.removeQuietly(prepared.outputPath);
      job.status = 'error';
      job.error = this.toErrorPayload(failure);
    } else {
      job.status = 'done';
      job.progress = 100;
      job.outputPath = prepared.outputPath;
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

  // body 跟 GET /convert/:id/status 的 error 欄位同形 { code, message }，前端靠 code 顯示對應訊息
  private toHttpException(err: unknown): HttpException {
    const payload = this.toErrorPayload(err);
    switch (payload.code) {
      case 'INVALID_INPUT':
      case 'UNSUPPORTED_COMBINATION':
      case 'PROBE_FAILED':
        return new BadRequestException(payload);
      case 'TIMEOUT':
        return new RequestTimeoutException(payload);
      case 'FFMPEG_FAILED':
      case 'IMAGE_CONVERT_FAILED':
      default:
        return new InternalServerErrorException({
          code: payload.code,
          message: '轉檔過程發生錯誤，請稍後再試',
        });
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

  private async sweepOrphans(
    dir: string,
    tracked: Set<string | undefined>,
    now: number,
  ): Promise<void> {
    try {
      for (const name of await readdir(dir)) {
        const fullPath = join(dir, name);
        if (tracked.has(fullPath)) continue;
        const info = await stat(fullPath).catch(() => null);
        if (info && now - info.mtimeMs > JOB_TTL_MS) {
          await this.removeQuietly(fullPath);
        }
      }
    } catch (err) {
      this.logger.warn(
        `掃描殘留暫存檔失敗: ${dir}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
