# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MediaForge: web-based media conversion tool (MVP). Upload file → pick output format → synchronous ffmpeg conversion → download link. No queue, no progress bar, no auth, no history — those are explicitly out of scope for this stage (see `ConvertFlow_MVP_開發計畫.md`).

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

- `types.ts` — `FormatDefinition`, `MediaKind`
- `formats.ts` — `FORMATS` array is the single source of truth for supported formats (id, label, ext, kind, videoCodec, audioCodec, extraArgs, mimeTypes). Adding a format = adding an entry here, nothing else.
- `ffmpeg-binaries.ts` — `FFMPEG_PATH` / `FFPROBE_PATH` resolved from the installer packages; every spawn elsewhere uses these constants instead of bare `'ffmpeg'`/`'ffprobe'` strings.
- `probe.ts` — `probeFile()` spawns `ffprobe -show_streams -show_format`, JSON-parses output, timeout-guarded, rejects with `ConversionError('PROBE_FAILED', ...)` if no streams.
- `detect.ts` — `detectMediaKind()` decides video vs audio. Video streams whose codec is mjpeg/png/bmp/gif, or whose disposition has `attached_pic: 1`, are treated as cover-art thumbnails and ignored — a file with only a thumbnail + audio stream is classified `audio`, not `video`.
- `ffmpeg-args.ts` — `validateCombination()` rejects audio→video before anything touches ffmpeg; `buildFfmpegArgs()` always returns an argv array (never a shell string) for `spawn`.
- `run-job.ts` — `runFfmpegJob()` spawns ffmpeg with argv array, timeout-guarded, captures stderr for error reporting.
- `convert.ts` — `convertFile()` is the one entry point that wires probe → detect → validate/build args → run job. This is what the NestJS layer (and any future Electron layer) calls.
- `errors.ts` — `ConversionError` has a `code`: `INVALID_INPUT | UNSUPPORTED_COMBINATION | PROBE_FAILED | FFMPEG_FAILED | TIMEOUT`. The API layer maps these codes to HTTP status codes (400 for the first three, 408 for timeout, 500 for ffmpeg failure) — see `conversion.service.ts#mapConversionError`.

### API layer (`backend/src/conversion/`)

- Uploads go through multer (`multer.config.ts`) straight to disk, filename forced to `randomUUID()` — original filenames are never used as paths (traversal prevention).
- `ConversionService` keeps an in-memory `Map` of output id → file path (no DB). Input file is deleted immediately after conversion (success or failure, in a `finally`); output file is deleted the moment it's streamed for download (one-shot download), and a 5-minute sweep also clears any output older than 30 minutes in case it's never downloaded.
- `GET /download/:id` never builds a filesystem path from the user-supplied `id` directly — it always looks up the registry first, so an unknown/malicious id just 404s.
- Storage paths: `backend/tmp/uploads` and `backend/tmp/outputs` (gitignored, created on module init).

### Frontend (`frontend/src/App.vue`)

Single-component app, no router, no state library. Fetches `GET /formats` on mount, posts `multipart/form-data` to `/convert`, then links to the returned `downloadUrl` (prefixed with `VITE_API_BASE_URL`). CORS is enabled wide-open on the backend (`app.enableCors()`), expected to be tightened post-MVP.


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
