import { describe, it, expect } from 'vitest'
import { acceptsFile } from './file-intake'

const FORMATS = [
  { id: 'mp4', ext: 'mp4', kind: 'video' },
  { id: 'gif', ext: 'gif', kind: 'video' },
  { id: 'mp3', ext: 'mp3', kind: 'audio' },
  { id: 'png', ext: 'png', kind: 'image' },
  { id: 'avif', ext: 'avif', kind: 'image' },
]

const file = (name, type) => ({ name, type })

describe('acceptsFile', () => {
  it.each([
    ['video 分頁：MIME 是 video/', file('a.mov', 'video/quicktime'), 'video', true],
    ['video 分頁：MIME 是 audio/', file('a.flac', 'audio/flac'), 'video', true],
    ['video 分頁：GIF 靠副檔名接受', file('a.gif', 'image/gif'), 'video', true],
    ['video 分頁：一般圖片被拒', file('a.png', 'image/png'), 'video', false],
    ['video 分頁：空 MIME 靠副檔名接受', file('a.MP4', ''), 'video', true],
    ['image 分頁：MIME 是 image/', file('a.gif', 'image/gif'), 'image', true],
    ['image 分頁：空 MIME 靠副檔名接受', file('a.avif', ''), 'image', true],
    ['image 分頁：影片被拒', file('a.mp4', 'video/mp4'), 'image', false],
    ['不支援的副檔名、空 MIME', file('notes.txt', ''), 'video', false],
    ['沒有副檔名', file('README', ''), 'image', false],
  ])('%s', (_label, f, tab, expected) => {
    expect(acceptsFile(f, tab, FORMATS)).toBe(expected)
  })
})
