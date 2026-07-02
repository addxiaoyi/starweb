<template>
  <transition name="fade-dirt">
    <div v-if="isOffline" class="offline-overlay">
      <div class="offline-modal">
        <h2 class="title">Disconnected from Server</h2>
        <div class="content">
          <p>糟糕！你的网络似乎断开了。</p>
          <p class="text-muted">请检查网络连接后重试。</p>
        </div>

        <button class="mc-btn wide-btn" @click="playDenied">
          等待重连...
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { audioService } from '@/shared/utils/audioService';

const isOffline = ref(false);

const handleOffline = () => {
  isOffline.value = true;
};

const handleOnline = () => {
  if (isOffline.value) {
    audioService.playClick();
  }
  isOffline.value = false;
};

const playDenied = () => {};

onMounted(() => {
  if (globalThis.window !== undefined) {
    isOffline.value = !globalThis.navigator.onLine;
    globalThis.window.addEventListener('offline', handleOffline);
    globalThis.window.addEventListener('online', handleOnline);
  }
});

onUnmounted(() => {
  if (globalThis.window !== undefined) {
    globalThis.window.removeEventListener('offline', handleOffline);
    globalThis.window.removeEventListener('online', handleOnline);
  }
});
</script>

<style scoped>
.offline-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(10px);
}

.offline-modal {
  text-align: center;
  font-family: 'Minecraft', 'Zpix', sans-serif;
  max-width: 520px;
  padding: 32px 28px;
  border-radius: 20px;
  background: rgba(12, 14, 20, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.title {
  margin: 0 0 14px;
  color: #ff6b6b;
  font-size: 24px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
}

.content {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
}

.content p {
  margin: 0;
  line-height: 1.7;
}

.text-muted {
  color: rgba(235, 241, 255, 0.68);
  font-size: 14px;
}

.mc-btn {
  background: rgba(124, 140, 255, 0.14);
  color: #fff;
  border: 1px solid rgba(124, 140, 255, 0.24);
  padding: 12px 18px;
  border-radius: 14px;
  font-family: inherit;
  font-size: 14px;
  cursor: default;
}

.wide-btn {
  width: 100%;
  max-width: 280px;
}

.fade-dirt-enter-active,
.fade-dirt-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.fade-dirt-enter-from,
.fade-dirt-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
