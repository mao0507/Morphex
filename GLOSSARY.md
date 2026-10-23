# Glossary

Morphex 的領域用語。命名 module、寫文件或討論架構時使用這些詞。

**Job**：後端的一次轉檔工作，由 `POST /convert` 建立，存在 `ConversionService` 的 in-memory map，30 分鐘後被清除。用 job id 查狀態與下載。

**Queue Entry**：前端佇列裡的一個檔案。帶著加入時所在的分頁（`kind`：`video` 或 `image`，之後不再用 MIME 重猜）、自己的 format、tuning、狀態（`idle → queued → processing → done → downloaded`，任一步可進 `error`），轉換時對應一個 Job。狀態只由 `frontend/src/conversion-queue.js` 改寫。

**One-shot download**：Job 的 output 只能下載一次——串流結束後後端立刻刪檔。前端因此在下載成功後把 Queue Entry 轉成 `downloaded`，不再提供下載。

**Error code**：`ConversionError` 的 `code`（`INVALID_INPUT`、`UNSUPPORTED_COMBINATION`、`PROBE_FAILED`、`FFMPEG_FAILED`、`TIMEOUT`、`IMAGE_CONVERT_FAILED`、`TARGET_SIZE_EXCEEDED`）。同步失敗（`POST /convert` 的 4xx/5xx body）與非同步失敗（status 的 `error` 欄位）都是 `{ code, message }`。前端另有 `DOWNLOAD_EXPIRED`。

**Target size**：使用者指定的輸出檔案大小上限（`targetSizeMB`，單位 MiB），只限影片目標。後端用預期輸出長度換算成一趟 ABR 的影片位元率（預留 8% 邊際、扣掉音訊），跟影片位元率／CRF 互斥；轉完仍超過就是 `TARGET_SIZE_EXCEEDED`。

**Engine**：實際執行轉檔的工具，sharp（圖片）或 ffmpeg（影音，含動態 GIF）。由 `core/convert.ts#chooseEngine()` 依目標格式種類與來源檔決定。
