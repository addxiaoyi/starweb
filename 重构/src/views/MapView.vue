<template>
  <div class="mc-screen">
    <div class="bg-layer" />

    <header class="map-hero page-shell">
      <div>
        <p class="map-eyebrow">Live Map</p>
        <h1 class="map-title">实时地图</h1>
        <p class="map-subtitle">查看服务器在线地图，支持切换线路、刷新与全屏浏览。</p>
      </div>
      <div class="map-summary" aria-label="地图摘要">
        <span class="summary-pill">{{ mapTabs.length }} 条线路</span>
        <span class="summary-pill">{{ isLoading ? '加载中' : hasError ? '异常' : '在线' }}</span>
      </div>
    </header>

    <div class="map-wrapper">
      <CreateTabMc
        v-model="selectedMapId"
        :tabs="mapTabs"
        class="full-height-tab"
      >
        <div class="pixel-map-artifact">
            <!-- 背景地图图片 -->
            <div class="map-bg-image">
              <OptimizedImage
                :src="mapPng"
                alt="Map Background"
                class="w-full h-full object-cover"
                :lazy="false"
              />
            </div>

            <AppStatePanel
              v-if="isLoading"
              variant="loading"
              eyebrow="Map"
              title="地图加载中..."
              message="正在连接实时地图服务，请稍候。"
              hint="如果加载超时，你可以尝试刷新地图或新标签页打开。"
              class="map-state-panel"
            />
          
            <AppStatePanel
              v-else-if="hasError"
              variant="error"
              eyebrow="Map"
              title="实时地图连接失败"
              :message="isMixedContent ? '浏览器阻止了不安全内容（Mixed Content）。' : isProxyError ? '代理服务器无法连接到地图服务。' : '实时地图当前不可用，请稍后重试。'"
              hint="你可以尝试在新标签页中打开地图，或检查服务器状态。"
              class="map-state-panel"
            >
              <template #actions>
                <a 
                  :href="currentMapUrl" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  class="action-btn primary"
                >
                  Open in New Tab
                  <AppIcon name="external" :size="16" class="inline-icon" />
                </a>
                <button 
                  class="action-btn ui-btn secondary"
                  @click="reloadMap"
                >
                  <AppIcon name="refresh" :size="16" class="inline-icon" />
                  Retry
                </button>
              </template>
            </AppStatePanel>
          
          <iframe
            v-show="!hasError"
            ref="mapIframe"
            class="real-map-iframe"
            title="Minecraft Real-time Map"
            frameborder="0"
            scrolling="yes"
            allow="geolocation; fullscreen; clipboard-write; camera; microphone; payment; autoplay; accelerometer; gyroscope"
            allowfullscreen
            referrerpolicy="no-referrer-when-downgrade"
            @load="onLoad"
            @error="onError"
          />
        </div>

        <div class="bottom-tools">
          <button
            class="tool-btn ui-btn"
            @click="toggleFullscreen"
            title="全屏显示"
          >
            <AppIcon name="expand" :size="20" />
          </button>
          <button
            class="tool-btn ui-btn"
            @click="showHelp = !showHelp"
            title="操作说明"
          >
            <AppIcon name="help" :size="20" />
          </button>
          <button
            class="tool-btn ui-btn"
            @click="reloadMap"
            title="刷新地图"
          >
            <AppIcon name="refresh" :size="20" />
          </button>
        </div>
        
        <div v-if="showHelp" class="help-panel">
          <div class="help-content">
            <h3>操作说明</h3>
            
            <div class="help-section">
              <h4>鼠标控制</h4>
              <div class="help-item">
                <span class="help-label">移动</span>
                <span class="help-value">左键点击 + 拖动</span>
              </div>
              <div class="help-item">
                <span class="help-label">缩放</span>
                <span class="help-value">鼠标滚轮（滚动）</span>
              </div>
              <div class="help-item">
                <span class="help-label">旋转 / 倾斜</span>
                <span class="help-value">右键点击 + 拖动</span>
              </div>
            </div>
            
            <div class="help-section">
              <h4>键盘控制</h4>
              <div class="help-item">
                <span class="help-label">移动</span>
                <span class="help-value">WASD / 方向键</span>
              </div>
              <div class="help-item">
                <span class="help-label">缩放</span>
                <span class="help-value">小键盘: +/- 或 Ins/Home</span>
              </div>
              <div class="help-item">
                <span class="help-label">旋转 / 倾斜</span>
                <span class="help-value">左-Alt + WASD / 方向键</span>
              </div>
            </div>
            
            <button
              class="close-btn ui-btn"
              @click="showHelp = false"
            >
              完成
            </button>
          </div>
        </div>
      </CreateTabMc>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import CreateTabMc from '@/components/organisms/CreativeUI/CreateTabMc.vue';
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import type { AppIconName } from '@/components/atoms/appIcons';
import { getWensetConfig } from '@/shared/config/wenset';
import { devLog, devWarn } from '@/shared/utils/devLog';

defineOptions({
  name: 'MapView'
});

interface MapType {
  id: string;
  name: string;
  url: string;
  iconName: AppIconName;
}

interface FullscreenEnabledElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

const mapPng = '/map.png';
const config = getWensetConfig();

const mapTypes = ref<MapType[]>([
  { id: 'ser', name: '养老', url: config.maps.survival, iconName: 'home' },
  { id: 'pvp', name: '舵星归途-诺娜星', url: config.maps.nationWar, iconName: 'crosshair' }
]);

const mapTabs = computed(() => mapTypes.value.map((m) => ({ id: m.id, label: m.name, iconName: m.iconName })));

const selectedMapId = ref('ser');
const isLoading = ref(true);
const hasError = ref(false);
const mapIframe = ref<HTMLIFrameElement | null>(null);
const showHelp = ref(false);
const currentMapUrl = ref('');
const loadTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const LOAD_TIMEOUT_MS = 15000;
const isMixedContent = ref(false);
const isProxyError = ref(false);

const reloadMap = () => {
  if (loadTimeout.value) {
    clearTimeout(loadTimeout.value);
  }
  
  isLoading.value = true;
  hasError.value = false;
  isMixedContent.value = false;
  isProxyError.value = false;
  
  const map = mapTypes.value.find(m => m.id === selectedMapId.value);
  const url = map?.url || '';
  currentMapUrl.value = url;
  
  // Check for Mixed Content (HTTPS page loading HTTP iframe)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
    isMixedContent.value = true;
    // We don't block it completely to allow browser overrides, but we show a warning
    // and fail faster if it doesn't load
  }
  
  loadTimeout.value = setTimeout(() => {
    if (isLoading.value) {
      onError();
      devWarn(`Map load timeout: ${url}`);
    }
  }, isMixedContent.value ? 5000 : LOAD_TIMEOUT_MS); // Fail faster for mixed content
  
  if (mapIframe.value) {
    mapIframe.value.src = url;
  }
};

const onLoad = () => {
  if (loadTimeout.value) {
    clearTimeout(loadTimeout.value);
  }

  try {
    // Check if the iframe loaded the main app (proxy failure fallback) or an error page
    const iframeDoc = mapIframe.value?.contentDocument || mapIframe.value?.contentWindow?.document;
    if (iframeDoc) {
      const title = iframeDoc.title;
      // If the title matches our app's title, contains specific app elements, or is a standard error page
      // Use .app-container to detect if we fell back to the main Vue app (App.vue)
      if (
        iframeDoc.querySelector('.app-container') ||
        title.includes('404') ||
        title.includes('500') ||
        title.includes('502') ||
        title.includes('504') ||
        title.toLowerCase().includes('nginx') ||
        title.toLowerCase().includes('error') ||
        // Check for empty body (often returned by 400 Bad Request or connection reset)
        (iframeDoc.body && iframeDoc.body.children.length === 0 && !iframeDoc.body.textContent?.trim())
      ) {
        devWarn('Map proxy failed (Title/Content check):', title || 'Empty Body');
        isProxyError.value = true;
        hasError.value = true;
        isLoading.value = false;
        return;
      }
    }
  } catch (e) {
    // SecurityError: Blocked a frame with origin "..." from accessing a cross-origin frame.
    // This is actually GOOD - it means we loaded external content
    devLog('Map loaded cross-origin content (success)');
  }

  setTimeout(() => {
    isLoading.value = false;
    hasError.value = false;
  }, 500);
};

const onError = () => {
  if (loadTimeout.value) {
    clearTimeout(loadTimeout.value);
  }
  isLoading.value = false;
  hasError.value = true;
};

watch(selectedMapId, () => {
  reloadMap();
});

onMounted(() => {
  reloadMap();
  document.documentElement.classList.add('is-map-view');
});

onUnmounted(() => {
  if (loadTimeout.value) {
    clearTimeout(loadTimeout.value);
  }
  document.documentElement.classList.remove('is-map-view');
});

const toggleFullscreen = () => {
  const iframe = mapIframe.value as (HTMLIFrameElement & FullscreenEnabledElement) | null;
  if (!iframe) return;
  
  try {
    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if (iframe.webkitRequestFullscreen) {
      iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) {
      iframe.msRequestFullscreen();
    }
  } catch (error) {
    devLog('Fullscreen request failed:', error);
    // 如果 iframe 无法全屏，尝试全屏其容器
    const container = iframe.parentElement as (HTMLElement & FullscreenEnabledElement) | null;
    if (container?.requestFullscreen) {
      container.requestFullscreen();
    } else if (container?.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container?.msRequestFullscreen) {
      container.msRequestFullscreen();
    }
  }
};
</script>

<style scoped lang="scss">
.mc-screen {
  --mc-bg: #1a1a1a;
  --paper-bg: #DBCFA5;
  --accent: #FFAA00;
  
  width: 100%;
  flex: 1;
  background: transparent; /* 移除背景色，让 bg-layer 全屏显示 */
  display: flex;
  flex-direction: column; /* 确保垂直方向布局 */
  align-items: center;
  justify-content: center;
  font-family: 'Minecraft', 'VT323', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  /* overflow: hidden; 移除此属性以防止内容在小屏幕或特定比例下被截断 */
  position: relative;
  box-sizing: border-box;
  /* height: 100vh; 移除固定高度，允许内容撑开或由 flex 控制 */
  min-height: 100%;
  padding-top: 20px; /* 减少内边距，因为 main-content 已有 padding */
  padding-bottom: 40px; /* 增加底部内边距，防止底部内容紧贴边缘 */
}

.bg-layer {
  /* ... (unchanged) ... */
  position: fixed; /* 改为 fixed，使其脱离文档流并铺满全屏 */
  top: 0;
  left: 0;
  width: 100vw; 
  height: 100vh;
  z-index: 0; /* 确保在内容之下，但可能需要根据实际情况调整，原为 absolute 时层级较低 */
  /* 使用类似 MC 泥土/石头的像素背景 */
  background-color: #1a1a1a; /* 将原 mc-screen 的背景色移到这里 */
  background-image: 
    linear-gradient(45deg, #2a2a2a 25%, transparent 25%), 
    linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #2a2a2a 75%), 
    linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
  background-size: 40px 40px;
  background-position: 0 0, 0 20px, 20px -20px, -20px 0px;
  opacity: 0.4;
  image-rendering: pixelated;
}

/* 地图容器：宽度自适应，高度由内容（图片）决定 */
.map-hero {
  width: min(1400px, calc(100vw - 32px));
  margin: 0 auto 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  color: #fff;
}

.map-eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(255,255,255,.6);
  font-size: .74rem;
}

.map-title {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
}

.map-subtitle {
  margin: 8px 0 0;
  color: rgba(255,255,255,.72);
}

.map-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  color: #fff;
  font-size: 12px;
}

.map-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 10;
  width: 90vw;
  /* 移除强制宽高比，让图片决定高度 */
  height: auto;
  /* max-height: 85vh; 移除此限制以防止内容溢出覆盖底部栏 */
  max-width: 1400px; /* 限制最大宽度，防止在超宽屏上过大 */
  margin: auto;
  
  @media (max-width: 768px) {
    width: 95vw;
    height: auto; 
    flex: 0 0 auto;
    padding: 0;
    margin: auto;
  }
  
  /* CreateTabMc 样式覆盖 */
  :deep(.mc-creative-ui) {
    width: 100%;
    height: auto; /* 让高度自适应 */
    display: flex;
    flex-direction: column;
  }

  :deep(.ui-body) {
    flex: 0 0 auto; /* 不要自动拉伸，适应内容高度 */
    background-color: transparent !important; /* 移除背景色，避免遮挡或显示多余边框 */
    border: none !important; /* 移除边框，只显示图片 */
    outline: none !important;
    padding: 0 !important;
    overflow: visible; /* 允许内容决定大小 */
  }
}

/* 
    核心逻辑：
    1. pixel-map-artifact 作为相对定位容器
    2. map-bg-image 作为文档流内容，撑开容器高度
    3. real-map-iframe 绝对定位覆盖在图片上
  */
  .pixel-map-artifact {
    position: relative;
    width: 100%;
    height: auto;
    display: block; /* 块级元素 */
    overflow: hidden; /* 裁剪圆角或溢出 */
    /* 移除阴影，保持扁平风格 */
    box-shadow: none;
  }

  .map-bg-image {
    position: relative; /* 参与文档流，撑开父容器 */
    width: 100%;
    height: auto;
    min-height: 400px; /* 确保即使图片加载失败，容器也有高度 */
    pointer-events: none;
    z-index: 0;
    display: block;
    line-height: 0; /* 消除图片底部的空白间隙 */
    
    /* 修复 OptimizedImage 内部 img 的样式 */
    :deep(img) {
      width: 100%;
      height: auto; /* 高度自动，保持原始比例 */
      object-fit: contain; /* 保持比例 */
      display: block;
      opacity: 1;
    }
  }

  .real-map-iframe {
    position: absolute;
    /* 调整内边距以适应背景图的卷轴/边框区域 */
    top: calc(50% - 4px); /* 向上偏移 4px */
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80%;
    /* 保持宽高比 1:1，与背景图的绘制区域匹配 */
    aspect-ratio: 1 / 1;
    border: none;
    z-index: 1;
    transition: opacity 0.5s ease;
    background-color: transparent;
    
    /* 移除内阴影，保持扁平风格 */
    box-shadow: none;
    /* iOS 滚动优化 */
    -webkit-overflow-scrolling: touch;
    overflow-y: auto;
  }

.status-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  color: #fff;
  
  &.loading {
    gap: 15px;
    font-size: 1.2rem;
    color: var(--accent);
  }
}

.cube-spinner {
  width: 40px;
  height: 40px;
  background-color: var(--accent);
  animation: sk-rotateplane 1.2s infinite ease-in-out;
  box-shadow: 0 0 15px var(--accent);
}

@keyframes sk-rotateplane {
  0% { transform: perspective(120px) rotateX(0deg) rotateY(0deg); }
  50% { transform: perspective(120px) rotateX(-180.1deg) rotateY(0deg); }
  100% { transform: perspective(120px) rotateX(-180deg) rotateY(-179.9deg); }
}

.error-box {
  background: #1a1a1a;
  border: 2px solid #ff4444;
  padding: 30px;
  border-radius: 8px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.error-icon {
  display: block;
  margin: 0 auto 15px;
  color: #ff4444;
}

.error-text {
  display: block;
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 10px;
}

.error-hint {
  color: #aaa;
  margin-bottom: 15px;
}

.error-reasons {
  text-align: left;
  margin-bottom: 25px;
  color: #888;
  font-size: 0.9rem;
  
  li {
    margin-bottom: 5px;
  }
}

.error-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.action-btn {
  padding: 10px 20px;
  border-radius: 4px;
  text-decoration: none;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  
  &.primary {
    background: var(--accent);
    color: #000;
    border: none;
    
    &:hover {
      background: #ffbb33;
      transform: translateY(-2px);
    }
  }
  
  &.secondary {
    background: transparent;
    color: #fff;
    border: 1px solid #444;
    
    &:hover {
      background: rgba(255,255,255,0.1);
    }
  }
}

.bottom-tools {
  display: flex;
  gap: 15px;
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 20;

  @media (max-width: 768px) {
    position: fixed;
    bottom: 20px;
    right: 50%;
    transform: translateX(50%); /* Center horizontally */
    flex-direction: row; /* Horizontal layout */
    gap: 20px;
    background: rgba(0, 0, 0, 0.5);
    padding: 10px 20px;
    border-radius: 30px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

.tool-btn {
  width: 44px;
  height: 44px;
  background: #3c3c3c;
  border: 2px solid #5a5a5a;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 0 #1a1a1a;
  border-radius: 4px;

  &:hover {
    background: #4a4a4a;
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(2px);
    box-shadow: 0 0 0 #1a1a1a;
  }

  @media (max-width: 768px) {
    width: 48px; 
    height: 48px;
    border-radius: 50%; /* 移动端圆形按钮 */
    background: rgba(60, 60, 60, 0.9);
    backdrop-filter: blur(4px);
    font-size: 1.1rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.2);
  }
}

.help-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.8);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  animation: fadeIn 0.3s ease-out;

  @media (max-width: 768px) {
    position: fixed;
    z-index: 2000;
  }
}

.help-content {
  background: #C6B58F;
  border: 4px solid #3c2a1a;
  padding: 30px;
  width: 90%;
  max-width: 500px;
  color: #3c2a1a;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);

  @media (max-width: 768px) {
    width: 95%;
    padding: 20px;
    max-height: 80vh;
    overflow-y: auto;
  }
  h3 {
    color: var(--accent);
    text-align: center;
    margin-bottom: 25px;
    font-size: 1.8rem;
    text-shadow: 2px 2px 0 #000;
  }
  
  h4 {
    color: #3c2a1a;
    margin: 20px 0 10px;
    border-bottom: 2px solid rgba(60, 42, 26, 0.2);
    padding-bottom: 5px;
    font-weight: bold;
  }
}

.help-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 0.95rem;
  border-bottom: 1px dashed rgba(60, 42, 26, 0.1);
}

.help-label {
  color: rgba(60, 42, 26, 0.7);
  font-weight: 500;
}

.help-value {
  color: #3c2a1a;
  font-weight: bold;
}

.close-btn {
  width: 100%;
  margin-top: 30px;
  padding: 12px;
  background: #3c2a1a;
  color: #fff;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  border-radius: 4px;
  box-shadow: 0 4px 0 #1a1a1a;
  transition: all 0.2s;
  
  &:hover {
    background: #4a3a2a;
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(2px);
    box-shadow: 0 0 0 #1a1a1a;
  }
}

/* 响应式适配 */
@media (max-width: 768px) {
  .pixel-map-artifact {
    width: 95vw;
    height: 95vw;
    margin-bottom: 60px;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>

<style lang="scss">
/* 针对 MapView 页面，强制让 Footer 透明，以融合像素背景 */
.is-map-view .site-footer {
  background-color: transparent !important;
  border-top: none !important;
  box-shadow: none !important;
}
</style>
