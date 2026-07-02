<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  width?: string;
  height?: string;
  borderRadius?: string;
}>(), {
  width: '100%',
  height: '1rem',
  borderRadius: '0.5rem',
});

const style = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.borderRadius,
}));
</script>

<template>
  <div class="skeleton-loader relative overflow-hidden bg-white/5 border border-white/5" :style="style">
    <div class="shimmer-sweep absolute inset-0"></div>
  </div>
</template>

<style scoped>
.shimmer-sweep {
  background: linear-gradient(
    90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.01) 45%, 
    rgba(255, 255, 255, 0.03) 50%, 
    rgba(255, 255, 255, 0.01) 55%, 
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 3s infinite linear;
}

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
</style>
