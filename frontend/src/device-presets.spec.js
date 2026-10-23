import { describe, expect, it } from 'vitest'
import { applyPreset, emptyTuning, presetState } from './device-presets'

const blank = () => ({ format: 'avi', preset: null, tuning: { ...emptyTuning(), stripMetadata: true } })

describe('device presets', () => {
  it('套用預設：換格式、重設其他欄位、狀態為該預設', () => {
    const entry = applyPreset(blank(), 'discord')
    expect(entry).toMatchObject({ format: 'mp4', preset: 'discord' })
    expect(entry.tuning).toMatchObject({ targetSize: '9.5', videoCodec: 'h264', stripMetadata: false })
    expect(presetState(entry)).toBe('discord')
  })

  it('不改原 entry', () => {
    const original = blank()
    applyPreset(original, 'youtube1080')
    expect(original.format).toBe('avi')
  })

  it('改了欄位或格式就變成 custom；數字型別的同值不算改', () => {
    const entry = applyPreset(blank(), 'youtube1080')
    expect(presetState({ ...entry, tuning: { ...entry.tuning, crf: 18 } })).toBe('youtube1080')
    expect(presetState({ ...entry, tuning: { ...entry.tuning, crf: '20' } })).toBe('custom')
    expect(presetState({ ...entry, tuning: { ...entry.tuning, denoise: true } })).toBe('custom')
    expect(presetState({ ...entry, format: 'mkv' })).toBe('custom')
  })

  it('選「無」：清掉預設但保留目前的值', () => {
    const entry = applyPreset(applyPreset(blank(), 'webSmall'), '')
    expect(entry.preset).toBeNull()
    expect(entry.format).toBe('webm')
    expect(presetState(entry)).toBe('')
  })
})
