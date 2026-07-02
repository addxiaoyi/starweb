<template>
  <div class="skin-preview-container" ref="container">
    <canvas ref="canvas" class="skin-canvas"></canvas>
    
    <div class="preview-controls">
      <button @click="toggleAnimation" class="mc-button small">
        <AppIcon :name="isWalking ? 'pause' : 'play'" :size="16" />
        {{ isWalking ? '停止' : '走动' }}
      </button>
      <button @click="resetCamera" class="mc-button small">
        <AppIcon name="undo" :size="16" /> 重置
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';

interface Props {
  skinUrl?: string;
  capeUrl?: string;
  model?: 'auto' | 'default' | 'slim';
}

const props = withDefaults(defineProps<Props>(), {
  model: 'auto',
});

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- skinview3d 类型定义不完整
let viewer: any = null;
let resizeObserver: ResizeObserver | null = null;
const isWalking = ref(true);

function skinLoadOptions() {
  if (props.model === 'slim' || props.model === 'default') {
    return { model: props.model };
  }
  return { model: 'auto-detect' as const };
}

async function initViewer() {
  const defaultSkin = '/image/steve.png';

  if (!canvas.value || !container.value) return;

  const skinview3d = await import('skinview3d');

  const skinOpts =
    props.model === 'slim' || props.model === 'default'
      ? { model: props.model }
      : { model: 'auto-detect' as const };

  viewer = new skinview3d.SkinViewer({
    canvas: canvas.value,
    width: container.value.clientWidth || 300,
    height: container.value.clientHeight || 400,
    skin: props.skinUrl || defaultSkin,
    cape: props.capeUrl,
    ...skinOpts,
  });

  viewer.autoRotate = true;
  viewer.autoRotateSpeed = 0.5;
  viewer.background = 0x222222;

  viewer.animation = new skinview3d.WalkingAnimation();
  viewer.animation.speed = 0.6;

  resizeObserver = new ResizeObserver(() => {
    if (viewer && container.value) {
      viewer.width = container.value.clientWidth;
      viewer.height = container.value.clientHeight;
    }
  });
  resizeObserver.observe(container.value);
}

onMounted(() => {
  void initViewer();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (viewer) {
    viewer.dispose();
  }
});

function toggleAnimation() {
  if (!viewer) return;
  isWalking.value = !isWalking.value;
  viewer.animation.paused = !isWalking.value;
}

function resetCamera() {
  if (!viewer) return;
  viewer.controls.reset();
}

watch(
  () => props.skinUrl,
  (newUrl) => {
    if (viewer) {
      viewer.loadSkin(newUrl || '/image/steve.png', skinLoadOptions());
    }
  },
);

watch(
  () => props.model,
  () => {
    if (viewer && props.skinUrl) {
      viewer.loadSkin(props.skinUrl, skinLoadOptions());
    }
  },
);

watch(
  () => props.capeUrl,
  (newUrl) => {
    if (viewer) {
      if (newUrl) viewer.loadCape(newUrl);
      else viewer.loadCape(null);
    }
  },
);

defineExpose({ toggleAnimation, resetCamera, isWalking });
</script>

<style scoped lang="scss">
.skin-preview-container {
  width: 100%;
  height: 400px;
  background: rgba(0, 0, 0, 0.2);
  border: 2px solid #555;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
}

.skin-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
  
  &:active {
    cursor: grabbing;
  }
}

.preview-controls {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  backdrop-filter: blur(5px);
  padding: 8px;
  border-radius: 4px;
  z-index: 5;
}

.mc-button.small {
  padding: 4px 12px;
  font-size: 0.8rem;
}
</style>
