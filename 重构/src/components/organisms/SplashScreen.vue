<template>
  <transition name="splash-fade">
    <div v-if="loading" class="splash-screen" aria-label="正在启动 StarMC">
      <div class="splash-shell">
        <div class="orb orb--one"></div>
        <div class="orb orb--two"></div>

        <div class="logo-row">
          <div class="logo-mark">
            <img src="/favicon.svg" alt="StarMC Logo" class="logo" />
          </div>
          <div class="copy">
            <p class="eyebrow">StarMC</p>
            <h1 class="title">正在进入星系</h1>
            <p class="subtitle">初始化资源、连接服务、准备工作区。</p>
          </div>
        </div>

        <div class="meter" :style="{ '--progress': `${progress}%` }">
          <div class="meter-track">
            <div class="meter-fill"></div>
          </div>
          <div class="meter-meta">
            <span>Loading</span>
            <span>{{ Math.round(progress) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { devWarn } from '@/shared/utils/devLog'

const loading = ref(true)
const progress = ref(0)
let interval: ReturnType<typeof globalThis.setInterval> | null = null
let observer: PerformanceObserver | null = null
let finishTimer: ReturnType<typeof globalThis.setTimeout> | null = null

const finishLoading = () => {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (finishTimer) {
    clearTimeout(finishTimer)
    finishTimer = null
  }

  progress.value = 100
  sessionStorage.setItem('splash_shown', 'true')
  window.setTimeout(() => {
    loading.value = false
    globalThis.window.dispatchEvent(new Event('app-ready'))
  }, 180)
}

const startLoading = () => {
  if (sessionStorage.getItem('splash_shown')) {
    loading.value = false
    globalThis.window.dispatchEvent(new Event('app-ready'))
    return
  }

  progress.value = 8

  const updateProgress = () => {
    const target = Math.min(96, 8 + performance.getEntriesByType('resource').length * 4)
    if (target > progress.value) {
      progress.value = target
    }
  }

  try {
    if (typeof PerformanceObserver !== 'undefined') {
      observer = new PerformanceObserver((list) => {
        if (list.getEntries().length > 0) {
          updateProgress()
        }
      })
      observer.observe({ entryTypes: ['resource'] })
    }
  } catch (error) {
    devWarn('PerformanceObserver init failed', error)
  }

  interval = globalThis.setInterval(() => {
    if (progress.value < 92) {
      progress.value += Math.max(0.2, (92 - progress.value) / 40)
    }
  }, 90)

  if (document.readyState === 'complete') {
    finishLoading()
  } else {
    globalThis.window.addEventListener('load', finishLoading, { once: true })
    finishTimer = globalThis.setTimeout(finishLoading, 8000)
  }
}

onMounted(startLoading)

onUnmounted(() => {
  if (interval) clearInterval(interval)
  if (observer) observer.disconnect()
  if (finishTimer) clearTimeout(finishTimer)
})
</script>

<style scoped lang="scss">
.splash-screen {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 20%, rgba(124, 92, 255, 0.24), transparent 32%),
    radial-gradient(circle at 80% 30%, rgba(60, 194, 255, 0.18), transparent 28%),
    linear-gradient(135deg, #090816 0%, #0f1328 45%, #080b14 100%);
}

.splash-shell {
  position: relative;
  width: min(92vw, 440px);
  padding: 28px;
  border-radius: 28px;
  background: rgba(10, 14, 28, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(18px);
  transform: translate3d(0, 0, 0);
  animation: splash-panel-enter var(--motion-splash, 520ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 18px;
}

.logo-mark {
  position: relative;
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
}

.logo-mark::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(124, 92, 255, 0.34), transparent 70%);
  filter: blur(6px);
  opacity: 0.88;
}

.logo {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 20px;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.35);
  transform: translate3d(0, 0, 0);
}

.copy {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-size: 0.72rem;
  color: rgba(214, 223, 255, 0.72);
}

.title {
  margin: 0;
  font-size: clamp(1.4rem, 4vw, 2rem);
  line-height: 1.1;
  color: #fff;
}

.subtitle {
  margin: 8px 0 0;
  color: rgba(214, 223, 255, 0.72);
  font-size: 0.95rem;
}

.meter {
  margin-top: 22px;
}

.meter-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.meter-fill {
  position: absolute;
  inset: 0;
  width: var(--progress);
  border-radius: inherit;
  background: linear-gradient(90deg, #7c5cff 0%, #35c9ff 52%, #8bffcf 100%);
  box-shadow: 0 0 22px rgba(91, 154, 255, 0.45);
  transition: width 160ms ease;
}

.meter-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 0.8rem;
  color: rgba(214, 223, 255, 0.64);
}

.orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  pointer-events: none;
}

.orb--one {
  width: 180px;
  height: 180px;
  right: -60px;
  top: -60px;
  background: rgba(124, 92, 255, 0.18);
  opacity: 0.86;
}

.orb--two {
  width: 140px;
  height: 140px;
  left: -50px;
  bottom: -50px;
  background: rgba(53, 201, 255, 0.12);
  opacity: 0.78;
}

.splash-fade-leave-active {
  transition:
    opacity var(--motion-base, 260ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)),
    transform var(--motion-base, 260ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

.splash-fade-leave-to {
  opacity: 0;
  transform: translate3d(0, -6px, 0);
}

@keyframes splash-panel-enter {
  from { opacity: 0; transform: translate3d(0, 12px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .splash-shell {
    animation: none !important;
  }

  .splash-fade-leave-to {
    transform: none;
  }

  .meter-fill {
    transition: none;
  }
}
</style>
