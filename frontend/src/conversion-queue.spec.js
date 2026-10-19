import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createConversionQueue, POLL_INTERVAL_MS } from './conversion-queue'

const API = 'http://api'

function json(status, body) {
  return { ok: status < 400, status, json: async () => body, headers: new Headers() }
}

function makeEntry() {
  return {
    localId: 'f1',
    file: new Blob(['x']),
    format: 'mp3',
    compressMode: false,
    tuning: {},
    status: 'idle',
    progress: 0,
    jobId: null,
    downloadUrl: null,
    errorCode: null,
  }
}

// 假後端：依路徑回傳排好的回應；pending 回應用 deferred 控制回來的時間點
function fakeBackend(routes) {
  return vi.fn(async (url) => {
    const handler = routes[url.replace(API, '')]
    if (!handler) throw new Error(`unexpected ${url}`)
    return typeof handler === 'function' ? handler() : handler
  })
}

function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('conversion queue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('POST 回 400 時把後端的錯誤碼記在 entry 上', async () => {
    const fetch = fakeBackend({ '/convert': json(400, { code: 'UNSUPPORTED_COMBINATION', message: 'x' }) })
    const queue = createConversionQueue({ fetch, apiBase: API, saveBlob: vi.fn() })
    const entry = makeEntry()

    await queue.start(entry)

    expect(entry.status).toBe('error')
    expect(entry.errorCode).toBe('UNSUPPORTED_COMBINATION')
  })

  it('tuning 的 0 值照送，空字串與 false 不送', async () => {
    const fetch = fakeBackend({ '/convert': json(202, { id: 'j1', status: 'processing', progress: 0 }) })
    const queue = createConversionQueue({ fetch, apiBase: API, saveBlob: vi.fn() })
    const entry = { ...makeEntry(), tuning: { crf: 0, contrast: '0', preset: '', denoise: false, normalizeAudio: true } }

    await queue.start(entry)
    queue.stop(entry)

    const sent = Object.fromEntries(fetch.mock.calls[0][1].body.entries())
    expect(sent).toMatchObject({ format: 'mp3', crf: '0', contrast: '0', normalizeAudio: 'true' })
    expect(sent).not.toHaveProperty('preset')
    expect(sent).not.toHaveProperty('denoise')
  })

  it('輪詢不重疊，停止後晚到的回應不改狀態', async () => {
    const slow = deferred()
    const fetch = fakeBackend({
      '/convert': json(202, { id: 'j1', status: 'queued', progress: 0 }),
      '/convert/j1/status': () => slow.promise,
    })
    const queue = createConversionQueue({ fetch, apiBase: API, saveBlob: vi.fn() })
    const entry = makeEntry()

    await queue.start(entry)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5)
    expect(fetch).toHaveBeenCalledTimes(2) // POST + 一次還沒回來的 status

    queue.stop(entry)
    slow.resolve(json(404, { message: 'gone' }))
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)

    expect(entry.status).toBe('processing')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('轉換完成後呼叫 onDone，下載一次後變 downloaded，再下載不發請求', async () => {
    const onDone = vi.fn()
    const saveBlob = vi.fn()
    const fetch = fakeBackend({
      '/convert': json(202, { id: 'j1', status: 'processing', progress: 0 }),
      '/convert/j1/status': json(200, { id: 'j1', status: 'done', progress: 100, downloadUrl: '/download/j1' }),
      '/download/j1': {
        ok: true,
        status: 200,
        blob: async () => new Blob(['out']),
        headers: new Headers({ 'Content-Disposition': 'attachment; filename="a.mp3"' }),
      },
    })
    const queue = createConversionQueue({ fetch, apiBase: API, saveBlob, onDone })
    const entry = makeEntry()

    await queue.start(entry)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(entry.status).toBe('done')
    expect(entry.progress).toBe(100)
    expect(onDone).toHaveBeenCalledWith(entry)

    await Promise.all([queue.download(entry), queue.download(entry)])
    await queue.download(entry)

    expect(entry.status).toBe('downloaded')
    expect(saveBlob).toHaveBeenCalledTimes(1)
    expect(saveBlob.mock.calls[0][1]).toBe('a.mp3')
    expect(fetch.mock.calls.filter(([u]) => u.endsWith('/download/j1'))).toHaveLength(1)
  })

  it('下載失敗時標記 DOWNLOAD_EXPIRED', async () => {
    const fetch = fakeBackend({
      '/convert': json(202, { id: 'j1', status: 'processing', progress: 0 }),
      '/convert/j1/status': json(200, { id: 'j1', status: 'done', progress: 100, downloadUrl: '/download/j1' }),
      '/download/j1': json(404, { message: 'gone' }),
    })
    const queue = createConversionQueue({ fetch, apiBase: API, saveBlob: vi.fn() })
    const entry = makeEntry()

    await queue.start(entry)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await queue.download(entry)

    expect(entry.status).toBe('error')
    expect(entry.errorCode).toBe('DOWNLOAD_EXPIRED')
  })

  it('非同步失敗帶回後端錯誤碼，網路錯誤則沒有錯誤碼', async () => {
    const fetch = fakeBackend({
      '/convert': json(202, { id: 'j1', status: 'processing', progress: 0 }),
      '/convert/j1/status': json(200, { id: 'j1', status: 'error', progress: 0, error: { code: 'TIMEOUT', message: 'x' } }),
    })
    const queue = createConversionQueue({ fetch, apiBase: API, saveBlob: vi.fn() })
    const entry = makeEntry()

    await queue.start(entry)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(entry.errorCode).toBe('TIMEOUT')

    const offline = createConversionQueue({
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      apiBase: API,
      saveBlob: vi.fn(),
    })
    const other = makeEntry()
    await offline.start(other)
    expect(other.status).toBe('error')
    expect(other.errorCode).toBeNull()
  })
})
