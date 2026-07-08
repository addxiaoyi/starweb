<template>
  <div 
    class="mc-tooltip-wrapper"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
  >
    <!-- Triggers the tooltip -->
    <slot></slot>

    <!-- The actual tooltip -->
    <transition name="fade-tooltip">
      <div v-show="isVisible" class="mc-tooltip" :class="position" role="tooltip">
        <h4 v-if="title" class="mc-tooltip-title" :class="titleColor">{{ title }}</h4>
        <div class="mc-tooltip-content">
          <slot name="content">{{ content }}</slot>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  title?: string;
  content?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  titleColor?: 'white' | 'gold' | 'green' | 'red' | 'purple' | 'blue';
}>(), {
  title: '',
  content: '',
  position: 'top',
  titleColor: 'white' // 默认白底色字
});

const isVisible = ref(false);

const show = () => isVisible.value = true;
const hide = () => isVisible.value = false;
</script>

<style scoped>
.mc-tooltip-wrapper {
  position: relative;
  display: inline-flex;
}

.mc-tooltip {
  position: absolute;
  z-index: 9999;
  min-width: 160px;
  background-color: rgba(16, 0, 16, 0.95); /* 深紫偏黑底色 */
  border: 2px solid #23005B; /* 外包一圈深紫 */
  padding: 8px 10px;
  font-family: 'Minecraft', 'Zpix', sans-serif;
  color: #aaaaaa;
  pointer-events: none;
  border-radius: 4px; /* Minecraft 1.13+ 工具提示有轻微圆角 */
  
  /* 层叠阴影模拟 Minecraft 的边框样式：
     游戏里是外圈黑，内圈紫/深紫交替。通过多重 box-shadow 模拟 */
  box-shadow: 
    0 0 0 2px rgba(45, 0, 100, 0.8) inset, /* 紫色内发光 */
    0 0 0 4px #000 inset, /* 黑色最内边 */
    2px 2px 4px rgba(0,0,0,0.8); /* 整体外阴影 */
}

/* 颜色后缀预设 (MC Formatting Codes) */
.mc-tooltip-title {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: normal; /* 像素字体最好不强制宽体粗体 */
}
.white { color: #ffffff; }
.gold { color: #FFAA00; }
.green { color: #55FF55; }
.red { color: #FF5555; }
.purple { color: #FF55FF; }
.blue { color: #5555FF; }

.mc-tooltip-content {
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Positional adjustments */
.mc-tooltip.top {
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
}
.mc-tooltip.bottom {
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
}
.mc-tooltip.left {
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
}
.mc-tooltip.right {
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
}

/* 进场褪去动画 */
.fade-tooltip-enter-active,
.fade-tooltip-leave-active {
  transition: opacity 0.1s;
}
.fade-tooltip-enter-from,
.fade-tooltip-leave-to {
  opacity: 0;
}
</style>
