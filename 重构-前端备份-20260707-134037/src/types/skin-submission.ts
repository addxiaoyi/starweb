/**
 * 用户皮肤投稿 - TypeScript 类型定义
 * 与后端 /api/skins/player/submissions 对齐
 */

// ============ 枚举/别名 ============

/** 投稿状态 */
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

/** 皮肤模型类型 */
export type SubmissionModel = 'auto' | 'default' | 'slim';

// ============ 投稿记录（前端展示用） ============

/** 用户投稿记录 */
export interface SubmissionRecord {
  id: string;
  /** 皮肤名称（后端返回 fileName 时映射为此字段） */
  name: string;
  /** 简介描述 */
  description: string;
  /** 逗号分隔的标签 */
  tags: string[];
  /** 模型类型 */
  model: SubmissionModel;
  /** 皮肤资源 URL */
  skinUrl: string;
  /** 披风资源 URL */
  capeUrl: string | null;
  /** 前端预览用 URL（来自 skinUrl 转换） */
  previewUrl: string | null;
  /** 审核状态 */
  status: SubmissionStatus;
  /** 审核意见（被拒绝时） */
  reviewerNote?: string;
  submittedAt: string;
  reviewedAt: string | null;
  updatedAt: string;
}

// ============ API 响应 ============

/** 投稿列表响应 */
export interface SubmissionListResponse {
  items: SubmissionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** 创建投稿响应 */
export interface SubmissionCreateResponse {
  ok: boolean;
  id: string;
  message: string;
}

/** 删除投稿响应 */
export interface SubmissionDeleteResponse {
  ok: boolean;
  message: string;
}
