import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { FFMPEG_PATH } from '../src/core/ffmpeg-binaries';

describe('Conversion API (e2e)', () => {
  let app: INestApplication;
  let workDir: string;
  let sampleVideoPath: string;
  let sampleAudioPath: string;
  let sampleImagePath: string;
  let brokenFilePath: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    workDir = mkdtempSync(join(tmpdir(), 'convertflow-e2e-'));
    sampleVideoPath = join(workDir, 'sample.mp4');
    sampleAudioPath = join(workDir, 'sample.mp3');
    sampleImagePath = join(workDir, 'sample.jpg');
    brokenFilePath = join(workDir, 'broken.mp4');

    spawnSync(FFMPEG_PATH, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=64x64:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      sampleVideoPath,
    ]);
    spawnSync(FFMPEG_PATH, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=1',
      '-c:a',
      'libmp3lame',
      sampleAudioPath,
    ]);
    writeFileSync(brokenFilePath, 'not a real media file');

    await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 3,
        background: { r: 10, g: 120, b: 200 },
      },
    })
      .jpeg()
      .toFile(sampleImagePath);
  });

  afterAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
    await app.close();
  });

  // POST /convert 只同步做格式驗證與 probe，ffmpeg 編碼在背景跑，需輪詢 status 至 done/error
  async function waitForJobDone(
    id: string,
  ): Promise<{ status: string; downloadUrl?: string; error?: unknown }> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/convert/${id}/status`)
        .expect(200);
      if (res.body.status === 'done' || res.body.status === 'error') {
        return res.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`轉檔工作 ${id} 逾時未完成`);
  }

  it('GET /formats 回傳格式清單', async () => {
    const res = await request(app.getHttpServer()).get('/formats').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((f: { id: string }) => f.id === 'mp4')).toBe(true);
  });

  it('影片轉影片：mp4 -> webm', async () => {
    const res = await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleVideoPath)
      .field('format', 'webm')
      .expect(202);

    expect(res.body.id).toBeTruthy();

    const status = await waitForJobDone(res.body.id);
    expect(status.status).toBe('done');
    expect(status.downloadUrl).toMatch(/^\/download\//);

    await request(app.getHttpServer())
      .get(status.downloadUrl!)
      .expect(200)
      .expect('Content-Disposition', /attachment/);

    // 下載後即刪除，重複下載應 404
    await request(app.getHttpServer()).get(status.downloadUrl!).expect(404);
  }, 30_000);

  it('影片轉音訊：mp4 -> mp3', async () => {
    const res = await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleVideoPath)
      .field('format', 'mp3')
      .expect(202);

    const status = await waitForJobDone(res.body.id);
    expect(status.status).toBe('done');
    await request(app.getHttpServer()).get(status.downloadUrl!).expect(200);
  }, 30_000);

  it('音訊轉音訊：mp3 -> flac', async () => {
    const res = await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleAudioPath)
      .field('format', 'flac')
      .expect(202);

    const status = await waitForJobDone(res.body.id);
    expect(status.status).toBe('done');
    await request(app.getHttpServer()).get(status.downloadUrl!).expect(200);
  }, 30_000);

  it('帶進階參數（resolution/normalizeAudio）：轉檔成功', async () => {
    const res = await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleVideoPath)
      .field('format', 'webm')
      .field('resolution', '32x32')
      .field('normalizeAudio', 'true')
      .expect(202);

    const status = await waitForJobDone(res.body.id);
    expect(status.status).toBe('done');
    await request(app.getHttpServer()).get(status.downloadUrl!).expect(200);
  }, 30_000);

  it('壓縮模式（圖片不帶 format）：自動用來源格式，輸出仍是 jpg', async () => {
    const res = await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleImagePath)
      .field('quality', '50')
      .expect(202);

    const status = await waitForJobDone(res.body.id);
    expect(status.status).toBe('done');
    expect(status.ext).toBe('jpg');
    await request(app.getHttpServer()).get(status.downloadUrl!).expect(200);
  }, 15_000);

  it('不帶 format 的非圖片檔案（影片）：回傳 400', async () => {
    await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleVideoPath)
      .expect(400);
  }, 15_000);

  it('音訊轉影片：回傳 400', async () => {
    await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleAudioPath)
      .field('format', 'mp4')
      .expect(400);
  }, 15_000);

  it('非媒體檔（損毀檔案）：回傳 400', async () => {
    await request(app.getHttpServer())
      .post('/convert')
      .attach('file', brokenFilePath)
      .field('format', 'mp3')
      .expect(400);
  }, 15_000);

  it('未知輸出格式：回傳 400', async () => {
    await request(app.getHttpServer())
      .post('/convert')
      .attach('file', sampleVideoPath)
      .field('format', 'does-not-exist')
      .expect(400);
  }, 15_000);

  it('未提供檔案：回傳 400', async () => {
    await request(app.getHttpServer())
      .post('/convert')
      .field('format', 'mp4')
      .expect(400);
  });

  it('下載不存在的 id：回傳 404', async () => {
    await request(app.getHttpServer())
      .get('/download/not-a-real-id')
      .expect(404);
  });

  it('查詢不存在的轉檔工作：回傳 404', async () => {
    await request(app.getHttpServer())
      .get('/convert/not-a-real-id/status')
      .expect(404);
  });

  it('暫存資料夾在請求結束後不殘留 uploads/outputs 檔案', () => {
    const uploadsDir = join(process.cwd(), 'tmp', 'uploads');
    const outputsDir = join(process.cwd(), 'tmp', 'outputs');
    const fs = require('fs');
    const leftoverUploads = existsSync(uploadsDir)
      ? fs.readdirSync(uploadsDir)
      : [];
    const leftoverOutputs = existsSync(outputsDir)
      ? fs.readdirSync(outputsDir)
      : [];
    expect(leftoverUploads).toEqual([]);
    expect(leftoverOutputs).toEqual([]);
  });
});
