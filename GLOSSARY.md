# Glossary

Morphex 的領域用語。命名 module、寫文件或討論架構時使用這些詞。

**Job**：後端的一次轉檔工作，由 `POST /convert` 建立，存在 `ConversionService` 的 in-memory map，30 分鐘後被清除。用 job id 查狀態與下載。

**Queue Entry**：前端佇列裡的一個檔案。帶著自己的 format、tuning、狀態（`idle → queued → processing → done → downloaded`，任一步可進 `error`），轉換時對應一個 Job。狀態只由 `frontend/src/conversion-queue.js` 改寫。

**One-shot download**：Job 的 output 只能下載一次——串流結束後後端立刻刪檔。前端因此在下載成功後把 Queue Entry 轉成 `downloaded`，不再提供下載。

**Error code**：`ConversionError` 的 `code`（`INVALID_INPUT`、`UNSUPPORTED_COMBINATION`、`PROBE_FAILED`、`FFMPEG_FAILED`、`TIMEOUT`、`IMAGE_CONVERT_FAILED`）。同步失敗（`POST /convert` 的 4xx/5xx body）與非同步失敗（status 的 `error` 欄位）都是 `{ code, message }`。前端另有 `DOWNLOAD_EXPIRED`。
