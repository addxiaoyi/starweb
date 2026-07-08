<template>
  <SkinCardBase
    as="button"
    theme="azure"
    :interactive="true"
    :cover-height="60"
    :cover-style="{ background: item.cover }"
    :tag="item.tag"
    content-padding="0.5rem"
    @click="$emit('select', item)"
  >
    <p class="catalog-title">{{ item.title }}</p>
  </SkinCardBase>
</template>

<script setup lang="ts">
import SkinCardBase from '@/components/molecules/Skin/SkinCardBase.vue';

export interface CatalogItem {
  id: string;
  title: string;
  tag: string;
  cover: string;
  desc?: string;
  skinTextureUrl?: string;
  capeTextureUrl?: string;
  model?: string;
}

interface SkinCatalogCardProps {
  /** 当前方案项数据。 */
  item: CatalogItem;
}

defineProps<SkinCatalogCardProps>();

defineEmits<{
  /** 点击卡片时触发。 */
  (e: 'select', item: CatalogItem): void;
}>();
</script>

<style scoped lang="scss">
.catalog-title {
  font-size: 0.82rem;
  color: var(--text-primary);
  text-align: center;
  margin: 0;
  line-height: 1.45;
  font-family: var(--font-pixel-cjk), var(--font-ui);
}
</style>
