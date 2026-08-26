# Morphex 後端

NestJS 寫的轉檔 API。實際轉檔邏輯獨立放在 `src/core/`，不依賴框架（細節見根目錄 `CLAUDE.md`）。

## 安裝

```bash
npm install
```

需求：本機已安裝 ffmpeg / ffprobe，且可在終端機執行 `ffmpeg -version`。

## 啟動

```bash
# 開發模式（watch）
npm run start:dev

# 一般模式
npm run start

# production 模式
npm run start:prod
```

預設監聽 `http://localhost:3000`，可用 `PORT` 環境變數覆寫；上傳大小上限用 `MAX_UPLOAD_BYTES`（bytes）覆寫，預設 500MB。

## 測試

```bash
# 單元測試 + 整合測試（會實際呼叫本機 ffmpeg/ffprobe）
npm run test

# API 端到端測試（含暫存檔清理驗證）
npm run test:e2e

# 測試覆蓋率
npm run test:cov
```

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/formats` | 取得支援的輸出格式清單 |
| `POST` | `/convert` | multipart/form-data，欄位 `file`、`format`，同步阻塞轉檔，回傳 `{ id, format, ext, downloadUrl }` |
| `GET` | `/download/:id` | 下載轉檔結果，下載完成即從伺服器刪除 |

## 暫存檔案

- `tmp/uploads`：上傳暫存，轉檔結束（無論成功或失敗）即刪除
- `tmp/outputs`：轉檔結果，下載完成即刪除；未下載者每 5 分鐘掃描，超過 30 分鐘自動清除

兩個目錄皆已加入 `.gitignore`。
