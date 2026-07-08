import { requireRolesOrJson } from './permission.js'

function normalizeRoles(roles) {
  return Array.isArray(roles) ? roles : []
}

/**
 * 管理端访问分层：
 * 1) 先走开发密钥/IP 白名单校验（兼容现有 x-admin-secret 访问模式）
 * 2) 若请求已有登录用户上下文，再叠加角色能力校验
 */
export function requireAdminAccessOrJson(req, res, options = {}) {
  const requireDevAdmin = typeof options.requireDevAdmin === 'function'
    ? options.requireDevAdmin
    : () => true

  if (!requireDevAdmin(req, res)) return false

  const roles = normalizeRoles(options.roles)
  if (roles.length === 0 || !req?.user) return true

  return requireRolesOrJson(req, res, {
    roles,
    code: String(options.code || 'forbidden'),
    message: String(options.message || `需要角色：${roles.join('/')}`),
    requiredCapability: String(options.requiredCapability || '')
  })
}
