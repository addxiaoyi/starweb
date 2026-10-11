import crypto from 'crypto'
import { normalizeShortText, toPlainObject } from './utils.js'

export const MC_BINDING_AUDIT_ACTIONS = new Set([
  'link_minecraft',
  'unlink_minecraft',
  'verify_init',
  'verify_cancel',
  'verify_success',
  'verify_failed',
  'verify_callback_conflict',
])

/**
 * 安全事件 action 中文标签
 */
export function actionLabel(action) {
  const k = String(action || '').trim().toLowerCase()
  const map = {
    session_register: '新会话登录',
    session_revoke: '会话已撤销',
    session_revoke_all: '已一键下线会话',
    totp_enable: '启用了两步验证',
    totp_disable: '关闭了两步验证',
    recovery_codes_rotate: '更新了恢复码',
    link_minecraft: '绑定了游戏角色',
    unlink_minecraft: '解绑了游戏角色',
    verify_init: '发起了正版验证',
    verify_cancel: '取消了正版验证',
    verify_success: '正版验证成功',
    verify_failed: '正版验证失败',
    verify_callback_conflict: '验证回调冲突',
  }
  return map[k] || `安全事件：${k || 'unknown'}`
}

/**
 * 验证状态中文标签
 */
export function verifyStatusLabel(status) {
  const key = String(status || '').trim().toLowerCase()
  const map = {
    pending: '进行中',
    succeeded: '已成功',
    failed: '已失败',
    cancelled: '已取消',
    expired: '已过期',
  }
  return map[key] || '未知状态'
}

/**
 * 从审计行构建 MC 绑定历史条目
 */
export function buildMcBindingHistoryItemFromAudit(row) {
  const action = String(row?.action || '').trim().toLowerCase()
  const detail = toPlainObject(row?.detail)
  const session = toPlainObject(detail.session)
  const at = String(row?.at || '').trim()
  const reason =
    normalizeShortText(detail.reason || detail.failureReason || session.failureReason, 180) || null
  const conflictCode =
    normalizeShortText(detail.conflictCode || session.conflictCode, 80) || null
  const mcUsername =
    normalizeShortText(detail.mcUsername || session.mcUsername, 16).toLowerCase() || null
  const source = normalizeShortText(detail.source, 40) || null

  return {
    id: normalizeShortText(row?.id, 80) || crypto.randomUUID(),
    at: at || new Date().toISOString(),
    action,
    label: actionLabel(action),
    mcUsername,
    reason,
    conflictCode,
    source,
    detail,
  }
}
