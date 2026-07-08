import { apiJsonWithAuth, fetchJsonWithHealthFallback } from '@/shared/utils/security';
import type {
  ApiMessageResponse,
  LibraryItem,
  LibrarySyncStatusResponse,
  SkinApplyPayload
} from './types';

/**
 * 搜索皮肤库
 * 注意：HTTP-only Cookie 会自动随请求发送，无需手动传递 token
 */
export async function searchSkinLibrary(keyword: string) {
  const q = encodeURIComponent(keyword.trim());
  const ts = Date.now();
  const path = q
    ? `/api/skins/library/search?q=${q}&t=${ts}`
    : `/api/skins/library/search?t=${ts}`;
  return apiJsonWithAuth<{ items?: LibraryItem[]; message?: string }>(path, null, {
    cache: 'no-store'
  });
}

/**
 * 同步皮肤库
 */
export async function syncSkinLibrary() {
  const data = await fetchJsonWithHealthFallback<ApiMessageResponse>(
    `/api/skins/library/sync?t=${Date.now()}`,
    {
      method: 'POST',
      cache: 'no-store'
    },
    { ok: false, message: '服务暂不可用' }
  );
  return {
    response: new Response(null, { status: data?.ok ? 200 : 503 }),
    data
  };
}

/**
 * 读取皮肤库同步状态（含版本与 SSE 元信息）
 */
export async function fetchLibrarySyncStatus() {
  const data = await fetchJsonWithHealthFallback<LibrarySyncStatusResponse>(
    `/api/skins/library/sync-status?t=${Date.now()}`,
    { cache: 'no-store' },
    { ok: false, items: [] }
  );
  return data ?? { ok: false, items: [] };
}

/**
 * 创建皮肤库实时流（SSE）。
 * 返回 null 表示当前运行环境不支持 EventSource。
 */
export function createLibrarySyncEventSource(streamPath = '/api/skins/library/stream'): EventSource | null {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    return null;
  }
  return new EventSource(streamPath, { withCredentials: true });
}

/**
 * 应用皮肤到玩家
 */
export async function applySkinAssets(payload: SkinApplyPayload) {
  return apiJsonWithAuth<ApiMessageResponse>('/api/skin/apply', null, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uuid: payload.uuid,
      skinAssetId: payload.skinAssetId,
      capeAssetId: payload.capeAssetId,
      slot: payload.slot || 'default'
    })
  });
}
