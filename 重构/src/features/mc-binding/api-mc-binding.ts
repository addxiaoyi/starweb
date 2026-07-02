/**
 * 超级联合登录：Minecraft 绑定 & 正版验证 API
 *
 * 核心流程：
 *  1. GET  /api/user/minecraft/status         → 获取当前绑定状态
 *  2. POST /api/user/minecraft/verify/init    → 发起正版验证（生成验证码）
 *  3. POST /api/user/minecraft/verify/cancel → 取消当前验证码会话
 *  4. POST /api/user/link-minecraft          → 绑定 MC 用户名（VLA external_user_id 联动）
 *  5. POST /api/user/unlink-minecraft        → 解绑 MC 用户名
 */

import { apiJsonWithAuth } from '@/shared/utils/security';
import { parseApiError } from '@/shared/utils/apiResponse';
import type {
  McBindingStatus,
  McBindingHistoryItem,
  McPagedResult,
  McVerifyInitResponse,
  McVerifyHistoryItem,
  McVerifyStateInfo,
} from '@/types/minecraft';

/** 空兜底 */
const NULL_STATUS: McBindingStatus = {
  linked: false,
  mcUsername: null,
  mcUuid: null,
  verifiedMojang: false,
  vlaLinked: false,
  verifySession: null,
  verifyState: null,
};

type ApiErrorPayload = {
  message?: string;
  code?: string;
  error?: string;
  details?: unknown;
};

type BindingApiError = Error & {
  code?: string;
  details?: unknown;
  status?: number;
};

function buildBindingApiError(
  payload: ApiErrorPayload | null | undefined,
  fallback: string,
  status: number
): BindingApiError {
  const err = new Error(parseApiError(payload, fallback)) as BindingApiError;
  err.code = String(payload?.code || payload?.error || '').trim() || undefined;
  err.details = payload?.details;
  err.status = status;
  return err;
}

/**
 * 获取 Minecraft 绑定状态（含正版验证会话）
 */
export async function fetchMcBindingStatus(): Promise<McBindingStatus> {
  const { response, data } = await apiJsonWithAuth<McBindingStatus | ApiErrorPayload>(
    '/api/user/minecraft/status'
  );
  if (!response.ok) {
    throw buildBindingApiError(data as ApiErrorPayload, `获取绑定状态失败 (${response.status})`, response.status);
  }
  const result = (data as McBindingStatus | null) ?? NULL_STATUS;
  return {
    ...NULL_STATUS,
    ...result,
    verifySession: result?.verifySession ?? null,
    verifyState: (result?.verifyState ?? null) as McVerifyStateInfo | null,
  };
}

/**
 * 发起正版验证（生成 6 位验证码）
 * @param options 要验证的参数（可选强制替换旧会话）
 */
export async function initMcVerify(options: {
  mcUsername?: string;
  force?: boolean;
} = {}): Promise<McVerifyInitResponse> {
  const body: Record<string, unknown> = {};
  if (options.mcUsername) body.mcUsername = options.mcUsername;
  if (options.force) body.force = true;
  const { response, data } = await apiJsonWithAuth<
    McVerifyInitResponse | ApiErrorPayload
  >(
    '/api/user/minecraft/verify/init',
    null,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    throw buildBindingApiError(
      data as ApiErrorPayload,
      `发起验证失败 (${response.status})`,
      response.status
    );
  }
  return data as McVerifyInitResponse;
}

/**
 * 取消当前正版验证会话
 */
export async function cancelMcVerify(): Promise<void> {
  const { response, data } = await apiJsonWithAuth<Record<string, unknown> | ApiErrorPayload>(
    '/api/user/minecraft/verify/cancel',
    null,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw buildBindingApiError(
      data as ApiErrorPayload,
      `取消失败 (${response.status})`,
      response.status
    );
  }
}

export async function fetchMcBindingHistory(params: {
  page?: number;
  pageSize?: number;
  action?: string;
  q?: string;
} = {}): Promise<McPagedResult<McBindingHistoryItem>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.action) query.set('action', params.action);
  if (params.q) query.set('q', params.q);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const { response, data } = await apiJsonWithAuth<McPagedResult<McBindingHistoryItem> | ApiErrorPayload>(
    `/api/user/minecraft/binding-history${suffix}`
  );
  if (!response.ok) {
    throw buildBindingApiError(
      data as ApiErrorPayload,
      `获取绑定历史失败 (${response.status})`,
      response.status
    );
  }
  const payload = (data as McPagedResult<McBindingHistoryItem> | null) ?? {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  };
  return {
    ok: true,
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number(payload.total || 0),
    page: Number(payload.page || 1),
    pageSize: Number(payload.pageSize || 20),
  };
}

export async function fetchMcVerifyHistory(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<McPagedResult<McVerifyHistoryItem>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const { response, data } = await apiJsonWithAuth<McPagedResult<McVerifyHistoryItem> | ApiErrorPayload>(
    `/api/user/minecraft/verify-history${suffix}`
  );
  if (!response.ok) {
    throw buildBindingApiError(
      data as ApiErrorPayload,
      `获取验证历史失败 (${response.status})`,
      response.status
    );
  }
  const payload = (data as McPagedResult<McVerifyHistoryItem> | null) ?? {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  };
  return {
    ok: true,
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number(payload.total || 0),
    page: Number(payload.page || 1),
    pageSize: Number(payload.pageSize || 20),
  };
}

/**
 * 绑定 Minecraft 用户名（联动 VLA external_user_id）
 * @param mcUsername 游戏角色名
 * @param inviteCode  邀请码（如后端要求）
 * @param totpCode    TOTP 验证码（如已启用两步验证）
 */
export async function linkMcUsername(
  mcUsername: string,
  inviteCode?: string,
  totpCode?: string
): Promise<void> {
  const body: Record<string, string> = { username: mcUsername };
  if (inviteCode) body.inviteCode = inviteCode;
  if (totpCode) body.totpCode = totpCode;

  const { response, data } = await apiJsonWithAuth<Record<string, unknown> | ApiErrorPayload>(
    '/api/user/link-minecraft',
    null,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    throw buildBindingApiError(
      data as ApiErrorPayload,
      response.status === 403
        ? '绑定失败：邀请码无效或无权操作'
        : response.status === 400
        ? '游戏库中不存在该角色名，请先在服务器注册'
        : `绑定失败 (${response.status})`,
      response.status
    );
  }
}

/**
 * 解绑 Minecraft 用户名
 * @param totpCode TOTP 验证码（如已启用两步验证）
 */
export async function unlinkMcUsername(totpCode?: string, reason?: string): Promise<void> {
  const body: Record<string, string> = {};
  if (totpCode) body.totpCode = totpCode;
  const reasonText = String(reason || '').trim();
  if (reasonText) body.reason = reasonText;

  const { response, data } = await apiJsonWithAuth<Record<string, unknown> | ApiErrorPayload>(
    '/api/user/unlink-minecraft',
    null,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    throw buildBindingApiError(
      data as ApiErrorPayload,
      `解绑失败 (${response.status})`,
      response.status
    );
  }
}
