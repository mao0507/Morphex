import { createI18n } from 'vue-i18n'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'
import ja from './locales/ja.json'

export const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja']
export const DEFAULT_LOCALE = 'zh-TW'
const STORAGE_KEY = 'morphex-locale'

// 沒有明確存過偏好時，用瀏覽器/系統語言猜一次；猜不到就 fallback 回繁中，
// 之後使用者手動切換會蓋掉這個偵測結果並存進 localStorage
function detectLocale() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (SUPPORTED_LOCALES.includes(stored)) return stored

  const browserLangs = navigator.languages || [navigator.language]
  for (const lang of browserLangs) {
    const normalized = lang.toLowerCase()
    if (normalized.startsWith('ja')) return 'ja'
    if (normalized.startsWith('en')) return 'en'
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { 'zh-TW': zhTW, en, ja },
})

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.setAttribute('lang', locale)
}

document.documentElement.setAttribute('lang', i18n.global.locale.value)
