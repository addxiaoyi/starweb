/**
 * 皮肤库管理后台 - TypeScript 类型定义
 * 管理员增删改查皮肤库资源
 */

// ============ 核心类型 ============

/** 管理员皮肤资源状态 */
export type SkinResourceStatus = 'online' | 'offline' | 'pending';

/** 皮肤模型类型 */
export type SkinModel = 'auto' | 'default' | 'slim';

/** 管理员皮肤资源项 */
export interface AdminSkinResource {
  id: string;
  name: string;
  model: SkinModel;
  skinUrl: string;
  capeUrl: string | null;
  previewUrl: string | null;
  tags: string[];
  uploaderId: string;
  uploaderName?: string;
  status: SkinResourceStatus;
  createdAt: string;
  updatedAt: string;
}

/** 管理员皮肤资源 - 创建/更新请求体 */
export interface AdminSkinResourceForm {
  name: string;
  model: SkinModel;
  skinUrl: string;
  capeUrl?: string | null;
  previewUrl?: string | null;
  tags?: string[];
}

/** 管理员皮肤资源 - 查询参数 */
export interface AdminSkinQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: SkinResourceStatus;
  model?: SkinModel;
}

// ============ API 响应类型 ============

/** 管理员皮肤资源 - 分页响应 */
export interface AdminSkinListResponse {
  items: AdminSkinResource[];
  total: number;
  page: number;
  pageSize: number;
}

/** 管理员皮肤资源 - 单条响应 */
export interface AdminSkinDetailResponse {
  item: AdminSkinResource;
}

/** 管理员皮肤资源 - 创建响应 */
export interface AdminSkinCreateResponse {
  item: AdminSkinResource;
  message: string;
}

/** 管理员皮肤资源 - 更新响应 */
export interface AdminSkinUpdateResponse {
  item: AdminSkinResource;
  message: string;
}

/** 管理员皮肤资源 - 状态更新响应 */
export interface AdminSkinStatusResponse {
  id: string;
  status: SkinResourceStatus;
  message: string;
}

/** 管理员皮肤资源 - 删除响应 */
export interface AdminSkinDeleteResponse {
  id: string;
  message: string;
}

/** 管理员皮肤资源 - 批量操作响应 */
export interface AdminSkinBatchResponse {
  success: string[];
  failed: { id: string; reason: string }[];
  message: string;
}

/** 通用 API 消息响应 */
export interface ApiMessageResponse {
  message: string;
  ok?: boolean;
}

// ============ 角色管理类型 ============

/** 用户角色类型 */
export type UserRole = 'admin' | 'reviewer' | 'moderator';

/** 用户列表项（角色管理用）*/
export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  uuid: string;
  roles: UserRole[];
  emailVerified: boolean;
  linkedMcUsername: string | null;
  createdAt: string;
  updatedAt?: string;
  isBanned?: boolean;
  bannedAt?: string | null;
  bannedUntil?: string | null;
  banReason?: string;
  bannedBy?: string | null;
  note?: string;
}

/** 用户列表分页响应 */
export interface AdminUserListResponse {
  items: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 用户详情响应 */
export interface AdminUserDetailResponse {
  user: AdminUserItem;
}

/** 角色更新请求体 */
export interface AdminRoleUpdateForm {
  roles: UserRole[];
}

/** 角色更新响应 */
export interface AdminRoleUpdateResponse {
  ok: boolean;
  id: string;
  username: string;
  roles: UserRole[];
  message: string;
}

/** 用户列表查询参数 */
export interface AdminUserQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: 'all' | 'active' | 'banned';
  role?: UserRole | 'all';
}

export interface AdminUserUpdateForm {
  username?: string;
  email?: string;
  emailVerified?: boolean;
  note?: string;
}

export interface AdminUserUpdateResponse {
  ok: boolean;
  user: AdminUserItem;
  message: string;
}

export interface AdminUserBanForm {
  reason?: string;
  durationHours?: number;
}

export interface AdminUserActionResponse {
  ok: boolean;
  user?: AdminUserItem;
  id?: string;
  message: string;
}

export interface AdminUserAuditLogItem {
  id: string;
  at: string;
  actorUserId: string;
  actorUsername: string;
  action: string;
  targetUserId: string;
  targetUsername: string;
  detail?: unknown;
}

export interface AdminUserAuditListResponse {
  items: AdminUserAuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}
