/**
 * 皮肤目录 API（公开浏览）
 * 用于 SkinCatalogView
 */

import { fetchJsonWithHealthFallback } from '@/shared/utils/security';
import type { CatalogListResponse, CatalogFilters } from '@/types/skin-catalog';
import type { LibraryItem } from './types';

/** 空列表兜底 */
const NULL_LIST: CatalogListResponse = Object.assign(Object.create(null), {
  items: [],
  total: 0,
  page: 1,
  pageSize: 24,
});

/** 搜索皮肤库（支持公开访问） */
export async function fetchCatalogItems(filters: CatalogFilters = {}): Promise<CatalogListResponse> {
  const params = new URLSearchParams();

  if (filters.keyword?.trim()) {
    params.set('q', filters.keyword.trim());
  }
  if (filters.model && filters.model !== 'all') {
    params.set('model', filters.model);
  }
  if (filters.sort) {
    params.set('sort', filters.sort);
  }
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 24));

  const qs = params.toString();
  const path = `/api/skins/catalog${qs ? `?${qs}` : ''}`;

  const data = await fetchJsonWithHealthFallback<CatalogListResponse>(
    path,
    { credentials: 'include' },
    NULL_LIST
  );
  return data ?? NULL_LIST;
}

/** 获取皮肤详情 */
export async function fetchCatalogItem(id: string): Promise<LibraryItem | null> {
  return await fetchJsonWithHealthFallback<LibraryItem>(
    `/api/skins/catalog/${id}`,
    { credentials: 'include' },
    null
  );
}

/** 获取热门标签 */
export async function fetchPopularTags(): Promise<string[]> {
  const data = await fetchJsonWithHealthFallback<{ tags?: string[] }>(
    '/api/skins/tags/popular',
    { credentials: 'include' },
    { tags: [] }
  );
  return data?.tags ?? [];
}
