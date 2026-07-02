<script setup lang="ts">
import { inject, ref, computed, useAttrs, onUnmounted, watch, nextTick, CSSProperties } from 'vue';
import { POPOVER_CONTEXT_KEY, type PopoverSide } from './types';

defineOptions({ name: 'PopoverContent', inheritAttrs: false });

const props = withDefaults(defineProps<{
  class?: string;
  side?: PopoverSide;
  sideOffset?: number;
}>(), {
  side: 'bottom',
  sideOffset: 5
});

const attrs = useAttrs();
const context = inject(POPOVER_CONTEXT_KEY);
if (!context) {
  throw new Error('PopoverContent must be used within Popover');
}

const contentRef = ref<HTMLElement | null>(null);
const popoverStyle = ref<CSSProperties>({
  position: 'fixed',
  visibility: 'hidden',
  left: '0px',
  top: '0px',
  zIndex: 10000,
});

let resizeObserver: ResizeObserver | null = null;
const scrollListenerOptions: AddEventListenerOptions = { capture: true, passive: true };
const scrollRemoveOptions: EventListenerOptions = { capture: true };

const calculatePosition = () => {
  if (!context.isOpen.value || !context.triggerRef.value || !contentRef.value) {return;}

  const triggerRect = context.triggerRef.value.getBoundingClientRect();
  const contentRect = contentRef.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 10;

  let side: PopoverSide = props.side;
  
  if (viewportWidth < 640 && (side === 'left' || side === 'right')) {
    side = 'bottom';
  }

  const compute = (currentSide: PopoverSide) => {
    let l = 0;
    let t = 0;
    if (currentSide === 'top') {
      l = triggerRect.left + (triggerRect.width / 2) - (contentRect.width / 2);
      t = triggerRect.top - contentRect.height - props.sideOffset;
    } else if (currentSide === 'bottom') {
      l = triggerRect.left + (triggerRect.width / 2) - (contentRect.width / 2);
      t = triggerRect.bottom + props.sideOffset;
    } else if (currentSide === 'left') {
      l = triggerRect.left - contentRect.width - props.sideOffset;
      t = triggerRect.top + (triggerRect.height / 2) - (contentRect.height / 2);
    } else if (currentSide === 'right') {
      l = triggerRect.right + props.sideOffset;
      t = triggerRect.top + (triggerRect.height / 2) - (contentRect.height / 2);
    }
    return { l, t };
  };

  let pos = compute(side);

  // Boundary check and fallback logic (simplified)
  if (side === 'top' && pos.t < padding) {pos = compute('bottom'); side = 'bottom';}
  else if (side === 'bottom' && pos.t + contentRect.height > viewportHeight - padding) {pos = compute('top'); side = 'top';}
  
  const left = Math.max(padding, Math.min(pos.l, viewportWidth - contentRect.width - padding));
  const top = Math.max(padding, Math.min(pos.t, viewportHeight - contentRect.height - padding));

  popoverStyle.value = {
    ...popoverStyle.value,
    left: `${left}px`,
    top: `${top}px`,
    visibility: 'visible',
  };
};

const handleOutsideClick = (e: MouseEvent) => {
  if (
    context.isOpen.value &&
    contentRef.value &&
    !contentRef.value.contains(e.target as Node) &&
    context.triggerRef.value &&
    !context.triggerRef.value.contains(e.target as Node)
  ) {
    context.close();
  }
};

let rafId: number | null = null;
const handleResize = () => {
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      calculatePosition();
      rafId = null;
    });
  }
};
const handleScroll = () => {
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      calculatePosition();
      rafId = null;
    });
  }
};

watch(() => context.isOpen.value, async (val) => {
  if (val) {
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, scrollListenerOptions);
    await nextTick();
    calculatePosition();
    if (contentRef.value) {
      resizeObserver = new ResizeObserver(() => {
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            calculatePosition();
            rafId = null;
          });
        }
      });
      resizeObserver.observe(contentRef.value);
    }
  } else {
    window.removeEventListener('mousedown', handleOutsideClick);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', handleScroll, scrollRemoveOptions);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    popoverStyle.value.visibility = 'hidden';
  }
});

onUnmounted(() => {
  window.removeEventListener('mousedown', handleOutsideClick);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('scroll', handleScroll, scrollRemoveOptions);
  if (resizeObserver) {resizeObserver.disconnect();}
  if (rafId) {
    cancelAnimationFrame(rafId);
  }
});

const computedClass = computed(() => [
  'popover-content',
  props.class,
  attrs.class,
  `side-${props.side}`
].filter(Boolean).join(' '));

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="context.isOpen.value"
      ref="contentRef"
      :class="computedClass"
      :style="popoverStyle"
      @click.stop
      v-bind="filteredAttrs"
    >
      <div class="popover-arrow" />
      <slot />
    </div>
  </Teleport>
</template>
