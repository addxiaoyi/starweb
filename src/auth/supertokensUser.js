import crypto from 'node:crypto'
import { markUserProfileDirty } from '../db/siteUserProfileSync.js'
import { scheduleSave } from '../persist.js'

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/

export function normalizeUsername(value) {
  return String(value || '').trim()
}

export function isValidUsername(value) {
  return USERNAME_PATTERN.test(normalizeUsername(value))
}

export function findUserByUsername(store, username) {
  const target = normalizeUsername(username).toLowerCase()
  if (!target || !Array.isArray(store?.users)) return null
  return store.users.find((user) => normalizeUsername(user?.username).toLowerCase() === target) || null
}

export function findSupertokensLinkedUser(store, stUserId) {
  const key = String(stUserId || '').trim()
  if (!key) return null
  const linked = (Array.isArray(store?.users) ? store.users : [])
    .filter((user) => String(user?.supertokensUserId || '') === key)
    .sort((left, right) => roleScore(right) - roleScore(left))
  return linked[0] ||
    (Array.isArray(store?.users) ? store.users.find((u) => String(u.id || '') === key) : null) ||
    null
}

function roleScore(user) {
  const roles = new Set(Array.isArray(user?.roles) ? user.roles : [])
  if (roles.has('superadmin')) return 5
  if (roles.has('admin')) return 4
  if (roles.has('moderator') || roles.has('reviewer')) return 3
  if (roles.has('sponsor')) return 2
  return 1
}

function findLegacyEmailUser(store, email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return null
  return (store?.users || [])
    .filter((user) => String(user?.email || '').trim().toLowerCase() === normalized)
    .sort((left, right) => roleScore(right) - roleScore(left))[0] || null
}

export function ensureSupertokensLocalUser(store, stUser, { username } = {}) {
  const stId = String(stUser?.id || '').trim()
  const email = String(stUser?.emails?.[0] || stUser?.email || '').trim()
  let local = findSupertokensLinkedUser(store, stId)
  const legacy = findLegacyEmailUser(store, email)

  if (
    local &&
    legacy &&
    legacy.id !== local.id &&
    roleScore(legacy) > roleScore(local) &&
    (!legacy.supertokensUserId || String(legacy.supertokensUserId) === stId)
  ) {
    const previousLocalId = local.id
    delete local.supertokensUserId
    local = legacy
    local.supertokensUserId = stId
    if (email) local.email = email
    markUserProfileDirty(previousLocalId)
    markUserProfileDirty(local.id)
    scheduleSave()
    return local
  }

  if (!local) {
    local = legacy
    if (local) {
      local.supertokensUserId = stId
      if (email) local.email = email
      markUserProfileDirty(local.id)
      scheduleSave()
      return local
    }
    const requestedUsername = normalizeUsername(username)
    const localUsername = requestedUsername || (email ? email.split('@')[0] : `user_${stId.slice(0, 8)}`)
    local = {
      id: crypto.randomUUID(),
      uuid: crypto.randomUUID(),
      username: localUsername,
      email: email || `${localUsername}@starmc.local`,
      roles: [],
      emailVerified: true,
      supertokensUserId: stId,
      linkedMcUsername: null,
      linkedMcUuid: null,
      verifiedMojang: false,
      totpEnabled: false,
      totpSecret: null,
      totpPendingSecret: null,
      recoveryCodes: [],
      recoveryCodesCount: 0,
    }
    store.users.push(local)
    markUserProfileDirty(local.id)
    scheduleSave()
  }
  return local
}

export function syncSupertokensLocalUser(local, stUser) {
  const email = String(stUser?.emails?.[0] || stUser?.email || '').trim()
  if (email && local.email !== email) local.email = email
  if (!local.supertokensUserId && stUser?.id) local.supertokensUserId = stUser.id
}
