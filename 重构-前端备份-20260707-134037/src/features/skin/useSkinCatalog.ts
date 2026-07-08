/**
 * 皮肤目录 Hook（SkinStationView 内部使用）
 * 用于登录后从皮肤数据库中检索并选择方案
 */

import { ref } from 'vue';
import { searchSkinLibrary } from './api';
import type { CatalogItem } from '@/components/molecules/Skin/SkinCatalogCard.vue';
import type { LibraryItem } from './types';

interface UseSkinCatalogOptions {
  isLoggedIn: () => boolean;
  emailVerified: () => boolean;
  onSelected?: () => void | Promise<void>;
}

export function useSkinCatalog(_options: UseSkinCatalogOptions) {
  const catalog = ref<CatalogItem[]>([]);
  const catalogLoading = ref(false);
  const catalogFetchError = ref('');

  async function fetchCatalog() {
    catalogLoading.value = true;
    catalogFetchError.value = '';
    try {
      const { data } = await searchSkinLibrary('');
      catalog.value = (data?.items ?? []).map((item: LibraryItem) => ({
        id: String(item.id ?? ''),
        title: item.name ?? `方案 #${item.id}`,
        tag: item.source ?? '皮肤站',
        cover: item.previewUrl ?? item.skinUrl ?? '/image/steve.png',
        desc: '',
        skinTextureUrl: item.skinUrl,
        capeTextureUrl: item.capeUrl,
        model: item.model,
      }));
    } catch {
      catalogFetchError.value = '加载失败，请稍后重试';
    } finally {
      catalogLoading.value = false;
    }
  }

  function selectCatalogItem(item: CatalogItem) {
    void item;
    _options.onSelected?.();
  }

  return {
    catalog,
    catalogLoading,
    catalogFetchError,
    fetchCatalog,
    selectCatalogItem,
  };
}
