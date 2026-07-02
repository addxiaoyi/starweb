<template>
  <div class="google-layout-container">
    <BackgroundCanvas />
    <header class="page-hero guide-hero panel-hover">
      <div class="guide-hero__text">
        <h1 class="page-hero__title">服务器教程与入口</h1>
        <p class="page-hero__subtitle" data-typography="prose">
          一页掌握文档、IP、地图、下载与社区入口，按你的使用频率自由排布。
        </p>
      </div>
      <div class="guide-hero__actions">
        <button type="button" class="ui-btn" @click="refreshWikiTopics" :disabled="isLoadingWiki">
          {{ isLoadingWiki ? '刷新中...' : '刷新热点' }}
        </button>
        <button type="button" class="ui-btn secondary" @click="scrollToGrid">查看全部入口</button>
        <a href="/map" class="ui-btn secondary">打开地图</a>
      </div>
      <div class="guide-hero__stats">
        <span class="stat-pill">热点 {{ hotTopicCount }}</span>
        <span class="stat-pill">卡片 {{ cards.length }}</span>
      </div>
    </header>
    <!-- Grid Content -->
    <TransitionGroup 
      name="grid" 
      tag="main" 
      class="grid-content" 
      ref="gridContainer"
    >
      <div 
        v-for="(card, index) in cards" 
        :key="card.id"
        :class="[card.class, 'draggable-item', { 'is-dragging-placeholder': draggedIndex === index }]"
        @mousedown="startDrag(index, $event)"
        @touchstart="startDrag(index, $event)"
      >
        <!-- Hero Card (Wiki Highlight) -->
        <div v-if="card.type === 'hero'" class="grid-card hero-card card-hover">
          <div class="card-image-wrapper">
            <img :src="config.images.guideHero" alt="StarMC Adventure" class="card-image" />
            <div class="card-overlay"></div>
          </div>
          <div class="card-content">
            <div class="card-tag">Documentation Hub v2.0</div>
            <h2 class="card-title">舵星归途 StarMC Wiki：纯净生存与技术交流的归宿</h2>
            <p class="card-excerpt">
              Documentation Hub v2.0 专注于稳定、纯净生存与技术交流的 Minecraft 社区。在这里，每一行文档都为你指引归途。无繁琐插件，唯有协作与创造，汇聚红石大牛与生电爱好者，共同挑战原版生存极限。
            </p>
            <div class="card-meta">
              <span class="author">官方文档</span>
              <span class="time">持续更新中</span>
            </div>
          </div>
          <a :href="config.urls.wiki" target="_blank" rel="noopener noreferrer" class="card-link"></a>
        </div>

        <!-- Server Status Card -->
        <div v-else-if="card.type === 'status'" class="grid-card status-card panel-hover">
          <div class="status-header">
            <div class="status-indicator">
              <span class="status-dot online"></span>
              <span class="status-ping"></span>
            </div>
            <span class="status-text">System Online</span>
          </div>
          <div class="status-info">
            <div class="info-item" @click="copyIp(config.server.javaIp)" title="点击复制">
              <div class="info-label">
                <AppIcon name="network" :size="18" class="label-icon" />
                <span>主线路</span>
              </div>
              <span class="value">{{ config.server.javaIp }}</span>
            </div>
            <div v-if="config.server.modIp" class="info-item" @click="copyIp(config.server.modIp)" title="点击复制">
              <div class="info-label">
                <AppIcon name="cubes" :size="18" class="label-icon" />
                <span>模组服</span>
              </div>
              <span class="value">{{ config.server.modIp }}</span>
            </div>
            <div class="info-item no-hover">
              <div class="info-label">
                <AppIcon name="branch" :size="18" class="label-icon" />
                <span>版本</span>
              </div>
              <span class="value">{{ config.server.version }}</span>
            </div>
          </div>
        </div>

        <!-- Map Card -->
        <div v-else-if="card.type === 'map'" class="grid-card map-card card-hover">
          <div class="card-image-wrapper">
            <div class="map-placeholder">
              <div class="map-grid"></div>
              <div class="map-marker"></div>
            </div>
          </div>
          <div class="card-content-bottom">
            <h3 class="card-title-small">实时卫星地图</h3>
            <div class="card-action">
              查看全图 <AppIcon name="external" :size="16" class="inline-icon" />
            </div>
          </div>
          <router-link to="/map" class="card-link"></router-link>
        </div>

        <!-- Official Wiki Card -->
        <div v-else-if="card.type === 'official-wiki'" class="grid-card official-wiki-card card-hover">
          <div class="wiki-content">
            <div class="wiki-icon">
              <AppIcon name="bookOpen" :size="32" />
            </div>
            <div class="wiki-info">
              <h3 class="card-title-small">官方百科 Wiki</h3>
              <p class="card-subtitle">查阅合成表、服务器规则与进阶教程</p>
            </div>
            <div class="wiki-action">
              <AppIcon name="arrowRight" :size="22" />
            </div>
          </div>
          <a :href="config.urls.wiki" target="_blank" rel="noopener noreferrer" class="card-link"></a>
        </div>

        <!-- Feature Card 1 -->
        <div v-else-if="card.type === 'feature-pure'" class="grid-card feature-card space-theme card-hover">
          <div class="card-content">
            <div class="card-icon"><AppIcon name="cubes" :size="28" /></div>
            <h3 class="card-title-medium">纯净生存</h3>
            <p class="card-desc">无繁琐插件，回归最纯粹的 Minecraft 体验。</p>
          </div>
        </div>

        <!-- Feature Card 2 -->
        <div v-else-if="card.type === 'feature-tech'" class="grid-card feature-card tech-theme card-hover">
          <div class="card-content">
            <div class="card-icon"><AppIcon name="chip" :size="28" /></div>
            <h3 class="card-title-medium">技术交流</h3>
            <p class="card-desc">汇聚红石大牛与生电爱好者，共同挑战原版生存极限。</p>
          </div>
        </div>

        <!-- Mod Survival Card -->
        <div v-else-if="card.type === 'mod-survival'" class="grid-card feature-card mod-theme card-hover">
          <div class="card-content">
            <div class="card-icon"><AppIcon name="gears" :size="28" /></div>
            <h3 class="card-title-medium">模组生存</h3>
            <p class="card-desc">下载官方qq群文件体验<br><span class="card-sub-note">[整合包由群友提供更换]</span></p>
          </div>
        </div>

        <!-- Community / Social -->
        <div v-else-if="card.type === 'community'" class="grid-card community-card panel-hover">
          <div class="card-header-small">社区动态</div>
          <div class="community-list">
            <a :href="config.urls.discord" target="_blank" rel="noopener noreferrer" class="community-item">
              <div class="item-icon discord"><AppIcon name="discord" :size="22" /></div>
              <div class="item-info">
                <div class="item-title">Discord 频道</div>
                <div class="item-sub">点击加入社区</div>
              </div>
            </a>
            <a :href="'mailto:' + config.contacts.qqEmail" class="community-item">
              <div class="item-icon qq"><AppIcon name="qq" :size="22" /></div>
              <div class="item-info">
                <div class="item-title">腐竹 QQ</div>
                <div class="item-sub">{{ config.contacts.qq }}</div>
              </div>
            </a>
            <a :href="config.urls.bilibili" target="_blank" rel="noopener noreferrer" class="community-item">
              <div class="item-icon bilibili"><AppIcon name="bilibili" :size="22" /></div>
              <div class="item-info">
                <div class="item-title">Bilibili 官方号</div>
                <div class="item-sub">观看视频教程</div>
              </div>
            </a>
          </div>
        </div>

        <!-- Download Card -->
        <div v-else-if="card.type === 'download'" class="grid-card download-card panel-hover">
          <div class="card-content-center">
            <div class="download-icon-circle">
              <AppIcon name="download" :size="28" />
            </div>
            <h3 class="card-title-medium">下载客户端</h3>
            
            <template v-if="!isDownloading">
              <p class="card-desc">下载通道暂时关闭，请前往QQ群文件获取最新版本。</p>
              <div class="download-note">如需下载，请使用QQ群文件中的最新整合包。</div>
              <div class="download-actions">
                <button @click="startDownload" class="download-btn ui-btn">打开QQ群文件</button>
                <span class="download-hint">更新会在群文件内同步发布</span>
              </div>
            </template>
            
            <div v-else class="download-progress-container">
              <div class="progress-info">
                <span class="status-text">{{ downloadStatus }}</span>
                <span class="speed-text">{{ downloadSpeed }}</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" :style="{ width: downloadProgress + '%' }"></div>
              </div>
              <div class="progress-percentage">{{ downloadProgress.toFixed(1) }}%</div>
            </div>
          </div>
        </div>
        
        <!-- Wiki List Card (Special Layout) -->
        <div 
          v-else-if="card.type === 'wiki-list'" 
          class="grid-card list-card panel-hover"
          :class="[
            'cell-wide-fill', 
            'draggable-item', 
            { 'is-dragging': isDragging }
          ]"
        >
          <div class="card-header-small">
            MC 热点新闻
            <span v-if="isLoadingWiki" class="loading-indicator">更新中...</span>
          </div>
          <AppStatePanel
            v-if="isLoadingWiki"
            variant="loading"
            eyebrow="Wiki"
            title="正在加载热点新闻..."
            message="我们正在同步最新的 Minecraft 资讯，请稍候。"
            class="wiki-state-panel"
          />
          <div v-else class="wiki-list">
            <template v-if="wikiTopics.length > 0">
              <a 
                v-for="(topic, index) in wikiTopics" 
                :key="index"
                :href="topic.url" 
                target="_blank" 
                rel="noopener noreferrer"
                class="wiki-item"
              >
                <span class="wiki-number">{{ index + 1 }}</span>
                <span class="wiki-title-wrap">
                  <span class="wiki-title">{{ topic.title }}</span>
                  <span v-if="topic.source" class="wiki-source">{{ topic.source }}</span>
                </span>
              </a>
            </template>
            <AppStatePanel
              v-else
              variant="empty"
              eyebrow="Wiki"
              title="暂无热点新闻"
              message="暂时没有抓取到最新条目，下面保留官方入口供你继续查看。"
              hint="你也可以稍后刷新页面，或者直接访问 Minecraft 官方资讯。"
              class="wiki-state-panel"
            >
              <template #actions>
                <a href="https://www.minecraft.net/en-us/articles" target="_blank" rel="noopener noreferrer" class="wiki-cta">打开 Minecraft 官方新闻</a>
              </template>
            </AppStatePanel>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import { fetchWikiHotTopics, type WikiResult } from '@/shared/utils/wikiApi';
import { getWensetConfig } from '@/shared/config/wenset';
import { useGridDrag } from '@/composables/useGridDrag';
import { devLog } from '@/shared/utils/devLog';
import BackgroundCanvas from '@/components/atoms/BackgroundCanvas.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';

const config = getWensetConfig();

const copyIp = (ip: string) => {
  navigator.clipboard.writeText(ip).then(() => {
    alert(`IP 已复制: ${ip}`);
  });
};

const wikiTopics = ref<WikiResult[]>([]);
const isLoadingWiki = ref(true);
const hotTopicCount = computed(() => wikiTopics.value.length);
let wikiRefreshTimer: ReturnType<typeof setInterval> | null = null;

const refreshWikiTopics = async () => {
  try {
    const topics = await fetchWikiHotTopics(20);
    wikiTopics.value = topics;
  } catch (e) {
    console.error('Wiki load failed', e);
  } finally {
    isLoadingWiki.value = false;
  }
};

// Download logic
const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadSpeed = ref('');
const downloadStatus = ref('');

const startDownload = () => {
  const url = 'https://git.s3.fan/addxiaoyi312048/zhenghebao/raw/branch/main/StarMC-OPZ-1.21.11.zip';
  isDownloading.value = true;
  downloadStatus.value = '连接中...';
  downloadProgress.value = 0;
  
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'blob';
  
  let startTime = Date.now();
  
  xhr.onprogress = (event) => {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      downloadProgress.value = percentComplete;
      
      const currentTime = Date.now();
      const elapsedTime = (currentTime - startTime) / 1000; // seconds
      
      if (elapsedTime > 0.5) { // Update speed every 0.5s
        const speed = (event.loaded / elapsedTime) / (1024 * 1024); // MB/s
        downloadSpeed.value = `${speed.toFixed(1)} MB/s`;
        downloadStatus.value = '下载中...';
      }
    } else {
      // If content-length is not available
      downloadStatus.value = '下载中...';
      downloadSpeed.value = '计算中...';
    }
  };
  
  xhr.onload = () => {
    if (xhr.status === 200) {
      downloadStatus.value = '下载完成';
      downloadProgress.value = 100;
      
      const blob = xhr.response;
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'StarMC-OPZ-1.21.11.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      
      setTimeout(() => {
        isDownloading.value = false;
      }, 2000);
    } else {
      handleDownloadError();
    }
  };
  
  xhr.onerror = () => {
    handleDownloadError();
  };
  
  xhr.send();
};

const handleDownloadError = () => {
  downloadStatus.value = '正在获取资源...';
  downloadSpeed.value = '';
  
  // Simulate progress to 100% to indicate "handover" to browser
  const interval = setInterval(() => {
    if (downloadProgress.value < 100) {
      downloadProgress.value += 5;
    } else {
      clearInterval(interval);
      downloadStatus.value = '下载已开始';
      
      // Fallback to direct link
      const link = document.createElement('a');
      link.href = 'https://git.s3.fan/addxiaoyi312048/zhenghebao/raw/branch/main/StarMC-OPZ-1.21.11.zip';
      link.setAttribute('download', 'StarMC-OPZ-1.21.11.zip');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        isDownloading.value = false;
        downloadProgress.value = 0;
      }, 2000);
    }
  }, 50);
};

// Grid Drag Setup
const cards = ref([
  { id: 'hero', type: 'hero', class: 'cell-hero' },
  { id: 'status', type: 'status', class: 'cell-standard' },
  { id: 'map', type: 'map', class: 'cell-standard' },
  { id: 'official-wiki', type: 'official-wiki', class: 'cell-standard' },
  { id: 'feature-pure', type: 'feature-pure', class: 'cell-standard' },
  { id: 'feature-tech', type: 'feature-tech', class: 'cell-standard' },
  { id: 'mod-survival', type: 'mod-survival', class: 'cell-standard' },
  { id: 'community', type: 'community', class: 'cell-standard' },
  { id: 'download', type: 'download', class: 'cell-standard' },
  { id: 'wiki-list', type: 'wiki-list', class: 'cell-wide-fill' },
]);

const gridContainer = ref<HTMLElement | null>(null);

const { startDrag, draggedIndex, isDragging } = useGridDrag({
  items: cards,
  containerRef: gridContainer,
  onDragEnd: (newItems) => {
    devLog('New order:', newItems.map(i => i.id));
  }
});

function scrollToGrid() {
  gridContainer.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(async () => {
  await refreshWikiTopics();
  wikiRefreshTimer = setInterval(() => {
    refreshWikiTopics();
  }, 10 * 60 * 1000);
});

onUnmounted(() => {
  if (wikiRefreshTimer) {
    clearInterval(wikiRefreshTimer);
    wikiRefreshTimer = null;
  }
});
</script>

<style scoped lang="scss">
.google-layout-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: transparent;
  color: var(--text-primary);
  font-family: var(--font-ui);
  padding: 0;
}

.guide-hero {
  padding: clamp(4.5rem, 10vw, 6.5rem) clamp(1rem, 2.5vw, 2rem) 1.25rem;
  width: min(1200px, 100%);
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.guide-hero__text {
  min-width: 0;
}

.guide-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: flex-end;
}

.guide-hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
}

.stat-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.72rem;
  border-radius: 999px;
  background: rgba(124, 140, 255, 0.1);
  border: 1px solid rgba(124, 140, 255, 0.18);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.grid-content {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: 280px;
  gap: 1rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  padding: 0 clamp(1rem, 2.5vw, 2rem) 3rem;
  position: relative; /* Ensure relative positioning for drag */

  @media (max-width: 1400px) {
    grid-template-columns: repeat(4, 1fr);
  }
  @media (max-width: 1100px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.8rem;
    grid-auto-rows: auto;
  }
  @media (max-width: 480px) {
    grid-template-columns: repeat(1, 1fr);
  }
}

.draggable-item {
  cursor: grab;
  touch-action: none; /* Important for touch drag */
  user-select: none;
  
  &:active {
    cursor: grabbing;
  }
  
  /* Make sure internal elements don't block clicks but allow interaction */
  & > * {
    pointer-events: none;
  }
  
  /* Allow clicking on buttons/links inside */
  & :deep(a), 
  & :deep(button),
  & :deep(.info-item) {
    pointer-events: auto;
  }
}

.is-dragging-placeholder {
  opacity: 0.2;
}

/* FLIP Animation */
.grid-move {
  transition: transform var(--motion-base, 260ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

/* Layout Helper Classes */
.cell-hero {
  grid-column: span 2;
  grid-row: span 2;
  
  @media (max-width: 1100px) {
    grid-column: span 2;
  }
  @media (max-width: 768px) {
    grid-column: span 2;
    grid-row: auto;
    min-height: 300px;
  }
  @media (max-width: 480px) {
    grid-column: span 1;
  }
}

.cell-tall {
  grid-column: span 1;
  grid-row: span 2;
  
  @media (max-width: 600px) {
    grid-row: auto;
    min-height: 300px;
  }
}

.cell-standard {
  grid-column: span 1;
  grid-row: span 1;
  
  @media (max-width: 600px) {
    grid-row: auto;
    min-height: 200px;
  }
}

.cell-wide-fill {
  grid-column: 1 / -1 !important;
  grid-row: span 1;
  
  @media (max-width: 600px) {
    grid-row: auto;
    min-height: 200px;
  }
}

/* Card Common Styles */
.grid-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
  border-radius: var(--radius-2);
  overflow: hidden;
  position: relative;
  transition: transform var(--motion-base, 260ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)),
              border-color var(--motion-base, 260ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)),
              box-shadow var(--motion-base, 260ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-1);
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-2);
    border-color: var(--border-strong);
  }
  
  .card-link {
    position: absolute;
    inset: 0;
    z-index: 10;
  }
}

/* Hero Card */
.hero-card {
  /* No grid spans here, handled by wrapper */
  display: flex;
  flex-direction: column;
  
  @media (max-width: 640px) {
    min-height: 400px;
  }
  
  .card-image-wrapper {
    flex: 1;
    position: relative;
    overflow: hidden;
    
    .card-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s;
    }
    
    .card-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.75) 100%);
    }
  }
  
  .card-content {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    padding: 24px;
    z-index: 2;
  }
  
  .card-tag {
    display: inline-block;
    background: rgba(255,255,255,0.1);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 4px;
    margin-bottom: 12px;
    text-transform: uppercase;
  }
  
  .card-title {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 12px;
    color: #fff;
  }
  
  .card-excerpt {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 16px;
    display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--text-muted);
    
    .author {
      color: var(--text-primary);
      font-weight: 500;
    }
  }
  
  &:hover .card-image {
    transform: scale(1.05);
  }
}

/* Status Card */
.status-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  
  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    
    .status-indicator {
      display: flex;
      align-items: center;
      position: relative;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #81c995;
      box-shadow: none;
      position: relative;
      z-index: 2;
      
      &.online { background-color: #81c995; }
    }
    
    .status-ping {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-color: rgba(129, 201, 149, 0.4);
      animation: ping 2.4s cubic-bezier(0.2, 0, 0, 1) infinite;
    }
    
    .status-text {
      font-size: 12px;
      color: #81c995;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
  }
  
  .status-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    
    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(255,255,255,0.03);
      transition: transform var(--motion-fast, 160ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)),
                  background-color var(--motion-fast, 160ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
      cursor: pointer;
      
      &:hover:not(.no-hover) {
        background: rgba(255,255,255,0.08);
        transform: translateX(2px);
      }
      
      &.no-hover {
        cursor: default;
        background: transparent;
        padding-left: 0;
        padding-right: 0;
      }
      
      .info-label {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-muted);
        font-size: 13px;
        
        .label-icon {
          flex-shrink: 0;
          color: var(--state-info);
        }
      }
      
      .value {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        font-family: 'Consolas', 'Monaco', monospace;
      }
    }
  }

  @keyframes ping {
    75%, 100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  @media (max-width: 768px) {
    padding: 16px; 
    
    .status-header {
      margin-bottom: 12px;
    }

    .status-info {
      gap: 8px;
      
      .info-item {
        padding: 6px 8px;
        
        .info-label { font-size: 12px; }
        .value { font-size: 12px; }
      }
    }
  }
}

/* Map Card */
.map-card {
  display: flex;
  flex-direction: column;
  
  .card-image-wrapper {
    flex: 1;
    background-color: #1e1e1e;
    position: relative;
    
    .map-placeholder {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      
      .map-grid {
        position: absolute;
        inset: 0;
        background-image: 
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
        background-size: 20px 20px;
      }
      
      .map-marker {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 12px;
        height: 12px;
        background-color: #f28b82;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 0 4px rgba(242, 139, 130, 0.2);
      }
    }
  }
  
  .card-content-bottom {
    padding: 16px;
    background-color: #303134;
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .card-title-small {
      font-size: 16px;
      font-weight: 500;
      margin: 0;
    }
    
    .card-action {
      font-size: 12px;
      color: #8ab4f8;
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }
}

/* Official Wiki Card */
.official-wiki-card {
    background: linear-gradient(180deg, rgba(124, 140, 255, 0.08), rgba(255,255,255,0.02)), rgba(255,255,255,0.03);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: transform 180ms var(--ease-standard), box-shadow 180ms var(--ease-standard), border-color 180ms var(--ease-standard);
    border: 1px solid rgba(124, 140, 255, 0.12);
    overflow: hidden;
    padding: 20px;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 32px rgba(0,0,0,0.18);
      border-color: rgba(124, 140, 255, 0.22);
      
      .wiki-action {
        transform: translateX(3px);
      }
    }

    .wiki-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      color: #fff;
      z-index: 2;
      gap: 12px;
    }

    .wiki-icon {
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: rgba(124, 140, 255, 0.12);
      color: #cfd7ff;
      opacity: 0.95;
    }

    .wiki-info {
      display: grid;
      gap: 6px;
      margin-bottom: 0;
      
      .card-title-small {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }
      
      .card-subtitle {
        font-size: 13px;
        opacity: 0.78;
        max-width: 220px;
        margin: 0 auto;
        line-height: 1.55;
      }
    }

    .wiki-action {
      font-size: 24px;
      opacity: 0.72;
      transition: transform 180ms var(--ease-standard);
    }

    @media (max-width: 768px) {
      padding: 16px;
      .wiki-icon { width: 48px; height: 48px; }
      .wiki-info {
        .card-title-small { font-size: 16px; }
        .card-subtitle { font-size: 12px; }
      }
      .wiki-action { font-size: 18px; }
    }
}

/* Feature Cards */
.feature-card {
  padding: 22px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.06);
  
  &.space-theme {
    .card-icon { color: #9fb0ff; background: rgba(124, 140, 255, 0.12); }
  }
  
  &.tech-theme {
    .card-icon { color: #ffb3b0; background: rgba(242, 139, 130, 0.12); }
  }

  &.mod-theme {
    .card-icon { color: #d2f7b1; background: rgba(204, 255, 144, 0.12); }
    .card-sub-note { font-size: 11px; opacity: 0.68; display: block; margin-top: 4px; }
  }
  
  .card-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  }
  
  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    margin-bottom: 4px;
  }
  
  .card-title-medium {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: #fff;
  }
  
  .card-desc {
    font-size: 13px;
    color: rgba(235, 241, 255, 0.72);
    line-height: 1.55;
    margin: 0;
  }
}

/* Community Card */
.community-card {
  padding: 18px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.06);
  
  .card-header-small {
    font-size: 14px;
    color: rgba(235, 241, 255, 0.68);
    font-weight: 600;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  
  .community-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .community-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    cursor: pointer;
    transition: transform 180ms var(--ease-standard), background-color 180ms var(--ease-standard), border-color 180ms var(--ease-standard);
    
    &:hover {
      background-color: rgba(124, 140, 255, 0.08);
      border-color: rgba(124, 140, 255, 0.14);
      transform: translateY(-1px);
    }
    
    .item-icon {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: #fff;
      
      &.discord { background-color: #5865F2; }
      &.qq { background-color: #12B7F5; }
      &.bilibili { background-color: #FB7299; }
    }
    
    .item-info {
      .item-title {
        font-size: 14px;
        font-weight: 600;
        color: #eef2ff;
      }
      
      .item-sub {
        font-size: 12px;
        color: rgba(235, 241, 255, 0.62);
      }
    }
  }
}

/* Download Card */
.download-card {
  background:
    linear-gradient(180deg, rgba(124, 140, 255, 0.08), rgba(255,255,255,0.02)),
    rgba(255,255,255,0.03);
  border: 1px solid rgba(124, 140, 255, 0.12);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.16);
  
  .card-content-center {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    gap: 12px;
  }
  
  .download-icon-circle {
    width: 68px;
    height: 68px;
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(124, 140, 255, 0.16), rgba(255,255,255,0.04));
    border: 1px solid rgba(124, 140, 255, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #9fb0ff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 22px rgba(0,0,0,0.16);
  }
  
  .card-title-medium {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: #fff;
  }
  
  .card-desc {
    font-size: 13px;
    color: rgba(233, 238, 255, 0.72);
    margin: 0;
    line-height: 1.65;
  }
  
  .download-btn {
    min-height: 40px;
    padding: 0 18px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(124, 140, 255, 0.98), rgba(92, 109, 232, 0.98));
    color: #fff;
    border: 1px solid rgba(124, 140, 255, 0.22);
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
    transition: transform 180ms var(--ease-standard), box-shadow 180ms var(--ease-standard), filter 180ms var(--ease-standard);
    
    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 22px rgba(92, 109, 232, 0.22);
      filter: brightness(1.03);
    }
  }

  .download-progress-container {
    width: 100%;
    margin-top: 10px;
    display: grid;
    gap: 10px;
    
    .progress-info {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: rgba(233, 238, 255, 0.72);
      
      .speed-text {
        font-family: monospace;
      }
    }
    
    .progress-bar-track {
      width: 100%;
      height: 6px;
      background-color: rgba(255,255,255,0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, rgba(124, 140, 255, 0.95), rgba(53, 201, 255, 0.9));
      transition: width 180ms linear;
    }
    
    .progress-percentage {
      font-size: 12px;
      color: rgba(233, 238, 255, 0.84);
      text-align: right;
    }
  }
}

/* Wiki List Card */
.list-card {
  padding: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.06);
  
  .card-header-small {
    font-size: 14px;
    color: rgba(233, 238, 255, 0.72);
    font-weight: 500;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .loading-indicator {
      font-size: 12px;
      color: #9fb0ff;
    }
  }
  
  .wiki-state-panel { margin-bottom: 12px; }

  .wiki-cta {
    color: #9fb0ff;
    text-decoration: none;
    font-weight: 600;
  }

  .wiki-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    max-height: 220px;
    
    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: rgba(159, 176, 255, 0.36);
      border-radius: 2px;
    }
  }

  /* Wide mode adjustment for wiki list */
  &.cell-wide-fill .wiki-list {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
    gap: 12px;
    max-height: none !important;
    overflow-y: visible !important;
    padding-bottom: 4px;
  }
  
  .wiki-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    text-decoration: none;
    transition: transform 180ms var(--ease-standard), background-color 180ms var(--ease-standard), border-color 180ms var(--ease-standard);
    
    &:hover {
      background: rgba(124, 140, 255, 0.1);
      border-color: rgba(124, 140, 255, 0.16);
      transform: translateY(-1px);
      
      .wiki-number {
        background-color: rgba(124, 140, 255, 0.85);
        color: #ffffff;
      }
    }
    
    .wiki-number {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background-color: rgba(255,255,255,0.08);
      color: #e8eaed;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      transition: background-color 0.2s;
    }
    
    .wiki-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }

    .wiki-title {
      font-size: 13px;
      color: #e8eaed;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .wiki-source {
      font-size: 11px;
      color: rgba(233, 238, 255, 0.52);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}
</style>
