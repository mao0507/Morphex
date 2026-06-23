<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { gsap } from 'gsap'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const MAX_UPLOAD_MB = 500

const RESOLUTION_PRESETS = [
  { value: '', label: '原始解析度' },
  { value: '1920x1080', label: '1920×1080 (FHD)' },
  { value: '1280x720', label: '1280×720 (HD)' },
  { value: '854x480', label: '854×480 (SD)' },
  { value: '640x360', label: '640×360' },
]

const FRAME_RATE_PRESETS = [
  { value: '', label: '原始 FPS' },
  { value: '60', label: '60 fps' },
  { value: '30', label: '30 fps' },
  { value: '24', label: '24 fps' },
  { value: '15', label: '15 fps' },
]

const AUDIO_BITRATE_PRESETS = [
  { value: '', label: '自動' },
  { value: '320', label: '320 kbps' },
  { value: '256', label: '256 kbps' },
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps' },
]

const VIDEO_CODEC_PRESETS = [
  { value: '', label: '格式預設' },
  { value: 'h264', label: 'H.264' },
  { value: 'h265', label: 'H.265 / HEVC' },
  { value: 'vp9', label: 'VP9' },
  { value: 'av1', label: 'AV1' },
  { value: 'mpeg4', label: 'MPEG-4' },
  { value: 'copy', label: '不重新編碼 (copy)' },
]

const AUDIO_CODEC_PRESETS = [
  { value: '', label: '格式預設' },
  { value: 'aac', label: 'AAC' },
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' },
  { value: 'flac', label: 'FLAC' },
  { value: 'vorbis', label: 'Vorbis' },
  { value: 'copy', label: '不重新編碼 (copy)' },
]

const PRESET_PRESETS = [
  { value: '', label: '編碼速度預設' },
  { value: 'ultrafast', label: 'ultrafast' },
  { value: 'veryfast', label: 'veryfast' },
  { value: 'fast', label: 'fast' },
  { value: 'medium', label: 'medium' },
  { value: 'slow', label: 'slow' },
  { value: 'veryslow', label: 'veryslow' },
]

const SAMPLE_RATE_PRESETS = [
  { value: '', label: '原始取樣率' },
  { value: '48000', label: '48000 Hz' },
  { value: '44100', label: '44100 Hz' },
  { value: '22050', label: '22050 Hz' },
  { value: '16000', label: '16000 Hz' },
]

const AUDIO_CHANNEL_PRESETS = [
  { value: '', label: '原始聲道' },
  { value: '2', label: '立體聲 (2)' },
  { value: '1', label: '單聲道 (1)' },
]

const ROTATE_PRESETS = [
  { value: '', label: '不旋轉' },
  { value: '90', label: '90°' },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
]

const STATUS_LABEL = {
  idle: '待轉換',
  queued: '排隊中',
  processing: '轉換中',
  done: '完成',
  error: '失敗',
}

const formats = ref([])
const queue = ref([])
const defaultFormat = ref('')
const isDragging = ref(false)
const theme = ref(localStorage.getItem('mediaforge-theme') || systemTheme())
const fileInputRef = ref(null)
const shellRef = ref(null)

let localIdCounter = 0
let gsapCtx
const pollTimers = new Map()

const videoFormats = computed(() => formats.value.filter((f) => f.kind === 'video'))
const audioFormats = computed(() => formats.value.filter((f) => f.kind === 'audio'))
const hasIdleOrError = computed(() => queue.value.some((e) => e.status === 'idle' || e.status === 'error'))
const hasDone = computed(() => queue.value.some((e) => e.status === 'done'))
const doneCount = computed(() => queue.value.filter((e) => e.status === 'done').length)
const processingCount = computed(() => queue.value.filter((e) => e.status === 'processing' || e.status === 'queued').length)
const idleCount = computed(() => queue.value.filter((e) => e.status === 'idle').length)
const errorCount = computed(() => queue.value.filter((e) => e.status === 'error').length)
const pendingCount = computed(() => idleCount.value + errorCount.value)
const fileCountLabel = computed(() => `${queue.value.length} 個檔案`)
const totalSizeLabel = computed(() => formatBytes(queue.value.reduce((sum, e) => sum + (e.file?.size || 0), 0)))
const supportHint = computed(() => {
  if (!formats.value.length) return ''
  const exts = [...new Set(formats.value.map((f) => f.ext.toUpperCase()))]
  return `${exts.slice(0, 8).join(' · ')} 等共 ${exts.length} 種格式，單檔最高 ${MAX_UPLOAD_MB}MB`
})

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem('mediaforge-theme', theme.value)
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme()
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function extOf(entry) {
  const parts = entry.name.split('.')
  return parts.length > 1 ? parts.pop().toUpperCase() : ''
}

function isVideoEntry(entry) {
  return entry.file.type.startsWith('video/')
}

onMounted(async () => {
  applyTheme()

  if (shellRef.value) {
    gsapCtx = gsap.context(() => {
      gsap.from('.site-header', { y: -12, autoAlpha: 0, duration: 0.35, ease: 'power2.out' })
      gsap.from('.hero-text > *', {
        y: 10,
        autoAlpha: 0,
        duration: 0.35,
        stagger: 0.06,
        delay: 0.05,
        ease: 'power2.out',
      })
      gsap.from('.dropzone', { y: 10, autoAlpha: 0, duration: 0.35, delay: 0.1, ease: 'power2.out' })
    }, shellRef.value)
  }

  try {
    const res = await fetch(`${API_BASE}/formats`)
    if (!res.ok) throw new Error('無法載入格式清單')
    formats.value = await res.json()
    defaultFormat.value = formats.value.find((f) => f.kind === 'video')?.id ?? formats.value[0]?.id ?? ''
  } catch {
    // 載入失敗時格式清單留空，加入檔案後操作會自然失敗並顯示錯誤
  }
})

onUnmounted(() => {
  for (const timer of pollTimers.values()) clearInterval(timer)
  gsapCtx?.revert()
})

function onCardEnter(el, done) {
  gsap.from(el, { y: -16, autoAlpha: 0, duration: 0.4, ease: 'power2.out', onComplete: done })
}

function onCardLeave(el, done) {
  gsap.to(el, { x: 24, autoAlpha: 0, duration: 0.28, ease: 'power1.in', onComplete: done })
}

function makeEntry(file) {
  localIdCounter += 1
  return {
    localId: `f${localIdCounter}`,
    file,
    previewUrl: URL.createObjectURL(file),
    name: file.name,
    sizeLabel: formatBytes(file.size),
    format: defaultFormat.value,
    settingsOpen: false,
    tuning: {
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
    },
    status: 'idle',
    progress: 0,
    jobId: null,
    downloadUrl: null,
    errorMessage: '',
  }
}

function addFiles(fileList) {
  const accepted = Array.from(fileList).filter(
    (file) => file.type.startsWith('video/') || file.type.startsWith('audio/'),
  )
  queue.value.push(...accepted.map(makeEntry))
}

function onInputChange(event) {
  if (event.target.files?.length) addFiles(event.target.files)
  event.target.value = ''
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function onDrop(event) {
  isDragging.value = false
  if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files)
}

function applyFormatToIdle(formatId) {
  defaultFormat.value = formatId
  for (const entry of queue.value) {
    if (entry.status === 'idle') entry.format = formatId
  }
}

function toggleSettings(entry) {
  entry.settingsOpen = !entry.settingsOpen
}

function applyTuningToAll(entry) {
  for (const other of queue.value) {
    if (other.localId === entry.localId) continue
    other.tuning = { ...entry.tuning }
  }
}

function removeEntry(entry) {
  stopPolling(entry.localId)
  URL.revokeObjectURL(entry.previewUrl)
  queue.value = queue.value.filter((e) => e.localId !== entry.localId)
}

function stopPolling(localId) {
  const timer = pollTimers.get(localId)
  if (timer) {
    clearInterval(timer)
    pollTimers.delete(localId)
  }
}

function buildFormData(entry) {
  const formData = new FormData()
  formData.append('file', entry.file)
  formData.append('format', entry.format)
  const t = entry.tuning
  if (t.resolution) formData.append('resolution', t.resolution)
  if (t.frameRate) formData.append('frameRate', t.frameRate)
  if (t.videoBitrate) formData.append('videoBitrate', t.videoBitrate)
  if (t.audioBitrate) formData.append('audioBitrate', t.audioBitrate)
  if (t.trimStart) formData.append('trimStart', t.trimStart)
  if (t.trimEnd) formData.append('trimEnd', t.trimEnd)
  if (t.normalizeAudio) formData.append('normalizeAudio', 'true')
  if (t.stripMetadata) formData.append('stripMetadata', 'true')
  if (t.videoCodec) formData.append('videoCodec', t.videoCodec)
  if (t.audioCodec) formData.append('audioCodec', t.audioCodec)
  if (t.crf) formData.append('crf', t.crf)
  if (t.preset) formData.append('preset', t.preset)
  if (t.audioChannels) formData.append('audioChannels', t.audioChannels)
  if (t.sampleRate) formData.append('sampleRate', t.sampleRate)
  if (t.rotate) formData.append('rotate', t.rotate)
  if (t.flipHorizontal) formData.append('flipHorizontal', 'true')
  if (t.flipVertical) formData.append('flipVertical', 'true')
  if (t.speed) formData.append('speed', t.speed)
  if (t.deinterlace) formData.append('deinterlace', 'true')
  if (t.denoise) formData.append('denoise', 'true')
  if (t.brightness) formData.append('brightness', t.brightness)
  if (t.contrast) formData.append('contrast', t.contrast)
  if (t.saturation) formData.append('saturation', t.saturation)
  return formData
}

async function startConversion(entry) {
  stopPolling(entry.localId)
  entry.status = 'queued'
  entry.progress = 0
  entry.errorMessage = ''
  entry.downloadUrl = null

  try {
    const res = await fetch(`${API_BASE}/convert`, {
      method: 'POST',
      body: buildFormData(entry),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || '轉檔失敗')

    entry.jobId = data.id
    entry.status = 'processing'
    entry.progress = data.progress ?? 0
    pollStatus(entry)
  } catch (err) {
    entry.status = 'error'
    entry.errorMessage = err.message || '轉檔過程發生錯誤'
  }
}

function pollStatus(entry) {
  const timer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/convert/${entry.jobId}/status`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || '無法取得轉檔進度')

      entry.progress = data.progress ?? entry.progress

      if (data.status === 'done') {
        stopPolling(entry.localId)
        entry.status = 'done'
        entry.progress = 100
        entry.downloadUrl = `${API_BASE}${data.downloadUrl}`
        const card = document.querySelector(`[data-local-id="${entry.localId}"]`)
        if (card) gsap.fromTo(card, { scale: 1 }, { scale: 1.015, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut' })
      } else if (data.status === 'error') {
        stopPolling(entry.localId)
        entry.status = 'error'
        entry.errorMessage = data.error?.message || '轉檔失敗'
      }
    } catch (err) {
      stopPolling(entry.localId)
      entry.status = 'error'
      entry.errorMessage = err.message || '無法取得轉檔進度'
    }
  }, 800)
  pollTimers.set(entry.localId, timer)
}

function convertAll() {
  for (const entry of queue.value) {
    if (entry.status === 'idle' || entry.status === 'error') startConversion(entry)
  }
}

function downloadAll() {
  for (const entry of queue.value) {
    if (entry.status === 'done' && entry.downloadUrl) {
      const link = document.createElement('a')
      link.href = entry.downloadUrl
      link.download = ''
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
  }
}
</script>

<template>
  <div class="shell" ref="shellRef">
    <header class="site-header">
      <div class="header-inner">
        <div class="brand-group">
          <span class="brand-mark">⇄</span>
          <span class="brand-name">MediaForge</span>
          <span class="beta-tag">BETA</span>
        </div>
        <div class="header-actions">
          <button class="btn-outline" type="button" @click="openFilePicker">+ 新增檔案</button>
          <button class="theme-toggle" type="button" @click="toggleTheme">
            <span v-if="theme === 'dark'" class="theme-dot theme-dot-dark"></span>
            <span v-else class="theme-dot theme-dot-light"></span>
            {{ theme === 'dark' ? 'Dark' : 'Light' }}
          </button>
        </div>
      </div>
    </header>

    <main class="page">
      <div class="hero">
        <div class="hero-text">
          <h1>轉換檔案</h1>
          <p>拖放影片或音訊檔案，選擇目標格式，即可在瀏覽器中完成轉換。</p>
        </div>
        <div class="hero-badge" v-if="queue.length">{{ fileCountLabel }} · {{ totalSizeLabel }}</div>
      </div>

      <button
        class="dropzone"
        :class="{ 'is-dragging': isDragging }"
        type="button"
        @click="openFilePicker"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <span class="dropzone-icon">↑</span>
        <span class="dropzone-text">
          <span class="dropzone-title">拖放檔案到這裡，或<span class="link-text">點擊瀏覽</span></span>
          <span class="dropzone-hint">{{ supportHint }}</span>
        </span>
        <input
          ref="fileInputRef"
          class="visually-hidden"
          type="file"
          multiple
          accept="video/*,audio/*"
          @change="onInputChange"
          @click.stop
        />
      </button>

      <div class="chips-bar" v-if="formats.length">
        <span class="chips-label">預設輸出格式</span>
        <div class="chips-group">
          <button
            v-for="f in videoFormats"
            :key="f.id"
            type="button"
            class="chip"
            :class="{ active: defaultFormat === f.id }"
            @click="applyFormatToIdle(f.id)"
          >
            {{ f.label }}
          </button>
        </div>
        <span class="chips-divider" v-if="videoFormats.length && audioFormats.length"></span>
        <div class="chips-group">
          <button
            v-for="f in audioFormats"
            :key="f.id"
            type="button"
            class="chip"
            :class="{ active: defaultFormat === f.id }"
            @click="applyFormatToIdle(f.id)"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <div class="queue-header" v-if="queue.length">
        <span>佇列</span>
        <span class="queue-header-count">{{ fileCountLabel }}</span>
      </div>

      <TransitionGroup
        tag="ul"
        class="queue-list"
        v-if="queue.length"
        :css="false"
        @enter="onCardEnter"
        @leave="onCardLeave"
      >
        <li v-for="entry in queue" :key="entry.localId" class="queue-card" :data-local-id="entry.localId">
          <div class="queue-row">
            <div class="thumb" :class="isVideoEntry(entry) ? 'thumb-video' : 'thumb-audio'">
              <video
                v-if="isVideoEntry(entry)"
                class="thumb-video-el"
                :src="entry.previewUrl"
                muted
                preload="metadata"
                @loadedmetadata="(e) => { e.target.currentTime = 0.05 }"
              ></video>
              <span v-else class="thumb-bars" aria-hidden="true">
                <span v-for="n in 6" :key="n" class="thumb-bar" :style="{ height: `${8 + ((n * 5) % 13)}px` }"></span>
              </span>
            </div>

            <div class="queue-info">
              <span class="queue-name">{{ entry.name }}</span>
              <span class="queue-meta">{{ extOf(entry) }} · {{ entry.sizeLabel }}</span>
            </div>

            <div class="format-pill-group">
              <span class="src-pill">{{ extOf(entry) }}</span>
              <span class="pill-arrow">→</span>
              <div class="select-wrap select-wrap-pill">
                <select
                  class="target-select"
                  v-model="entry.format"
                  :disabled="entry.status === 'processing' || entry.status === 'queued'"
                >
                  <optgroup label="影片" v-if="videoFormats.length">
                    <option v-for="f in videoFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
                  </optgroup>
                  <optgroup label="音訊" v-if="audioFormats.length">
                    <option v-for="f in audioFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
                  </optgroup>
                </select>
                <span class="select-arrow">▼</span>
              </div>
            </div>

            <span class="row-divider"></span>

            <div class="status-zone">
              <template v-if="entry.status === 'done'">
                <span class="status-chip status-chip-done">✓ 完成</span>
                <a class="btn-solid" :href="entry.downloadUrl">↓ 下載</a>
              </template>
              <template v-else-if="entry.status === 'processing'">
                <div class="progress-col">
                  <div class="progress-meta">
                    <span class="progress-label"><span class="spinner"></span>轉換中</span>
                    <span class="progress-pct">{{ Math.round(entry.progress) }}%</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" :style="{ width: `${entry.progress}%` }"></div>
                  </div>
                </div>
              </template>
              <template v-else-if="entry.status === 'queued'">
                <span class="status-chip status-chip-queued"><span class="status-dot"></span>排隊中</span>
              </template>
              <template v-else-if="entry.status === 'error'">
                <span class="status-chip status-chip-error">{{ entry.errorMessage || STATUS_LABEL.error }}</span>
                <button class="btn-solid" type="button" @click="startConversion(entry)">重試</button>
              </template>
              <template v-else>
                <span class="status-chip status-chip-idle"><span class="status-dot"></span>待轉換</span>
                <button class="btn-solid" type="button" @click="startConversion(entry)">轉換</button>
              </template>
            </div>

            <div class="row-actions">
              <button class="icon-btn" type="button" title="設定" @click="toggleSettings(entry)">
                {{ entry.settingsOpen ? '⌃' : '⌄' }}
              </button>
              <button class="icon-btn icon-btn-remove" type="button" title="移除" @click="removeEntry(entry)">✕</button>
            </div>
          </div>

          <div class="settings-panel" v-if="entry.settingsOpen">
            <div class="settings-grid">
              <label class="settings-field">
                <span class="settings-label">解析度</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.resolution">
                    <option v-for="opt in RESOLUTION_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-label">幀率</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.frameRate">
                    <option v-for="opt in FRAME_RATE_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-label">音訊位元率</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.audioBitrate">
                    <option v-for="opt in AUDIO_BITRATE_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>

              <label class="settings-field settings-field-wide">
                <span class="settings-label">視訊位元率 (kbps)</span>
                <input class="settings-input" type="number" min="0" placeholder="自動" v-model="entry.tuning.videoBitrate" />
              </label>

              <div class="settings-field settings-field-wide">
                <span class="settings-label">剪輯範圍（秒）</span>
                <div class="trim-row">
                  <input class="settings-input trim-input" type="number" min="0" placeholder="開始" v-model="entry.tuning.trimStart" />
                  <span class="trim-sep">—</span>
                  <input class="settings-input trim-input" type="number" min="0" placeholder="結尾" v-model="entry.tuning.trimEnd" />
                </div>
              </div>

              <label class="settings-field">
                <span class="settings-label">視訊編碼器</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.videoCodec">
                    <option v-for="opt in VIDEO_CODEC_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-label">音訊編碼器</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.audioCodec">
                    <option v-for="opt in AUDIO_CODEC_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-label">編碼速度</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.preset">
                    <option v-for="opt in PRESET_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>

              <label class="settings-field">
                <span class="settings-label">畫質 CRF (0-51)</span>
                <input class="settings-input" type="number" min="0" max="51" placeholder="自動" v-model="entry.tuning.crf" />
              </label>
              <label class="settings-field">
                <span class="settings-label">取樣率</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.sampleRate">
                    <option v-for="opt in SAMPLE_RATE_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-label">聲道</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.audioChannels">
                    <option v-for="opt in AUDIO_CHANNEL_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>

              <label class="settings-field">
                <span class="settings-label">旋轉</span>
                <div class="select-wrap">
                  <select class="settings-select" v-model="entry.tuning.rotate">
                    <option v-for="opt in ROTATE_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <span class="select-arrow">▼</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-label">速度倍率 (0.25-4)</span>
                <input class="settings-input" type="number" min="0.25" max="4" step="0.1" placeholder="1.0" v-model="entry.tuning.speed" />
              </label>

              <div class="settings-field settings-field-wide">
                <span class="settings-label">畫面調整：亮度 / 對比 / 飽和度</span>
                <div class="trim-row">
                  <input class="settings-input trim-input" type="number" min="-1" max="1" step="0.1" placeholder="亮度" v-model="entry.tuning.brightness" />
                  <input class="settings-input trim-input" type="number" min="0" max="2" step="0.1" placeholder="對比" v-model="entry.tuning.contrast" />
                  <input class="settings-input trim-input" type="number" min="0" max="3" step="0.1" placeholder="飽和度" v-model="entry.tuning.saturation" />
                </div>
              </div>

              <div class="settings-field settings-field-wide settings-toggles">
                <label class="toggle">
                  <input type="checkbox" v-model="entry.tuning.normalizeAudio" class="visually-hidden" />
                  <span class="toggle-track" :class="{ on: entry.tuning.normalizeAudio }"><span class="toggle-knob"></span></span>
                  音量標準化
                </label>
                <label class="toggle">
                  <input type="checkbox" v-model="entry.tuning.stripMetadata" class="visually-hidden" />
                  <span class="toggle-track" :class="{ on: entry.tuning.stripMetadata }"><span class="toggle-knob"></span></span>
                  移除中繼資料
                </label>
                <label class="toggle">
                  <input type="checkbox" v-model="entry.tuning.flipHorizontal" class="visually-hidden" />
                  <span class="toggle-track" :class="{ on: entry.tuning.flipHorizontal }"><span class="toggle-knob"></span></span>
                  水平翻轉
                </label>
                <label class="toggle">
                  <input type="checkbox" v-model="entry.tuning.flipVertical" class="visually-hidden" />
                  <span class="toggle-track" :class="{ on: entry.tuning.flipVertical }"><span class="toggle-knob"></span></span>
                  垂直翻轉
                </label>
                <label class="toggle">
                  <input type="checkbox" v-model="entry.tuning.deinterlace" class="visually-hidden" />
                  <span class="toggle-track" :class="{ on: entry.tuning.deinterlace }"><span class="toggle-knob"></span></span>
                  去交錯
                </label>
                <label class="toggle">
                  <input type="checkbox" v-model="entry.tuning.denoise" class="visually-hidden" />
                  <span class="toggle-track" :class="{ on: entry.tuning.denoise }"><span class="toggle-knob"></span></span>
                  降噪
                </label>
              </div>
            </div>

            <div class="settings-footer">
              <button class="btn-text" type="button" @click="applyTuningToAll(entry)">套用到所有檔案</button>
              <button class="btn-accent-soft" type="button" @click="toggleSettings(entry)">儲存設定</button>
            </div>
          </div>
        </li>
      </TransitionGroup>
    </main>

    <footer class="site-footer" v-if="queue.length">
      <div class="footer-inner">
        <div class="footer-stats">
          <span class="stat"><span class="status-dot status-dot-done"></span>{{ doneCount }} 完成</span>
          <span class="stat"><span class="status-dot status-dot-accent"></span>{{ processingCount }} 轉換中</span>
          <span class="stat"><span class="status-dot"></span>{{ idleCount }} 待轉換</span>
          <span class="stat stat-error" v-if="errorCount"><span class="status-dot status-dot-error"></span>{{ errorCount }} 失敗</span>
        </div>
        <div class="footer-actions">
          <button class="btn-outline" type="button" :disabled="!hasDone" @click="downloadAll">全部下載</button>
          <button class="btn-solid" type="button" :disabled="!hasIdleOrError" @click="convertAll">
            全部轉換<span class="count-badge">{{ pendingCount }}</span>
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  width: 100%;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 30;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  background: color-mix(in oklab, var(--bg) 80%, transparent);
  border-bottom: 1px solid var(--border-soft);
}

.header-inner {
  max-width: 1080px;
  margin: 0 auto;
  padding: 13px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--accent);
  display: grid;
  place-items: center;
  font-family: var(--mono);
  font-size: 15px;
  color: #fff;
  box-shadow: 0 4px 16px color-mix(in oklab, var(--accent) 45%, transparent);
}

.brand-name {
  font-weight: 600;
  font-size: 15.5px;
  letter-spacing: -0.015em;
}

.beta-tag {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  color: var(--text-faint);
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  padding: 2px 5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 13px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  transition: 0.15s;
}

.btn-outline:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text-mute);
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  transition: 0.15s;
}

.theme-toggle:hover {
  color: var(--text);
}

.theme-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.theme-dot-dark {
  background: var(--accent);
}

.theme-dot-light {
  border: 2px solid oklch(0.78 0.14 80);
  box-sizing: border-box;
}

.page {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 34px 28px 150px;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.hero-text h1 {
  font-size: 27px;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin: 0 0 7px;
}

.hero-text p {
  color: var(--text-mute);
  font-size: 14.5px;
  line-height: 1.45;
}

.hero-badge {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-mute);
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  padding: 8px 13px;
  white-space: nowrap;
}

.dropzone {
  width: 100%;
  text-align: left;
  border: 1.5px dashed var(--border);
  border-radius: 16px;
  background: color-mix(in oklab, var(--bg-2) 55%, transparent);
  padding: 26px 28px;
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
  cursor: pointer;
  font: inherit;
  transition: border-color 0.18s, background 0.18s, transform 0.2s ease;
}

.dropzone:hover,
.dropzone.is-dragging {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 7%, var(--bg-2));
}

.dropzone:hover .dropzone-icon,
.dropzone.is-dragging .dropzone-icon {
  transform: translateY(-3px) scale(1.06);
}

.dropzone.is-dragging {
  transform: scale(1.01);
}

.dropzone-icon {
  width: 48px;
  height: 48px;
  border-radius: 13px;
  flex: none;
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 300;
  color: var(--accent);
  transition: transform 0.25s ease;
}

.dropzone-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dropzone-title {
  font-size: 15px;
  font-weight: 550;
  color: var(--text);
}

.link-text {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.dropzone-hint {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-faint);
  letter-spacing: 0.01em;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.chips-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 13px 16px;
  border: 1px solid var(--border-soft);
  border-radius: 13px;
  background: var(--bg-2);
  margin-bottom: 22px;
}

.chips-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-faint);
  flex: none;
}

.chips-group {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.chips-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.chip {
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
  transition: 0.15s;
  border: 1px solid var(--border);
  background: var(--bg-3);
  color: var(--text-mute);
}

.chip:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.chip:active {
  transform: translateY(0) scale(0.96);
}

.chip.active {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
  box-shadow: 0 3px 12px color-mix(in oklab, var(--accent) 32%, transparent);
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 4px 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.queue-header-count {
  font-family: var(--mono);
  font-size: 11.5px;
  text-transform: none;
  letter-spacing: 0;
}

.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.queue-card {
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--bg-2);
  overflow: hidden;
  transition: border-color 0.15s;
}

.queue-card:hover {
  border-color: var(--border);
}

.queue-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: var(--row-pad);
  flex-wrap: wrap;
}

.thumb {
  width: 74px;
  height: 48px;
  flex: none;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.thumb-video {
  background: repeating-linear-gradient(135deg, var(--bg-3) 0 7px, var(--bg) 7px 14px);
}

.thumb-video-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-audio {
  background: var(--bg-3);
}

.thumb-bars {
  display: flex;
  align-items: center;
  gap: 2px;
}

.thumb-bar {
  width: 2px;
  border-radius: 2px;
  background: var(--text-faint);
}

.queue-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 160px;
  gap: 4px;
}

.queue-name {
  font-size: 14.5px;
  font-weight: 550;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-meta {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-mute);
}

.format-pill-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.src-pill {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-mute);
  padding: 4px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--bg);
}

.pill-arrow {
  color: var(--text-faint);
  font-size: 13px;
}

.select-wrap {
  position: relative;
}

.select-wrap-pill .target-select {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text);
  padding: 4px 24px 4px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-3);
  cursor: pointer;
  transition: 0.15s;
}

.select-wrap-pill .target-select:hover {
  border-color: var(--accent);
}

.select-wrap-pill .select-arrow {
  font-size: 8px;
  right: 9px;
}

.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text-faint);
  font-size: 9px;
}

.row-divider {
  width: 1px;
  height: 34px;
  background: var(--border-soft);
  flex: none;
}

.status-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 11px;
  border-radius: 7px;
  white-space: nowrap;
}

.status-chip-done {
  color: var(--success);
  background: color-mix(in oklab, var(--success) 16%, transparent);
}

.status-chip-queued,
.status-chip-idle {
  color: var(--text-mute);
  background: var(--bg-3);
  border: 1px solid var(--border-soft);
}

.status-chip-error {
  color: var(--error);
  background: color-mix(in oklab, var(--error) 14%, transparent);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
}

.progress-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 176px;
  flex: none;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
}

.progress-pct {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
}

.spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid color-mix(in oklab, var(--accent) 28%, transparent);
  border-top-color: var(--accent);
  animation: spin 0.7s linear infinite;
  display: inline-block;
}

.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-3);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 78%, #fff), var(--accent));
  box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 55%, transparent);
  transition: width 0.3s ease;
}

.btn-solid {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border: none;
  padding: 8px 14px;
  border-radius: 9px;
  cursor: pointer;
  text-decoration: none;
  box-shadow: 0 4px 14px color-mix(in oklab, var(--accent) 32%, transparent);
  transition: 0.15s;
  white-space: nowrap;
}

.btn-solid:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.btn-solid:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}

.btn-solid:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  margin-left: 2px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-mute);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: 0.15s;
}

.icon-btn:hover {
  background: var(--bg-3);
  color: var(--text);
}

.icon-btn-remove {
  color: var(--text-faint);
  font-size: 11px;
}

.icon-btn-remove:hover {
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  color: var(--text);
}

.settings-panel {
  border-top: 1px solid var(--border-soft);
  background: color-mix(in oklab, var(--bg) 45%, var(--bg-2));
  padding: 20px var(--row-pad) 22px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px 24px;
  max-width: 780px;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-field-wide {
  grid-column: span 3;
}

.settings-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.settings-select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 9px 30px 9px 11px;
  cursor: pointer;
}

.settings-input {
  font: inherit;
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--text);
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
  width: 100%;
}

.trim-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trim-input {
  width: 120px;
  text-align: center;
}

.trim-sep {
  color: var(--text-faint);
}

.settings-toggles {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
  padding: 7px 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-3);
  cursor: pointer;
}

.toggle-track {
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: var(--border);
  position: relative;
  flex: none;
  transition: background 0.15s;
}

.toggle-track.on {
  background: var(--accent);
}

.toggle-knob {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}

.toggle-track.on .toggle-knob {
  left: 15px;
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-soft);
  max-width: 780px;
}

.btn-text {
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-mute);
  background: transparent;
  border: 1px solid var(--border);
  padding: 8px 14px;
  border-radius: 9px;
  cursor: pointer;
  transition: 0.15s;
}

.btn-text:hover {
  color: var(--text);
  border-color: var(--text-faint);
}

.btn-accent-soft {
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  border: none;
  padding: 8px 16px;
  border-radius: 9px;
  cursor: pointer;
  transition: 0.15s;
}

.btn-accent-soft:hover {
  background: color-mix(in oklab, var(--accent) 22%, transparent);
}

.site-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  background: color-mix(in oklab, var(--bg) 84%, transparent);
  border-top: 1px solid var(--border-soft);
}

.footer-inner {
  max-width: 1080px;
  margin: 0 auto;
  padding: 14px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.footer-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-mute);
  flex-wrap: wrap;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stat-error {
  color: var(--error);
}

.status-dot-done {
  background: var(--success);
}

.status-dot-accent {
  background: var(--accent);
}

.status-dot-error {
  background: var(--error);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.count-badge {
  font-family: var(--mono);
  font-size: 11px;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 6px;
  padding: 2px 7px;
  line-height: 1.3;
}
</style>
