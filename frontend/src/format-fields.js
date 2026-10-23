// 填了目標大小，後端會自己算影片位元率，跟這些欄位互斥（同時送會回 INVALID_INPUT）
const SUPERSEDED_BY_TARGET_SIZE = ['videoBitrate', 'crf']

// 目標格式用不到或寫死的 tuning 欄位（後端 /formats 的 unsupportedFields），以及被其他欄位取代的欄位：
// 畫面上藏起來，送出時也略過——藏起來的欄位若留著舊值照送，後端會回 INVALID_INPUT
export function isFieldHidden(formats, entry, field) {
  if (entry.tuning?.targetSize && SUPERSEDED_BY_TARGET_SIZE.includes(field)) return true
  return formats.find((f) => f.id === entry.format)?.unsupportedFields?.includes(field) ?? false
}
