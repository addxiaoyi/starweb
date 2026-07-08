<template>
  <div class="toast-container">
    <transition-group name="toast-fade">
      <div
        v-for="toast in store.toasts"
        :key="toast.id"
        class="toast-item"
        :class="toast.type"
      >
        <AppIcon
          class="toast-icon"
          :name="toast.type === 'success' ? 'trophy' : toast.type === 'warning' ? 'warning' : toast.type === 'error' ? 'skull' : 'infoCircle'"
          :size="18"
        />

        <div class="toast-content">
          <p class="toast-title">
            {{ toast.type === 'success' ? '提示' : toast.type === 'error' ? '错误' : toast.type === 'warning' ? '警告' : '消息' }}
          </p>
          <p class="toast-message">{{ toast.message }}</p>
        </div>

        <button
          type="button"
          @click="store.removeToast(toast.id)"
          class="close-btn"
          aria-label="关闭提示"
        >
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast';
import AppIcon from '@/components/atoms/AppIcon.vue';

const store = useToastStore();
</script>

<style scoped>
.toast-container {
  pointer-events: none;
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.toast-item {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 240px;
  max-width: 320px;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: rgba(13, 17, 26, 0.94);
  border: 1px solid rgba(182, 198, 255, 0.12);
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
}

.toast-item.success {
  border-color: rgba(124, 255, 174, 0.22);
}

.toast-item.warning {
  border-color: rgba(255, 183, 77, 0.22);
}

.toast-item.error {
  border-color: rgba(255, 110, 110, 0.22);
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(246, 248, 255, 0.96);
}

.toast-message {
  margin: 0.2rem 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: rgba(235, 241, 255, 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(235, 241, 255, 0.56);
  cursor: pointer;
}

.close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

@media (max-width: 480px) {
  .toast-container {
    top: auto;
    right: 1rem;
    bottom: 1.25rem;
    left: 1rem;
  }

  .toast-item {
    max-width: none;
    width: 100%;
  }
}
</style>
