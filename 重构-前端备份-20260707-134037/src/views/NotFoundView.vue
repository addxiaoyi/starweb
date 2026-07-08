<template>
  <div class="not-found-container flex-center flex-column">
    <div class="end-sky"></div>
    <div class="content-wrapper mc-inventory-modal text-center">
      <AppStatePanel
        variant="empty"
        eyebrow="404"
        title="页面不在这个维度"
        message="坏消息：你掉进了虚空。好消息：这里没有末影龙追着你咬。"
        hint="返回首页后，你可以继续浏览服务器、皮肤或帮助内容。"
      >
        <template #actions>
          <div class="actions-row">
            <button class="return-btn ui-btn" @click="handleReturn">
              返回首页
            </button>
            <button class="return-btn ui-btn secondary" @click="handleBack">
              返回上一页
            </button>
          </div>
        </template>
      </AppStatePanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { audioService } from '@/shared/utils/audioService';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';

const router = useRouter();

const handleReturn = () => {
  audioService.playClick();
  router.push('/');
};

const handleBack = () => {
  audioService.playClick();
  router.back();
};
</script>

<style scoped>
.not-found-container {
  min-height: 80vh;
  position: relative;
  overflow: hidden;
  padding: 20px;
}

.end-sky {
  position: absolute;
  inset: 0;
  background: #0a0514;
  background-image:
    radial-gradient(1px 1px at 20px 30px, rgba(180, 120, 255, 0.35) 100%, transparent),
    radial-gradient(1px 1px at 40px 70px, rgba(255, 255, 255, 0.2) 100%, transparent),
    radial-gradient(1px 1px at 50px 160px, rgba(140, 80, 200, 0.3) 100%, transparent);
  background-size: 200px 200px;
  z-index: -1;
  opacity: 0.55;
}

.content-wrapper {
  max-width: 560px;
  width: 100%;
  padding: 0;
  z-index: 1;
}

.actions-row {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.return-btn {
  background: #373737;
  color: #55ff55;
  border: 2px solid;
  border-color: #555 #111 #111 #555;
  padding: 12px 24px;
  font-size: 18px;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset -2px -2px 0 #111, inset 2px 2px 0 #555;
  transition: all 0.2s;
  text-shadow: 1px 1px 0 #000;
}

.return-btn:hover {
  background: #555;
  color: #aaffaa;
  transform: translateY(-2px);
}

.return-btn:active {
  border-color: #111 #555 #555 #111;
  box-shadow: inset 2px 2px 0 #111;
  transform: translateY(1px);
}
</style>
