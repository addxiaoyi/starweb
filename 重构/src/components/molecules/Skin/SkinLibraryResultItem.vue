<template>
  <li>
    <SkinCardBase
      theme="emerald"
      :cover-style="{ backgroundImage: `url(${item.previewUrl || '/image/steve.png'})` }"
      :cover-height="72"
      content-padding="1rem"
    >
      <div class="result-main starmc-list-group">
        <div class="result-top starmc-list-item">
          <div class="starmc-list-item__main">
            <p class="starmc-list-item__title result-name">{{ item.name || '未命名皮肤' }}</p>
          </div>
          <span class="starmc-badge is-info result-id">#{{ item.id }}</span>
        </div>
        <div class="result-meta starmc-list-group">
          <span class="starmc-badge is-info result-meta-item"><AppIcon name="cube" :size="14" class="pill-icon starmc-pill-icon" /> 模型：{{ item.model || 'auto' }}</span>
          <span class="starmc-badge is-info result-meta-item"><AppIcon name="database" :size="14" class="pill-icon starmc-pill-icon" /> 来源：{{ item.source || 'server-db' }}</span>
          <span class="starmc-badge is-info result-meta-item"><AppIcon name="clockRotate" :size="14" class="pill-icon starmc-pill-icon" /> 更新时间：{{ item.updatedAt || '未知' }}</span>
        </div>
        <div class="result-tags starmc-list-group" v-if="item.tags && item.tags.length">
          <span v-for="tag in item.tags" :key="`${item.id}-${tag}`" class="starmc-badge tag-pill">{{ tag }}</span>
        </div>
        <div class="result-actions">
          <button
            class="mc-button ui-btn small"
            :disabled="!isLoggedIn || applying"
            @click="$emit('apply', item)"
          >
            {{ applying ? '应用中...' : '应用到当前角色' }}
          </button>
        </div>
        <p v-if="applyError" class="result-apply-error">{{ applyError }}</p>
      </div>
    </SkinCardBase>
  </li>
</template>

<script setup lang="ts">
import AppIcon from '@/components/atoms/AppIcon.vue';
import SkinCardBase from '@/components/molecules/Skin/SkinCardBase.vue';

import type { LibraryItem } from '@/features/skin';

interface SkinLibraryResultItemProps {
  /** 当前皮肤库条目。 */
  item: LibraryItem;
  /** 是否已登录（用于控制应用按钮可用态）。 */
  isLoggedIn: boolean;
  /** 当前条目是否处于应用中状态。 */
  applying: boolean;
  /** 当前条目应用失败信息。 */
  applyError?: string;
}

defineProps<SkinLibraryResultItemProps>();

defineEmits<{
  /** 点击“应用到当前角色”时触发。 */
  (e: 'apply', item: LibraryItem): void;
}>();
</script>

<style scoped lang="scss">

.result-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.result-name {
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.35;
}

.result-id {
  font-size: 0.74rem;
}

.result-meta {
  margin: 0.26rem 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.result-meta-item {
  flex: 0 0 auto;
}

.result-tags {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag-pill {
  color: #d6e7bc;
}

.result-actions {
  margin-top: 0.55rem;
  display: flex;
  justify-content: flex-end;
}

.result-apply-error {
  margin: 0.35rem 0 0;
  padding: 0.4rem 0.5rem;
  border: 2px solid rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.14);
  color: #fecaca;
  border-radius: 0;
  font-size: 0.76rem;
}

@media (max-width: 640px) {
  .result-main {
    gap: 0.45rem;
  }

  .result-top {
    align-items: flex-start;
  }

  .result-meta {
    gap: 0.3rem;
  }

  .result-actions {
    justify-content: stretch;
  }

  .result-actions :deep(.ui-btn) {
    width: 100%;
  }

  .result-name {
    font-size: 0.84rem;
  }

  .result-apply-error {
    font-size: 0.72rem;
  }
}
</style>
