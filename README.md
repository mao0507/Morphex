# MediaForge

線上影音轉檔工具 MVP。上傳檔案、選擇輸出格式、下載轉檔結果。

## 技術棟

- 前端：Vue 3 + Vite（`frontend/`）
- 後端：NestJS（`backend/`）
- 轉檔引擎：ffmpeg / ffprobe（CLI 直接呼叫，核心邏輯獨立於框架，見 `backend/src/core/`）

## 環境需求

- Node.js（已驗證 v24，理論上 v18+ 皆可）
- ffmpeg / ffprobe 已安裝並可在終端機執行 `ffmpeg -version`

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

暫存檔案位於 `backend/tmp/uploads`（上傳暫存，轉檔結束即刪除）與 `backend/tmp/outputs`（轉檔結果，下載後即刪除；未下載者每 5 分鐘掃描一次，超過 30 分鐘自動清除）。

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

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/formats` | 取得支援的輸出格式清單 |
| `POST` | `/convert` | multipart/form-data，欄位 `file`（檔案）與 `format`（目標格式 id），同步阻塞處理，回傳 `{ id, format, ext, downloadUrl }` |
| `GET` | `/download/:id` | 下載轉檔結果，下載完成即從伺服器刪除 |

## 測試

```bash
cd backend
npm test          # 單元測試（core 邏輯）+ 整合測試（呼叫真實 ffmpeg/ffprobe）
npm run test:e2e  # API 端到端測試（含暫存清理驗證）
```

## 已知限制（MVP 範圍）

- 轉檔為同步阻塞處理，無背景佇列、無即時進度條
- 無使用者帳號與轉檔歷史
- 無硬體加速、無物件儲存
