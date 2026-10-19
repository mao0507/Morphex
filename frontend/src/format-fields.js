// 目標格式用不到或寫死的 tuning 欄位（後端 /formats 的 unsupportedFields）：畫面上藏起來，送出時也略過——
// 藏起來的欄位若留著舊值照送，後端會回 INVALID_INPUT
export function isFieldHidden(formats, formatId, field) {
  return formats.find((f) => f.id === formatId)?.unsupportedFields?.includes(field) ?? false
}
