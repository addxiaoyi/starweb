<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { gsap } from 'gsap';
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';
import SkeletonLoader from '@/components/atoms/SkeletonLoader.vue';
import { getWensetConfig } from '@/shared/config/wenset';
import { blockParticle } from '@/shared/utils/BlockParticle';
import { devLog, devWarn } from '@/shared/utils/devLog';
import { sanitizeHtml } from '@/shared/utils/security';

export interface ServerData {
  id: number | string;
  name: string;
  label: string;
  ip: string;
  port?: number;
  emoji?: string;
  icon?: string;
  type?: string;
  color?: string;
  online: boolean;
  status?: 'online' | 'offline' | 'unknown';
  loading: boolean;
  ping?: number;
  players: { online: number; max: number };
  version: string;
  motd?: {
    html?: string | string[];
    clean?: string[];
    raw?: string[];
  } | null;
  copied?: boolean;
}

const props = withDefaults(defineProps<{
  serversData?: ServerData[];
  showDashboard?: boolean;
}>(), {
  serversData: () => [],
  showDashboard: false
});

const servers = ref<ServerData[]>([]);
const dashboardIframe = ref<HTMLIFrameElement | null>(null);
const iframeLoading = ref(true);
const iframeError = ref(false);
const iframeKey = ref(0);
const dashboardUrl = getWensetConfig().urls.dashboard;
const loadTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const LOAD_TIMEOUT_MS = 10000;
const isMixedContent = ref(false);
const isProxyError = ref(false);

// Update servers data
watch(() => props.serversData, (newData: ServerData[] | undefined) => {
  if (newData) {
    servers.value = newData.map((s: ServerData) => {
      const existing = servers.value.find((old: ServerData) => old.id === s.id);
      return { ...s, copied: existing?.copied || false } as ServerData;
    });
    
    // Animate new items
    nextTick(() => {
      gsap.from('.server-card', {
        y: 8,
        opacity: 0,
        stagger: 0.04,
        duration: 0.22,
        ease: 'power2.out',
        clearProps: 'all'
      });
    });
  }
}, { deep: true, immediate: true });

const copyIp = (ip: string, index: number, event?: MouseEvent) => {
  if (!ip) return;
  
  // 触发粒子反馈
  if (event) {
    blockParticle.emit(event.clientX, event.clientY, '#555555');
  }

  navigator.clipboard.writeText(ip).then(() => {
    if (servers.value[index]) {
      servers.value[index].copied = true;
      setTimeout(() => {
        if (servers.value[index]) {
          servers.value[index].copied = false;
        }
      }, 2000);
    }
  }).catch(err => {
    console.error('Failed to copy IP:', err);
  });
};

const calculatePercentage = (online: number, max: number) => {
  if (!max) return 0;
  return Math.min(100, Math.round((online / max) * 100));
};

const parseMotdHtml = (html: string | string[] | undefined) => {
  if (!html) return '';
  const rawHtml = Array.isArray(html) ? html.join('<br>') : html;
  return sanitizeHtml(rawHtml);
};

// Dashboard logic
const handleIframeLoad = () => {
  if (loadTimeout.value) clearTimeout(loadTimeout.value);
  
  try {
    // Check if the iframe loaded the main app (proxy failure fallback) or an error page
    const iframeDoc = dashboardIframe.value?.contentDocument || dashboardIframe.value?.contentWindow?.document;
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
        // Check for empty body
        (iframeDoc.body && iframeDoc.body.children.length === 0 && !iframeDoc.body.textContent?.trim())
      ) {
        devWarn('Dashboard proxy failed (Title/Content check):', title || 'Empty Body');
        isProxyError.value = true;
        iframeError.value = true;
        iframeLoading.value = false;
        return;
      }
    }
  } catch (e) {
    // SecurityError: Blocked a frame with origin "..." from accessing a cross-origin frame.
    // This is actually GOOD - it means we loaded external content (the dashboard)
    devLog('Dashboard loaded cross-origin content (success)');
  }

  iframeLoading.value = false;
  iframeError.value = false;
};

const handleIframeError = () => {
  if (loadTimeout.value) clearTimeout(loadTimeout.value);
  iframeLoading.value = false;
  iframeError.value = true;
};

const retryLoad = () => {
  if (loadTimeout.value) clearTimeout(loadTimeout.value);
  iframeLoading.value = true;
  iframeError.value = false;
  isProxyError.value = false;
  iframeKey.value++;
  
  loadTimeout.value = setTimeout(() => {
    if (iframeLoading.value) handleIframeError();
  }, isMixedContent.value ? 5000 : LOAD_TIMEOUT_MS);
};

const openInNewTab = () => globalThis.open(dashboardUrl, '_blank', 'noopener,noreferrer');

onMounted(() => {
  if (globalThis.window !== undefined && globalThis.window.location.protocol === 'https:' && dashboardUrl.startsWith('http:')) {
    isMixedContent.value = true;
  }

  if (props.showDashboard) {
    loadTimeout.value = setTimeout(() => {
      if (iframeLoading.value) handleIframeError();
    }, isMixedContent.value ? 5000 : LOAD_TIMEOUT_MS);
  }
});

onUnmounted(() => {
  if (loadTimeout.value) clearTimeout(loadTimeout.value);
});
</script>

<template>
  <div class="server-widget w-full max-w-7xl mx-auto space-y-8">
    <!-- Server Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="(server, index) in servers"
        :key="server.id"
        class="server-card ui-card ui-card-hover mc-selectable relative group bg-gray-900/50 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20"
        :class="{'grayscale opacity-70': !server.loading && !server.online}"
        @click="copyIp(server.ip, index, $event)"
      >
        <!-- Glow Effect -->
        <div class="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

        <div class="p-6 relative z-10">
          <template v-if="server.loading">
            <SkeletonLoader height="180px" />
          </template>


          <template v-else>
            <!-- Header -->
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-2xl overflow-hidden shadow-inner">
                  <OptimizedImage v-if="server.icon" :src="server.icon" class="w-full h-full object-cover" />
                  <span v-else>{{ server.emoji }}</span>
                </div>
                <div>
                  <h3 class="text-xl font-minecraft text-white font-bold">{{ server.name }}</h3>
                  <span class="text-xs text-gray-400 uppercase tracking-wider">{{ server.label }}</span>
                </div>
              </div>
              
              <div class="flex items-center gap-2">
                <span v-if="server.online" class="text-xs font-mono text-green-400">{{ typeof server.ping === 'number' ? server.ping : '?' }}ms</span>
                <div class="w-3 h-3 rounded-full" :class="server.online ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : (server.loading ? 'bg-yellow-500 animate-pulse' : 'bg-red-500')"></div>
              </div>
            </div>

            <!-- IP Address -->
            <div class="bg-black/30 rounded-lg p-3 mb-4 flex items-center justify-between group-hover:bg-black/50 transition-colors cursor-pointer">
              <code class="font-mono text-gray-300">{{ server.ip }}</code>
              <span v-if="server.copied" class="text-xs font-bold text-green-400 animate-bounce">COPIED!</span>
              <span v-else class="text-xs text-gray-500 group-hover:text-primary transition-colors">CLICK TO COPY</span>
            </div>

            <!-- MOTD -->
            <div class="mb-4 text-sm text-gray-400 font-minecraft leading-relaxed min-h-[40px]">
              <div v-if="server.motd?.html" v-html="parseMotdHtml(server.motd.html)"></div>
              <div v-else-if="server.motd?.clean">
                <div v-for="(line, i) in server.motd.clean" :key="i">{{ line.trim() }}</div>
              </div>
            </div>

            <!-- Stats -->
            <div v-if="server.online" class="space-y-2">
              <div class="flex justify-between text-xs text-gray-400">
                <span>Online Players</span>
                <span class="text-white font-bold">{{ server.players.online }} / {{ server.players.max }}</span>
              </div>
              <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-primary transition-all duration-1000 ease-out relative overflow-hidden"
                  :style="{ width: calculatePercentage(server.players.online, server.players.max) + '%', backgroundColor: server.color }"
                >
                  <div class="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>
              <div class="text-right text-xs text-gray-500 font-mono">{{ server.version }}</div>
            </div>

            <!-- Offline State -->
            <div v-else class="text-center py-4 text-red-400 font-minecraft">
              Server Offline
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Dashboard -->
    <div v-if="showDashboard" class="rounded-xl overflow-x-hidden overflow-y-auto border border-white/10 bg-black/40 h-[400px] md:h-[600px] relative" style="-webkit-overflow-scrolling: touch;">
      <div v-if="iframeLoading" class="absolute inset-0 flex items-center justify-center">
        <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>

      <iframe
        ref="dashboardIframe"
        v-show="!iframeError"
        :key="iframeKey"
        :src="dashboardUrl"
        class="w-full h-full border-0"
        title="Server Dashboard"
        allowfullscreen
        @load="handleIframeLoad"
        @error="handleIframeError"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.server-card.ui-card {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(17, 24, 39, 0.58);
}

.server-card.ui-card:hover {
  border-color: rgba(124, 140, 255, 0.45);
}

.mc-error-overlay {
  background:
    radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.04) 0 2px, transparent 2px),
    radial-gradient(circle at 70% 60%, rgba(0, 0, 0, 0.22) 0 2px, transparent 2px),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, rgba(0, 0, 0, 0) 1px 4px),
    linear-gradient(180deg, #2e2a24 0%, #1b1814 100%);
  background-size: 16px 16px, 16px 16px, 100% 4px, 100% 100%;
  image-rendering: pixelated;
}

.mc-error-panel {
  width: min(720px, 100%);
  border: 4px solid #1a1a1a;
  background:
    repeating-linear-gradient(45deg, #4d4337 0 8px, #43392e 8px 16px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.25));
  box-shadow:
    0 0 0 4px #6f5b45,
    0 0 0 8px #2a221b,
    8px 8px 0 rgba(0, 0, 0, 0.55);
  padding: 20px;
  image-rendering: pixelated;
}

.mc-error-icon {
  font-family: 'Minecraft', monospace;
  font-size: 40px;
  line-height: 1;
  color: #ff5c3f;
  text-shadow: 2px 2px 0 #2c0f0f;
}

.mc-error-title {
  font-family: 'Minecraft', monospace;
  font-size: 24px;
  letter-spacing: 1px;
  color: #f3efe5;
  text-shadow: 2px 2px 0 #1d1a16;
}

.mc-error-text {
  margin: 0 auto;
  max-width: 620px;
  font-family: 'Minecraft', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #d8d0c2;
  text-shadow: 1px 1px 0 #211c17;
}

.mc-error-text--warn {
  color: #ff9e82;
}

.mc-error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.mc-btn {
  font-family: var(--font-ui);
  font-size: 13px;
  letter-spacing: 0.04em;
  border: 2px solid #1f1f1f;
  min-width: 160px;
  color: #fff;
  text-shadow: 1px 1px 0 #111;
  box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.35), inset 2px 2px 0 rgba(255, 255, 255, 0.2), 3px 3px 0 rgba(0, 0, 0, 0.45);
  transition: transform 0.08s ease;
}

.mc-btn:hover {
  transform: translate(-1px, -1px);
}

.mc-btn:active {
  transform: translate(1px, 1px);
  box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.35), inset 1px 1px 0 rgba(255, 255, 255, 0.2), 1px 1px 0 rgba(0, 0, 0, 0.45);
}

.mc-btn--primary {
  background: linear-gradient(180deg, #6db24a 0%, #3d7b2d 100%);
}

.mc-btn--ghost {
  background: linear-gradient(180deg, #777777 0%, #505050 100%);
}

@media (max-width: 768px) {
  .mc-error-panel {
    padding: 16px;
  }

  .mc-error-title {
    font-size: 20px;
  }

  .mc-error-text {
    font-size: 12px;
  }

  .mc-btn {
    width: 100%;
  }
}
</style>
