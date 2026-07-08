import { normalizePagedResponse, parseApiError } from '@/shared/utils/apiResponse';
import { apiJsonWithAuth } from '@/shared/utils/security';

export interface SkinComment {
  id: string;
  skinId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
}

interface SkinCommentListResponse {
  items?: SkinComment[];
  total?: number;
  page?: number;
  pageSize?: number;
}

interface SkinCommentCreateResponse {
  ok?: boolean;
  item?: SkinComment;
  message?: string;
}

interface SkinCommentLikeResponse {
  ok?: boolean;
  commentId?: string;
  likeCount?: number;
  liked?: boolean;
}

export interface SkinVersionRecord {
  id: string;
  skinId: string;
  versionNumber: number;
  at: string;
  title: string;
  description: string;
  model: string;
  skinUrl: string;
  capeUrl: string;
  previewUrl: string;
  tags: string[];
  source?: Record<string, unknown>;
}

interface SkinVersionListResponse {
  items?: SkinVersionRecord[];
  total?: number;
  page?: number;
  pageSize?: number;
}

interface SkinRollbackResponse {
  ok?: boolean;
  skinId?: string;
  rolledBackToVersionId?: string;
  item?: {
    id?: string;
    name?: string;
    description?: string;
    model?: string;
    skinUrl?: string;
    capeUrl?: string;
    previewUrl?: string;
    tags?: string[];
  };
  message?: string;
}

export async function fetchSkinComments(
  skinId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<SkinCommentListResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  const path = `/api/skins/${encodeURIComponent(skinId)}/comments${qs ? `?${qs}` : ''}`;
  const { response, data } = await apiJsonWithAuth<SkinCommentListResponse>(
    path,
    null,
    { cache: 'no-store', credentials: 'include' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `评论列表加载失败 (${response.status})`));
  }
  const normalized = normalizePagedResponse(data, { page, pageSize });
  return {
    items: normalized.items,
    total: normalized.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
  };
}

export async function createSkinComment(
  skinId: string,
  content: string
): Promise<{ response: Response; data: SkinCommentCreateResponse | null }> {
  return apiJsonWithAuth<SkinCommentCreateResponse>(
    `/api/skins/${encodeURIComponent(skinId)}/comments`,
    null,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    }
  );
}

export async function deleteSkinComment(
  commentId: string
): Promise<{ response: Response; data: { ok?: boolean; message?: string } | null }> {
  return apiJsonWithAuth<{ ok?: boolean; message?: string }>(
    `/api/skins/comments/${encodeURIComponent(commentId)}`,
    null,
    {
      method: 'DELETE',
    }
  );
}

export async function likeSkinComment(
  commentId: string
): Promise<{ response: Response; data: SkinCommentLikeResponse | null }> {
  return apiJsonWithAuth<SkinCommentLikeResponse>(
    `/api/skins/comments/${encodeURIComponent(commentId)}/like`,
    null,
    {
      method: 'POST',
    }
  );
}

export async function fetchSkinVersions(
  skinId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<SkinVersionListResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  const path = `/api/skins/${encodeURIComponent(skinId)}/versions${qs ? `?${qs}` : ''}`;
  const { response, data } = await apiJsonWithAuth<SkinVersionListResponse>(
    path,
    null,
    { cache: 'no-store', credentials: 'include' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `版本历史加载失败 (${response.status})`));
  }
  const normalized = normalizePagedResponse(data, { page, pageSize });
  return {
    items: normalized.items,
    total: normalized.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
  };
}

export async function rollbackSkinVersion(
  skinId: string,
  payload: { versionId?: string; versionIndex?: number; note?: string }
): Promise<{ response: Response; data: SkinRollbackResponse | null }> {
  return apiJsonWithAuth<SkinRollbackResponse>(
    `/api/skins/${encodeURIComponent(skinId)}/rollback`,
    null,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}
