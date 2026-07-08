<template>
  <div class="coming-soon page-shell">
    <AppStatePanel
      variant="info"
      eyebrow="Coming Soon"
      title="页面重构中..."
      message="这个模块正在完善中，后续会补齐完整功能与交互。"
      hint="如果你正在寻找内容，请先返回首页或浏览现有模块。"
      class="coming-soon-panel"
    >
      <template #actions>
        <RouterLink to="/" class="ui-btn">返回首页</RouterLink>
        <RouterLink to="/guide" class="ui-btn secondary">查看指引</RouterLink>
      </template>
    </AppStatePanel>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
</script>

<style scoped>
.coming-soon {
  display: grid;
  place-items: center;
  min-height: 70vh;
  color: #fff;
  text-align: center;
}

.coming-soon-panel {
  width: min(100%, 520px);
}
</style>
