import { normalizePagedResponse, parseApiError } from '@/shared/utils/apiResponse';
import { apiJsonWithAuth } from '@/shared/utils/security';
import type { ApiMessageResponse } from './types';

export interface ReportItem {
  id: string;
  skinId: string;
  skinName: string;
  skinImageUrl?: string;
  reporterUuid: string;
  reason: 'copyright' | 'nsfw' | 'spam' | 'other';
  detail?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
}

export interface ReportsResponse {
  items: ReportItem[];
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

export interface ReportStats {
  total: number;
  pending: number;
  reviewed: number;
  dismissed: number;
  other: number;
  recent24h: number;
  recent7d: number;
  byReason: {
    copyright: number;
    nsfw: number;
    spam: number;
    other: number;
  };
}

export interface SubmitReportData {
  skinId: string;
  reason: string;
  detail: string;
}

export interface SubmitReportResponse extends ApiMessageResponse {
  reportId?: string;
  status?: string;
  statusText?: string;
}

export interface ReportStatusItem {
  id: string;
  skinId: string;
  status: string;
  statusText?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  updatedAt?: string;
}

/**
 * 提交举报
 */
export async function submitSkinReport(data: SubmitReportData): Promise<SubmitReportResponse> {
  const { response, data: result } = await apiJsonWithAuth<SubmitReportResponse>('/api/skins/report', null, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error(parseApiError(result, `举报提交失败 (${response.status})`));
  }
  return result ?? { ok: true, message: '举报已提交', status: 'pending' };
}

/**
 * 获取举报列表（管理员）
 */
export async function getReports(
  status?: string,
  page = 1,
  pageSize = 20
): Promise<ReportsResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', page.toString());
  params.set('pageSize', pageSize.toString());
  params.set('t', Date.now().toString());
  
  const path = `/api/admin/skins/reports?${params.toString()}`;
  const { response, data } = await apiJsonWithAuth<ReportsResponse>(path, null, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `举报列表加载失败 (${response.status})`));
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
 * 处理举报（管理员）
 */
export async function reviewReport(
  reportId: string,
  action: 'approve' | 'dismiss',
  note?: string
): Promise<ApiMessageResponse> {
  const { response, data } = await apiJsonWithAuth<ApiMessageResponse>(`/api/admin/skins/reports/${reportId}`, null, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, note })
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `举报处理失败 (${response.status})`));
  }
  return data ?? { ok: true, message: '处理完成' };
}

/**
 * 获取举报统计（管理员）
 */
export async function getReportStats(): Promise<ReportStats> {
  const { response, data } = await apiJsonWithAuth<{
    ok?: boolean;
    stats?: Partial<ReportStats>;
    message?: string;
  }>('/api/admin/skins/reports/stats', null, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `举报统计加载失败 (${response.status})`));
  }
  const stats = data?.stats ?? {};
  return {
    total: Number(stats.total || 0),
    pending: Number(stats.pending || 0),
    reviewed: Number(stats.reviewed || 0),
    dismissed: Number(stats.dismissed || 0),
    other: Number(stats.other || 0),
    recent24h: Number(stats.recent24h || 0),
    recent7d: Number(stats.recent7d || 0),
    byReason: {
      copyright: Number(stats.byReason?.copyright || 0),
      nsfw: Number(stats.byReason?.nsfw || 0),
      spam: Number(stats.byReason?.spam || 0),
      other: Number(stats.byReason?.other || 0),
    }
  };
}

/**
 * 查询举报状态（用户侧）
 */
export async function fetchSkinReportStatus(reportId: string): Promise<ReportStatusItem> {
  const id = String(reportId || '').trim();
  if (!id) throw new Error('缺少举报编号');
  const { response, data } = await apiJsonWithAuth<{
    ok?: boolean;
    report?: Partial<ReportStatusItem>;
    message?: string;
  }>(`/api/skins/report/${encodeURIComponent(id)}/status`, null, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(parseApiError(data, `举报状态查询失败 (${response.status})`));
  }
  if (!data?.report) {
    throw new Error('举报状态响应缺少 report 字段');
  }
  const report = data.report;
  return {
    id: String(report.id || id),
    skinId: String(report.skinId || ''),
    status: String(report.status || 'pending'),
    statusText: report.statusText ? String(report.statusText) : '',
    reviewedBy: report.reviewedBy ? String(report.reviewedBy) : '',
    reviewedAt: report.reviewedAt ? String(report.reviewedAt) : '',
    reviewNote: report.reviewNote ? String(report.reviewNote) : '',
    updatedAt: report.updatedAt ? String(report.updatedAt) : '',
  };
}
