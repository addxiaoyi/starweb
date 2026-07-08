<script setup lang="ts">
import { ref, computed, useAttrs } from 'vue';

defineOptions({
  name: 'Tooltip',
  inheritAttrs: false
});

const props = defineProps({
  class: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  }
});

const attrs = useAttrs();
const isTooltipVisible = ref(false);
const tooltipPosition = ref({ x: 0, y: 0 });

const showTooltip = () => { isTooltipVisible.value = true; };
const hideTooltip = () => { isTooltipVisible.value = false; };

const updateTooltipPosition = (e: MouseEvent) => {
  tooltipPosition.value = {
    x: e.clientX,
    y: e.clientY
  };
};

const computedClass = computed(() => {
  return [
    'tooltip',
    props.class,
    attrs.class
  ].filter(Boolean).join(' ');
});

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <div
    :class="computedClass"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
    @mousemove="updateTooltipPosition"
    v-bind="filteredAttrs"
  >
    <slot />
    <Teleport to="body">
      <div
        v-if="isTooltipVisible && props.content"
        class="tooltip-content"
        :style="{
          position: 'fixed',
          left: `${tooltipPosition.x + 15}px`,
          top: `${tooltipPosition.y - 5}px`,
          zIndex: 999999
        }"
      >
        {{ props.content }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tooltip {
  position: relative;
  display: inline-block;
}

.tooltip-content {
  position: fixed;
  z-index: 999999;
  background-color: rgba(0, 0, 0, 0.9);
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  white-space: nowrap;
  border: 1px solid var(--primary, #007bff);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  animation: fadeIn 0.2s ease;
  pointer-events: none;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
