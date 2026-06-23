# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MediaForge: web-based media conversion tool. Upload file(s) → pick output format and optional advanced options (resolution/frame rate/bitrate/trim/normalize/strip metadata) → async ffmpeg conversion with progress polling → download link. Multi-file queue is client-orchestrated (one independent job per file); the backend has no DB, no auth, no persistent history — jobs live in an in-memory map and are swept after 30 minutes (see `ConvertFlow_MVP_開發計畫.md` for the original single-file MVP baseline this evolved from).

Monorepo, two independent npm projects: `backend/` (NestJS) and `frontend/` (Vue 3 + Vite). No shared root package.json.

## Commands

Backend (`cd backend`):
- `npm run start:dev` — dev server w/ watch, default port 3000 (override with `PORT` env var)
- `npm run build` — `nest build`
- `npm test` — unit tests (`src/**/*.spec.ts`) + integration tests that shell out to real ffmpeg/ffprobe (`convert.integration.spec.ts`)
- `npx jest src/core/detect.spec.ts` — run a single unit test file
- `npm run test:e2e` — full HTTP API tests via supertest (`test/conversion.e2e-spec.ts`), also asserts tmp dirs are empty after the run
- `npm run lint` — eslint

Frontend (`cd frontend`):
- `npm run dev` — Vite dev server, default port 5173; set `VITE_API_BASE_URL` to point at a non-default backend
- `npm run build` / `npm run preview`

ffmpeg/ffprobe binaries come from `@ffmpeg-installer/ffmpeg` / `@ffprobe-installer/ffprobe` (installed via `npm install`, resolved in `backend/src/core/ffmpeg-binaries.ts`) — no system `PATH` install needed. Both unit-level integration tests and the app itself spawn these real binaries (no mocking).

## Architecture

### Core conversion logic is framework-free (`backend/src/core/`)

This is the load-bearing design constraint: everything in `core/` must be callable without NestJS, because the project may later move into an Electron main process. Never put conversion logic directly in a controller or service — controllers/services only orchestrate calls into `core/`.

- `types.ts` — `FormatDefinition`, `MediaKind`, `ConvertTuning` (optional resolution/frameRateFps/videoBitrateKbps/audioBitrateKbps/trimStartSec/trimEndSec/normalizeAudio/stripMetadata — all optional, undefined means "use format/source default").
- `formats.ts` — `FORMATS` array is the single source of truth for supported formats (id, label, ext, kind, videoCodec, audioCodec, extraArgs, mimeTypes). Adding a format = adding an entry here, nothing else.
- `ffmpeg-binaries.ts` — `FFMPEG_PATH` / `FFPROBE_PATH` resolved from the installer packages; every spawn elsewhere uses these constants instead of bare `'ffmpeg'`/`'ffprobe'` strings.
- `probe.ts` — `probeFile()` spawns `ffprobe -show_streams -show_format`, JSON-parses output, timeout-guarded, rejects with `ConversionError('PROBE_FAILED', ...)` if no streams.
- `detect.ts` — `detectMediaKind()` decides video vs audio. Video streams whose codec is mjpeg/png/bmp/gif, or whose disposition has `attached_pic: 1`, are treated as cover-art thumbnails and ignored — a file with only a thumbnail + audio stream is classified `audio`, not `video`.
- `ffmpeg-args.ts` — `validateCombination()` rejects audio→video before anything touches ffmpeg; `buildFfmpegArgs()` takes an optional `ConvertTuning` and always returns an argv array (never a shell string) for `spawn`. Trim becomes `-ss`/`-t`, resolution becomes `-vf scale=`, normalize becomes `-af loudnorm`, strip-metadata becomes `-map_metadata -1` — video-only knobs (resolution/frameRate/videoBitrate) are skipped when the target format is audio.
- `run-job.ts` — `runFfmpegJob()` spawns ffmpeg with argv array, timeout-guarded, captures stderr for error reporting. Accepts `{ durationSec, onProgress }`: parses `time=HH:MM:SS` out of stderr and reports 0–99% against `durationSec`, then 100% on a clean exit.
- `convert.ts` — split into `prepareConversion()` (probe → detect → validate → build args, no ffmpeg spawn — fast, used for synchronous up-front validation) and `runPreparedConversion()` (spawns ffmpeg with progress callback). `convertFile()` is a thin wrapper that does both in sequence, kept for callers (and tests) that don't need progress/async job semantics.
- `errors.ts` — `ConversionError` has a `code`: `INVALID_INPUT | UNSUPPORTED_COMBINATION | PROBE_FAILED | FFMPEG_FAILED | TIMEOUT`. The API layer maps these codes to HTTP status codes (400 for the first three, 408 for timeout, 500 for ffmpeg failure) — see `conversion.service.ts#toHttpException`.

### API layer (`backend/src/conversion/`) — async job model

- Uploads go through multer (`multer.config.ts`) straight to disk, filename forced to `randomUUID()` — original filenames are never used as paths (traversal prevention).
- `POST /convert` is split into a fast synchronous half and a slow async half: it runs `prepareConversion()` (format lookup + probe + detect + validateCombination) synchronously and throws a normal 4xx/408 if that fails — so invalid format / unsupported combination / corrupt file still fail immediately, same as before. If prepare succeeds, it registers a job, kicks off `runPreparedConversion()` in the background (not awaited), and responds `202 { id, status: 'queued'|'processing', progress }` immediately. There is no batch endpoint — multiple files means multiple independent `POST /convert` calls; the frontend queue is client-side state only.
- `GET /convert/:id/status` polls a job: `{ id, status, progress }`, plus `downloadUrl`/`ext` once `status === 'done'`, or `error: { code, message }` once `status === 'error'`. Unknown id → 404.
- `tuning.parser.ts#parseTuningOptions()` turns the multipart string fields (`resolution`, `frameRate`, `videoBitrate`, `audioBitrate`, `trimStart`, `trimEnd`, `normalizeAudio`, `stripMetadata`) into a `ConvertTuning`, dropping anything malformed/empty.
- `ConversionService` keeps an in-memory `Map` of job id → `{ status, progress, formatId, outputPath?, error?, createdAt }` (no DB). Input file is deleted as soon as the background job finishes (success or failure, in a `finally`); output file is deleted the moment it's streamed for download (one-shot download), and a 5-minute sweep also clears any job/output older than 30 minutes in case it's never downloaded.
- `GET /download/:id` never builds a filesystem path from the user-supplied `id` directly — it always looks up the job registry first (and requires `status === 'done'`), so an unknown/malicious/not-yet-finished id just 404s.
- Storage paths: `backend/tmp/uploads` and `backend/tmp/outputs` (gitignored, created on module init).

### Frontend (`frontend/src/App.vue`)

Single-component app, no router, no state library — but it now manages a client-side multi-file queue (drag & drop or multi-select), each entry tracking its own format, advanced tuning options, and `idle|queued|processing|done|error` status. Per-file conversion: `POST /convert` then poll `GET /convert/:id/status` every ~800ms until `done`/`error`, updating that entry's progress bar. "全部轉換"/"全部下載" just loop over queue entries client-side — there is no backend batch concept. Light/dark theme is a `data-theme` attribute toggle (persisted to `localStorage`, defaults to `prefers-color-scheme`) on top of CSS variables in `style.css`. CORS is enabled wide-open on the backend (`app.enableCors()`), expected to be tightened later.


## git commit
- git commit 訊息 請使用正體中文
- 必須要有 type (Prefix)，請參照類別規範
- 必須要有 subject
  - 不超過 50 個字元
  - 結尾不加句號
  - 盡量讓 Commit 單一化，一次只更動一個主題

### <type> 類別規範
* feat：新增或修改功能（feature）
* fix：修補 bug（bug fix）
* docs：文件（documentation）
* style：格式
* refactor：重構
* perf：改善效能（improves performance）
* test：增加測試（when adding missing tests）
* chore：maintain，不影響程式碼運行，建構程序或輔助工具的變動
* revert：撤銷回覆先前的 commit
