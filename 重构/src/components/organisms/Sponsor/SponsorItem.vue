<template>
  <div 
    class="gallery-card"
  >
    <div class="card-bg" />
    <OptimizedImage
      :src="item.img"
      :alt="item.id"
      :width="item.width"
      :height="item.height"
      class="card-content"
      lazy
    />
  </div>
</template>

<script setup lang="ts">
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';

defineProps<{
  item: {
    id: string;
    img: string;
    url: string;
    width?: number;
    height: number;
  }
}>();
</script>

<style scoped>
.gallery-card {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  background-color: rgba(30, 30, 35, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: default;
  border-radius: 0;
  contain: content;
}



.card-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom right,
    rgba(255, 255, 255, 0.05),
    transparent
  );
  pointer-events: none;
}

.card-content {
  width: 100%;
  height: 100%;
  display: block;
  border: none;
  border-radius: 0;
}

.card-content :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: none;
  border-radius: 0;
}


@media (max-width: 768px) {
  .gallery-card {
    background: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: none;
    box-shadow: none;
    border-radius: 0;
  }

  .gallery-card:hover {
    transform: none;
    box-shadow: none;
  }

  .card-bg {
    display: none;
  }

  .card-content :deep(img) {
    border-radius: 0;
  }
}
</style>
