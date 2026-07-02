/**
 * 皮肤目录视图
 * 公开浏览所有在线皮肤，支持搜索/筛选/预览/分页
 * 路由：/skin
 */

<template>
  <div class="page-shell skin-catalog-view">

    <!-- ========== Hero Header ========== -->
    <header class="catalog-hero page-hero">
      <div class="hero-text">
        <p class="page-hero__eyebrow">Skin Library</p>
        <h1 class="hero-title page-hero__title">
          <AppIcon name="shirt" :size="28" class="heading-icon" />
          皮肤库
        </h1>
        <p class="hero-sub page-hero__lede">浏览并应用社区投稿的皮肤资源</p>
      </div>
      <!-- 快捷标签 -->
      <div v-if="popularTags.length" class="hero-tags starmc-list-group" aria-label="热门标签">
        <button
          v-for="tag in popularTags"
          :key="tag"
          class="starmc-badge tag-chip"
          :class="{ active: filters.keyword === tag }"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </header>

    <!-- ========== 搜索 & 筛选栏 ========== -->
    <section class="filter-bar glass-panel panel-hover" aria-label="皮肤库筛选">
      <div class="filter-top">
        <div class="search-wrap">
          <span class="search-decor" aria-hidden="true">
            <AppIcon name="search" :size="18" />
          </span>
          <input
            v-model="searchInput"
            type="search"
            class="ui-input search-input"
            placeholder="搜索皮肤名称 / 标签 / 玩家"
            @input="onSearchInput"
            @keyup.enter="commitSearch"
          />
          <button v-if="searchInput" class="clear-btn" @click="clearSearch" aria-label="清空搜索">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <label class="sort-wrap" aria-label="排序方式">
          <span class="sort-label">排序</span>
          <select v-model="sortSelect" class="ui-input sort-select" @change="onSortChange">
            <option value="newest">最新</option>
            <option value="oldest">最早</option>
            <option value="popular">最热</option>
          </select>
        </label>
      </div>

      <div class="filter-bottom">
        <div class="model-tabs" role="group" aria-label="模型筛选">
          <button
            v-for="opt in MODEL_OPTIONS"
            :key="opt.value"
            class="model-tab"
            :class="{ active: filters.model === opt.value }"
            @click="setModel(opt.value)"
          >
            <span class="model-icon">{{ opt.icon }}</span>
            <span>{{ opt.label }}</span>
          </button>
        </div>
        <div class="filter-summary">当前模型：{{ modelLabel(filters.model) }}</div>
        <button type="button" class="reset-filters ui-btn secondary" @click="resetSearchFilters" :disabled="state.loading && !state.items.length">
          重置筛选
        </button>
      </div>
    </section>

    <!-- ========== 结果统计 ========== -->
    <div class="result-meta starmc-list-item" aria-live="polite">
      <span v-if="!state.loading && state.total > 0" class="starmc-badge is-info">
        共 <strong>{{ state.total }}</strong> 个皮肤
      </span>
      <span v-if="state.loading" class="starmc-badge is-info loading-hint">加载中…</span>
    </div>

    <!-- ========== 皮肤卡片网格 ========== -->
    <main class="catalog-grid" aria-label="皮肤列表">
      <!-- 骨架屏 -->
      <template v-if="state.loading">
        <div v-for="i in 12" :key="i" class="card-skeleton">
          <div class="skel skel-cover"></div>
          <div class="skel skel-title"></div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else-if="!hasItems && !state.error" class="grid-empty glass-panel fade-rise-enter-active" aria-live="polite">
        <div class="empty-visual" aria-hidden="true">
          <div class="empty-orb empty-orb--one"></div>
          <div class="empty-orb empty-orb--two"></div>
          <AppIcon name="database" class="empty-icon" :size="34" />
        </div>
        <div class="empty-copy">
          <p class="empty-title">当前还没有皮肤</p>
          <p class="empty-lede">
            {{ searchInput ? '没有找到匹配结果，试试换个关键词或清空筛选。' : '稍后同步服务器数据后，这里会展示可浏览的皮肤资源。' }}
          </p>
        </div>
        <div class="empty-actions">
          <button v-if="searchInput" class="ui-btn primary" @click="clearSearch">
            <AppIcon name="refresh" />
            清空筛选
          </button>
          <button v-else class="ui-btn secondary" @click="loadCatalog">
            <AppIcon name="refresh" />
            重新加载
          </button>
          <RouterLink to="/skin/manage" class="ui-btn ghost">
            <AppIcon name="shirt" />
            打开皮肤站
          </RouterLink>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="state.error && !hasItems" class="grid-error" role="alert">
        <AppIcon name="warning" class="err-icon" />
        <p>{{ state.error }}</p>
        <button class="ui-btn secondary" @click="loadCatalog">重试</button>
      </div>

      <!-- 卡片网格 -->
      <template v-else>
        <div
          v-for="item in state.items"
          :key="item.id"
          class="catalog-card-wrap starmc-list-item card-hover"
        >
          <SkinCatalogCard
            :item="toCardItem(item)"
            @select="openPreview(item)"
          />
        </div>
      </template>
    </main>

    <!-- ========== 分页 ========== -->
    <nav v-if="totalPages > 1" class="pagination starmc-list-group panel-hover" aria-label="列表分页">
      <button
        class="starmc-list-item page-btn"
        :disabled="state.page <= 1"
        @click="goPage(state.page - 1)"
        aria-label="上一页"
      >
        <AppIcon name="arrowLeft" />
      </button>

      <div class="page-numbers starmc-list-group">
        <template v-for="p in visiblePages" :key="p">
          <span v-if="p === '...'" class="page-ellipsis">…</span>
          <button
            v-else
            class="page-num"
            :class="{ current: p === state.page }"
            @click="goPage(Number(p))"
            :aria-current="p === state.page ? 'page' : undefined"
          >
            {{ p }}
          </button>
        </template>
      </div>

      <button
        class="page-btn"
        :disabled="state.page >= totalPages"
        @click="goPage(state.page + 1)"
        aria-label="下一页"
      >
        <AppIcon name="chevronRight" />
      </button>
    </nav>

    <!-- ========== 预览抽屉 ========== -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="previewItem"
          class="preview-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="`${previewItem.name ?? '皮肤'} 预览`"
        >
          <div class="drawer-backdrop" @click="closePreview"></div>
          <div class="drawer-panel glass-panel panel-hover">
            <!-- 关闭按钮 -->
            <button class="drawer-close" @click="closePreview" aria-label="关闭预览">
              <AppIcon name="close" />
            </button>

            <!-- 3D 预览 -->
            <div class="drawer-preview">
              <SkinPreview
                :skin-url="previewItem.skinUrl ?? previewItem.previewUrl ?? ''"
                :cape-url="previewItem.capeUrl"
                :model="previewModel"
                class="preview-3d"
              />
            </div>

            <!-- 皮肤信息 -->
            <div class="drawer-info">
              <h2 class="drawer-title">{{ previewItem.name ?? '未命名皮肤' }}</h2>

              <div class="drawer-meta">
                <span class="model-badge" :class="`model-${previewItem.model ?? 'default'}`">
                  {{ MODEL_NAME_MAP[previewItem.model ?? 'default'] ?? previewItem.model }}
                </span>
                <span v-if="previewItem.source" class="source-tag">
                  <AppIcon name="network" :size="12" />
                  {{ previewItem.source }}
                </span>
              </div>

              <p v-if="previewItem.updatedAt" class="drawer-date">
                更新于 {{ formatDate(previewItem.updatedAt) }}
              </p>
            </div>

            <!-- 操作区 -->
            <div class="drawer-actions">
              <template v-if="auth.isLoggedIn">
                <button class="ui-btn primary w-full" @click="applySkin(previewItem)">
                  <AppIcon name="checkCircle" />
                  应用到我的角色
                </button>
                <p class="apply-hint">皮肤将同步到服务器生效</p>
              </template>
              <template v-else>
                <RouterLink to="/skin/manage" class="ui-btn primary w-full">
                  <AppIcon name="lock" />
                  登录后应用此皮肤
                </RouterLink>
                <p class="apply-hint">需要一个服务器账号</p>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/atoms/AppIcon.vue';
import SkinCatalogCard from '@/components/molecules/Skin/SkinCatalogCard.vue';
import SkinPreview from '@/components/organisms/Skin/SkinPreview.vue';
import { useAuthStore } from '@/stores/auth';
import { useSkinBrowser } from '@/features/skin/useSkinBrowser';
import type { CatalogItem } from '@/components/molecules/Skin/SkinCatalogCard.vue';
import type { LibraryItem } from '@/features/skin/types';

const auth = useAuthStore()
const {
  state,
  popularTags,
  previewItem,
  filters,
  totalPages,
  hasItems,
  modelLabel,
  loadCatalog,
  setKeyword,
  commitSearch,
  setModel,
  setSort,
  resetFilters,
  goPage,
  openPreview,
  closePreview,
} = useSkinBrowser()

const searchInput = ref(filters.keyword ?? '')
const sortSelect = ref(filters.sort ?? 'newest')

const MODEL_OPTIONS = [
  { value: 'all', label: '全部模型', icon: '🧩' },
  { value: 'default', label: '经典体型', icon: '🧍' },
  { value: 'slim', label: '纤细体型', icon: '🧑' },
] as const

watch(() => filters.keyword, (value) => {
  if (value !== searchInput.value) searchInput.value = value ?? ''
})

watch(() => filters.sort, (value) => {
  if (value && value !== sortSelect.value) sortSelect.value = value
})

function onSearchInput() {
  setKeyword(searchInput.value)
}

function clearSearch() {
  searchInput.value = ''
  setKeyword('')
  commitSearch()
}

function resetSearchFilters() {
  searchInput.value = ''
  sortSelect.value = 'newest'
  resetFilters()
  commitSearch()
}

function onSortChange() {
  setSort(sortSelect.value as typeof filters.sort)
}

const previewModel = computed<'auto' | 'default' | 'slim'>(() => {
  const m = previewItem.value?.model
  if (m === 'default' || m === 'slim') return m
  return 'auto'
})

const filterSummary = computed(() => {
  const parts = []
  if (filters.keyword) parts.push(`关键词: ${filters.keyword}`)
  if (filters.sort) parts.push(`排序: ${filters.sort}`)
  if (filters.model) parts.push(`模型: ${modelLabel(filters.model)}`)
  return parts.length ? parts.join(' · ') : '未设置筛选'
})

function toggleTag(tag: string) {
  if (filters.keyword === tag) {
    searchInput.value = ''
    setKeyword('')
  } else {
    searchInput.value = tag
    setKeyword(tag)
  }
}

const visiblePages = computed<(number | '...')[]>(() => {
  const total = totalPages.value;
  const cur = state.page;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];
  if (cur > 3) pages.push('...');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) {
    pages.push(p);
  }
  if (cur < total - 2) pages.push('...');
  pages.push(total);
  return pages;
});

// ========== LibraryItem → SkinCatalogCard.Item ==========
function toCardItem(item: LibraryItem): CatalogItem {
  return {
    id: item.id,
    title: item.name ?? `皮肤 #${item.id}`,
    tag: item.source ?? '社区',
    cover: item.previewUrl ?? item.skinUrl ?? '/image/steve.png',
    skinTextureUrl: item.skinUrl,
    capeTextureUrl: item.capeUrl,
    model: item.model,
  };
}

// ========== 应用皮肤 ==========
function applySkin(item: LibraryItem) {
  // 跳转到管理页面引导用户完成应用
  window.location.href = `/skin/manage?apply=${item.id}`;
}

// ========== 工具函数 ==========
const MODEL_NAME_MAP: Record<string, string> = {
  auto: '自动检测',
  default: '经典体型',
  slim: '纤细体型',
  other: '其他模型',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
</script>

<style scoped>
/* === Layout === */
.skin-catalog-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 100%;
}

/* === Hero === */
.catalog-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.hero-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.hero-sub {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
}
.hero-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tag-chip {
  font-size: 0.75rem;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.tag-chip:hover {
  border-color: rgba(59, 130, 246, 0.5);
  color: rgba(59, 130, 246, 0.9);
}
.tag-chip.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.5);
  color: #60a5fa;
}

/* === Filter Bar === */
.filter-bar {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
}
.filter-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.filter-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
  align-items: center;
  justify-content: space-between;
}

.filter-summary {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin-right: auto;
}

.reset-filters {
  margin-left: auto;
  white-space: nowrap;
}
.search-wrap {
  position: relative;
  min-width: 200px;
}
.search-decor {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  display: inline-flex;
}
.search-input {
  width: 100%;
  padding-left: 40px;
  padding-right: 42px;
}
.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  color: var(--text-muted);
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}
.clear-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-50%) scale(1.04);
}
.sort-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.sort-label {
  color: var(--text-muted);
  font-size: 0.78rem;
  white-space: nowrap;
}
.model-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.model-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
}
.model-tab:hover {
  transform: translateY(-1px);
  border-color: rgba(124, 140, 255, 0.35);
  color: #d9e2ff;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
}
.model-tab.active {
  background: linear-gradient(180deg, rgba(124, 140, 255, 0.18), rgba(92, 109, 232, 0.12));
  border-color: rgba(124, 140, 255, 0.45);
  color: #eef2ff;
}
.model-icon {
  font-size: 0.9rem;
}
.sort-select {
  min-width: 108px;
}

/* === Result Meta === */
.result-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  padding: 0 2px;
}
.loading-hint {
  opacity: 0.6;
}

/* === Grid === */
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.catalog-card-wrap {
  transition: transform var(--motion-base) var(--ease-standard);
}
.catalog-card-wrap:hover {
  transform: translateY(-2px);
}

/* Skeleton */
.card-skeleton {
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.skel {
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 75%);
  background-size: 220% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
.skel-cover { height: 150px; border-radius: 12px; }
.skel-title { height: 14px; width: 72%; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Empty / Error */
.grid-empty,
.grid-error {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 72px 24px;
  color: var(--text-muted);
  text-align: center;
}

.grid-empty {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.08);
  background:
    radial-gradient(circle at 20% 20%, rgba(124, 140, 255, 0.12), transparent 34%),
    radial-gradient(circle at 80% 30%, rgba(53, 201, 255, 0.1), transparent 28%),
    rgba(255,255,255,0.025);
}

.empty-visual {
  position: relative;
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: 999px;
}

.empty-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
}

.empty-orb--one {
  inset: -8px;
  background: rgba(124, 140, 255, 0.18);
}

.empty-orb--two {
  inset: 10px;
  background: rgba(53, 201, 255, 0.12);
}

.empty-icon, .err-icon {
  position: relative;
  width: 34px;
  height: 34px;
  opacity: 0.86;
  color: rgba(214, 223, 255, 0.75);
}

.empty-copy {
  display: grid;
  gap: 6px;
}

.empty-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.empty-lede {
  margin: 0;
  max-width: 30rem;
  line-height: 1.7;
  color: var(--text-muted);
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.empty-actions .ui-btn {
  min-width: 138px;
}

/* ========== Preview Drawer ========== */
.preview-drawer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(5, 8, 15, 0.52);
  backdrop-filter: blur(8px);
}
.drawer-panel {
  position: relative;
  width: min(520px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  overflow-y: auto;
  border-radius: 20px 0 0 20px;
  border-left: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(16, 22, 36, 0.98), rgba(12, 16, 28, 0.96));
}
.drawer-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
}
.drawer-close:hover {
  transform: rotate(6deg) scale(1.03);
  background: rgba(248, 113, 113, 0.14);
  border-color: rgba(248, 113, 113, 0.4);
  color: #f87171;
}
.drawer-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-base);
  border-radius: 12px;
  padding: 20px;
  min-height: 240px;
}
.preview-3d {
  width: 200px;
  height: 300px;
}
.drawer-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drawer-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.drawer-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.model-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.model-default { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
.model-slim { background: rgba(52, 211, 153, 0.15); color: #34d399; }
.model-auto { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
.source-tag {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.drawer-date {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}
.drawer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 16px;
}
.apply-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  margin: 0;
}
.w-full { width: 100%; }

/* Drawer transition */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.25s ease;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(100%);
}

/* === Pagination === */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0;
}
.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.page-numbers {
  display: flex;
  gap: 4px;
}
.page-num {
  min-width: 34px;
  height: 34px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}
.page-num:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.page-num.current {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #60a5fa;
  font-weight: 600;
}
.page-ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* === Responsive === */
@media (max-width: 768px) {
  .skin-catalog-view {
    gap: 12px;
    padding: 16px 16px 88px;
  }

  .catalog-hero {
    gap: 12px;
  }

  .hero-tags {
    width: 100%;
  }

  .filter-bar {
    gap: 12px;
    padding: 14px;
  }

  .filter-top {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .sort-wrap {
    width: 100%;
    justify-content: space-between;
  }

  .sort-select {
    width: 100%;
    min-width: 0;
  }

  .filter-bottom {
    padding: 10px;
  }

  .model-tabs {
    width: 100%;
  }

  .model-tab {
    flex: 1 1 calc(33.333% - 8px);
    justify-content: center;
  }

  .catalog-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .grid-empty,
  .grid-error {
    padding: 56px 18px;
  }

  .empty-visual {
    width: 72px;
    height: 72px;
  }

  .empty-icon,
  .err-icon {
    width: 28px;
    height: 28px;
  }

  .empty-actions {
    flex-direction: column;
    width: 100%;
  }

  .empty-actions .ui-btn {
    width: 100%;
  }

  .preview-drawer {
    justify-content: center;
    align-items: flex-end;
  }

  .drawer-panel {
    width: 100%;
    max-height: 86vh;
    border-radius: 20px 20px 0 0;
    padding: 18px 16px 20px;
  }

  .drawer-preview {
    min-height: 210px;
    padding: 16px;
  }

  .preview-3d {
    width: 180px;
    height: 260px;
  }

  .pagination {
    flex-wrap: wrap;
    gap: 6px;
  }

  .page-numbers {
    gap: 3px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .page-btn,
  .page-num,
  .page-ellipsis {
    width: 32px;
    height: 32px;
  }
}

@media (max-width: 600px) {
  .catalog-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
