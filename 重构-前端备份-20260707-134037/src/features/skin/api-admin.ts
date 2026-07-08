/**
 * 皮肤库管理后台 - API 层
 * 调用 /api/admin/skins 端点，需要 admin 权限
 */

import type {
  AdminSkinQuery,
  AdminSkinResourceForm,
  AdminSkinListResponse,
  AdminSkinDetailResponse,
  AdminSkinCreateResponse,
  AdminSkinUpdateResponse,
  AdminSkinStatusResponse,
  AdminSkinDeleteResponse,
  AdminSkinBatchResponse,
  SkinResourceStatus,
  AdminUserListResponse,
  AdminUserDetailResponse,
  AdminUserQuery,
  AdminRoleUpdateForm,
  AdminRoleUpdateResponse,
  AdminUserUpdateForm,
  AdminUserUpdateResponse,
  AdminUserBanForm,
  AdminUserActionResponse,
  AdminUserAuditListResponse,
} from '@/types/skin-admin';
import { apiJsonWithAuth, fetchJsonWithHealthFallback } from '@/shared/utils/security';
import { normalizePagedResponse, parseApiError } from '@/shared/utils/apiResponse';

/** 基础路径 */
const BASE = '/api/admin/skins';

/** 空响应兜底 */
const NULL_DETAIL: AdminSkinDetailResponse = Object.assign(Object.create(null), { item: null as unknown as AdminSkinDetailResponse['item'] });
const NULL_CREATE: AdminSkinCreateResponse = Object.assign(Object.create(null), { item: null as unknown as AdminSkinCreateResponse['item'], message: '创建失败' });
const NULL_UPDATE: AdminSkinUpdateResponse = Object.assign(Object.create(null), { item: null as unknown as AdminSkinUpdateResponse['item'], message: '更新失败' });

// ============ 列表查询 ============

/**
 * 分页查询皮肤资源列表
 * @example GET /api/admin/skins?page=1&pageSize=20&keyword=dragon&status=online
 */
export async function fetchAdminSkinList(query: AdminSkinQuery = {}): Promise<AdminSkinListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.status) params.set('status', query.status);
  if (query.model) params.set('model', query.model);

  const qs = params.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;

  const data = await fetchJsonWithHealthFallback<AdminSkinListResponse>(
    path,
    { credentials: 'include' },
    { items: [], total: 0, page: 1, pageSize: 20 }
  );
  return normalizePagedResponse(data, {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  });
}

// ============ 详情 ============

/**
 * 获取单个皮肤资源详情
 * @example GET /api/admin/skins/42
 */
export async function fetchAdminSkinDetail(id: string): Promise<AdminSkinDetailResponse> {
  const data = await fetchJsonWithHealthFallback<AdminSkinDetailResponse>(
    `${BASE}/${id}`,
    { credentials: 'include' },
    NULL_DETAIL
  );
  return data ?? NULL_DETAIL;
}

// ============ 创建 ============

/**
 * 新增皮肤资源
 * @example POST /api/admin/skins
 */
export async function createAdminSkin(form: AdminSkinResourceForm): Promise<AdminSkinCreateResponse> {
  const { response, data } = await apiJsonWithAuth<AdminSkinCreateResponse>(BASE, null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });

  if (!response.ok) {
    throw new Error(parseApiError(data, `创建失败 (${response.status})`));
  }

  return data ?? NULL_CREATE;
}

// ============ 更新 ============

/**
 * 更新皮肤资源元数据（名称/标签/模型等）
 * @example PUT /api/admin/skins/42
 */
export async function updateAdminSkin(id: string, form: Partial<AdminSkinResourceForm>): Promise<AdminSkinUpdateResponse> {
  const { response, data } = await apiJsonWithAuth<AdminSkinUpdateResponse>(`${BASE}/${id}`, null, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });

  if (!response.ok) {
    throw new Error(parseApiError(data, `更新失败 (${response.status})`));
  }

  return data ?? NULL_UPDATE;
}

// ============ 状态切换 ============

/**
 * 上下架切换
 * @example PATCH /api/admin/skins/42/status
 */
export async function toggleAdminSkinStatus(
  id: string,
  status: SkinResourceStatus,
): Promise<AdminSkinStatusResponse> {
  const { response, data } = await apiJsonWithAuth<AdminSkinStatusResponse>(`${BASE}/${id}/status`, null, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error(parseApiError(data, `状态更新失败 (${response.status})`));
  }

  return data ?? { id, status, message: '状态更新失败' };
}

/**
 * 批量更新状态
 */
export async function batchToggleStatus(
  ids: string[],
  status: SkinResourceStatus,
): Promise<AdminSkinBatchResponse> {
  const { response, data } = await apiJsonWithAuth<AdminSkinBatchResponse>(`${BASE}/batch/status`, null, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });

  if (!response.ok) {
    throw new Error(parseApiError(data, `批量状态更新失败 (${response.status})`));
  }

  return data ?? { success: [], failed: [], message: '批量状态更新失败' };
}

// ============ 删除 ============

/**
 * 删除单个皮肤资源
 * @example DELETE /api/admin/skins/42
 */
export async function deleteAdminSkin(id: string): Promise<AdminSkinDeleteResponse> {
  const { response, data } = await apiJsonWithAuth<AdminSkinDeleteResponse>(`${BASE}/${id}`, null, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(parseApiError(data, `删除失败 (${response.status})`));
  }

  return data ?? { id, message: '删除失败' };
}

/**
 * 批量删除
 */
export async function batchDeleteSkins(ids: string[]): Promise<AdminSkinBatchResponse> {
  const { response, data } = await apiJsonWithAuth<AdminSkinBatchResponse>(`${BASE}/batch`, null, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(parseApiError(data, `批量删除失败 (${response.status})`));
  }

  return data ?? { success: [], failed: [], message: '批量删除失败' };
}

// ============ 角色管理 ============

const USER_BASE = '/api/admin/users';

/** 空用户兜底 */
const NULL_USER_LIST: AdminUserListResponse = { items: [], total: 0, page: 1, pageSize: 20 };
const NULL_USER_DETAIL: AdminUserDetailResponse = Object.assign(Object.create(null), {
  user: null as unknown as AdminUserDetailResponse['user']
});

/**
 * 分页查询用户列表（用于角色分配）
 * @example GET /api/admin/users?page=1&pageSize=20&keyword=alice
 */
export async function fetchAdminUserList(query: AdminUserQuery = {}): Promise<AdminUserListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.status) params.set('status', query.status);
  if (query.role) params.set('role', query.role);

  const qs = params.toString();
  const path = qs ? `${USER_BASE}?${qs}` : USER_BASE;
  const data = await fetchJsonWithHealthFallback<AdminUserListResponse>(
    path,
    { credentials: 'include' },
    NULL_USER_LIST
  );
  return normalizePagedResponse(data, {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  });
}

/**
 * 获取单个用户详情
 * @example GET /api/admin/users/:id
 */
export async function fetchAdminUserDetail(id: string): Promise<AdminUserDetailResponse> {
  const data = await fetchJsonWithHealthFallback<AdminUserDetailResponse>(
    `${USER_BASE}/${id}`,
    { credentials: 'include' },
    NULL_USER_DETAIL
  );
  return data ?? NULL_USER_DETAIL;
}

/**
 * 更新用户角色（分配/移除 reviewer 或 admin）
 * @example PUT /api/admin/users/:id/roles
 */
export async function updateAdminUserRoles(
  id: string,
  form: AdminRoleUpdateForm
): Promise<AdminRoleUpdateResponse> {
  const { response, data } = await apiJsonWithAuth<AdminRoleUpdateResponse>(
    `${USER_BASE}/${id}/roles`,
    null,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }
  );

  if (!response.ok) {
    throw new Error(parseApiError(data, `角色更新失败 (${response.status})`));
  }

  return data ?? { ok: false, id, username: '', roles: [], message: '角色更新失败' };
}

export async function updateAdminUser(
  id: string,
  form: AdminUserUpdateForm
): Promise<AdminUserUpdateResponse> {
  const { response, data } = await apiJsonWithAuth<AdminUserUpdateResponse>(
    `${USER_BASE}/${id}`,
    null,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `用户信息更新失败 (${response.status})`));
  }
  return data ?? { ok: false, user: NULL_USER_DETAIL.user, message: '用户信息更新失败' };
}

export async function banAdminUser(
  id: string,
  form: AdminUserBanForm
): Promise<AdminUserActionResponse> {
  const { response, data } = await apiJsonWithAuth<AdminUserActionResponse>(
    `${USER_BASE}/${id}/ban`,
    null,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form || {}),
    }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `封禁用户失败 (${response.status})`));
  }
  return data ?? { ok: false, message: '封禁用户失败' };
}

export async function unbanAdminUser(id: string): Promise<AdminUserActionResponse> {
  const { response, data } = await apiJsonWithAuth<AdminUserActionResponse>(
    `${USER_BASE}/${id}/unban`,
    null,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `解封用户失败 (${response.status})`));
  }
  return data ?? { ok: false, message: '解封用户失败' };
}

export async function deleteAdminUser(id: string): Promise<AdminUserActionResponse> {
  const { response, data } = await apiJsonWithAuth<AdminUserActionResponse>(
    `${USER_BASE}/${id}`,
    null,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw new Error(parseApiError(data, `删除用户失败 (${response.status})`));
  }
  return data ?? { ok: false, id, message: '删除用户失败' };
}

export async function fetchAdminUserAuditLogs(
  id: string,
  query: Pick<AdminUserQuery, 'page' | 'pageSize'> = {}
): Promise<AdminUserAuditListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  const path = qs ? `${USER_BASE}/${id}/audit?${qs}` : `${USER_BASE}/${id}/audit`;
  const data = await fetchJsonWithHealthFallback<AdminUserAuditListResponse>(
    path,
    { credentials: 'include' },
    { items: [], total: 0, page: 1, pageSize: 20 }
  );
  return normalizePagedResponse(data, {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  });
}
