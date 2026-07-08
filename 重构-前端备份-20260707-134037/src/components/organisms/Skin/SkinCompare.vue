<template>
  <div class="skin-compare">
    <div class="compare-summary" aria-live="polite">
      <span class="summary-chip">左侧模型：{{ leftModelLabel }}</span>
      <span class="summary-chip">右侧模型：{{ rightModelLabel }}</span>
      <span class="summary-chip">状态：{{ leftWalking || rightWalking ? '动画中' : '已暂停' }}</span>
    </div>

    <div class="compare-container">
      <!-- 左侧预览 -->
      <div class="compare-side">
        <div class="side-header">
          <div>
            <h4>{{ leftSkin?.name || '未选择' }}</h4>
            <p class="side-hint">{{ leftModelLabel }}</p>
          </div>
          <div class="model-toggle" role="tablist" aria-label="左侧模型切换">
            <button
              v-for="model in modelOptions"
              :key="model.value"
              :class="['model-btn', { active: leftModel === model.value }]"
              @click="leftModel = model.value"
              :aria-pressed="leftModel === model.value"
            >
              {{ model.label }}
            </button>
          </div>
        </div>
        <div class="preview-wrapper">
          <SkinPreview
            v-if="leftSkin"
            ref="leftPreviewRef"
            :skin-url="leftSkin.skinUrl"
            :cape-url="leftSkin.capeUrl"
            :model="leftModel"
            class="compare-preview"
          />
          <div v-else class="empty-preview">
            <AppIcon name="image" :size="48" />
            <p>请在上方选择左侧皮肤</p>
          </div>
        </div>
        <div class="side-controls" v-if="leftSkin">
          <button @click="toggleAnimation('left')" class="mc-button small">
            <AppIcon :name="leftWalking ? 'pause' : 'play'" :size="14" />
            {{ leftWalking ? '停止' : '走动' }}
          </button>
          <button @click="resetCamera('left')" class="mc-button small">
            <AppIcon name="undo" :size="14" /> 重置视角
          </button>
        </div>
      </div>

      <!-- 中间分割线 -->
      <div class="compare-divider">
        <div class="divider-line"></div>
        <div class="vs-badge">VS</div>
        <div class="divider-line"></div>
      </div>

      <!-- 右侧预览 -->
      <div class="compare-side">
        <div class="side-header">
          <div>
            <h4>{{ rightSkin?.name || '未选择' }}</h4>
            <p class="side-hint">{{ rightModelLabel }}</p>
          </div>
          <div class="model-toggle" role="tablist" aria-label="右侧模型切换">
            <button
              v-for="model in modelOptions"
              :key="model.value"
              :class="['model-btn', { active: rightModel === model.value }]"
              @click="rightModel = model.value"
              :aria-pressed="rightModel === model.value"
            >
              {{ model.label }}
            </button>
          </div>
        </div>
        <div class="preview-wrapper">
          <SkinPreview
            v-if="rightSkin"
            ref="rightPreviewRef"
            :skin-url="rightSkin.skinUrl"
            :cape-url="rightSkin.capeUrl"
            :model="rightModel"
            class="compare-preview"
          />
          <div v-else class="empty-preview">
            <AppIcon name="image" :size="48" />
            <p>请在上方选择右侧皮肤</p>
          </div>
        </div>
        <div class="side-controls" v-if="rightSkin">
          <button @click="toggleAnimation('right')" class="mc-button small">
            <AppIcon :name="rightWalking ? 'pause' : 'play'" :size="14" />
            {{ rightWalking ? '停止' : '走动' }}
          </button>
          <button @click="resetCamera('right')" class="mc-button small">
            <AppIcon name="undo" :size="14" /> 重置视角
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import SkinPreview from './SkinPreview.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import type { LibraryItem } from '@/features/skin/types';

interface Props {
  leftSkin?: LibraryItem | null;
  rightSkin?: LibraryItem | null;
}

defineProps<Props>();

const modelOptions = [
  { value: 'auto', label: '自动' },
  { value: 'default', label: '经典' },
  { value: 'slim', label: '纤细' },
] as const;

const leftModel = ref<'auto' | 'default' | 'slim'>('auto');
const rightModel = ref<'auto' | 'default' | 'slim'>('auto');
const leftWalking = ref(true);
const rightWalking = ref(true);
const leftPreviewRef = ref<InstanceType<typeof SkinPreview> | null>(null);
const rightPreviewRef = ref<InstanceType<typeof SkinPreview> | null>(null);

const leftModelLabel = computed(() => modelOptions.find((model) => model.value === leftModel.value)?.label || '自动');
const rightModelLabel = computed(() => modelOptions.find((model) => model.value === rightModel.value)?.label || '自动');

function syncWalkingState(side: 'left' | 'right') {
  if (side === 'left') {
    leftWalking.value = !!leftPreviewRef.value?.isWalking;
  } else {
    rightWalking.value = !!rightPreviewRef.value?.isWalking;
  }
}

function toggleAnimation(side: 'left' | 'right') {
  if (side === 'left') {
    leftPreviewRef.value?.toggleAnimation?.();
  } else {
    rightPreviewRef.value?.toggleAnimation?.();
  }
  syncWalkingState(side);
}

function resetCamera(side: 'left' | 'right') {
  if (side === 'left') {
    leftPreviewRef.value?.resetCamera?.();
  } else {
    rightPreviewRef.value?.resetCamera?.();
  }
}
</script>

<style scoped lang="scss">
.skin-compare {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid #444;
  border-radius: 12px;
  padding: 1.5rem;
}

.compare-summary {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.summary-chip {
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.compare-container {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1.5rem;
}

.compare-side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.side-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  
  h4 {
    color: var(--text-primary);
    margin: 0;
    font-size: 1rem;
  }
}

.model-toggle {
  display: flex;
  gap: 0.25rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.25rem;
  border-radius: 999px;
  flex-wrap: wrap;
}

.model-btn {
  padding: 0.4rem 0.85rem;
  font-size: 0.78rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 999px;
  transition: all 0.2s;
  min-height: 32px;
  
  &:hover,
  &:focus-visible {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }
  
  &.active {
    background: var(--accent-color, #00d4ff);
    color: #000;
  }
}

.preview-wrapper {
  flex: 1;
  min-height: 350px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  overflow: hidden;
}

.compare-preview {
  height: 100%;
}

.empty-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  gap: 1rem;
}

.side-controls {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.compare-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  
  .divider-line {
    width: 2px;
    flex: 1;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--accent-color, #00d4ff),
      transparent
    );
  }
  
  .vs-badge {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--accent-color, #00d4ff);
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 0.9rem;
    box-shadow: 0 0 15px rgba(0, 212, 255, 0.5);
  }
}

@media (max-width: 768px) {
  .compare-summary {
    gap: 0.4rem;
  }

  .compare-container {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .compare-divider {
    flex-direction: row;
    padding: 0.5rem 0;
    
    .divider-line {
      width: auto;
      height: 2px;
      flex: 1;
      background: linear-gradient(
        to right,
        transparent,
        var(--accent-color, #00d4ff),
        transparent
      );
    }
  }

  .model-toggle {
    width: 100%;
    justify-content: space-between;
  }

  .model-btn {
    flex: 1;
  }

  .side-controls {
    flex-direction: column;

    .mc-button {
      width: 100%;
    }
  }
}
</style>
