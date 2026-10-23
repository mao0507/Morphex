# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Morphex: web-based media conversion tool. Upload file(s) → pick output format and optional advanced options (resolution/frame rate/bitrate/trim/normalize/strip metadata) → async ffmpeg conversion with progress polling → download link. Multi-file queue is client-orchestrated (one independent job per file); the backend has no DB, no auth, no persistent history — jobs live in an in-memory map and are swept after 30 minutes (see `ConvertFlow_MVP_開發計畫.md` for the original single-file MVP baseline this evolved from).

Monorepo, two independent npm projects: `backend/` (NestJS) and `frontend/` (Vue 3 + Vite), plus a `src-tauri/` desktop wrapper (see Desktop app section below) with its own minimal root `package.json` (just the Tauri CLI — not a shared workspace root for backend/frontend).

## Desktop app (Tauri, `src-tauri/`)

Wraps the existing web app for desktop distribution — no rewrite of `backend/core` (that stays framework-free per the constraint above; Tauri here just replaces "open browser + run two dev servers" with one packaged app). Approach: **sidecar**, not a Rust port.

- The desktop build listens on a fixed non-default port, **47823** (not the web app's 3000), to avoid colliding with whatever else might be running on a shared machine — it's hardcoded in two places that must stay in sync: `src-tauri/src/lib.rs`'s `BACKEND_PORT` const (passed to the sidecar as `PORT`) and `src-tauri/tauri.conf.json`'s `beforeDevCommand`/`beforeBuildCommand` (`VITE_API_BASE_URL=http://localhost:47823`, via `cross-env` for Windows CI compatibility), which override the frontend's normal `http://localhost:3000` default just for the Tauri build. `frontend/dist` itself is loaded as the webview's static content (`tauri.conf.json` → `build.frontendDist`).
- The NestJS backend is *not* rewritten in Rust. It's run as a Tauri "sidecar": `scripts/prepare-sidecar.mjs` copies the current Node binary to `src-tauri/binaries/backend-<target-triple>` (Tauri's required sidecar naming convention), builds the backend, then does a **separate prod-only `npm ci --omit=dev` install in a scratch tmp dir** (not `backend/node_modules`, which stays the dev install with jest/eslint/etc) and copies that + `backend/dist` + `package.json` into `src-tauri/resources/backend/`. `binaries/` and `resources/` are gitignored — regenerate with `npm run prepare-sidecar` (or just `npm run dev`/`npm run build`, which run it first). This must run per-OS in CI (not cross-copied) because `@ffmpeg-installer/ffmpeg`/`@ffprobe-installer/ffprobe` are platform-specific packages resolved at install time.
- `src-tauri/src/lib.rs` spawns that sidecar on app startup via `tauri-plugin-shell`, running `dist/main.js` with `PORT=47823` and `cwd` set to the OS-appropriate app-data dir (`app.path().app_data_dir()`) — **not** the read-only bundled Resources dir — because `backend/src/conversion/storage.paths.ts` derives `tmp/uploads`/`tmp/outputs` from `process.cwd()`. Before spawning, `<app_data_dir>/tmp` is wiped on every startup (a prior run's unfinished/undownloaded files are meaningless, and the backend's own 30-min sweep timer dies with the process on a crash/force-quit instead of a clean exit — so nothing else clears them). The child is killed on `ExitRequested`. If spawning fails, a native error dialog (`tauri-plugin-dialog`) is shown instead of panicking silently. `tauri-plugin-single-instance` prevents a second launch from spawning a second backend (competing for the same port) — it just refocuses the existing window.
- `tauri.conf.json`'s `security.csp` is a real policy (not `null`): `self` for scripts/default, plus the Google Fonts hosts the frontend loads (`style-src`/`font-src`), `connect-src` allowing the fixed `http://localhost:47823` sidecar, and `blob:` in both `media-src` and `img-src` for the video/image thumbnail previews (`URL.createObjectURL`) — dropping either breaks that thumbnail kind with only a CSP console warning.
- Root `package.json` only holds `@tauri-apps/cli` + `cross-env`; run `npm run dev` / `npm run build` from the repo root (not from `backend/` or `frontend/`) to drive the desktop app.
- This reuses the Node binary itself as the sidecar (no `pkg`/`nexe` step) specifically so `@ffmpeg-installer/ffmpeg` / `@ffprobe-installer/ffprobe`'s own path resolution keeps working unmodified.
- **Release CI**: unsigned (no Apple/Windows code-signing cert) — README documents the Gatekeeper/SmartScreen bypass. `release-please-config.json` + `.release-please-manifest.json` drive `googleapis/release-please-action` off Conventional Commits on `main`, which opens/updates a release PR; merging it creates a GitHub Release + tag and triggers `.github/workflows/release.yml`'s build job (`tauri-apps/tauri-action`, matrix over `macos-latest`/`windows-latest`) to attach `.dmg`/`.msi` installers. Version is tracked in three places release-please keeps in sync via `extra-files`: root `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
- **Auto-update** (`tauri-plugin-updater`): on every launch, after the sidecar spawns, `spawn_update_check()` in `lib.rs` checks `tauri.conf.json`'s `plugins.updater.endpoints` (a static `https://github.com/mao0507/Morphex/releases/latest/download/latest.json` URL) off the main thread; if a newer version is found it shows a native Yes/No dialog, and on Yes downloads, verifies the signature, installs, and calls `app.restart()`. This signing is a *separate* concern from the OS code-signing mentioned above — it's a minisign keypair (`npx tauri signer generate`) that only proves the update package wasn't tampered with in transit; `tauri.conf.json`'s `plugins.updater.pubkey` holds the public half, while the private half + its password live only as the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Actions secrets that `tauri-action` reads to sign each build (never committed). `bundle.createUpdaterArtifacts: true` is what makes `tauri-action` emit the signed `latest.json` manifest alongside the installers. Losing the private key means old installs can never verify a future update again — a new keypair requires shipping one manually-installed release with the new `pubkey` first.

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
- `npm test` — vitest unit tests (`src/**/*.spec.js`), currently the conversion queue module

ffmpeg/ffprobe binaries come from `@ffmpeg-installer/ffmpeg` / `@ffprobe-installer/ffprobe` (installed via `npm install`, resolved in `backend/src/core/ffmpeg-binaries.ts`) — no system `PATH` install needed. Both unit-level integration tests and the app itself spawn these real binaries (no mocking).

## Architecture

### Core conversion logic is framework-free (`backend/src/core/`)

This is the load-bearing design constraint: everything in `core/` must be callable without NestJS, so it stays testable without booting the framework and reusable outside it (the desktop app still runs the NestJS backend as a sidecar, but the constraint is kept for testability). Never put conversion logic directly in a controller or service — controllers/services only orchestrate calls into `core/`.

- `types.ts` — `FormatDefinition`, `MediaKind`, `ConvertTuning` (optional resolution/frameRateFps/videoBitrateKbps/audioBitrateKbps/trimStartSec/trimEndSec/normalizeAudio/stripMetadata — all optional, undefined means "use format/source default").
- `formats.ts` — `FORMATS` array is the single source of truth for supported formats (id, label, ext, kind, videoCodec, audioCodec, extraArgs, mimeTypes, optional `unsupportedTuning`). Adding a format = adding an entry here, nothing else — except an image format sharp cannot write (no `sharpFormat`), which also needs an entry in `image-convert.ts`'s `CUSTOM_ENCODERS`: BMP/ICO are decoded/resized by sharp and containerised by the hand-written `bitmap-encoders.ts` (24-bit white-flattened BMP; ICO with fixed 16/32/48/256 PNG entries, `contain` + transparent padding). `unsupportedTuning` is the one place that says which knobs a format does not take (hard-coded like AMR-NB's 8kHz mono 12.2k `extraArgs`, or ignored by its encoder like MPG's `crf`/`preset`, BMP/ICO `quality`): `assertTuningSupported()` rejects them with `INVALID_INPUT` in `prepareConversion` (both engines), and `GET /formats` reports them as `unsupportedFields` in multipart field names (via `tuning.parser.ts#REQUEST_FIELD_BY_TUNING_KEY`) so the frontend can hide them. `mpeg2video` (MPG) has no `-crf`, so without a video bitrate it gets fixed-quality `-q:v`.
- `ffmpeg-binaries.ts` — `FFMPEG_PATH` / `FFPROBE_PATH` resolved from the installer packages; every spawn elsewhere uses these constants instead of bare `'ffmpeg'`/`'ffprobe'` strings. It also exports `FFMPEG_ENCODERS` (parsed once from `ffmpeg -encoders` at import); `formats.ts` drops any format whose `videoCodec`/`audioCodec` the platform's build lacks (e.g. macOS has no `libopencore_amrnb`, so AMR is absent there from `FORMATS`, `/formats` and `getFormatById`; its integration tests skip).
- `probe.ts` — `probeFile()` spawns `ffprobe -show_streams -show_format`, JSON-parses output, timeout-guarded, rejects with `ConversionError('PROBE_FAILED', ...)` if no streams.
- `detect.ts` — `detectMediaKind()` decides video vs audio. Video streams whose codec is mjpeg/png/bmp (not gif — an animated GIF is real video content), or whose disposition has `attached_pic: 1`, are treated as cover-art thumbnails and ignored — a file with only a thumbnail + audio stream is classified `audio`, not `video`.
- `ffmpeg-args.ts` — `validateCombination()` rejects audio→video before anything touches ffmpeg; `buildFfmpegArgs()` takes an optional `ConvertTuning` and always returns an argv array (never a shell string) for `spawn`. Trim becomes `-ss`/`-t`, both placed *before* `-i` as input options (an output-side `-t` limits output time, so with `speed` it would read too much source), resolution becomes `-vf scale=`, normalize becomes `-af loudnorm`, strip-metadata becomes `-map_metadata -1` — video-only knobs (resolution/frameRate/videoBitrate) are skipped when the target format is audio.
  `expectedOutputDurationSec(sourceSec, tuning)` owns "how long will the output be" — trimmed span ÷ speed — and is the progress denominator (ffmpeg's `time=` is output time, not source time); it also rejects a trim start past the source length with `INVALID_INPUT`.
- `run-job.ts` — `runFfmpegJob()` spawns ffmpeg with argv array, timeout-guarded, captures stderr for error reporting. Accepts `{ durationSec, onProgress }` where `durationSec` is the *expected output* duration. Parsing lives in the pure `createProgressTracker()` (buffers partial lines across stderr chunks, splits on `
`/`
`, last `time=` wins, capped at 99%), tested without spawning; 100% is reported only on a clean exit.
- `convert.ts` — `chooseEngine()` is the one place that routes a file to an engine, by target format kind plus what sharp can read: image target → source must be sharp-readable (else `UNSUPPORTED_COMBINATION`) → sharp; audio/video target → a static image (sharp-readable, `pages <= 1`) is rejected, anything else (incl. animated GIF) goes ffprobe + ffmpeg; no target (image compress mode) → sharp via `resolveTargetFormat()`. `convert-routing.integration.spec.ts` pins these rules with tiny real fixtures. `sharp.cache(false)` is set in `image-convert.ts` because libvips' cache keeps input files open, which blocks deleting uploads on Windows.
- `convert.ts` is split into `prepareConversion()` (probe → detect → validate → build args, no ffmpeg spawn — fast, used for synchronous up-front validation) and `runPreparedConversion()` (spawns ffmpeg with progress callback). `convertFile()` is a thin wrapper that does both in sequence, kept for callers (and tests) that don't need progress/async job semantics.
- `errors.ts` — `ConversionError` has a `code`: `INVALID_INPUT | UNSUPPORTED_COMBINATION | PROBE_FAILED | FFMPEG_FAILED | TIMEOUT`. The API layer maps these codes to HTTP status codes (400 for the first three, 408 for timeout, 500 for ffmpeg failure) — see `conversion.service.ts#toHttpException`.

### API layer (`backend/src/conversion/`) — async job model

- Uploads go through multer (`multer.config.ts`) straight to disk, filename forced to `randomUUID()` — original filenames are never used as paths (traversal prevention).
- `POST /convert` is split into a fast synchronous half and a slow async half: it runs `prepareConversion()` (format lookup + probe + detect + validateCombination) synchronously and throws a normal 4xx/408 (body `{ code, message }`, same shape as the status endpoint's `error`) if that fails — so invalid format / unsupported combination / corrupt file still fail immediately, same as before. If prepare succeeds, it registers a job, kicks off `runPreparedConversion()` in the background (not awaited), and responds `202 { id, status: 'queued'|'processing', progress }` immediately. There is no batch endpoint — multiple files means multiple independent `POST /convert` calls; the frontend queue is client-side state only.
- `GET /convert/:id/status` polls a job: `{ id, status, progress }`, plus `downloadUrl`/`ext` once `status === 'done'`, or `error: { code, message }` once `status === 'error'`. Unknown id → 404.
- `tuning.parser.ts#parseConvertRequest()` turns the multipart string fields (`format` plus every tuning knob: `resolution`, `frameRate`, `trimStart`, `crf`, `speed`, …) into `{ targetFormatId, tuning: ConvertTuning }`. Empty/missing = use the default; a present-but-invalid value (out of range, malformed, unknown enum, repeated field) throws `INVALID_INPUT` naming the field — never silently dropped. It runs inside `ConversionService.convert`'s try, so a bad parameter deletes the upload and returns the same `{ code, message }` 400 as a prepare failure. The frontend sends `0` values (e.g. `crf=0`) and omits only `''`/`false`/`null`.
- `ConversionService` is the single owner of the Job lifecycle: an in-memory `Map` of job id → `{ status, progress, formatId, outputPath?, error?, createdAt }` (no DB), plus every temp-file deletion. The controller only does HTTP translation. Its constructor takes optional `ConversionDeps` (`engine`, `uploadsDir`, `outputsDir`, `now`; Nest token `CONVERSION_DEPS`, defaults to the real ones), which is how `conversion.service.spec.ts` runs it against a `mkdtemp` root, a fake clock and a fake engine. The engine seam (`ConversionEngine.prepare()` → `PreparedJob.run()`) has the production adapter `core-engine.ts` wrapping `resolveTargetFormat`/`prepareConversion`/`runPreparedConversion`.
- File lifecycle: prepare failure → input deleted, 4xx thrown. Background run finishes → input deleted *before* the final status is set (so `done`/`error` means cleanup already happened); on failure the output is deleted too. `openDownload(id)` opens the output first (missing → 404 before any header), and its `pipeTo(dest)` deletes the output and removes the job only after the stream fully completes and the fd is closed (one-shot download; Windows keeps a deleted-but-open file visible). An aborted download keeps the output until the TTL. `sweep()` (every 5 min) drops jobs older than 30 min with their output, plus untracked orphan files older than 30 min in both tmp dirs.
- `GET /download/:id` never builds a filesystem path from the user-supplied `id` directly — it always looks up the job registry first (and requires `status === 'done'`), so an unknown/malicious/not-yet-finished id just 404s.
- Storage paths: `backend/tmp/uploads` and `backend/tmp/outputs` (gitignored, created on module init).

### Frontend (`frontend/src/`)

No router, no state library. `App.vue` renders and animates a client-side multi-file queue (drag & drop or multi-select); each Queue Entry records its tab (`entry.kind`: `video`|`image`) at add time — never re-derived from MIME — via `file-intake.js#acceptsFile()` (MIME prefix, falling back to extension against `/formats` for empty `File.type`), and tracks its own format, advanced tuning options, and `idle|queued|processing|done|downloaded|error` status (see `GLOSSARY.md`). The conversion lifecycle lives in `conversion-queue.js` (`createConversionQueue({ fetch, apiBase, saveBlob, onDone })` → `start`/`stop`/`download`), the only code that writes an entry's status: `POST /convert`, then poll `GET /convert/:id/status` every ~800ms (sequential `setTimeout`, stale responses dropped after `stop`) until `done`/`error`, then a one-shot download that moves the entry to `downloaded`. Fields a target format ignores or hard-codes are hidden and not sent, per the backend's `/formats` `unsupportedFields` (`format-fields.js#isFieldHidden()`, used by both the template and `buildFormData`) — no per-format knowledge is duplicated in the frontend. Errors are stored as `entry.errorCode` (backend `ConversionError` code, or `DOWNLOAD_EXPIRED`, or `null`) and translated in `App.vue#errorLabel`. "全部轉換"/"全部下載" just loop over queue entries client-side — there is no backend batch concept. Light/dark theme is a `data-theme` attribute toggle (persisted to `localStorage`, defaults to `prefers-color-scheme`) on top of CSS variables in `style.css`. CORS is enabled wide-open on the backend (`app.enableCors()`), expected to be tightened later.


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
