<template>
  <div class="app-container">
    <SplashScreen v-if="isLoading" />
    <a href="#main-content" class="skip-link">跳转到主要内容</a>
    <ToastContainer />

    <NavBar v-if="!isLoading" />
    <MobileNavBar v-if="isMobile && !isLoading" />
    <main id="main-content" class="main-content" tabindex="-1" v-if="!isLoading">
      <ErrorBoundary>
        <router-view v-slot="{ Component }">
          <transition
            name="page-enter"
            mode="out-in"
          >
            <component :is="Component" />
          </transition>
        </router-view>
      </ErrorBoundary>
    </main>
    <Footer />
    <BackToTop />
    <OfflineModal />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import NavBar from '@/components/organisms/NavBar.vue';
import MobileNavBar from '@/components/organisms/MobileNavBar.vue';
import Footer from '@/components/organisms/Footer.vue';
import ErrorBoundary from '@/components/atoms/ErrorBoundary.vue';
import ToastContainer from '@/components/molecules/ToastContainer.vue';
import SplashScreen from '@/components/organisms/SplashScreen.vue';
import BackToTop from '@/components/atoms/BackToTop.vue';
import OfflineModal from '@/components/atoms/OfflineModal.vue';
import { securityService } from '@/services/SecurityService';
import { useToastStore } from '@/stores/toast';
import { useMediaQuery } from '@/composables/useMediaQuery';

const isLoading = ref(true);
const toast = useToastStore();
const { isMobile } = useMediaQuery();

let onAppReady: (() => void) | null = null;

// 监听 SplashScreen 完成事件 - 在 setup 阶段尽早注册，防止错过子组件发出的事件
onAppReady = () => {
  isLoading.value = false;
};
if (globalThis.window !== undefined) {
  globalThis.window.addEventListener('app-ready', onAppReady);
}

onMounted(() => {
  // 启动安全防护服务
  securityService.init();
  
  // 兜底超时，防止 SplashScreen 出错导致页面卡死
  setTimeout(() => {
    if (isLoading.value) {
      toast.addToast({
        type: 'warning',
        title: '加载提示',
        message: '启动画面超时，已为你进入站点',
        duration: 6000,
      });
      isLoading.value = false;
    }
  }, 5000);
});

onUnmounted(() => {
  if (onAppReady) {
    globalThis.window.removeEventListener('app-ready', onAppReady);
  }
});
</script>

<style lang="scss">
.app-container {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  background: transparent;
  font-family: var(--font-ui);
}

.app-container :deep(
  h1, h2, h3, h4, h5, h6,
  p, span, a, li, strong, em,
  button, input, select, textarea,
  label, small, time, code
) {
  font-family: var(--font-ui);
}

.main-content {
  flex: 1;
  padding-top: calc(var(--navbar-height, 72px) + env(safe-area-inset-top, 0px) + 18px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  position: relative;
  background: transparent;
  display: flex;
  flex-direction: column;
}

.page-enter-enter-active,
.page-enter-leave-active {
  transition:
    opacity var(--motion-route, 320ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)),
    transform var(--motion-route, 320ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
  position: relative;
  z-index: 1;
}

.page-enter-enter-from {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}

.page-enter-leave-to {
  opacity: 0;
  transform: translate3d(0, -6px, 0);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-enter-active,
  .page-enter-leave-active {
    transition: opacity var(--motion-route, 320ms) linear;
  }

  .page-enter-enter-from,
  .page-enter-leave-to {
    transform: none;
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .main-content {
    padding-top: calc(var(--navbar-height-mobile, 64px) + env(safe-area-inset-top, 0px) + 16px);
  }
}

/* 跨浏览器兼容性 */
* {
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  box-sizing: border-box;
}

/* 默认允许选中，提升可读性和可访问性 */
body {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

/* 仅禁用图片拖拽，保留正常点击 */
img {
  -webkit-user-drag: none;
}

button {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

input, textarea {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

.skip-link {
  position: absolute;
  top: -60px;
  left: 14px;
  background: linear-gradient(135deg, rgba(124, 140, 255, 0.95), rgba(92, 109, 232, 0.95));
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  z-index: 100;
  box-shadow: 0 10px 28px rgba(34, 45, 92, 0.35);
  transition: top 0.24s var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

.skip-link:focus {
  top: 10px;
}
</style>
