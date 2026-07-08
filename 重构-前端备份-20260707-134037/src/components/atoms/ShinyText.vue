<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({
  name: 'ShinyText',
  inheritAttrs: false
});

const attrs = useAttrs();

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  class?: string;
}

const props = withDefaults(defineProps<ShinyTextProps>(), {
  text: '',
  disabled: false,
  speed: 5,
  class: ''
});

const animationDuration = computed(() => `${props.speed}s`);

const computedClass = computed(() => {
  return [
    'text-[#b5b5b5a4] bg-clip-text inline-block',
    !props.disabled ? 'animate-shine' : '',
    props.class,
    attrs.class
  ].filter(Boolean).join(' ');
});
</script>

<template>
  <div
    :class="computedClass"
    :style="{
      backgroundImage:
        'linear-gradient(120deg, rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0) 60%)',
      backgroundSize: '200% 100%',
      WebkitBackgroundClip: 'text',
      animationDuration: animationDuration
    }"
    v-bind="filteredAttrs"
  >
    {{ props.text }}
  </div>
</template>

<style scoped>
@keyframes shine {
  0% {
    background-position: 100%;
  }
  100% {
    background-position: -100%;
  }
}

.animate-shine {
  animation: shine 5s linear infinite;
}
</style>
