# Morphex

網頁版影音／圖片轉檔工具。多檔案批次上傳、選擇輸出格式與進階選項、非同步轉檔並即時顯示進度、完成後下載結果。也可包成桌面應用（見下方）。

## 技術棧

- 前端：Vue 3 + Vite（`frontend/`）
- 後端：NestJS（`backend/`）
- 轉檔引擎：
  - 影音：ffmpeg / ffprobe（CLI 直接呼叫）
  - 圖片：sharp（libvips）
  - 核心邏輯獨立於框架，見 `backend/src/core/`
- 桌面：Tauri（見「桌面應用」章節）

## 環境需求

- Node.js（已驗證 v24，理論上 v18+ 皆可）
- 不需另外安裝系統 ffmpeg/ffprobe——由 `@ffmpeg-installer/ffmpeg`、`@ffprobe-installer/ffprobe` 這兩個 npm 套件在 `npm install` 時自動下載對應平台的執行檔
- 圖片轉檔用的 sharp 同樣是 `npm install` 時自動抓對應平台的原生 binary

## 啟動方式

### 後端

```bash
cd backend
npm install
npm run start:dev   # 預設監聽 http://localhost:3000
```

可用環境變數：

| 變數 | 說明 | 預設值 |
|---|---|---|
| `PORT` | 監聽埠號 | `3000` |
| `MAX_UPLOAD_BYTES` | 上傳檔案大小上限（bytes） | `524288000`（500MB） |

暫存檔案位於 `backend/tmp/uploads`（上傳暫存，轉檔結束即刪除，無論成功或失敗）與 `backend/tmp/outputs`（轉檔結果，下載後即刪除；未下載者每 5 分鐘掃描一次，超過 30 分鐘自動清除）。

### 前端

```bash
cd frontend
npm install
npm run dev   # 預設 http://localhost:5173
```

可用環境變數（`frontend/.env` 或啟動時帶入）：

| 變數 | 說明 | 預設值 |
|---|---|---|
| `VITE_API_BASE_URL` | 後端 API 位址 | `http://localhost:3000` |

前端分「轉換影片」（影片＋音訊）與「轉換圖片」兩個分頁，各自限制可上傳的檔案類型；多檔案採客戶端佇列，每個檔案是獨立的轉檔工作，可各自設定格式與進階選項、獨立顯示進度。

## 支援格式

完整清單以執行中的 `GET /formats`（單一事實來源：`backend/src/core/formats.ts`）為準，目前涵蓋：

- **影片**：MP4、WebM、MOV、AVI、MKV、FLV、WMV、MPEG-TS、3GP、OGV、GIF 動圖
- **音訊**：MP3、WAV、FLAC、M4A、OGG、Opus、WMA、AIFF
- **圖片**：JPEG、PNG、WebP、TIFF、AVIF

影片／音訊／圖片是三條互斥的轉檔路線：圖片只能轉圖片、影音只能轉影音，後端會依實際偵測到的檔案內容（而非副檔名）判斷走哪一條，不符合會回 400 錯誤。

## API

- `GET /formats`：取得支援的輸出格式清單（含 `id`/`label`/`ext`/`kind`）
- `POST /convert`：`multipart/form-data`，快速完成格式驗證與探測後立即回應，實際轉檔在背景進行
  - 必要欄位：`file`（檔案）、`format`（目標格式 id）
  - 進階選項欄位（皆選填，未提供則使用格式/來源預設值）：

    | 欄位 | 說明 | 適用 |
    |---|---|---|
    | `resolution` | 解析度／縮放，格式 `寬x高`，例如 `1920x1080` | 影片、圖片 |
    | `frameRate` | 幀率 (fps) | 影片 |
    | `videoBitrate` | 視訊位元率 (kbps) | 影片 |
    | `audioBitrate` | 音訊位元率 (kbps) | 影片、音訊 |
    | `trimStart` / `trimEnd` | 剪輯起訖秒數 | 影片、音訊 |
    | `normalizeAudio` | 音量標準化，`true`/未提供 | 影片、音訊 |
    | `stripMetadata` | 移除中繼資料，`true`/未提供 | 影片、音訊、圖片 |
    | `videoCodec` | `h264`/`h265`/`vp9`/`av1`/`mpeg4`/`copy` | 影片 |
    | `audioCodec` | `aac`/`mp3`/`opus`/`flac`/`vorbis`/`copy` | 影片、音訊 |
    | `crf` | 畫質 0-51，數字越小畫質越高 | 影片 |
    | `preset` | 編碼速度預設（`ultrafast`…`veryslow`） | 影片 |
    | `audioChannels` | 聲道數 `1`/`2` | 影片、音訊 |
    | `sampleRate` | 取樣率 (Hz) | 影片、音訊 |
    | `rotate` | 旋轉角度 `90`/`180`/`270` | 影片 |
    | `flipHorizontal` / `flipVertical` | 翻轉，`true`/未提供 | 影片 |
    | `speed` | 播放速度倍率 0.25-4 | 影片 |
    | `deinterlace` | 去交錯，`true`/未提供 | 影片 |
    | `denoise` | 降噪，`true`/未提供 | 影片 |
    | `brightness` / `contrast` / `saturation` | 畫面調整 | 影片 |
    | `quality` | 壓縮品質 1-100 | 圖片 |

  - 回應 `202 { id, status: 'queued'｜'processing', progress }`；格式錯誤／不支援的轉換組合／檔案損毀則同步回 4xx
- `GET /convert/:id/status`：輪詢轉檔進度，回應 `{ id, status, progress }`，完成時多帶 `{ downloadUrl, ext }`，失敗時多帶 `{ error: { code, message } }`；未知 id 回 404
- `GET /download/:id`：下載轉檔結果，下載完成即從伺服器刪除（一次性下載）

## 測試

```bash
cd backend
npm test          # 單元測試（core 邏輯）+ 整合測試（呼叫真實 ffmpeg/ffprobe/sharp）
npm run test:e2e  # API 端到端測試（含暫存清理驗證）
```

## 桌面應用（Tauri）

`src-tauri/` 把前後端包成一個桌面 app（backend 以 sidecar 方式隨 app 啟停，細節見 `CLAUDE.md`）。

```bash
npm install          # repo 根目錄，只裝 Tauri CLI
npm run dev           # 開發模式
npm run build          # 打包安裝檔（.dmg / .msi），輸出於 src-tauri/target/release/bundle/
```

Windows/macOS 安裝檔另由 GitHub Actions（`release-please` 合併版本 PR 後自動觸發）建置並掛在 GitHub Release 上。

**目前未簽章**，直接下載執行會被系統擋下，第一次開啟需要手動放行：

- **macOS**：對 app 「右鍵 → 打開」，或「系統設定 → 隱私權與安全性」裡找到「已封鎖」提示按「仍要打開」
- **Windows**：SmartScreen 跳出「Windows 已保護您的電腦」時，點「其他資訊 → 仍要執行」

## 已知限制

- 無使用者帳號、無轉檔歷史紀錄
- Job 狀態存在記憶體中（無 DB），僅限單一伺服器實例，重啟即遺失所有進行中工作
- 無硬體加速、無物件儲存
- 圖片轉檔不支援 BMP（sharp 未提供此格式的讀寫能力）與動態 GIF（僅取第一幀當靜態圖片）
