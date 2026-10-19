// 分頁只是前端的第一道防線，真正的圖片/影音判定以後端 sharp/ffprobe 探測結果為準。
// 部分格式（mkv/wma/3gp...）瀏覽器的 File.type 會回傳空字串，這時退而用副檔名
// 比對後端 /formats 回傳的支援清單，避免合法檔案被誤擋
const TAB_KINDS = { image: ['image'], video: ['video', 'audio'] }

function fileExtension(name) {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase()
}

export function acceptsFile(file, tab, formats) {
  const kinds = TAB_KINDS[tab]
  if (kinds.some((kind) => file.type.startsWith(`${kind}/`))) return true
  const ext = fileExtension(file.name)
  return formats.some((f) => kinds.includes(f.kind) && f.ext.toLowerCase() === ext)
}
