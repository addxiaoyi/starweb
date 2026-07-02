/**
 * 公开皮肤目录类型
 * 用于 SkinCatalogView（/skin 公开浏览）
 */

import type { LibraryItem } from '@/features/skin/types';

// 目录项（在线皮肤）
export type CatalogItem = LibraryItem;

// 目录列表响应
export interface CatalogListResponse {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}

// 筛选参数
export interface CatalogFilters {
  keyword?: string;
  tags?: string[];
  model?: 'all' | 'default' | 'slim';
  sort?: 'newest' | 'oldest' | 'popular';
  page?: number;
  pageSize?: number;
}
