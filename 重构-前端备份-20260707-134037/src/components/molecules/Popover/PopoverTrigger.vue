<script setup lang="ts">
import { inject, ref, onMounted, computed, useAttrs } from 'vue';
import { POPOVER_CONTEXT_KEY } from './types';

defineOptions({ name: 'PopoverTrigger', inheritAttrs: false });

const props = defineProps<{ class?: string }>();
const attrs = useAttrs();

const context = inject(POPOVER_CONTEXT_KEY);
if (!context) {
  throw new Error('PopoverTrigger must be used within Popover');
}

const triggerEl = ref<HTMLElement | null>(null);

onMounted(() => {
  context.setTriggerRef(triggerEl.value);
});

const computedClass = computed(() => [
  'popover-trigger',
  props.class,
  attrs.class,
  context.isOpen.value ? 'is-open' : ''
].filter(Boolean).join(' '));

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <button
    ref="triggerEl"
    type="button"
    :class="computedClass"
    @click="context.toggle"
    v-bind="filteredAttrs"
  >
    <slot />
  </button>
</template>
