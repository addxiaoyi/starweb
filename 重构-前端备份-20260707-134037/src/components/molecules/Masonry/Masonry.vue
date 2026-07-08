<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick, useAttrs } from 'vue';
import { gsap } from 'gsap';
import { debounce } from '@/shared/utils/debounceThrottle';
import './masonry.css';
import type { MasonryItem, GridItem } from './types';

defineOptions({ name: 'Masonry', inheritAttrs: false });

const props = withDefaults(defineProps<{
  items: MasonryItem[];
  ease?: string;
  duration?: number;
  stagger?: number;
  animateFrom?: 'bottom' | 'top' | 'left' | 'right' | 'center' | 'random';
  scaleOnHover?: boolean;
  hoverScale?: number;
  blurToFocus?: boolean;
  colorShiftOnHover?: boolean;
  class?: string;
}>(), {
  ease: 'power3.out',
  duration: 0.6,
  stagger: 0.05,
  animateFrom: 'bottom',
  scaleOnHover: false,
  hoverScale: 0.95,
  blurToFocus: true,
  colorShiftOnHover: false,
  class: ''
});

const attrs = useAttrs();
const containerRef = ref<HTMLDivElement | null>(null);
const grid = ref<GridItem[]>([]);
let resizeObserver: ResizeObserver | null = null;
const animatedIds = new Set<string>();
let intersectionObserver: IntersectionObserver | null = null;

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});

const computedClass = computed(() => ['masonry-container', props.class, attrs.class].filter(Boolean).join(' '));

const getColumns = () => {
  const width = containerRef.value?.clientWidth || 0;
  if (width >= 1600) {return 6;}
  if (width >= 1200) {return 5;}
  if (width >= 900) {return 4;}
  if (width >= 600) {return 3;}
  return 2;
};

const calculateGrid = () => {
  if (!containerRef.value) {return;}

  const columns = getColumns();
  const containerWidth = containerRef.value.clientWidth;
  if (!containerWidth) return;

  const gap = containerWidth < 600 ? 2 : 8; // Minimal gap for seamless mobile layout
  const totalGaps = (columns - 1) * gap;
  const columnWidth = Math.floor((containerWidth - totalGaps) / columns);
  const colHeights = new Array(columns).fill(0);

  const newGrid = props.items.map(child => {
    // Calculate scaled height if width is provided to maintain aspect ratio
    let itemHeight = child.height;
    if (child.width && child.width > 0) {
      itemHeight = Math.floor((columnWidth / child.width) * child.height);
    }

    const col = colHeights.indexOf(Math.min(...colHeights));
    const x = Math.floor(col * (columnWidth + gap));
    const y = Math.floor(colHeights[col]);
    colHeights[col] += itemHeight + gap;
    
    return { 
      ...child, 
      x, 
      y, 
      w: columnWidth, 
      h: itemHeight
    };
  });

  grid.value = newGrid;

  const maxHeight = Math.max(...colHeights);
  containerRef.value.style.height = `${maxHeight}px`;
};

const getInitialPosition = (item: GridItem) => {
  const containerRect = containerRef.value?.getBoundingClientRect();
  if (!containerRect) {return { x: item.x, y: item.y };}

  let direction = props.animateFrom;
  if (props.animateFrom === 'random') {
    const dirs = ['top', 'bottom', 'left', 'right'] as const;
    direction = dirs[Math.floor(Math.random() * dirs.length)];
  }

  switch (direction) {
    case 'top':
      return { x: item.x, y: -item.h - 100 };
    case 'bottom':
      return { x: item.x, y: containerRect.height + 100 };
    case 'left':
      return { x: -item.w - 100, y: item.y };
    case 'right':
      return { x: containerRect.width + 100, y: item.y };
    case 'center':
      return {
        x: containerRect.width / 2 - item.w / 2,
        y: containerRect.height / 2 - item.h / 2
      };
    default:
      return { x: item.x, y: item.y + 100 };
  }
};

const setupImmediateTrigger = () => {
  nextTick(() => {
    if (!containerRef.value) {return;}
    
    const elements = containerRef.value.querySelectorAll<HTMLElement>('[data-key]');
    elements.forEach((target, index) => {
      const dataKey = target.getAttribute('data-key');
      if (!dataKey || animatedIds.has(dataKey)) return;

      const item = grid.value.find((i) => i.id === dataKey);
      if (!item) return;

      animatedIds.add(dataKey);
      const start = getInitialPosition(item);
      const endX = item.x;
      const endY = item.y;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.killTweensOf(target);
      gsap.set(target, {
        x: start.x,
        y: start.y,
        opacity: 0,
        ...(props.blurToFocus && { filter: 'blur(10px)' })
      });

      gsap.to(target, {
        x: endX,
        y: endY,
        opacity: 1,
        ...(props.blurToFocus && { filter: 'blur(0px)' }),
        duration: prefersReducedMotion ? 0 : props.duration,
        delay: prefersReducedMotion ? 0 : index * props.stagger,
        ease: props.ease,
        overwrite: 'auto'
      });
    });
  });
};

onMounted(() => {
  calculateGrid();
  
  const debouncedCalculate = debounce(() => {
    window.requestAnimationFrame(() => {
      calculateGrid();
    });
  }, 100);

  resizeObserver = new ResizeObserver((entries) => {
    if (!entries || !entries.length) return;
    debouncedCalculate();
  });
  
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
  
  intersectionObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) {
      setupImmediateTrigger();
      intersectionObserver?.disconnect();
    }
  }, { threshold: 0.1, rootMargin: '180px' });

  if (containerRef.value) {
    intersectionObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  intersectionObserver?.disconnect();
});

watch(() => props.items, () => {
  calculateGrid();
  setupImmediateTrigger();
}, { deep: true });
</script>

<template>
  <div
    ref="containerRef"
    :class="computedClass"
    v-bind="filteredAttrs"
  >
    <div
      v-for="item in grid"
      :key="item.id"
      :data-key="item.id"
      class="masonry-item"
      :style="{ 
        transform: `translate(${item.x}px, ${item.y}px)`,
        width: `${item.w}px`,
        height: `${item.h}px`,
        willChange: 'transform, opacity'
      }"
    >
      <slot :item="item">
        <div
          class="masonry-item-inner"
          :style="{ backgroundImage: `url(${item.img})` }"
        />
      </slot>
    </div>
  </div>
</template>
