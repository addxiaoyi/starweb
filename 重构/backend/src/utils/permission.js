import { jsonError } from './response.js'

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase()
}

export function roleSetOf(user) {
  return new Set(
    [
      ...(Array.isArray(user?.roles) ? user.roles : []),
      ...(user?.role ? [user.role] : []),
    ]
      .map((role) => normalizeRole(role))
      .filter(Boolean)
  )
}

export function roleListOf(user) {
  return [...roleSetOf(user)]
}

export function hasRole(user, role) {
  const normalized = normalizeRole(role)
  if (!normalized) return false
  return roleSetOf(user).has(normalized)
}

export function hasAnyRole(user, roles = []) {
  const expected = Array.isArray(roles)
    ? roles.map((role) => normalizeRole(role)).filter(Boolean)
    : []
  if (expected.length === 0) return false
  const owned = roleSetOf(user)
  return expected.some((role) => owned.has(role))
}

export function requireRolesOrJson(req, res, options = {}) {
  const roles = Array.isArray(options.roles)
    ? options.roles.map((role) => normalizeRole(role)).filter(Boolean)
    : []
  if (roles.length === 0) return true
  if (hasAnyRole(req?.user, roles)) return true

  const requiredCapability = String(options.requiredCapability || '').trim()
  const details = {
    requiredRoles: roles,
    actualRoles: roleListOf(req?.user),
  }
  if (requiredCapability) {
    details.requiredCapability = requiredCapability
  }
  jsonError(
    res,
    403,
    options.message || `需要角色：${roles.join('/')}`,
    String(options.code || 'forbidden'),
    details
  )
  return false
}
