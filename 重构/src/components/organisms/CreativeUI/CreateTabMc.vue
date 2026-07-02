<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import type { Tab } from './types';

defineOptions({
  name: 'CreateTabMc',
  inheritAttrs: false
});

const props = withDefaults(defineProps<{
  modelValue: string | number;
  tabs: Tab[];
  className?: string;
  size?: 'normal' | 'small' | 'mini';
}>(), {
  size: 'normal'
});

const emit = defineEmits(['update:modelValue']);

const attrs = useAttrs();

const computedClass = computed(() => {
  return [
    'mc-creative-ui',
    `size-${props.size}`,
    props.className,
    attrs.class
  ].filter(Boolean).join(' ');
});

const selectTab = (id: string | number) => {
  emit('update:modelValue', id);
};
</script>

<template>
  <div :class="computedClass" v-bind="$attrs">
    <div class="tabs-header">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        class="mc-tab"
        :class="{ active: modelValue === tab.id }"
        :title="tab.label"
        @click="selectTab(tab.id)"
      >
        <AppIcon
          v-if="tab.iconName"
          :name="tab.iconName"
          :size="22"
          class="tab-icon tab-icon-svg"
        />
        <span
          v-else-if="tab.iconClass"
          :class="['tab-icon', 'tab-icon-class', tab.iconClass]"
          aria-hidden="true"
        />
        <OptimizedImage
          v-else
          :src="tab.icon || ''"
          class="tab-icon"
          alt="icon"
          lazy
        />
        <span class="tab-text">{{ tab.label }}</span>
      </button>
    </div>

    <div class="ui-body">
      <div class="slot-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@font-face {
  font-family: 'Minecraft';
  src: local('VT323'), local('VT323-Regular');
}

.mc-creative-ui {
  font-family: 'Minecraft', 'VT323', monospace;
  display: flex;
  flex-direction: column;
  width: fit-content;
  height: auto;
  max-width: 100%;
  margin: 0 auto;
}

.tabs-header {
  display: flex;
  align-items: flex-end;
  padding-left: 0;
  margin-bottom: -4px;
  z-index: 10;
  gap: 0;
  /* 确保标签在左侧对齐，不会跑偏 */
  width: 100%;
  justify-content: flex-start;
}

.mc-tab {
  width: 56px;
  height: 50px;
  background-color: #8B8B8B;
  border: none;
  position: relative;
  cursor: pointer;
  margin-right: 4px;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 
    inset 2px 2px 0 #C6C6C6,
    inset -2px -2px 0 #373737,
    2px 2px 0 #000000;
  transition: background-color 0.1s;

  &:hover {
    .tab-text {
      opacity: 1;
    }
  }

  &.active {
    background-color: #C6C6C6;
    height: 56px;
    z-index: 20;
    box-shadow: 
      inset 2px 2px 0 #FFFFFF,
      inset -2px 0 0 #555555,
      2px 0 0 #000000;

    .tab-icon {
      filter: brightness(1);
    }
  }
}

.tab-icon {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  pointer-events: none;
  filter: brightness(0.9);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;

  & :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }

  &.tab-icon-class {
    width: auto;
    height: auto;
  }
}

.tab-icon-svg {
  color: #111827;
}

.tab-text {
  position: absolute;
  bottom: -30px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #1a1a1a;
  color: #ffffff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 100;
}

.ui-body {
    background-color: #C6C6C6;
    border: 4px solid #373737;
    border-top-color: #FFFFFF;
    border-left-color: #FFFFFF;
    border-bottom-color: #373737;
    border-right-color: #373737;
    outline: 2px solid #000000;
    min-height: 0;
    /* height: 100%;  已移除，使用 flex: 1 自动撑开 */
    padding: 10px 40px !important;
    position: relative;
    z-index: 5;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden; /* 防止内容溢出导致 flex 失效 */

    @media (max-width: 768px) {
      padding: 10px 10px !important;
    }
  }

.slot-content {
  flex: 1;
}

/* Small size variant */
.mc-creative-ui.size-small {
  .mc-tab {
    width: 42px;
    height: 38px;
    margin-right: 3px;
    
    &.active {
      height: 44px;
    }
  }

  .tab-icon {
    width: 24px;
    height: 24px;
    font-size: 18px;
  }
  
  .tab-text {
    font-size: 12px;
    bottom: -25px;
    padding: 2px 6px;
  }

  .ui-body {
    border-width: 3px;
    padding: 8px;
    outline-width: 2px;
  }
}

/* Mini size variant (approx "10x smaller feel" or significantly reduced) */
.mc-creative-ui.size-mini {
  .mc-tab {
    width: 32px;
    height: 28px;
    margin-right: 2px;
    box-shadow: 
      inset 1px 1px 0 #C6C6C6,
      inset -1px -1px 0 #373737,
      1px 1px 0 #000000;
    
    &.active {
      height: 32px; /* Keep same height or slightly taller */
      margin-top: -4px; /* Pop up effect */
      box-shadow: 
        inset 1px 1px 0 #FFFFFF,
        inset -1px 0 0 #555555,
        1px 0 0 #000000;
    }
  }

  .tab-icon {
    width: 18px;
    height: 18px;
    font-size: 14px;
  }
  
  .tab-text {
    font-size: 10px;
    bottom: -20px;
    padding: 2px 4px;
  }

  .ui-body {
    border-width: 2px;
    padding: 5px;
    outline-width: 1px;
  }
  
  .tabs-header {
    margin-bottom: -2px;
  }
}
</style>
