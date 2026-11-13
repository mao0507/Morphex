<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { gsap } from 'gsap'

const props = defineProps({
  formats: { type: Array, default: () => [] },
})
const emit = defineEmits(['start'])

const { t } = useI18n()
const rootRef = ref(null)
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
let gsapCtx
let morphTimer = null

const FEATURES = ['batch', 'tuning', 'presets', 'privacy']

// 示意用的來源 → 目標；目標不在這台機器的 /formats 裡就不顯示
const MORPH_PAIRS = [
  ['MOV', 'MP4'],
  ['PNG', 'WEBP'],
  ['WAV', 'MP3'],
  ['MP4', 'GIF'],
  ['JPG', 'AVIF'],
  ['MKV', 'WEBM'],
]

const extsOf = (kinds) => [
  ...new Set(props.formats.filter((f) => kinds.includes(f.kind)).map((f) => f.ext.toUpperCase())),
]
const mediaExts = computed(() => extsOf(['video', 'audio']))
const imageExts = computed(() => extsOf(['image']))
const morphPairs = computed(() => {
  const all = new Set([...mediaExts.value, ...imageExts.value])
  const pairs = MORPH_PAIRS.filter(([, to]) => all.has(to))
  return pairs.length ? pairs : MORPH_PAIRS.slice(0, 1)
})
const formatCount = computed(() => mediaExts.value.length + imageExts.value.length)

const morphIndex = ref(0)
const morphPair = computed(() => morphPairs.value[morphIndex.value % morphPairs.value.length])

function nextMorph() {
  if (reduceMotion) {
    morphIndex.value++
    return
  }
  const pills = rootRef.value?.querySelectorAll('.morph-pill')
  if (!pills?.length) return
  gsap
    .timeline()
    .to(pills, { y: -8, autoAlpha: 0, filter: 'blur(4px)', duration: 0.22, stagger: 0.08, ease: 'power1.in' })
    .add(() => morphIndex.value++)
    .fromTo(
      pills,
      { y: 8, autoAlpha: 0, filter: 'blur(4px)' },
      { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 0.3, stagger: 0.08, ease: 'power2.out' },
    )
}

onMounted(() => {
  if (!reduceMotion) {
    gsapCtx = gsap.context(() => {
      gsap.from('.hero-copy > *', { y: 14, autoAlpha: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out' })
      gsap.from('.morph-stage', { scale: 0.96, autoAlpha: 0, duration: 0.5, delay: 0.15, ease: 'power2.out' })
      gsap.from('.landing-card', { y: 16, autoAlpha: 0, duration: 0.45, stagger: 0.08, delay: 0.25, ease: 'power2.out' })
    }, rootRef.value)
  }
  morphTimer = setInterval(nextMorph, 2400)
})

onUnmounted(() => {
  clearInterval(morphTimer)
  gsapCtx?.revert()
})
</script>

<template>
  <main class="landing" ref="rootRef">
    <section class="landing-hero">
      <div class="hero-copy">
        <span class="eyebrow">{{ t('landing.eyebrow') }}</span>
        <h1>{{ t('landing.title') }}</h1>
        <p>{{ t('landing.desc') }}</p>
      </div>

      <div class="morph-stage" aria-hidden="true">
        <div class="morph-row">
          <span class="morph-file">
            <span class="morph-pill">{{ morphPair[0] }}</span>
          </span>
          <span class="morph-pixels">
            <span v-for="n in 6" :key="n" :style="{ animationDelay: `${n * 0.12}s` }"></span>
          </span>
          <span class="morph-file morph-file-target">
            <span class="morph-pill">{{ morphPair[1] }}</span>
          </span>
        </div>
        <span class="morph-caption" v-if="formatCount">{{ t('landing.formatCount', { count: formatCount }) }}</span>
      </div>
    </section>

    <section class="landing-cards">
      <button class="landing-card" type="button" @click="emit('start', 'image')">
        <span class="card-head">
          <span class="card-title">{{ t('landing.cta.image.title') }}</span>
          <span class="card-go">{{ t('landing.cta.start') }} →</span>
        </span>
        <span class="card-desc">{{ t('landing.cta.image.desc') }}</span>
        <span class="card-exts" v-if="imageExts.length">{{ imageExts.join(' · ') }}</span>
      </button>
      <button class="landing-card" type="button" @click="emit('start', 'video')">
        <span class="card-head">
          <span class="card-title">{{ t('landing.cta.video.title') }}</span>
          <span class="card-go">{{ t('landing.cta.start') }} →</span>
        </span>
        <span class="card-desc">{{ t('landing.cta.video.desc') }}</span>
        <span class="card-exts" v-if="mediaExts.length">{{ mediaExts.slice(0, 10).join(' · ') }}</span>
      </button>
    </section>

    <section class="features">
      <div v-for="key in FEATURES" :key="key" class="feature">
        <span class="feature-title">{{ t(`landing.features.${key}.title`) }}</span>
        <span class="feature-desc">{{ t(`landing.features.${key}.desc`) }}</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.landing {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 64px 28px 80px;
}

.landing-hero {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  align-items: center;
  gap: 48px;
  margin-bottom: 52px;
}

.eyebrow {
  display: block;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  margin-bottom: 18px;
}

.hero-copy h1 {
  font-family: var(--display);
  font-size: clamp(32px, 5vw, 50px);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  margin: 0 0 18px;
  text-wrap: balance;
  word-break: keep-all;
}

.hero-copy p {
  color: var(--text-mute);
  font-size: 15.5px;
  line-height: 1.7;
  max-width: 460px;
}

.morph-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  aspect-ratio: 5 / 4;
  border-radius: 22px;
  border: 1px solid var(--border-soft);
  background:
    radial-gradient(circle at 20% 15%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 55%),
    radial-gradient(circle at 85% 90%, color-mix(in oklab, var(--accent-2) 14%, transparent), transparent 55%),
    var(--bg-2);
  overflow: hidden;
}

.morph-row {
  display: flex;
  align-items: center;
  gap: 18px;
}

.morph-file {
  position: relative;
  width: 92px;
  height: 116px;
  border-radius: 12px 26px 12px 12px;
  border: 1.5px solid var(--border);
  background: var(--bg-3);
  display: grid;
  place-items: center;
}

.morph-file-target {
  border: none;
  background: var(--morph);
  box-shadow: 0 14px 36px color-mix(in oklab, var(--accent) 35%, transparent);
}

.morph-pill {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-mute);
}

.morph-file-target .morph-pill {
  color: #fff;
}

.morph-pixels {
  display: grid;
  grid-template-columns: repeat(3, 7px);
  gap: 4px;
}

.morph-pixels span {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--morph);
  animation: pixel 1.4s ease-in-out infinite;
}

@keyframes pixel {
  0%,
  100% {
    opacity: 0.15;
    transform: translateX(-3px);
  }
  50% {
    opacity: 1;
    transform: translateX(3px);
  }
}

.morph-caption {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-faint);
}

.landing-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 40px;
}

.landing-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  text-align: left;
  font: inherit;
  color: var(--text);
  padding: 24px 26px;
  border-radius: 18px;
  border: 1px solid var(--border-soft);
  background: var(--bg-2);
  cursor: pointer;
  transition: border-color 0.18s, transform 0.2s ease, box-shadow 0.2s ease;
}

.landing-card:hover {
  border-color: color-mix(in oklab, var(--accent) 60%, var(--border));
  transform: translateY(-2px);
  box-shadow: 0 12px 32px color-mix(in oklab, var(--accent) 14%, transparent);
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  font-family: var(--display);
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.card-go {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  transition: transform 0.2s ease;
}

.landing-card:hover .card-go {
  transform: translateX(3px);
}

.card-desc {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-mute);
}

.card-exts {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-faint);
  padding-top: 12px;
  border-top: 1px dashed var(--border-soft);
}

.features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px;
  padding-top: 28px;
  border-top: 1px solid var(--border-soft);
}

.feature {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feature-title {
  font-size: 13.5px;
  font-weight: 600;
}

.feature-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-mute);
}

@media (max-width: 860px) {
  .landing-hero {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .morph-stage {
    aspect-ratio: auto;
    padding: 36px 0 28px;
  }

  .features {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .landing {
    padding: 36px 18px 60px;
  }

  .landing-cards,
  .features {
    grid-template-columns: 1fr;
  }
}
</style>
