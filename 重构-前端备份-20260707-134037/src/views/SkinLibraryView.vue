<template>
  <div class="skin-library-view">
    <div class="container page-shell">
      <header class="library-header card glass-card page-hero">
        <div>
          <div class="mode-chip starmc-mode-chip is-library">
            <div class="mode-chip-main starmc-mode-chip-main">
              <AppIcon name="database" :size="14" class="mode-chip-icon starmc-mode-chip-icon" />
              <span>当前模式：皮肤库检索</span>
            </div>
            <div class="mode-chip-actions starmc-mode-chip-actions">
              <RouterLink class="mode-chip-link starmc-mode-chip-link" to="/skin">皮肤管理</RouterLink>
              <RouterLink class="mode-chip-link starmc-mode-chip-link" to="/profile">个人中心</RouterLink>
              <RouterLink class="mode-chip-link starmc-mode-chip-link" to="/skin/review">审核预览</RouterLink>
            </div>
          </div>
          <h1 class="library-title starmc-brand-glow page-hero__title">
            <AppIcon name="database" :size="24" class="heading-icon" /> 皮肤库检索
          </h1>
          <p class="library-subtitle page-hero__subtitle" data-typography="prose">
            检索服务器皮肤数据库，并支持通过插件同步最新资源。
          </p>
        </div>
        <div class="library-header-actions">
          <RouterLink to="/skin" class="mc-button ui-btn small">返回皮肤站</RouterLink>
        </div>
      </header>

      <section class="card glass-card library-query-panel">
        <div class="query-row">
          <input
            v-model="keyword"
            class="query-input ui-input"
            type="text"
            maxlength="60"
            placeholder="输入关键词（名称 / 标签 / 上传者）"
            aria-label="检索关键词"
            @keyup.enter="searchLibrary"
          />
          <button class="mc-button ui-btn" :disabled="loading" @click="searchLibrary">
            {{ loading ? '检索中...' : '检索' }}
          </button>
          <button class="mc-button ui-btn secondary" :disabled="syncing" @click="syncLibrary">
            {{ syncing ? '同步中...' : '插件同步服务器库' }}
          </button>
          <button class="mc-button ui-btn secondary" :disabled="!keyword || loading" @click="clearKeyword">
            清空关键词
          </button>
        </div>
        <div class="quick-tags" aria-label="快捷检索词">
          <button type="button" class="quick-tag" v-for="tag in quickSearchTags" :key="tag" @click="applyQuickSearch(tag)">{{ tag }}</button>
        </div>
        <div class="query-meta-row">
          <p class="card-desc query-tip">同步会触发后端插件任务，从服务器皮肤数据库拉取最新数据。</p>
          <span class="meta-pill starmc-meta-pill auth-state" :class="{ 'is-login': auth.isLoggedIn }">
            <AppIcon :name="auth.isLoggedIn ? 'checkCircle' : 'warning'" :size="14" class="pill-icon starmc-pill-icon" />
            {{ auth.isLoggedIn ? '已登录，可直接应用' : '未登录，仅可检索' }}
          </span>
          <span
            class="meta-pill starmc-meta-pill realtime-state"
            :class="{ 'is-live': realtimeConnected, 'is-fallback': !realtimeConnected }"
          >
            <AppIcon :name="realtimeConnected ? 'bolt' : 'clockRotate'" :size="14" class="pill-icon starmc-pill-icon" />
            {{ realtimeConnected ? '实时推送已连接' : (realtimeEnabled ? '实时推送未连接（轮询兜底）' : '实时推送未启用') }}
          </span>
          <span v-if="syncSnapshot?.version" class="meta-pill starmc-meta-pill sync-version">
            <AppIcon name="database" :size="14" class="pill-icon starmc-pill-icon" />
            版本 {{ shortVersion(syncSnapshot.version) }} · 同步 {{ formatSyncTime(syncSnapshot.syncedAt) }}
          </span>
        </div>
      </section>

      <section class="card glass-card library-results">
        <div class="result-header starmc-list-item">
          <div class="starmc-list-item__main">
            <h3 class="card-title result-title">
              <AppIcon name="grid" :size="18" class="heading-icon" /> 检索结果
            </h3>
          </div>
          <span class="starmc-badge is-info result-count">共 {{ items.length }} 条</span>
        </div>

        <AppStatePanel
          v-if="loading"
          variant="loading"
          eyebrow="Library Search"
          title="正在检索皮肤库..."
          message="系统正在读取服务器皮肤数据库，请稍候。"
          class="result-state-panel"
        />
        <AppStatePanel
          v-else-if="error"
          variant="error"
          eyebrow="Library Search"
          title="检索失败"
          :message="error"
          hint="你可以稍后重试，或先执行一次插件同步。"
          class="result-state-panel"
        />
        <AppStatePanel
          v-else-if="items.length === 0"
          variant="empty"
          eyebrow="Library Search"
          title="暂无结果"
          message="试试更短的关键词，或者先执行插件同步。"
          hint="同步后，服务器库会刷新到最新状态。"
          class="result-state-panel"
        />

        <ul v-else class="result-list">
          <SkinLibraryResultItem
            v-for="item in items"
            :key="item.id"
            :item="item"
            :is-logged-in="auth.isLoggedIn"
            :applying="applyingItemId === item.id"
            :apply-error="applyErrorById[item.id]"
            @apply="applyLibraryItem"
          />
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/atoms/AppIcon.vue';
import SkinLibraryResultItem from '@/components/molecules/Skin/SkinLibraryResultItem.vue';
import { useAuthStore } from '@/stores/auth';
import { createLibrarySyncEventSource, useSkinLibrary } from '@/features/skin';

const auth = useAuthStore();
const isDev = import.meta.env.DEV;
const realtimeRefreshIntervalMs = (() => {
  const raw = Number(import.meta.env.VITE_SKIN_REALTIME_REFRESH_MS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return isDev ? 10000 : 30000;
  }
  return Math.min(Math.max(Math.floor(raw), 5000), 120000);
})();
const autoRefreshing = ref(false);
let libraryRefreshTimer: ReturnType<typeof setInterval> | null = null;
let libraryEventSource: EventSource | null = null;
let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
const realtimeReconnectDelayMs = isDev ? 2000 : 5000;
let lastRealtimeRefreshAt = 0;

const {
  keyword,
  loading,
  syncing,
  applyingItemId,
  applyErrorById,
  error,
  items,
  syncSnapshot,
  realtimeEnabled,
  realtimeStreamPath,
  realtimeConnected,
  searchLibrary,
  syncLibrary,
  loadSyncStatus,
  markRealtimeState,
  applyLibraryItem
} = useSkinLibrary({
  isLoggedIn: () => auth.isLoggedIn,
  userUuid: () => auth.user?.uuid
});

const quickSearchTags = ['pvp', 'fantasy', 'medieval', 'cute', 'hd'];

const refreshLibraryRealtime = async () => {
  if (autoRefreshing.value) return;
  autoRefreshing.value = true;
  try {
    await Promise.allSettled([searchLibrary(), loadSyncStatus(true)]);
  } finally {
    autoRefreshing.value = false;
  }
};

function parseEventPayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function applyRealtimeSnapshot(payload: Record<string, unknown>) {
  syncSnapshot.value = {
    syncedAt: String(payload.syncedAt || syncSnapshot.value?.syncedAt || ''),
    version: String(payload.version || syncSnapshot.value?.version || ''),
    etag: String(payload.etag || syncSnapshot.value?.etag || ''),
    lastModified: String(payload.lastModified || syncSnapshot.value?.lastModified || ''),
    totalItems: Number(payload.totalItems || syncSnapshot.value?.totalItems || 0),
  };
  const at = String(payload.emittedAt || payload.now || '').trim();
  markRealtimeState(true, at || new Date().toISOString());
}

function stopRealtimeReconnectTimer() {
  if (!realtimeReconnectTimer) return;
  clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
}

function stopRealtimeStream() {
  if (libraryEventSource) {
    libraryEventSource.close();
    libraryEventSource = null;
  }
  markRealtimeState(false);
}

function scheduleRealtimeReconnect() {
  stopRealtimeReconnectTimer();
  if (!realtimeEnabled.value) return;
  if (document.hidden) return;
  realtimeReconnectTimer = setTimeout(() => {
    connectRealtimeStream();
  }, realtimeReconnectDelayMs);
}

function connectRealtimeStream() {
  stopRealtimeStream();
  if (!realtimeEnabled.value) return false;
  const stream = createLibrarySyncEventSource(realtimeStreamPath.value || '/api/skins/library/stream');
  if (!stream) return false;
  libraryEventSource = stream;

  stream.onopen = () => {
    markRealtimeState(true, new Date().toISOString());
  };

  stream.onerror = () => {
    stopRealtimeStream();
    scheduleRealtimeReconnect();
  };

  stream.addEventListener('hello', (event) => {
    const payload = parseEventPayload((event as MessageEvent).data);
    applyRealtimeSnapshot(payload);
  });

  stream.addEventListener('heartbeat', (event) => {
    const payload = parseEventPayload((event as MessageEvent).data);
    const now = String(payload.now || '').trim();
    markRealtimeState(true, now || new Date().toISOString());
  });

  stream.addEventListener('catalog_sync', (event) => {
    const payload = parseEventPayload((event as MessageEvent).data);
    applyRealtimeSnapshot(payload);
    const nowMs = Date.now();
    if (nowMs - lastRealtimeRefreshAt < 1200) return;
    lastRealtimeRefreshAt = nowMs;
    void refreshLibraryRealtime();
  });

  return true;
}

function clearKeyword() {
  keyword.value = '';
  void searchLibrary();
}

function applyQuickSearch(tag: string) {
  keyword.value = tag;
  void searchLibrary();
}

const stopLibraryRefreshTimer = () => {
  if (libraryRefreshTimer) {
    clearInterval(libraryRefreshTimer);
    libraryRefreshTimer = null;
  }
};

const startLibraryRefreshTimer = () => {
  stopLibraryRefreshTimer();
  libraryRefreshTimer = setInterval(async () => {
    if (document.hidden) return;
    if (realtimeConnected.value) return;
    await refreshLibraryRealtime();
  }, realtimeRefreshIntervalMs);
};

const handleVisibilityChange = async () => {
  if (!document.hidden) {
    if (!realtimeConnected.value) connectRealtimeStream();
    await refreshLibraryRealtime();
  }
};

watch(
  () => auth.isLoggedIn,
  async () => {
    await refreshLibraryRealtime();
  }
);

watch(
  [() => realtimeEnabled.value, () => realtimeStreamPath.value],
  ([enabled]) => {
    if (!enabled) {
      stopRealtimeStream();
      stopRealtimeReconnectTimer();
      return;
    }
    connectRealtimeStream();
  }
);

onMounted(() => {
  document.title = '皮肤库 - StarMC';
  void loadSyncStatus(true).then(() => {
    connectRealtimeStream();
  });
  void refreshLibraryRealtime();
  startLibraryRefreshTimer();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  stopLibraryRefreshTimer();
  stopRealtimeStream();
  stopRealtimeReconnectTimer();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

function shortVersion(value?: string) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.slice(0, 8);
}

function formatSyncTime(value?: string) {
  const text = String(value || '').trim();
  if (!text) return '未知';
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
}
</script>

<style scoped lang="scss">
.skin-library-view {
  --font-pixel-ui: var(--font-ui), 'Press Start 2P', monospace;

  min-height: 100vh;
  padding-top: 132px;
  font-family: var(--font-pixel-ui);
  background:
    linear-gradient(180deg, rgba(20, 30, 16, 0.94), rgba(13, 20, 12, 0.98)),
    repeating-linear-gradient(0deg, rgba(120, 170, 90, 0.06) 0 2px, rgba(0, 0, 0, 0) 2px 4px),
    repeating-linear-gradient(90deg, rgba(120, 170, 90, 0.05) 0 2px, rgba(0, 0, 0, 0) 2px 4px);
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.3;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 24px 24px;
    z-index: 0;
  }
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem 2rem;
  position: relative;
  z-index: 1;
}

.skin-library-view :deep(
  h1, h2, h3, h4, h5, h6,
  p, span, label, li, strong,
  a, button, input,
  .library-subtitle, .result-meta, .result-tags,
  .result-id, .result-count, .query-tip,
  .query-input, .result-error, .result-empty
) {
  font-family: var(--font-pixel-ui) !important;
  letter-spacing: 0.01em;
}

.skin-library-view :deep(
  p, li, label, .library-subtitle,
  .result-meta, .result-tags, .query-tip,
  .result-error, .result-empty
) {
  line-height: 1.7;
}

.glass-card {
  border-radius: 0;
  border: 3px solid #1f2f18;
  background: linear-gradient(180deg, rgba(72, 95, 56, 0.9) 0%, rgba(48, 69, 38, 0.94) 100%);
  box-shadow:
    inset 0 2px 0 rgba(187, 220, 145, 0.35),
    inset 0 -2px 0 rgba(0, 0, 0, 0.35),
    0 6px 0 #192614,
    0 12px 24px rgba(0, 0, 0, 0.35);
  padding: 1rem;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.page-hero__title .heading-icon {
  color: var(--brand-primary, #6366f1);
}

.library-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.4rem;
  font-family: var(--font-pixel-latin), var(--font-pixel-cjk);
  letter-spacing: 0.03em;
  line-height: 1.4;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.45);
}

.library-subtitle {
  margin: 0;
  color: #d6e7bc;
  line-height: 1.6;
}

.library-query-panel {
  margin-bottom: 1rem;
}

.query-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
}

.query-input {
  border: 2px solid #1f2f18;
  background: #2d3f25;
  color: #f3ffe6;
  border-radius: 0;
  padding: 0.6rem 0.7rem;
  transition: border-color 120ms steps(2), filter 120ms steps(2), transform 120ms steps(2);
}

.query-input:focus {
  outline: none;
  border-color: #b8e183;
  filter: brightness(1.06);
  transform: translateY(-1px);
  background: linear-gradient(180deg, #365028 0%, #2b4121 100%);
}

.query-input:focus-visible,
.mode-chip-link:focus-visible,
.starmc-mode-chip-link:focus-visible,
.skin-library-view :deep(.mc-button:focus-visible) {
  outline: 2px solid #b8e183;
  outline-offset: 2px;
}

.query-input::placeholder {
  color: #a9c089;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.quick-tag {
  border: 1px solid #1f2f18;
  background: #314825;
  color: #ebffd7;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  border-radius: 0;
  font-size: 0.76rem;
}

.quick-tag:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.query-meta-row {
  margin-top: 0.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.query-tip {
  margin: 0;
  color: #d6e7bc;
  font-size: 0.82rem;
  line-height: 1.6;
}

.card-desc.query-tip,
.result-error.card-desc,
.result-empty.card-desc {
  margin-bottom: 0;
}

.meta-pill {
  border-width: 2px;
  border-color: #1f2f18;
  border-radius: 0;
  background: #2f4525;
  color: #def2c2;
  font-size: 0.74rem;
  line-height: 1.3;
}

.meta-pill.starmc-meta-pill {
  border-width: 2px;
  border-color: #1f2f18;
  border-radius: 0;
  background: #2f4525;
  color: #def2c2;
}

.pill-icon {
  color: #d6e7bc;
}

.pill-icon.starmc-pill-icon {
  color: #d6e7bc;
}

.auth-state {
  white-space: nowrap;
}

.auth-state.is-login {
  border-color: rgba(74, 222, 128, 0.55);
  background: rgba(34, 197, 94, 0.16);
  color: #bbf7d0;
}

.realtime-state,
.sync-version {
  white-space: nowrap;
}

.realtime-state.is-live {
  border-color: rgba(56, 189, 248, 0.55);
  background: rgba(14, 116, 144, 0.2);
  color: #bae6fd;
}

.realtime-state.is-fallback {
  border-color: rgba(245, 158, 11, 0.5);
  background: rgba(120, 53, 15, 0.22);
  color: #fde68a;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.result-title {
  margin-bottom: 0;
}

.result-count {
  font-size: 0.74rem;
}

.result-state-panel {
  margin-bottom: 0.5rem;
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skin-library-view :deep(.mc-button.secondary) {
  background: linear-gradient(180deg, #6f8fbf 0%, #4b6a9b 100%);
  border-color: #1f2f18;
}

.skin-library-view :deep(.mc-button) {
  border-radius: 0;
  border: 2px solid #1e2f12;
  background: linear-gradient(180deg, #88bd53 0%, #658f3a 100%);
  color: #f1ffd9;
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.28),
    inset 0 -2px 0 rgba(0, 0, 0, 0.32),
    0 3px 0 #213317;
  font-family: var(--font-pixel-latin), var(--font-pixel-cjk);
  letter-spacing: 0.02em;
  line-height: 1.35;
}

.skin-library-view :deep(.mc-button:hover) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.skin-library-view :deep(.mc-button:active) {
  transform: translateY(2px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
    0 1px 0 #213317;
}

@media (max-width: 992px) {
  .skin-library-view {
    padding-top: 116px;
  }

  .library-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.6rem;
  }

  .library-header-actions {
    width: 100%;
  }

  .library-header-actions :deep(.mc-button) {
    width: 100%;
  }

  .mode-chip,
  .starmc-mode-chip {
    width: 100%;
  }
}

@media (max-width: 800px) {
  .query-row {
    grid-template-columns: 1fr;
  }

  .query-meta-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .auth-state {
    white-space: normal;
  }
}

@media (max-width: 640px) {
  .skin-library-view {
    padding-top: 104px;
  }

  .glass-card {
    padding: 0.85rem;
  }

  .skin-library-view :deep(
    p, li, label, span, a,
    input, .library-subtitle,
    .result-meta, .result-tags, .query-tip
  ) {
    font-size: 0.76rem;
    line-height: 1.75;
    letter-spacing: 0;
  }

  .skin-library-view :deep(button),
  .mode-chip-link,
  .starmc-mode-chip-link,
  .skin-library-view :deep(.mc-button) {
    font-size: 0.68rem;
    line-height: 1.35;
    letter-spacing: 0.01em;
  }
}
</style>
