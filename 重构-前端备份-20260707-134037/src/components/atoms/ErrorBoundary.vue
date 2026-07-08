<template>
  <div
    v-if="hasError"
    :class="computedClass"
    v-bind="filteredAttrs"
  >
    <div class="error-content mc-inventory-modal" role="alert" aria-live="assertive">
      <div class="error-icon" aria-hidden="true">⚠️</div>
      <p class="error-eyebrow">Something went wrong</p>
      <h2 class="text-danger">系统方块崩溃了</h2>
      <p class="error-message">
        {{ error?.message || '发生了未知的量子坍缩' }}
      </p>

      <div class="error-suggestions">
        <p>你可以先尝试重试，或返回首页继续浏览。</p>
      </div>

      <div v-if="error?.stack" class="error-stack">
        <details>
          <summary class="stack-toggle">展开调试日志</summary>
          <pre class="stack-content">{{ error.stack }}</pre>
        </details>
      </div>

      <div class="actions">
        <button class="mc-btn retry-button" @click="retry">重试</button>
        <button class="mc-btn home-button" @click="goHome">返回首页</button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured, computed, useAttrs } from 'vue';
import { useRouter } from 'vue-router';

defineOptions({
  name: 'ErrorBoundary',
  inheritAttrs: false,
});

const attrs = useAttrs();

interface Props {
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  class: '',
});

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});

const computedClass = computed(() => {
  return ['error-boundary', props.class, attrs.class].filter(Boolean).join(' ');
});

const hasError = ref(false);
const error = ref<Error | null>(null);
const router = useRouter();

onErrorCaptured((err) => {
  hasError.value = true;
  error.value = err as Error;
  console.error('Error caught by ErrorBoundary:', err);
  return false;
});

const retry = () => {
  hasError.value = false;
  error.value = null;
};

const goHome = async () => {
  hasError.value = false;
  error.value = null;
  await router.push('/');
};
</script>

<style scoped>
.error-boundary {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 20px;
  background: radial-gradient(circle at top, rgba(124, 140, 255, 0.16), rgba(0, 0, 0, 0.92));
}

.error-content {
  width: min(100%, 640px);
  text-align: center;
  padding: clamp(1.5rem, 4vw, 2.25rem);
  display: grid;
  gap: 1rem;
}

.error-icon {
  font-size: 3rem;
  line-height: 1;
}

.error-eyebrow {
  margin: 0;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 0.78rem;
}

.text-danger {
  color: #ff6b6b;
  font-size: clamp(1.35rem, 3vw, 1.7rem);
  margin: 0;
}

.error-message,
.error-suggestions {
  color: rgba(255, 255, 255, 0.84);
  margin: 0;
  line-height: 1.7;
}

.error-stack {
  text-align: left;
}

.stack-toggle {
  color: #7c8cff;
  cursor: pointer;
  font-size: 0.92rem;
  outline: none;
}

.stack-content {
  margin-top: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: #ff9b9b;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  overflow-x: auto;
  max-height: 240px;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.mc-btn {
  background-color: #8b8b8b;
  color: #fff;
  border: 2px solid;
  border-color: #fff #373737 #373737 #fff;
  padding: 10px 20px;
  font-family: inherit;
  font-size: 16px;
  text-shadow: 2px 2px 0 #3f3f3f;
  cursor: pointer;
  box-shadow: inset -2px -2px 0 #555, inset 2px 2px 0 #c6c6c6;
  white-space: nowrap;
}

.mc-btn:hover {
  background-color: #9e9e9e;
  color: #ffff55;
}

.mc-btn:active {
  background-color: #5d5d5d;
  border-color: #373737 #fff #fff #373737;
  box-shadow: inset 2px 2px 0 rgba(0, 0, 0, 0.5);
  transform: translateY(2px);
}

.retry-button {
  color: #55ff55;
}

.home-button {
  color: #ffd36b;
}
</style>
