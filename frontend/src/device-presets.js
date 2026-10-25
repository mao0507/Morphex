// 裝置預設只是一組填值：套用後就是一般的 format + tuning，後端不知道有預設這回事。
// 之後使用者改了任何欄位，presetState 就回 'custom'
export function emptyTuning() {
  return {
    resolution: '',
    frameRate: '',
    videoBitrate: '',
    audioBitrate: '',
    trimStart: '',
    trimEnd: '',
    normalizeAudio: false,
    stripMetadata: false,
    videoCodec: '',
    audioCodec: '',
    crf: '',
    preset: '',
    audioChannels: '',
    sampleRate: '',
    rotate: '',
    flipHorizontal: false,
    flipVertical: false,
    speed: '',
    deinterlace: false,
    denoise: false,
    brightness: '',
    contrast: '',
    saturation: '',
    quality: '',
    repair: false,
    targetSize: '',
  }
}

// 解析度是「等比縮進框內」，不補黑邊：直式預設套在橫式來源上會是 1080 寬的橫式片
export const DEVICE_PRESETS = [
  { id: 'iphone', format: 'mp4', tuning: { videoCodec: 'h264', audioCodec: 'aac', resolution: '1920x1080', crf: '23', audioBitrate: '192' } },
  { id: 'android', format: 'mp4', tuning: { videoCodec: 'h264', audioCodec: 'aac', resolution: '1280x720', crf: '23', audioBitrate: '128' } },
  { id: 'youtube1080', format: 'mp4', tuning: { videoCodec: 'h264', audioCodec: 'aac', resolution: '1920x1080', crf: '18', preset: 'slow', audioBitrate: '192' } },
  { id: 'vertical', format: 'mp4', tuning: { videoCodec: 'h264', audioCodec: 'aac', resolution: '1080x1920', frameRate: '30', crf: '20', audioBitrate: '128' } },
  { id: 'webSmall', format: 'webm', tuning: { videoCodec: 'vp9', audioCodec: 'opus', resolution: '1280x720', crf: '33', audioBitrate: '96' } },
  // 預留 0.5MB 給 Discord 的 10MB 上限
  { id: 'discord', format: 'mp4', tuning: { videoCodec: 'h264', audioCodec: 'aac', resolution: '1280x720', audioBitrate: '96', targetSize: '9.5' } },
]

export function applyPreset(entry, presetId) {
  const preset = DEVICE_PRESETS.find((p) => p.id === presetId)
  if (!preset) return { ...entry, preset: null }
  return { ...entry, preset: preset.id, format: preset.format, tuning: { ...emptyTuning(), ...preset.tuning } }
}

// '' = 沒用預設；預設 id = 值還跟預設一模一樣；'custom' = 套過預設但之後改了欄位
export function presetState(entry) {
  const preset = DEVICE_PRESETS.find((p) => p.id === entry.preset)
  if (!preset) return ''
  const expected = { ...emptyTuning(), ...preset.tuning }
  // number input 的 v-model 可能把值變成數字，一律轉字串比
  const same =
    entry.format === preset.format &&
    Object.keys(expected).every((key) => String(entry.tuning[key] ?? '') === String(expected[key]))
  return same ? preset.id : 'custom'
}
