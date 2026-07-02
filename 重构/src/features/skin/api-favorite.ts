import { parseApiError, normalizePagedResponse } from '@/shared/utils/apiResponse';
import { apiJsonWithAuth } from '@/shared/utils/security';
import type { ApiMessageResponse } from './types';

export interface FavoriteItem {
  id: string;
  skinId: string;
  skinName: string;
  skinUrl: string;
  previewUrl?: string;
  model?: string;
  tags?: string[];
  createdAt: string;
}

export interface FavoritesResponse {
  items: FavoriteItem[];
  total: number;
  page: number;
  pageSize: number;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
    hasPrev: boolean;
  };
}

/**
 * 获取收藏列表
 */
export async function getFavorites(page = 1, pageSize = 20): Promise<FavoritesResponse> {
  const path = `/api/skins/favorites?page=${page}&pageSize=${pageSize}&t=${Date.now()}`;
  const { response, data } = await apiJsonWithAuth<FavoritesResponse>(path, null, {
    cache: 'no-store',
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `收藏列表加载失败 (${response.status})`));
  }
  const normalized = normalizePagedResponse(data, { page, pageSize });
  return {
    items: normalized.items,
    total: normalized.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pagination: normalized.pagination
  };
}

/**
 * 添加收藏
 */
export async function addFavorite(skinId: string): Promise<ApiMessageResponse> {
  const { response, data } = await apiJsonWithAuth<ApiMessageResponse>('/api/skins/favorites', null, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ skinId })
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `收藏失败 (${response.status})`));
  }
  return data ?? { ok: true, message: '已收藏' };
}

/**
 * 取消收藏
 */
export async function removeFavorite(skinId: string): Promise<ApiMessageResponse> {
  const { response, data } = await apiJsonWithAuth<ApiMessageResponse>(`/api/skins/favorites/${skinId}`, null, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `取消收藏失败 (${response.status})`));
  }
  return data ?? { ok: true, message: '已取消收藏' };
}

/**
 * 检查是否已收藏
 */
export async function checkFavorite(skinId: string): Promise<{ isFavorite: boolean }> {
  const path = `/api/skins/favorites/check?skinId=${skinId}&t=${Date.now()}`;
  const { response, data } = await apiJsonWithAuth<{ isFavorite: boolean }>(path, null, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `收藏状态检查失败 (${response.status})`));
  }
  return { isFavorite: Boolean(data?.isFavorite) };
}
