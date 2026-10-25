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

  // 數值對照 issue #13 的預設表
  it.each([
    ['iphone', 'mp4', { resolution: '1920x1080', audioBitrate: '192' }],
    ['android', 'mp4', { resolution: '1280x720', audioBitrate: '128' }],
    ['youtube1080', 'mp4', { resolution: '1920x1080', crf: '18', preset: 'slow', audioBitrate: '192' }],
    ['vertical', 'mp4', { resolution: '1080x1920', frameRate: '30', audioBitrate: '128' }],
    ['webSmall', 'webm', { resolution: '1280x720', videoCodec: 'vp9', audioCodec: 'opus', audioBitrate: '96' }],
    ['discord', 'mp4', { resolution: '1280x720', audioBitrate: '96', targetSize: '9.5' }],
  ])('%s 的格式與欄位', (id, format, tuning) => {
    const entry = applyPreset(blank(), id)
    expect(entry.format).toBe(format)
    expect(entry.tuning).toMatchObject(tuning)
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
