// 目標格式用不到或寫死的 tuning 欄位：畫面上藏起來，送出時也略過——
// 藏起來的欄位若留著舊值照送，AMR 這類格式後端會回 INVALID_INPUT
const HIDDEN_FIELDS = {
  amr: ['sampleRate', 'audioChannels', 'audioBitrate'],
  mpg: ['crf', 'preset'],
  bmp: ['quality'],
  ico: ['quality', 'resolution'],
}

export function isFieldHidden(formatId, field) {
  return HIDDEN_FIELDS[formatId]?.includes(field) ?? false
}
