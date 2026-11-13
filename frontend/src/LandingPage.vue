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
let gsapCtx

const FEATURES = ['batch', 'tuning', 'presets', 'privacy']

const extsOf = (kinds) => [
  ...new Set(props.formats.filter((f) => kinds.includes(f.kind)).map((f) => f.ext.toUpperCase())),
]
const mediaExts = computed(() => extsOf(['video', 'audio']))
const imageExts = computed(() => extsOf(['image']))

onMounted(() => {
  gsapCtx = gsap.context(() => {
    gsap.from('.landing-hero > *', { y: 14, autoAlpha: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out' })
    gsap.from('.landing-card', { y: 16, autoAlpha: 0, duration: 0.45, stagger: 0.08, delay: 0.2, ease: 'power2.out' })
    gsap.from('.feature', { y: 12, autoAlpha: 0, duration: 0.4, stagger: 0.06, delay: 0.35, ease: 'power2.out' })
  }, rootRef.value)
})

onUnmounted(() => gsapCtx?.revert())
</script>

<template>
  <main class="landing" ref="rootRef">
    <section class="landing-hero">
      <span class="eyebrow">{{ t('landing.eyebrow') }}</span>
      <h1>{{ t('landing.title') }}</h1>
      <p>{{ t('landing.desc') }}</p>
    </section>

    <section class="landing-cards">
      <button class="landing-card" type="button" @click="emit('start', 'image')">
        <span class="card-icon">◩</span>
        <span class="card-title">{{ t('landing.cta.image.title') }}</span>
        <span class="card-desc">{{ t('landing.cta.image.desc') }}</span>
        <span class="card-exts" v-if="imageExts.length">{{ imageExts.join(' · ') }}</span>
        <span class="card-go">{{ t('landing.cta.start') }} →</span>
      </button>
      <button class="landing-card" type="button" @click="emit('start', 'video')">
        <span class="card-icon">▶</span>
        <span class="card-title">{{ t('landing.cta.video.title') }}</span>
        <span class="card-desc">{{ t('landing.cta.video.desc') }}</span>
        <span class="card-exts" v-if="mediaExts.length">{{ mediaExts.slice(0, 10).join(' · ') }}</span>
        <span class="card-go">{{ t('landing.cta.start') }} →</span>
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
  padding: 72px 28px 80px;
}

.landing-hero {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 48px;
}

.eyebrow {
  display: inline-block;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.06em;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  border-radius: 999px;
  padding: 5px 12px;
  margin-bottom: 18px;
}

.landing-hero h1 {
  font-size: 40px;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0 0 14px;
}

.landing-hero p {
  color: var(--text-mute);
  font-size: 15.5px;
  line-height: 1.6;
}

.landing-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
  margin-bottom: 44px;
}

.landing-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  text-align: left;
  font: inherit;
  color: var(--text);
  padding: 26px;
  border-radius: 16px;
  border: 1px solid var(--border-soft);
  background: var(--bg-2);
  cursor: pointer;
  transition: border-color 0.18s, transform 0.2s ease, box-shadow 0.2s ease;
}

.landing-card:hover {
  border-color: var(--accent);
  transform: translateY(-3px);
  box-shadow: 0 10px 30px color-mix(in oklab, var(--accent) 18%, transparent);
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 17px;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  margin-bottom: 6px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.015em;
}

.card-desc {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-mute);
}

.card-exts {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-faint);
}

.card-go {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.feature {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  border-radius: 13px;
  border: 1px solid var(--border-soft);
}

.feature-title {
  font-size: 13.5px;
  font-weight: 600;
}

.feature-desc {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-mute);
}

@media (max-width: 760px) {
  .landing {
    padding-top: 44px;
  }

  .landing-hero h1 {
    font-size: 30px;
  }

  .landing-cards,
  .features {
    grid-template-columns: 1fr;
  }
}
</style>
