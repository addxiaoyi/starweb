<template>
  <nav v-if="breadcrumbs.length > 1" class="mc-breadcrumb" aria-label="面包屑导航">
    <div class="breadcrumb-container">
      <span 
        v-for="(item, index) in breadcrumbs" 
        :key="item.path" 
        class="breadcrumb-item"
      >
        <!-- Home Icon for the first item -->
        <AppIcon v-if="index === 0" name="home" :size="16" class="home-icon" />
        
        <!-- Link if not the last item -->
        <router-link 
          v-if="index < breadcrumbs.length - 1" 
          :to="item.path" 
          class="breadcrumb-link"
        >
          {{ item.meta.title || item.name }}
        </router-link>
        
        <!-- Plain text if it is the current page -->
        <span v-else class="breadcrumb-current tooltip-trigger">
          {{ item.meta.title || item.name }}
        </span>

        <!-- Separator -->
        <span v-if="index < breadcrumbs.length - 1" class="breadcrumb-separator">
          <AppIcon name="chevronRight" :size="14" class="sep-icon" />
        </span>
      </span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const breadcrumbs = computed(() => {
  // 确保首页永远是第一级
  const homeRoute = { path: '/', name: 'home', meta: { title: '首页' } };
  
  if (route.path === '/') {
    return []; // 首页不显示面包屑
  }

  // 构建当前页面路径
  const currentPath = {
    path: route.path,
    name: route.name,
    meta: route.meta
  };

  return [homeRoute, currentPath];
});
</script>

<style scoped>
.mc-breadcrumb {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 20px 0 20px;
  position: relative;
  z-index: 10;
}

.breadcrumb-container {
  display: inline-flex;
  align-items: center;
  background-color: rgba(30, 30, 30, 0.8);
  border: 2px solid #555;
  border-top-color: #8b8b8b;
  border-left-color: #8b8b8b;
  border-bottom-color: #373737;
  border-right-color: #373737;
  padding: 8px 16px;
  backdrop-filter: blur(8px);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.5);
  font-family: 'Minecraft', 'Zpix', sans-serif;
  font-size: 14px;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  color: #aaa;
}

.home-icon {
  margin-right: 6px;
  color: #ffaa00; /* Minecraft Gold */
}

.breadcrumb-link {
  color: #aaa;
  text-decoration: none;
  transition: color 0.2s;
  text-shadow: 1px 1px 0 #000;
}

.breadcrumb-link:hover {
  color: #55ff55; /* Minecraft Green */
  text-decoration: underline;
}

.breadcrumb-current {
  color: #ffffff;
  text-shadow: 2px 2px 0 #3f3f3f;
  font-weight: bold;
}

.breadcrumb-separator {
  margin: 0 10px;
  color: #555;
  font-size: 10px;
}

@media (max-width: 768px) {
  .mc-breadcrumb {
    padding-top: 12px;
  }
  .breadcrumb-container {
    padding: 6px 12px;
    font-size: 12px;
  }
}
</style>
