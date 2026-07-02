<template>
  <div class="favorites-view page-shell">
    <header class="favorites-header page-hero">
      <h1 class="starmc-brand-glow page-hero__title">
        <AppIcon name="heart" :size="28" class="heading-icon" />
        我的收藏
      </h1>
      <p class="subtitle page-hero__subtitle" data-typography="prose">
        共收藏 {{ totalFavorites }} 个皮肤
      </p>
      <div class="header-actions">
        <button type="button" class="mc-button secondary" @click="refreshFavorites" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新收藏' }}
        </button>
        <RouterLink to="/skin/library" class="mc-button">去皮肤库</RouterLink>
      </div>
    </header>

    <section class="favorites-section">
      <AppStatePanel
        v-if="loading"
        variant="loading"
        eyebrow="Favorites"
        title="正在加载收藏内容..."
        message="我们正在从你的收藏列表中同步最新数据。"
        class="favorites-state-panel"
      />

      <AppStatePanel
        v-else-if="error"
        variant="error"
        eyebrow="Favorites"
        title="收藏加载失败"
        :message="error"
        hint="请稍后重试，或先前往皮肤库重新同步。"
        class="favorites-state-panel"
      >
        <template #actions>
          <button type="button" class="mc-button primary" @click="refreshFavorites">重试</button>
        </template>
      </AppStatePanel>

      <AppStatePanel
        v-else-if="displayedFavorites.length === 0"
        variant="empty"
        eyebrow="Favorites"
        title="还没有收藏任何皮肤"
        :message="tagFilter ? '当前筛选条件下没有找到收藏内容。' : '去皮肤库发现喜欢的皮肤吧。'"
        hint="收藏后，你可以更快地回到常用皮肤。"
        class="favorites-state-panel"
      >
        <template #icon>
          <AppIcon name="heart" :size="64" class="empty-icon" />
        </template>
        <template #actions>
          <RouterLink to="/skin/library" class="mc-button primary">
            <AppIcon name="database" :size="16" />
            浏览皮肤库
          </RouterLink>
        </template>
      </AppStatePanel>

      <template v-else>
        <div class="favorites-toolbar starmc-list-group">
          <button type="button" class="mc-button secondary small" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">网格</button>
          <button type="button" class="mc-button secondary small" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表</button>
          <button type="button" class="mc-button secondary small" :disabled="!tagFilter" @click="clearFavoritesFilter">清空筛选</button>
          <span v-if="tagFilter" class="filter-chip starmc-badge is-info">
            标签：{{ tagFilter }}
          </span>
        </div>

        <div :class="['favorites-grid', viewMode]">
          <article
            v-for="item in paginatedFavorites"
            :key="item.id"
            class="favorite-card starmc-list-item"
          >
            <div class="card-preview">
              <img
                :src="item.previewUrl || item.skinUrl"
                :alt="item.skinName"
                class="skin-image"
                @error="handleImageError"
              >
              <div class="card-overlay">
                <button
                  type="button"
                  class="action-btn remove"
                  @click="removeFromFavorites(item.skinId)"
                  title="取消收藏"
                >
                  <AppIcon name="trash" :size="16" />
                </button>
                <button
                  type="button"
                  class="action-btn apply"
                  @click="applySkin(item)"
                  title="应用皮肤"
                >
                  <AppIcon name="check" :size="16" />
                </button>
              </div>
            </div>
            <div class="card-info">
              <h4 class="skin-name">{{ item.skinName }}</h4>
              <div class="skin-meta starmc-list-group">
                <span class="starmc-badge is-info model-tag">{{ item.model || 'auto' }}</span>
                <span class="starmc-badge is-info date">{{ formatDate(item.createdAt) }}</span>
              </div>
              <div v-if="item.tags?.length" class="skin-tags starmc-list-group">
                <button
                  v-for="tag in item.tags.slice(0, 3)"
                  :key="tag"
                  type="button"
                  class="starmc-badge tag"
                  @click="filterByTag(tag)"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
          </article>
        </div>

        <div v-if="totalPages > 1" class="pagination starmc-list-group">
          <button
            type="button"
            class="starmc-list-item page-btn"
            :disabled="currentPage === 1 || loading"
            @click="changePage(currentPage - 1)"
          >
            <AppIcon name="chevronLeft" :size="16" />
          </button>
          <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button
            type="button"
            class="page-btn"
            :disabled="currentPage === totalPages || loading"
            @click="changePage(currentPage + 1)"
          >
            <AppIcon name="chevronRight" :size="16" />
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/atoms/AppIcon.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import { useFavorite } from '@/features/skin/useFavorite';
import { useToastStore } from '@/stores/toast';
import type { FavoriteItem } from '@/features/skin/api-favorite';

const toast = useToastStore();
const { favoriteList, loading, totalFavorites, fetchFavorites, toggleFavorite } = useFavorite();

const currentPage = ref(1);
const pageSize = 12;
const viewMode = ref<'grid' | 'list'>('grid');
const tagFilter = ref('');
const error = ref('');

const displayedFavorites = computed(() => {
  if (!tagFilter.value) return favoriteList.value;
  return favoriteList.value.filter((item) => (item.tags || []).includes(tagFilter.value));
});

const totalPages = computed(() => Math.max(1, Math.ceil(displayedFavorites.value.length / pageSize)));
const paginatedFavorites = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return displayedFavorites.value.slice(start, start + pageSize);
});

onMounted(() => {
  void loadFavorites();
});

async function loadFavorites() {
  error.value = '';
  try {
    await fetchFavorites(currentPage.value, pageSize);
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
      await fetchFavorites(currentPage.value, pageSize);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载收藏失败';
  }
}

async function refreshFavorites() {
  await loadFavorites();
}

function clearFavoritesFilter() {
  tagFilter.value = '';
  currentPage.value = 1;
  void loadFavorites();
}

function filterByTag(tag: string) {
  tagFilter.value = tagFilter.value === tag ? '' : tag;
  currentPage.value = 1;
}

async function changePage(page: number) {
  currentPage.value = page;
  await loadFavorites();
}

async function removeFromFavorites(skinId: string) {
  try {
    await toggleFavorite(skinId);
    await loadFavorites();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '取消收藏失败';
  }
}

function applySkin(item: FavoriteItem) {
  toast.addToast({
    type: 'info',
    message: `正在应用皮肤：${item.skinName}`
  });
}

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement | null;
  if (target) {
    target.src = '/images/skin-placeholder.png';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
</script>

<style scoped lang="scss">
.favorites-view {
  padding: 2rem 0;
}

.favorites-header {
  text-align: center;
  margin-bottom: 2rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.favorites-section {
  min-height: 400px;
}

.favorites-state-panel {
  margin-bottom: 0;
}

.empty-icon {
  opacity: 0.3;
}

.favorites-toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 1rem;
}

.filter-chip {
  margin-left: auto;
}

.favorites-grid {
  display: grid;
  gap: 1.5rem;
}

.favorites-grid.grid {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.favorites-grid.list {
  grid-template-columns: 1fr;
}

.favorite-card {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid #444;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s, border-color 0.2s;

  &:hover {
    transform: translateY(-4px);
    border-color: var(--accent-color, #00d4ff);
  }
}

.card-preview {
  position: relative;
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.2);

  .skin-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }

  .card-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .card-overlay {
    opacity: 1;
  }
}

.action-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }

  &.remove {
    background: #ef4444;
    color: white;
  }

  &.apply {
    background: #22c55e;
    color: white;
  }
}

.card-info {
  padding: 1rem;
}

.skin-name {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skin-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;

  .model-tag {
    color: var(--accent-color, #00d4ff);
    text-transform: uppercase;
  }

  .date {
    color: var(--text-secondary);
  }
}

.skin-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.tag {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  color: var(--text-secondary);
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;

  .page-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 1px solid #555;
    background: rgba(0, 0, 0, 0.3);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      border-color: var(--accent-color, #00d4ff);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .page-info {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
}
</style>
