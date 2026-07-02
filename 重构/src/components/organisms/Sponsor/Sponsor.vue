<template>
  <section 
    :class="computedClass"
    v-bind="filteredAttrs"
  >
    <!-- 第一部分：赞助 GUI 面板 -->
    <div class="sponsor-wrapper">
      <!-- 现代风格赞助卡片 -->
      <div class="sponsor-card">
        <!-- 顶部：作为标题的图片 Banner -->
        <div class="card-banner">
          <OptimizedImage
            :src="screenshot"
            alt="Server Banner"
            class="banner-img"
            lazy
          />
        </div>

        <!-- 内容区域 -->
        <SponsorNotice
          :qr-src="sponsorQrSrc"
          :qr-alt="sponsorQrAlt"
          :qr-url="sponsorQrUrl"
        />
      </div>
    </div>
    
    <!-- 第二部分：画框(简单的墙面展示) -->
    <div class="gallery-wrapper">
      <Masonry
        :items="visibleItems"
        :duration="0.45"
        :stagger="0.05"
        class="gallery-grid"
      >
        <template #default="{ item }">
          <SponsorItem :item="item" />
        </template>
      </Masonry>
      
      <!-- Infinite Scroll Trigger -->
      <div 
        ref="loadMoreTrigger" 
        class="load-more-trigger"
        style="height: 20px; width: 100%; margin-top: 2rem;"
      ></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, useAttrs, onMounted, onUnmounted } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import Masonry from '@/components/molecules/Masonry/Masonry.vue';
import SponsorItem from './SponsorItem.vue';
import SponsorNotice from './SponsorNotice.vue';
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';
import { imageConfig } from '@/shared/config/images';
import { sponsorConfig } from '@/shared/config/sponsor';

const screenshot = '/screenshot.png';
const sponsorQrSrc = sponsorConfig.qrSrc;
const sponsorQrAlt = sponsorConfig.qrAlt;
const sponsorQrUrl = sponsorConfig.qrUrl;

defineOptions({
  name: 'Sponsor',
  inheritAttrs: false
});

const attrs = useAttrs();

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
});

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});

const computedClass = computed(() => {
  return [
    'section-container',
    'sponsor-section',
    props.class,
    attrs.class
  ].filter(Boolean).join(' ');
});

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface ImageConfigItem {
  id: string;
  width?: number;
  height?: number;
}

const uniqueImageConfig = (imageConfig as ImageConfigItem[]).filter((config, index, self) => 
  index === self.findIndex((c) => c.id === config.id)
);

const allImageItems = shuffleArray(uniqueImageConfig.map((config) => {
  // Randomly assign different aspect ratios to create a staggered (Xiaohongshu-style) layout
  // 0-0.6: Original aspect ratio (mostly landscape 16:9)
  // 0.6-0.8: Square (1:1)
  // 0.8-1.0: Portrait (3:4)
  const random = Math.random();
  let height = config.height || 300;
  const width = config.width || 300;
  
  if (random > 0.6 && random <= 0.8) {
    // Force square aspect ratio (1:1)
    // Calculate height based on width to be square
    height = width;
  } else if (random > 0.8) {
    // Force portrait aspect ratio (3:4)
    // Calculate height to be 4/3 of width
    height = width * (4/3);
  }
  // Otherwise keep original height (preserves landscape aspect ratio)

  return {
    id: config.id,
    img: `/image/${config.id}`,
    url: '#',
    width: width,
    height: Math.floor(height) // Ensure integer height
  };
}));

// Progressive Loading Logic
const PAGE_SIZE = 12;
const visibleCount = ref(PAGE_SIZE);
const loadMoreTrigger = ref<HTMLElement | null>(null);
let stopObserver: (() => void) | null = null;

const visibleItems = computed(() => allImageItems.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < allImageItems.length);

const loadMore = () => {
  if (hasMore.value) {
    visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, allImageItems.length);
  }
};

onMounted(() => {
  if (loadMoreTrigger.value) {
    stopObserver = useIntersectionObserver(
      loadMoreTrigger,
      ([{ isIntersecting }]: IntersectionObserverEntry[]) => {
        if (isIntersecting && hasMore.value) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    ).stop;
  }
});

onUnmounted(() => {
  stopObserver?.();
});
</script>

<style scoped>
.sponsor-section {
  position: relative;
  z-index: 1;
  width: 100%;
  content-visibility: auto;
  contain-intrinsic-size: 1000px;
}

.sponsor-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 4rem;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
}

.sponsor-card {
  width: 100%;
  max-width: 900px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: default;
}

.sponsor-card:hover {
  /* No hover effects */
  background: transparent;
  box-shadow: none;
}

.card-banner {
  width: 100%;
  height: 320px;
  position: relative;
  overflow: hidden;
  /* Removed solid background for transparent effect */
}

.banner-img {
  width: 100%;
  height: 100%;
  /* Remove object-fit/position from container as it's a div */
}

.banner-img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  filter: brightness(1);
  /* Add mask to blend bottom of image into content */
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}



.gallery-wrapper {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  margin-bottom: 2rem;
  padding: 0 20px;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .card-banner {
    height: 200px;
  }
  
  .sponsor-wrapper {
    padding: 0 16px;
    margin-bottom: 2rem;
  }

  .gallery-wrapper {
    padding: 0; /* Remove padding for edge-to-edge display */
  }
}

@media (max-width: 480px) {
  .card-banner {
    height: 160px;
  }
  
  .banner-title {
    font-size: 1.5rem;
  }

  .banner-overlay {
    padding: 1.5rem;
  }
}
</style>
