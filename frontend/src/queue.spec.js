import { describe, expect, it, vi } from 'vitest'
import { createQueue, DEFAULT_COMPRESS_QUALITY } from './queue'

const FORMATS = [
  { id: 'mp4', ext: 'mp4', kind: 'video' },
  { id: 'png', ext: 'png', kind: 'image' },
]

const file = (name, type) => new File(['x'], name, { type })

function setup({ fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) } = {}) {
  const entries = []
  const objectUrl = { createObjectURL: vi.fn((f) => `blob:${f.name}`), revokeObjectURL: vi.fn() }
  const queue = createQueue({ entries, getFormats: () => FORMATS, objectUrl, fetch, apiBase: 'http://api', saveBlob: vi.fn() })
  return { entries, objectUrl, queue, fetch }
}

describe('queue', () => {
  it('加入：只收這個分頁收得下的檔案，回傳被擋下的數量，kind 記為加入時的分頁', () => {
    const { entries, queue } = setup()

    const rejected = queue.add([file('a.mp4', 'video/mp4'), file('b.png', 'image/png'), file('c.txt', 'text/plain')], 'video', 'mp4')

    expect(rejected).toBe(2)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ name: 'a.mp4', kind: 'video', format: 'mp4', status: 'idle', previewUrl: 'blob:a.mp4' })
  })

  it('音訊不建預覽；localId 不重複', () => {
    const { entries, queue, objectUrl } = setup()

    queue.add([file('a.mp3', 'audio/mpeg'), file('b.mp4', 'video/mp4')], 'video', 'mp4')

    expect(entries[0].previewUrl).toBeNull()
    expect(objectUrl.createObjectURL).toHaveBeenCalledTimes(1)
    expect(entries[0].localId).not.toBe(entries[1].localId)
  })

  it('移除：就地拿掉該筆並釋放預覽，其他 entry 仍是同一個物件', () => {
    const { entries, queue, objectUrl } = setup()
    queue.add([file('a.mp4', 'video/mp4'), file('b.mp4', 'video/mp4')], 'video', 'mp4')
    const [first, second] = entries

    queue.remove(first)

    expect(entries).toEqual([second])
    expect(entries[0]).toBe(second)
    expect(objectUrl.revokeObjectURL).toHaveBeenCalledWith('blob:a.mp4')
  })

  it('套用預設：寫回同一個 entry 物件（conversion queue 用它當 key）', () => {
    const { entries, queue } = setup()
    queue.add([file('a.mp4', 'video/mp4')], 'video', 'mp4')
    const entry = entries[0]

    queue.selectPreset(entry, 'webSmall')

    expect(entries[0]).toBe(entry)
    expect(entry).toMatchObject({ preset: 'webSmall', format: 'webm' })
    expect(entry.tuning.videoCodec).toBe('vp9')
  })

  it('壓縮模式：第一次開啟帶入預設畫質，已設定的畫質不覆蓋', () => {
    const { entries, queue } = setup()
    queue.add([file('a.png', 'image/png'), file('b.png', 'image/png')], 'image', 'png')
    entries[1].tuning.quality = '55'

    queue.toggleCompressMode(entries[0])
    queue.toggleCompressMode(entries[1])

    expect(entries[0]).toMatchObject({ compressMode: true, tuning: { quality: DEFAULT_COMPRESS_QUALITY } })
    expect(entries[1].tuning.quality).toBe('55')
  })

  it('套用到全部：只套到同一種 kind，而且是複本不是同一個 tuning 物件', () => {
    const { entries, queue } = setup()
    queue.add([file('a.mp4', 'video/mp4'), file('b.mp4', 'video/mp4')], 'video', 'mp4')
    queue.add([file('c.png', 'image/png')], 'image', 'png')
    const [source, sameKind, otherKind] = entries
    source.tuning.crf = '20'

    queue.applyTuningToAll(source)

    expect(sameKind.tuning.crf).toBe('20')
    expect(sameKind.tuning).not.toBe(source.tuning)
    expect(otherKind.tuning.crf).toBe('')
  })

  it('預設格式只改這個分頁還沒開始的 entry', () => {
    const { entries, queue } = setup()
    queue.add([file('a.mp4', 'video/mp4'), file('b.mp4', 'video/mp4')], 'video', 'mp4')
    queue.add([file('c.png', 'image/png')], 'image', 'png')
    entries[1].status = 'done'

    queue.setFormatForIdle('video', 'webm')

    expect(entries.map((e) => e.format)).toEqual(['webm', 'mp4', 'png'])
  })

  it('全部轉換：只送這個分頁的 idle 與 error', async () => {
    const { entries, queue, fetch } = setup()
    queue.add([file('a.mp4', 'video/mp4'), file('b.mp4', 'video/mp4'), file('c.mp4', 'video/mp4')], 'video', 'mp4')
    queue.add([file('d.png', 'image/png')], 'image', 'png')
    entries[1].status = 'done'
    entries[2].status = 'error'

    queue.convertAll('video')
    await vi.waitFor(() => expect(entries[0].status).toBe('error'))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(entries[1].status).toBe('done')
    expect(entries[3].status).toBe('idle')
  })
})
