<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { audioService } from '@/shared/utils/audioService';
import MCTooltip from '@/components/atoms/MCTooltip.vue';

const isVisible = ref(false);

const checkScroll = () => {
  if (globalThis.window !== undefined) {
    isVisible.value = globalThis.window.scrollY > 400;
  }
};

const scrollToTop = () => {
  audioService.playClick();
  if (globalThis.window !== undefined) {
    globalThis.window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
};

onMounted(() => {
  if (globalThis.window !== undefined) {
    globalThis.window.addEventListener('scroll', checkScroll);
    checkScroll();
  }
});

onUnmounted(() => {
  if (globalThis.window !== undefined) {
    globalThis.window.removeEventListener('scroll', checkScroll);
  }
});
</script>

<template>
  <transition name="fade-pearl">
    <MCTooltip position="left" title="末影珍珠" content="点击传送回页面顶部" title-color="purple">
      <button 
        v-if="isVisible" 
        class="back-to-top-pearl"
        @click="scrollToTop"
        aria-label="回到顶部"
      >
        <div class="pearl-container">
          <div class="pearl-icon">
            <div class="pearl-core"></div>
            <div class="pearl-shine"></div>
          </div>
        </div>
      </button>
    </MCTooltip>
  </transition>
</template>

<style scoped>
.back-to-top-pearl {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 58px;
  height: 58px;
  background: rgba(70, 70, 70, 0.36);
  backdrop-filter: blur(8px) saturate(115%);
  -webkit-backdrop-filter: blur(8px) saturate(115%);
  border: 2px solid;
  border-color: rgba(255, 255, 255, 0.5) rgba(55, 55, 55, 0.9) rgba(55, 55, 55, 0.9) rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  cursor: pointer;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
  box-shadow: inset -2px -2px 0 rgba(85, 85, 85, 0.65), inset 2px 2px 0 rgba(255, 255, 255, 0.26), 0 10px 28px rgba(0, 0, 0, 0.33);
  padding: 0;
  image-rendering: pixelated;
}

.back-to-top-pearl:hover {
  transform: translateY(-2px) scale(1.04);
  background: rgba(92, 92, 92, 0.42);
  box-shadow: inset -2px -2px 0 rgba(85, 85, 85, 0.72), inset 2px 2px 0 rgba(255, 255, 255, 0.3), 0 14px 30px rgba(26, 188, 156, 0.28);
}

.back-to-top-pearl:active {
  transform: translateY(1px) scale(0.99);
  border-color: rgba(55, 55, 55, 0.9) rgba(255, 255, 255, 0.45) rgba(255, 255, 255, 0.45) rgba(55, 55, 55, 0.9);
  box-shadow: inset 2px 2px 0 rgba(55, 55, 55, 0.72), inset -2px -2px 0 rgba(255, 255, 255, 0.2);
}

.pearl-container {
  position: relative;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pearl-icon {
  position: relative;
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, rgba(68, 235, 182, 0.95) 0%, rgba(22, 160, 133, 0.95) 55%, rgba(13, 107, 90, 0.95) 100%);
  border-radius: 4px;
  border: 2px solid;
  border-color: rgba(175, 255, 229, 0.85) rgba(11, 79, 67, 0.95) rgba(11, 79, 67, 0.95) rgba(175, 255, 229, 0.85);
  box-shadow: inset -1px -1px 0 rgba(8, 59, 50, 0.75), inset 1px 1px 0 rgba(194, 255, 240, 0.5), 0 0 14px rgba(26, 188, 156, 0.5);
  overflow: hidden;
}

.pearl-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background: rgba(208, 255, 241, 0.92);
  border-radius: 2px;
  opacity: 0.75;
  animation: pearl-pulse 1.8s infinite ease-in-out;
}

.pearl-shine {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 7px;
  height: 5px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 1px;
}

@keyframes pearl-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
  50% { transform: translate(-50%, -50%) scale(1.28); opacity: 1; }
}

/* 原有的 .tooltip 样式已被 MCTooltip 组件替代 */

/* 进场动画 */
.fade-pearl-enter-active,
.fade-pearl-leave-active {
  transition: all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.fade-pearl-enter-from,
.fade-pearl-leave-to {
  opacity: 0;
  transform: scale(0.2) rotate(360deg) translateY(100px);
}
</style>
