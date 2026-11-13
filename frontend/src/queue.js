// Queue：前端佇列的唯一 owner。Queue Entry 的建立、設定變更、移除，以及轉換／下載
// （委派給 conversion-queue.js）都從這裡走；App.vue 只呼叫這裡並渲染 entries。
//
// entries 由呼叫端提供（App.vue 給 reactive 陣列，測試給一般陣列），這裡只就地改寫：
// conversion queue 用 entry 物件本身當 key，所以 entry 永遠是同一個物件，不會被換新

import { createConversionQueue } from './conversion-queue'
import { applyPreset, emptyTuning } from './device-presets'
import { acceptsFile } from './file-intake'

export const DEFAULT_COMPRESS_QUALITY = '80'

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// 縮圖只看瀏覽器能不能直接顯示：影音分頁的 GIF 也用圖片元素預覽
function thumbKind(file, kind) {
  if (kind === 'image' || file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'audio'
}

// fetch / apiBase / saveBlob / onDone：見 createConversionQueue；getFormats()：目前的 /formats 清單；
// objectUrl：建立與釋放預覽用 blob URL（預設是瀏覽器的 URL）
export function createQueue({ entries, getFormats, objectUrl = URL, ...conversionDeps }) {
  const conversion = createConversionQueue({ ...conversionDeps, getFormats })
  let nextId = 0

  const inTab = (tab) => entries.filter((entry) => entry.kind === tab)

  // 分頁歸屬（kind）在加入時就決定，之後不再用 MIME 重猜
  function makeEntry(file, formatId, kind) {
    nextId += 1
    const thumb = thumbKind(file, kind)
    return {
      localId: `f${nextId}`,
      file,
      kind,
      thumb,
      // 只有圖片/影片會顯示縮圖，音訊不建 blob URL
      previewUrl: thumb === 'audio' ? null : objectUrl.createObjectURL(file),
      name: file.name,
      sizeLabel: formatBytes(file.size),
      format: formatId,
      compressMode: false,
      settingsOpen: false,
      preset: null,
      tuning: emptyTuning(),
      status: 'idle',
      progress: 0,
      jobId: null,
      downloadUrl: null,
      errorCode: null,
    }
  }

  // 把這個分頁收得下的檔案加進佇列，回傳被擋下的檔案數
  function add(files, tab, formatId) {
    const all = Array.from(files)
    const accepted = all.filter((file) => acceptsFile(file, tab, getFormats()))
    entries.push(...accepted.map((file) => makeEntry(file, formatId, tab)))
    return all.length - accepted.length
  }

  function release(entry) {
    conversion.stop(entry)
    if (entry.previewUrl) objectUrl.revokeObjectURL(entry.previewUrl)
  }

  function remove(entry) {
    release(entry)
    const index = entries.findIndex((e) => e.localId === entry.localId)
    if (index !== -1) entries.splice(index, 1)
  }

  // 頁面卸載時：停掉所有輪詢、釋放預覽
  function dispose() {
    entries.forEach(release)
  }

  function setFormatForIdle(tab, formatId) {
    for (const entry of inTab(tab)) {
      if (entry.status === 'idle') entry.format = formatId
    }
  }

  // 壓縮模式：不換格式，只是把檔案變小；開啟時不送 format 給後端，後端會自動用
  // 來源格式當目標格式。第一次開啟且使用者還沒動過畫質滑桿時帶入預設值，
  // 不然滑桿空白等於「不壓縮」，跟「壓縮模式」這個功能名稱矛盾
  function toggleCompressMode(entry) {
    entry.compressMode = !entry.compressMode
    if (entry.compressMode && !entry.tuning.quality) {
      entry.tuning.quality = DEFAULT_COMPRESS_QUALITY
    }
  }

  function selectPreset(entry, presetId) {
    const next = applyPreset(entry, presetId)
    entry.preset = next.preset
    entry.format = next.format
    entry.tuning = next.tuning
  }

  // 圖片跟影音的進階選項語意完全不同（CRF/位元率 vs 縮放/畫質），
  // 只套用到同一種類型的檔案，避免把不相干的設定塞進另一分頁的檔案
  function applyTuningToAll(entry) {
    for (const other of inTab(entry.kind)) {
      if (other.localId === entry.localId) continue
      other.tuning = { ...entry.tuning }
      other.preset = entry.preset
    }
  }

  function convertAll(tab) {
    for (const entry of inTab(tab)) {
      if (entry.status === 'idle' || entry.status === 'error') conversion.start(entry)
    }
  }

  function downloadAll(tab) {
    for (const entry of inTab(tab)) conversion.download(entry)
  }

  return {
    add,
    remove,
    dispose,
    setFormatForIdle,
    toggleCompressMode,
    selectPreset,
    applyTuningToAll,
    convertAll,
    downloadAll,
    start: conversion.start,
    download: conversion.download,
  }
}
