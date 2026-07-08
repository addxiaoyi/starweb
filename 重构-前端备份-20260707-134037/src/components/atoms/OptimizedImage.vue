<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import SkeletonLoader from '@/components/atoms/SkeletonLoader.vue';

const props = withDefaults(defineProps<{
  src: string;
  alt?: string;
  lazy?: boolean;
  srcset?: string;
  sizes?: string;
  width?: string | number;
  height?: string | number;
}>(), {
  alt: '',
  lazy: true,
  srcset: '',
  sizes: '',
});

const isLoaded = ref(false);
const imgRef = ref<HTMLImageElement | null>(null);
const emit = defineEmits<{
  (e: 'load', event: Event): void;
  (e: 'error', event: Event): void;
}>();
const baseUrl = import.meta.env.BASE_URL || '/';

const resolvePublicUrl = (url: string) => {
  if (!url) return '';
  if (/^(https?:|data:|blob:|\/\/)/i.test(url)) return url;
  if (!url.startsWith('/')) return url;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}${url}`;
};

const resolvedSrc = computed(() => resolvePublicUrl(props.src));

const containerStyle = computed(() => {
  if (globalThis.window !== undefined && props.width && props.height) {
    return {
      aspectRatio: `${props.width} / ${props.height}`
    };
  }
  return {};
});

const onLoad = (event: Event) => {
  isLoaded.value = true;
  emit('load', event);
};

const onError = (event: Event) => {
  isLoaded.value = true;
  emit('error', event);
};

onMounted(() => {
  if (imgRef.value?.complete) {
    isLoaded.value = true;
  }
});
</script>

<template>
  <div class="relative overflow-hidden" :style="containerStyle">
    <img
      ref="imgRef"
      :src="resolvedSrc"
      :srcset="srcset"
      :sizes="sizes"
      :alt="alt"
      :width="width"
      :height="height"
      :loading="lazy ? 'lazy' : 'eager'"
      decoding="async"
      class="transition-opacity duration-300"
      :class="{ 'opacity-0': !isLoaded, 'opacity-100': isLoaded }"
      @load="onLoad"
      @error="onError"
    />
    <SkeletonLoader
      v-if="!isLoaded"
      class="absolute inset-0"
    />
  </div>
</template>
