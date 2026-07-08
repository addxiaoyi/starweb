/**
 * 审核中心 API
 */

import { normalizePagedResponse, parseApiError } from '@/shared/utils/apiResponse';
import { apiJsonWithAuth } from '@/shared/utils/security';
import type {
  ReviewAction,
  ReviewActionResponse,
  ReviewHistoryResponse,
  ReviewListResponse,
  ReviewRecord,
  ReviewReopenResponse,
  SubmissionStatus,
} from '@/types/skin-review';

interface RawReviewItem {
  id?: string;
  userId?: string;
  submitter?: string;
  authorName?: string;
  title?: string;
  description?: string;
  tags?: string[];
  skinUrl?: string;
  capeUrl?: string | null;
  status?: SubmissionStatus;
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewerId?: string;
  reviewerName?: string;
  reviewNote?: string;
  reviewVersion?: number;
}

interface RawReviewListResponse {
  items?: RawReviewItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  pagination?: {
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    hasMore?: boolean;
    hasPrev?: boolean;
  };
}

const BASE = '/api/skins/submissions';

function toReviewRecord(item: RawReviewItem): ReviewRecord {
  const skinUrl = String(item.skinUrl || '');
  const capeUrl = item.capeUrl ? String(item.capeUrl) : '';
  const title = String(item.title || item.id || '未命名投稿');
  return {
    id: String(item.id || ''),
    authorId: String(item.userId || ''),
    authorName: String(item.submitter || item.authorName || ''),
    title,
    description: String(item.description || ''),
    tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t)).filter(Boolean) : [],
    skinFile: {
      url: skinUrl,
      size: 0,
      filename: title,
    },
    capeFile: capeUrl
      ? {
          url: capeUrl,
          size: 0,
          filename: `${title}.cape`,
        }
      : null,
    status: (item.status as SubmissionStatus) || 'pending',
    submittedAt: String(item.submittedAt || ''),
    reviewedAt: item.reviewedAt || null,
    reviewerId: item.reviewerId ? String(item.reviewerId) : '',
    reviewerName: item.reviewerName ? String(item.reviewerName) : '',
    reviewNote: item.reviewNote ? String(item.reviewNote) : '',
    reviewVersion: Number(item.reviewVersion || 0),
  };
}

export async function fetchReviewList(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
} = {}): Promise<ReviewListResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params.status) searchParams.set('status', params.status);
  if (params.keyword) searchParams.set('keyword', params.keyword);
  const qs = searchParams.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;
  const { response, data } = await apiJsonWithAuth<RawReviewListResponse>(path, null, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `审核列表加载失败 (${response.status})`));
  }
  const raw = normalizePagedResponse(data, { page, pageSize });
  return {
    records: Array.isArray(raw.items) ? raw.items.map(toReviewRecord) : [],
    total: Number(raw.total || 0),
    page: Number(raw.page || 1),
    pageSize: Number(raw.pageSize || 10),
  };
}

export async function fetchReviewDetail(id: string): Promise<ReviewRecord> {
  const { response, data } = await apiJsonWithAuth<{ item?: RawReviewItem }>(`${BASE}/${id}`, null, {
    method: 'GET',
  });
  if (!response.ok || !data?.item) {
    throw new Error(parseApiError(data, `获取投稿详情失败 (${response.status})`));
  }
  return toReviewRecord(data.item);
}

export async function fetchReviewHistory(
  id: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<ReviewHistoryResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  const qs = searchParams.toString();
  const path = qs ? `${BASE}/${id}/history?${qs}` : `${BASE}/${id}/history`;
  const { response, data } = await apiJsonWithAuth<ReviewHistoryResponse>(
    path,
    null,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `审核历史加载失败 (${response.status})`));
  }
  const normalized = normalizePagedResponse(data, { page, pageSize });
  return {
    items: normalized.items,
    total: normalized.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
  };
}

export async function reviewSubmission(
  id: string,
  action: ReviewAction,
  note: string,
  expectedVersion?: number
): Promise<ReviewActionResponse> {
  const idemKey = `${id}:${action}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const { response, data } = await apiJsonWithAuth<ReviewActionResponse>(
    `${BASE}/${id}/${action}`,
    null,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({ note, expectedVersion }),
    }
  );

  if (!response.ok) {
    throw new Error(parseApiError(data, `审核操作失败 (${response.status})`));
  }

  return data as ReviewActionResponse;
}

export async function reopenReviewSubmission(
  id: string,
  note = '',
  expectedVersion?: number
): Promise<ReviewReopenResponse> {
  const { response, data } = await apiJsonWithAuth<ReviewReopenResponse>(
    `${BASE}/${id}/reopen`,
    null,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, expectedVersion }),
    }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `回退待审失败 (${response.status})`));
  }
  return data as ReviewReopenResponse;
}
