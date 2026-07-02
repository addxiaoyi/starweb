<template>
  <section :class="panelClass" :aria-live="ariaLive">
    <div class="state-icon" :class="`state-icon--${variant}`" aria-hidden="true">
      <slot name="icon">
        {{ defaultIcon }}
      </slot>
    </div>

    <div class="state-content">
      <p v-if="eyebrow" class="state-eyebrow">{{ eyebrow }}</p>
      <h2 v-if="title" class="state-title">{{ title }}</h2>
      <p v-if="message" class="state-message">{{ message }}</p>
      <p v-if="hint" class="state-hint">{{ hint }}</p>
    </div>

    <div v-if="$slots.actions" class="state-actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type StateVariant = 'info' | 'success' | 'warning' | 'error' | 'empty' | 'loading'

const props = withDefaults(defineProps<{
  title?: string
  message?: string
  hint?: string
  eyebrow?: string
  variant?: StateVariant
  compact?: boolean
  ariaLive?: 'polite' | 'assertive' | 'off'
}>(), {
  variant: 'info',
  compact: false,
  ariaLive: 'polite',
})

const defaultIcon = computed(() => {
  const map: Record<StateVariant, string> = {
    info: 'i',
    success: '✓',
    warning: '!',
    error: '×',
    empty: '∅',
    loading: '…',
  }
  return map[props.variant]
})

const panelClass = computed(() => [
  'app-state-panel',
  `app-state-panel--${props.variant}`,
  { 'app-state-panel--compact': props.compact },
])
</script>

<style scoped>
.app-state-panel {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 0.9rem;
  padding: clamp(1.25rem, 3vw, 2rem);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.02) 100%), var(--surface-1);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-1);
}

.app-state-panel--compact {
  padding: 1rem;
  gap: 0.6rem;
  border-radius: 18px;
}

.state-icon {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  font-size: 1.2rem;
  font-weight: 700;
  background: rgba(124, 140, 255, 0.12);
  color: var(--primary);
}

.state-icon--success { background: rgba(34, 197, 94, 0.14); color: #22c55e; }
.state-icon--warning { background: rgba(245, 158, 11, 0.14); color: #f59e0b; }
.state-icon--error { background: rgba(239, 68, 68, 0.14); color: #ef4444; }
.state-icon--empty { background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); }
.state-icon--loading { background: rgba(124, 140, 255, 0.12); color: var(--primary); }

.state-content {
  display: grid;
  gap: 0.4rem;
}

.state-eyebrow {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.state-title {
  margin: 0;
  font-size: clamp(1.1rem, 2.5vw, 1.4rem);
}

.state-message,
.state-hint {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.state-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}
</style>