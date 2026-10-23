// Queue entry 的轉換生命週期：POST /convert → 輪詢 status → 一次性下載。
// entry 的 status/progress/jobId/downloadUrl/errorCode 只由這裡改寫，App.vue 只讀。
// 狀態：idle → queued → processing → done → downloaded，任一步失敗 → error（可重新 start）

import { isFieldHidden } from './format-fields'

export const POLL_INTERVAL_MS = 800

// 前端自己產生的錯誤碼；後端的錯誤碼（INVALID_INPUT 等）原樣透傳，null 代表無法分類
export const DOWNLOAD_EXPIRED = 'DOWNLOAD_EXPIRED'

// 空字串/false/null 代表「用預設值」不送；0 是合法值（例如 crf=0 無損）要照送。
// 開關類欄位送 'true'，其餘原樣送字串，由後端驗證範圍
function buildFormData(entry, formats) {
  const formData = new FormData()
  formData.append('file', entry.file)
  if (!entry.compressMode) formData.append('format', entry.format)
  for (const [key, value] of Object.entries(entry.tuning)) {
    if (value === '' || value === false || value == null) continue
    if (isFieldHidden(formats, entry.format, key)) continue
    formData.append(key, value === true ? 'true' : String(value))
  }
  return formData
}

async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

// saveBlob(blob, filename)：把下載結果交給瀏覽器存檔；onDone(entry)：轉換完成時的 UI 回呼；
// getFormats()：目前的 /formats 清單，用來略過目標格式不支援的欄位
export function createConversionQueue({ fetch, apiBase, saveBlob, onDone = () => {}, getFormats = () => [] }) {
  // 每個 entry 目前有效的工作；晚到的回應拿 token 比對，不一致就丟掉
  const active = new WeakMap()
  const downloading = new WeakSet()

  function fail(entry, code) {
    active.delete(entry)
    entry.status = 'error'
    entry.errorCode = code ?? null
  }

  function stop(entry) {
    clearTimeout(active.get(entry)?.timer)
    active.delete(entry)
  }

  function schedulePoll(entry, token) {
    token.timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/convert/${entry.jobId}/status`)
        const data = await readJson(res)
        if (active.get(entry) !== token) return
        if (!res.ok) return fail(entry, data?.code)

        entry.progress = data.progress ?? entry.progress
        if (data.status === 'done') {
          active.delete(entry)
          entry.status = 'done'
          entry.progress = 100
          entry.downloadUrl = `${apiBase}${data.downloadUrl}`
          onDone(entry)
        } else if (data.status === 'error') {
          fail(entry, data.error?.code)
        } else {
          schedulePoll(entry, token)
        }
      } catch {
        if (active.get(entry) === token) fail(entry, null)
      }
    }, POLL_INTERVAL_MS)
  }

  async function start(entry) {
    stop(entry)
    const token = {}
    active.set(entry, token)
    entry.status = 'queued'
    entry.progress = 0
    entry.errorCode = null
    entry.downloadUrl = null

    try {
      const res = await fetch(`${apiBase}/convert`, { method: 'POST', body: buildFormData(entry, getFormats()) })
      const data = await readJson(res)
      if (active.get(entry) !== token) return
      if (!res.ok) return fail(entry, data?.code)

      entry.jobId = data.id
      entry.status = 'processing'
      entry.progress = data.progress ?? 0
      schedulePoll(entry, token)
    } catch {
      if (active.get(entry) === token) fail(entry, null)
    }
  }

  // 後端在串流結束後就刪掉 output，所以成功一次後就不能再下載
  async function download(entry) {
    if (entry.status !== 'done' || downloading.has(entry)) return
    downloading.add(entry)
    try {
      const res = await fetch(entry.downloadUrl)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'converted'
      saveBlob(blob, filename)
      entry.status = 'downloaded'
    } catch {
      fail(entry, DOWNLOAD_EXPIRED)
    } finally {
      downloading.delete(entry)
    }
  }

  return { start, stop, download }
}
