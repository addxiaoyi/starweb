<template>
  <div class="skin-card" @click="$emit('click')">
    <div class="skin-preview">
      <img
        v-if="skin.previewUrl"
        :src="skin.previewUrl"
        :alt="skin.name"
        loading="lazy"
      />
      <div v-else class="preview-placeholder">
        <AppIcon name="image" :size="32" />
      </div>
    </div>
    <div class="skin-info">
      <h3 class="skin-name">{{ skin.name }}</h3>
      <div class="skin-tags" v-if="skin.tags?.length">
        <span
          v-for="tag in skin.tags.slice(0, 3)"
          :key="tag"
          class="tag"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/atoms/AppIcon.vue';

interface Skin {
  id: string;
  name: string;
  previewUrl?: string;
  tags?: string[];
}

interface Props {
  skin: Skin;
}

defineProps<Props>();

defineEmits<{
  click: [];
}>();
</script>

<style scoped lang="scss">
.skin-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }
}

.skin-preview {
  aspect-ratio: 1;
  background: linear-gradient(135deg, rgba(30, 35, 50, 0.6), rgba(20, 25, 40, 0.8));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.preview-placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.skin-info {
  padding: 12px;
}

.skin-name {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  margin: 0 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skin-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  padding: 2px 8px;
  background: rgba(124, 140, 255, 0.15);
  border-radius: 12px;
  font-size: 11px;
  color: rgba(124, 140, 255, 0.9);
}
</style>
