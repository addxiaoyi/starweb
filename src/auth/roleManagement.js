const ALLOWED_ROLES = new Set(['superadmin', 'admin', 'moderator', 'reviewer', 'sponsor', 'user'])

function normalizeRoles(input) {
  if (!Array.isArray(input)) return null
  const roles = [...new Set(input.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean))]
  if (roles.some((role) => !ALLOWED_ROLES.has(role))) return null
  const elevated = roles.filter((role) => role !== 'user')
  return elevated.length > 0 ? elevated : ['user']
}

export function replaceUserRoles(store, operator, targetUserId, rawRoles, options = {}) {
  const target = store?.users?.find((user) => String(user.id) === String(targetUserId))
  if (!target) return { ok: false, code: 'user_not_found' }
  if (String(operator?.id) === String(target.id)) return { ok: false, code: 'self_role_change_forbidden' }

  const roles = normalizeRoles(rawRoles)
  if (!roles) return { ok: false, code: 'invalid_role' }

  const operatorIsSuperAdmin = Array.isArray(operator?.roles) && operator.roles.includes('superadmin')
  const targetWasSuperAdmin = Array.isArray(target.roles) && target.roles.includes('superadmin')
  const targetWillBeSuperAdmin = roles.includes('superadmin')
  if ((targetWasSuperAdmin || targetWillBeSuperAdmin) && !operatorIsSuperAdmin) {
    return { ok: false, code: 'superadmin_required' }
  }
  if (targetWasSuperAdmin !== targetWillBeSuperAdmin) {
    const confirmation = String(options.confirmation || '').trim()
    if (confirmation !== String(target.id)) return { ok: false, code: 'confirmation_required' }
  }
  if (targetWasSuperAdmin && !targetWillBeSuperAdmin) {
    const remaining = store.users.filter((user) => user.id !== target.id && Array.isArray(user.roles) && user.roles.includes('superadmin'))
    if (remaining.length === 0) return { ok: false, code: 'last_superadmin_protected' }
  }

  const wasAdmin = Array.isArray(target.roles) && target.roles.includes('admin')
  if (wasAdmin && !roles.includes('admin')) {
    const remainingAdmins = store.users.filter((user) => user.id !== target.id && Array.isArray(user.roles) && user.roles.includes('admin'))
    if (remainingAdmins.length === 0) return { ok: false, code: 'last_admin_protected' }
  }

  target.roles = roles
  return { ok: true, roles }
}
