<script setup>
import { ref, onMounted, computed } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const formats = ref([])
const selectedFile = ref(null)
const selectedFormat = ref('')
const loading = ref(false)
const errorMessage = ref('')
const result = ref(null)

const videoFormats = computed(() => formats.value.filter((f) => f.kind === 'video'))
const audioFormats = computed(() => formats.value.filter((f) => f.kind === 'audio'))

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/formats`)
    if (!res.ok) throw new Error('無法載入格式清單')
    formats.value = await res.json()
  } catch {
    errorMessage.value = '無法連線到伺服器，請確認後端服務已啟動'
  }
})

function onFileChange(event) {
  selectedFile.value = event.target.files?.[0] ?? null
  result.value = null
  errorMessage.value = ''
}

async function submitConvert() {
  if (!selectedFile.value) {
    errorMessage.value = '請選擇要轉檔的檔案'
    return
  }
  if (!selectedFormat.value) {
    errorMessage.value = '請選擇輸出格式'
    return
  }

  errorMessage.value = ''
  result.value = null
  loading.value = true

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('format', selectedFormat.value)

    const res = await fetch(`${API_BASE}/convert`, {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message || '轉檔失敗')
    }
    result.value = data
  } catch (err) {
    errorMessage.value = err.message || '轉檔過程發生錯誤'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <h1>MediaForge</h1>
    <p class="subtitle">上傳影音檔案，選擇輸出格式並轉檔</p>

    <form class="card" @submit.prevent="submitConvert">
      <label class="field">
        <span>選擇檔案</span>
        <input type="file" accept="video/*,audio/*" @change="onFileChange" />
      </label>

      <label class="field">
        <span>輸出格式</span>
        <select v-model="selectedFormat">
          <option value="" disabled>請選擇格式</option>
          <optgroup label="影片" v-if="videoFormats.length">
            <option v-for="f in videoFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
          </optgroup>
          <optgroup label="音訊" v-if="audioFormats.length">
            <option v-for="f in audioFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
          </optgroup>
        </select>
      </label>

      <button type="submit" :disabled="loading">
        {{ loading ? '轉檔中…' : '開始轉檔' }}
      </button>
    </form>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <div v-if="result" class="result">
      <p>轉檔完成！</p>
      <a :href="`${API_BASE}${result.downloadUrl}`">下載 {{ result.ext.toUpperCase() }} 檔案</a>
    </div>
  </main>
</template>

<style scoped>
.page {
  max-width: 480px;
  margin: 4rem auto;
  padding: 0 1.5rem;
  text-align: left;
  font-family: inherit;
}

h1 {
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #888;
  margin-bottom: 2rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  border: 1px solid #333;
  border-radius: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

button {
  cursor: pointer;
}

.error {
  color: #e5484d;
  margin-top: 1rem;
}

.result {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #2a8f4d;
  border-radius: 8px;
}
</style>
