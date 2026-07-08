/**
 * 用户皮肤投稿 - API 层
 * 后端实际路径：
 *   POST /api/skins/player/submissions   — 创建投稿（FormData，文件+元数据一体）
 *   GET  /api/skins/player/submissions   — 用户自己的投稿列表
 *   POST /api/skin/upload                — 上传皮肤文件（独立）
 *   POST /api/skin/upload-cape           — 上传披风文件（独立）
 */

import { normalizePagedResponse, parseApiError } from '@/shared/utils/apiResponse';
import { apiJsonWithAuth } from '@/shared/utils/security';
import type {
  SubmissionRecord,
  SubmissionListResponse,
  SubmissionCreateResponse,
  SubmissionDeleteResponse,
} from '@/types/skin-submission';

/** 后端原始投稿记录（部分字段名与前端不同） */
interface RawSubmissionRecord {
  id?: string;
  name?: string;
  fileName?: string;     // 后端用此字段
  description?: string;
  note?: string;         // 后端用此字段
  tags?: string[];
  model?: string;
  skinUrl?: string;
  capeUrl?: string | null;
  previewUrl?: string | null;
  status?: string;
  reviewerNote?: string;
  submittedAt?: string;
  reviewedAt?: string | null;
  updatedAt?: string;
}

const BASE = '/api/skins/player/submissions';

// ============ 创建投稿（FormData） ============

/**
 * 创建投稿：一次性上传文件+元数据
 * 后端 POST /api/skins/player/submissions
 */
export async function createSubmissionWithForm(
  name: string,
  description: string,
  tags: string[],
  model: string,
  skinFile: File,
  capeFile: File | null,
): Promise<SubmissionCreateResponse> {
  const fd = new FormData();
  fd.append('file', skinFile);
  if (capeFile) fd.append('cape', capeFile);
  fd.append('name', name);
  fd.append('description', description);
  fd.append('tags', tags.join(','));
  fd.append('model', model);

  const { response, data } = await apiJsonWithAuth<{ ok: boolean; id?: string; message?: string }>(
    BASE,
    null,
    {
      method: 'POST',
      body: fd,
    },
  );

  if (!response.ok) {
    throw new Error(parseApiError(data, `投稿失败 (${response.status})`));
  }

  return {
    ok: data?.ok ?? false,
    id: data?.id ?? '',
    message: data?.message ?? '投稿成功',
  };
}

// ============ 用户投稿列表 ============

/**
 * 获取当前用户的投稿列表
 * 后端 GET /api/skins/player/submissions
 */
export async function fetchSubmissionList(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<SubmissionListResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));
  if (params.status) sp.set('status', params.status);

  const qs = sp.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;

  const { response, data } = await apiJsonWithAuth<SubmissionListResponse>(
    path,
    null,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `投稿列表加载失败 (${response.status})`));
  }
  const normalized = normalizePagedResponse(data, { page, pageSize });

  // 后端返回 fileName/status/submittedAt/reviewedAt/note
  // 前端 SubmissionRecord 期望 name/description/tags/skinUrl/previewUrl/reviewerNote
  // 做字段映射
  return {
    items: normalized.items.map((s: RawSubmissionRecord) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? s.fileName ?? '未命名'),
      description: String(s.description ?? s.note ?? ''),
      tags: Array.isArray(s.tags) ? s.tags : [],
      model: (s.model as SubmissionRecord['model']) ?? 'auto',
      skinUrl: String(s.skinUrl ?? ''),
      capeUrl: s.capeUrl ?? null,
      previewUrl: s.previewUrl ?? null,
      status: (s.status as SubmissionRecord['status']) ?? 'pending',
      reviewerNote: s.reviewerNote ?? s.note ?? undefined,
      submittedAt: String(s.submittedAt ?? ''),
      reviewedAt: s.reviewedAt ?? null,
      updatedAt: String(s.updatedAt ?? s.submittedAt ?? ''),
    })),
    total: normalized.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
  };
}

/** 空删除响应 */
const NULL_DELETE: SubmissionDeleteResponse = { ok: false, message: '删除失败' };

/**
 * 取消/删除个人投稿
 * 仅允许取消 status === 'pending' 的投稿
 */
export async function deleteSubmission(id: string): Promise<SubmissionDeleteResponse> {
  const { response, data } = await apiJsonWithAuth<SubmissionDeleteResponse>(
    `${BASE}/${id}`,
    null,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `删除失败 (${response.status})`));
  }
  return data ?? NULL_DELETE;
}

export async function resubmitSubmission(id: string, note = ''): Promise<SubmissionCreateResponse> {
  const { response, data } = await apiJsonWithAuth<SubmissionCreateResponse>(
    `${BASE}/${id}/resubmit`,
    null,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `重新提交失败 (${response.status})`));
  }
  return data ?? { ok: false, id, message: '重新提交失败' };
}
