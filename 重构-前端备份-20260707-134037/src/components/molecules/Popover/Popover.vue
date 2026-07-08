<script setup lang="ts">
import { ref, provide, computed, useAttrs } from 'vue';
import { POPOVER_CONTEXT_KEY } from './types';
import './popover.css';

defineOptions({ name: 'Popover', inheritAttrs: false });

const props = defineProps<{ class?: string }>();
const attrs = useAttrs();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);

const open = () => { isOpen.value = true; };
const close = () => { isOpen.value = false; };
const toggle = () => { isOpen.value = !isOpen.value; };
const setTriggerRef = (el: HTMLElement | null) => { triggerRef.value = el; };

provide(POPOVER_CONTEXT_KEY, {
  isOpen,
  triggerRef,
  open,
  close,
  toggle,
  setTriggerRef
});

const computedClass = computed(() => ['popover', props.class, attrs.class].filter(Boolean).join(' '));
const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <div :class="computedClass" v-bind="filteredAttrs">
    <slot />
  </div>
</template>
