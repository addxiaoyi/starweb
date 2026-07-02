/**
 * 皮肤目录 Hook
 * 用于 SkinCatalogView
 */

import { computed, onScopeDispose, reactive, ref } from 'vue';
import { fetchCatalogItems, fetchPopularTags } from './api-catalog';
import type { CatalogItem, CatalogFilters } from '@/types/skin-catalog';

export function useSkinBrowser() {
  // ========== 状态 ==========
  const state = reactive({
    items: [] as CatalogItem[],
    total: 0,
    page: 1,
    pageSize: 24,
    loading: false,
    error: '',
  });

  const popularTags = ref<string[]>([]);

  // 当前预览的皮肤
  const previewItem = ref<CatalogItem | null>(null);

  // 筛选状态（与路由同步后可直接从 router 取）
  const filters = reactive<CatalogFilters>({
    keyword: '',
    model: 'all',
    sort: 'newest',
    page: 1,
  });

  // ========== 计算属性 ==========
  const totalPages = computed(() => Math.ceil(state.total / state.pageSize));

  const hasItems = computed(() => state.items.length > 0);

  function modelLabel(model: CatalogFilters['model'] = filters.model) {
    const map: Record<string, string> = {
      all: '全部模型',
      default: 'Steve',
      slim: 'Alex',
    };
    const key = model ?? 'all';
    return map[key] ?? key;
  }

  // ========== 加载目录 ==========
  async function loadCatalog() {
    state.loading = true;
    state.error = '';
    try {
      const res = await fetchCatalogItems({
        ...filters,
        page: state.page,
        pageSize: state.pageSize,
      });
      state.items = res.items;
      state.total = res.total;
    } catch (err) {
      state.error = err instanceof Error ? err.message : '加载失败';
    } finally {
      state.loading = false;
    }
  }

  // ========== 加载热门标签 ==========
  async function loadTags() {
    const tags = await fetchPopularTags();
    popularTags.value = tags.slice(0, 12);
  }

  // ========== 搜索（防抖） ==========
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function setKeyword(kw: string) {
    filters.keyword = kw;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.page = 1;
      loadCatalog();
    }, 300);
  }

  function commitSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    state.page = 1;
    loadCatalog();
  }

  // ========== 筛选 ==========
  function setModel(model: CatalogFilters['model']) {
    filters.model = model;
    state.page = 1;
    loadCatalog();
  }

  function setSort(sort: CatalogFilters['sort']) {
    filters.sort = sort;
    state.page = 1;
    loadCatalog();
  }

  function resetFilters() {
    filters.keyword = '';
    filters.model = 'all';
    filters.sort = 'newest';
    filters.page = 1;
    state.page = 1;
    loadCatalog();
  }

  // ========== 分页 ==========
  function goPage(p: number) {
    state.page = p;
    loadCatalog();
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== 预览 ==========
  function openPreview(item: CatalogItem) {
    previewItem.value = item;
  }

  function closePreview() {
    previewItem.value = null;
  }

  onScopeDispose(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  // ========== 初始化 ==========
  loadCatalog();
  loadTags();

  return {
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
  };
}
