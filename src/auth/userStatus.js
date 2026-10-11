const MIN_BAN_REASON_LENGTH = 3
const MAX_BAN_REASON_LENGTH = 500

export function isUserBanned(user) {
  return user?.banned === true || Boolean(String(user?.bannedAt || '').trim())
}

export function banUser(user, { reason, operatorId, now = Date.now() } = {}) {
  const normalizedReason = String(reason || '').trim()
  if (normalizedReason.length < MIN_BAN_REASON_LENGTH) {
    return { ok: false, code: 'ban_reason_required' }
  }
  if (normalizedReason.length > MAX_BAN_REASON_LENGTH) {
    return { ok: false, code: 'ban_reason_too_long' }
  }

  user.banned = true
  user.bannedAt = new Date(now).toISOString()
  user.banReason = normalizedReason
  user.bannedBy = String(operatorId || '').trim() || null
  return { ok: true }
}

export function unbanUser(user) {
  delete user.banned
  delete user.bannedAt
  delete user.banReason
  delete user.bannedBy
  return { ok: true }
}
