<template>
  <Transition name="confirm-dialog">
    <div v-if="visible" class="confirm-overlay" @click.self="$emit('cancel')">
      <div class="confirm-panel glass-panel" role="dialog" :aria-labelledby="titleId">
        <header class="confirm-header">
          <h2 :id="titleId" class="confirm-title">
          <AppIcon v-if="variant === 'danger'" name="skull" class="icon-danger" />
          <AppIcon v-else-if="variant === 'warning'" name="warning" class="icon-warning" />
          <AppIcon v-else name="infoCircle" class="icon-info" />
            {{ title }}
          </h2>
        </header>

        <div class="confirm-body">
          <p class="confirm-message">{{ message }}</p>
        </div>

        <footer class="confirm-footer">
          <button class="ui-btn ghost" @click="$emit('cancel')">
            {{ cancelText }}
          </button>
          <button
            class="ui-btn"
            :class="confirmClass"
            :disabled="loading"
            @click="$emit('confirm')"
          >
            <AppIcon v-if="loading" name="spinner" :spin="true" />
            {{ loading ? loadingText : confirmText }}
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  loadingText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  cancelText: '取消',
  variant: 'info',
  loading: false,
  loadingText: '处理中...',
});

defineEmits<{
  confirm: [];
  cancel: [];
}>();

const titleId = `confirm-title-${Math.random().toString(36).slice(2, 8)}`;

const confirmClass = computed(() => {
  const map: Record<string, string> = {
    danger: 'danger',
    warning: 'primary',
    info: 'primary',
  };
  return map[props.variant] ?? 'primary';
});
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.confirm-panel {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border-subtle);
}

.confirm-header {
  padding: 1.25rem 1.5rem 0.75rem;
}

.confirm-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.icon-danger { color: #ef4444; }
.icon-warning { color: #f59e0b; }
.icon-info { color: var(--brand-primary); }

.confirm-body {
  padding: 0 1.5rem 1.25rem;
}

.confirm-message {
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.6;
  margin: 0;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem 1.25rem;
}

/* 过渡动画 */
.confirm-dialog-enter-active,
.confirm-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.confirm-dialog-enter-from,
.confirm-dialog-leave-to {
  opacity: 0;
}

.confirm-dialog-enter-from .confirm-panel {
  transform: scale(0.95);
}

.confirm-dialog-leave-to .confirm-panel {
  transform: scale(0.95);
}

.confirm-panel {
  transition: transform 0.2s ease;
}
</style>
