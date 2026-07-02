<template>
  <div class="media-card mc-selectable" :class="{ 'is-disabled': !bvid }">
    <div class="media-thumbnail-wrapper" :class="{ 'full-height': !bvid }" @click="handlePlay">
      <img 
        :src="cover" 
        :alt="title" 
        class="media-thumbnail"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="handleImageError"
      />
      <div v-if="bvid" class="play-overlay">
        <AppIcon name="playCircle" :size="48" class="play-icon" />
      </div>
      <div v-else class="coming-soon-overlay">
        <span class="coming-soon-badge">待上架</span>
      </div>
    </div>
    <div v-if="bvid" class="media-content">
      <h3 class="media-title" :title="title">{{ title }}</h3>
      <p class="media-desc" :title="desc">{{ desc }}</p>
      <div class="media-actions">
        <button 
          class="action-btn play-btn" 
          @click="handlePlay"
        >
          <AppIcon name="play" :size="16" class="btn-icon" /> 播放
        </button>
        <a 
          :href="`https://www.bilibili.com/video/${bvid}`" 
          target="_blank" 
          rel="noopener noreferrer"
          class="action-btn link-btn"
          title="在 Bilibili 观看"
          >
          <AppIcon name="external" :size="16" />
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/atoms/AppIcon.vue';

const props = defineProps<{
  title: string;
  desc: string;
  cover: string;
  bvid?: string;
}>();

const emit = defineEmits<{
  (e: 'play', bvid: string): void;
}>();

const handlePlay = () => {
  if (props.bvid) {
    emit('play', props.bvid);
  }
};

const handleImageError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  // Fallback image
  target.src = 'https://picsum.photos/seed/fallback/640/360';
};
</script>

<style scoped lang="scss">
.media-card {
  display: flex;
  flex-direction: column;
  background: rgba(30, 30, 30, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
  height: 100%;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
    border-color: rgba(255, 255, 255, 0.3);

    .play-overlay {
      opacity: 1;
    }
    
    .media-thumbnail {
      transform: scale(1.05);
    }
  }
  
  &.is-disabled {
    opacity: 0.8;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: none;
      
      .media-thumbnail {
        transform: scale(1);
      }
    }
  }

  // Mobile/Small screen adaptations
  @media (max-width: 768px) {
    .media-content {
      padding: 10px;
    }
    
    .media-title {
      font-size: 0.9rem;
      margin-bottom: 4px;
      -webkit-line-clamp: 1; // Limit to 1 line on very small screens
      line-clamp: 1;
    }
    
    .media-desc {
      display: none; // Hide description to save space
    }
    
    .media-actions {
      flex-direction: column; // Stack buttons
      gap: 6px;
      
      .action-btn {
        width: 100%;
        padding: 6px 0;
        font-size: 0.8rem;
        justify-content: center;
      }
      
      .play-btn {
        margin-right: 0;
      }
    }
  }
}

.media-thumbnail-wrapper {
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 16:9 Aspect Ratio */
  overflow: hidden;
  cursor: pointer;
  background-color: #000;
  
  &.full-height {
    flex: 1;
    padding-top: 0;
    display: flex;
    flex-direction: column;
    height: auto;
  }
}

.coming-soon-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 10px;
  z-index: 2;
  transition: all 0.3s ease;
}

.coming-soon-badge {
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.media-thumbnail {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;

  .play-icon {
    color: rgba(255, 255, 255, 0.9);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  }
}

.media-content {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.media-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-desc {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.media-placeholder-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
  padding: 20px 0;
  gap: 8px;
  
  .placeholder-icon {
    font-size: 24px;
    opacity: 0.5;
  }
}

.btn-icon {
  margin-right: 6px;
  flex-shrink: 0;
}

.media-actions {
  display: flex;
  gap: 10px;
  margin-top: auto;
}

.action-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.play-btn {
  flex: 1;
  background: #3b82f6;
  color: white;

  &:hover {
    background: #2563eb;
  }
}

.link-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 8px 12px;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }
}
</style>
