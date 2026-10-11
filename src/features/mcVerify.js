import crypto from 'node:crypto'
import { getStore, scheduleSave } from '../persist.js'

const SESSION_TTL_MS = 15 * 60_000
const INIT_COOLDOWN_MS = 60_000
const INIT_WINDOW_MS = 60 * 60_000
const MAX_INIT_PER_WINDOW = 5
const MAX_RETRY_CHAIN = 3
const RETRY_COOLDOWN_MS = 5 * 60_000

/** @type {Map<string, object>} */
const activeByUser = new Map()

function nowMs() {
  return Date.now()
}

function ensureHistory(store) {
  if (!Array.isArray(store.mcVerifySessions)) store.mcVerifySessions = []
  return store.mcVerifySessions
}

function archiveSession(store, row, patch = {}) {
  const archived = {
    ...row,
    ...patch,
    finishedAt: patch.finishedAt ?? nowMs(),
  }
  const history = ensureHistory(store)
  const idx = history.findIndex((r) => String(r.id) === String(archived.id))
  if (idx >= 0) history[idx] = { ...history[idx], ...archived }
  else history.unshift(archived)
  if (history.length > 500) history.length = 500
  return archived
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function randomServerId() {
  return crypto.randomBytes(4).toString('hex')
}

function normalizeMcUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function getInitAttempts(store, userId) {
  const since = nowMs() - INIT_WINDOW_MS
  return ensureHistory(store).filter((row) => {
    if (String(row.userId || '') !== String(userId || '')) return false
    const created = Number(row.createdAt || 0)
    return Number.isFinite(created) && created >= since
  }).length
}

function buildView(userId, row, lastState = null) {
  if (!row) {
    return {
      hasSession: false,
      status: 'idle',
      failureReason: null,
      conflictCode: null,
      retryCount: 0,
      maxRetries: MAX_RETRY_CHAIN,
      createdAt: null,
      expiresAt: null,
      code: null,
      serverId: null,
      mcUsername: null,
      verified: false,
      expired: false,
      lastState,
    }
  }
  const expiresAt = Number(row.expiresAt || 0)
  const expired = row.status === 'pending' && expiresAt > 0 && expiresAt <= nowMs()
  const status = expired ? 'expired' : String(row.status || 'pending')
  return {
    hasSession: status === 'pending',
    status,
    failureReason: row.failureReason || null,
    conflictCode: row.conflictCode || null,
    retryCount: Number(row.retries || 0),
    maxRetries: Number(row.maxRetries ?? MAX_RETRY_CHAIN),
    createdAt: Number(row.createdAt || 0) || null,
    expiresAt: expiresAt || null,
    code: status === 'pending' ? row.code : null,
    serverId: row.serverId || null,
    mcUsername: row.mcUsername || null,
    verified: status === 'succeeded',
    expired,
    lastState: lastState || row,
  }
}

function hydrateActiveFromStore(store) {
  for (const row of ensureHistory(store)) {
    if (String(row.status || '') !== 'pending') continue
    const expiresAt = Number(row.expiresAt || 0)
    if (expiresAt && expiresAt <= nowMs()) continue
    activeByUser.set(String(row.userId || ''), row)
  }
}

/**
 * @param {string} userId
 * @param {string} mcUsername
 * @param {{ force?: boolean }} [options]
 */
export function createMcVerifySession(userId, mcUsername, options = {}) {
  const store = getStore()
  hydrateActiveFromStore(store)
  const uid = String(userId || '').trim()
  const mc = normalizeMcUsername(mcUsername)
  if (!uid || !mc) {
    return { ok: false, error: 'validation_error', message: '无效参数' }
  }

  const current = activeByUser.get(uid)
  if (current && String(current.status || '') === 'pending' && Number(current.expiresAt || 0) > nowMs()) {
    if (!options.force) {
      return {
        ok: false,
        error: 'session_conflict',
        session: buildView(uid, current),
      }
    }
    archiveSession(store, current, {
      status: 'cancelled',
      conflictCode: 'session_replaced',
      failureReason: 'replaced_by_new_session',
    })
    activeByUser.delete(uid)
  }

  const lastInitAt = Number(store.mcVerifyMeta?.[uid]?.lastInitAt || 0)
  if (lastInitAt && nowMs() - lastInitAt < INIT_COOLDOWN_MS) {
    return {
      ok: false,
      error: 'init_rate_limited',
      retryAfterSeconds: Math.ceil((INIT_COOLDOWN_MS - (nowMs() - lastInitAt)) / 1000),
    }
  }

  const retries = Number(store.mcVerifyMeta?.[uid]?.retryCount || 0)
  if (retries >= MAX_RETRY_CHAIN) {
    const retryAfter = Number(store.mcVerifyMeta?.[uid]?.retryBlockedUntil || 0) - nowMs()
    if (retryAfter > 0) {
      return {
        ok: false,
        error: 'max_retries_exceeded',
        retryAfterSeconds: Math.ceil(retryAfter / 1000),
        retryCount: retries,
        maxRetries: MAX_RETRY_CHAIN,
      }
    }
    if (!store.mcVerifyMeta) store.mcVerifyMeta = {}
    if (!store.mcVerifyMeta[uid]) store.mcVerifyMeta[uid] = {}
    store.mcVerifyMeta[uid].retryCount = 0
  }

  const attempts = getInitAttempts(store, uid)
  if (attempts >= MAX_INIT_PER_WINDOW) {
    return {
      ok: false,
      error: 'init_rate_limited',
      retryAfterSeconds: 3600,
    }
  }

  const createdAt = nowMs()
  const session = {
    id: crypto.randomUUID(),
    userId: uid,
    mcUsername: mc,
    status: 'pending',
    code: randomCode(),
    serverId: randomServerId(),
    retries,
    maxRetries: MAX_RETRY_CHAIN,
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
  }
  activeByUser.set(uid, session)
  ensureHistory(store).unshift({ ...session })
  if (!store.mcVerifyMeta) store.mcVerifyMeta = {}
  if (!store.mcVerifyMeta[uid]) store.mcVerifyMeta[uid] = {}
  store.mcVerifyMeta[uid].lastInitAt = createdAt
  scheduleSave()

  const remainingInitQuota = Math.max(0, MAX_INIT_PER_WINDOW - attempts - 1)
  return {
    ok: true,
    session,
    remainingInitQuota,
    instructions: {
      zh: `请在游戏内完成正版验证。验证码：${session.code}`,
      en: `Complete premium verification in-game. Code: ${session.code}`,
      mcUsername: mc,
      serverId: session.serverId,
      expiresInSeconds: Math.floor(SESSION_TTL_MS / 1000),
    },
  }
}

export function getMcVerifySession(userId) {
  const store = getStore()
  hydrateActiveFromStore(store)
  const uid = String(userId || '').trim()
  const row = activeByUser.get(uid)
  const history = ensureHistory(store).filter((r) => String(r.userId || '') === uid)
  const lastState = history[0] || null
  if (!row) return buildView(uid, null, lastState)
  const expiresAt = Number(row.expiresAt || 0)
  if (row.status === 'pending' && expiresAt && expiresAt <= nowMs()) {
    const expired = archiveSession(store, row, { status: 'expired', failureReason: 'expired' })
    activeByUser.delete(uid)
    scheduleSave()
    return buildView(uid, expired, expired)
  }
  return buildView(uid, row, lastState)
}

/**
 * @param {string} userId
 * @param {{ page?: number, pageSize?: number, status?: string }} [query]
 */
export function getMcVerifySessionHistory(userId, query = {}) {
  const store = getStore()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  const statusFilter = String(query.status || '').trim().toLowerCase()
  let rows = ensureHistory(store).filter((r) => String(r.userId || '') === String(userId || ''))
  if (statusFilter) rows = rows.filter((r) => String(r.status || '').toLowerCase() === statusFilter)
  const total = rows.length
  const start = (page - 1) * pageSize
  return { items: rows.slice(start, start + pageSize), total }
}

export function clearMcVerifySession(userId, reason = 'user_cancelled') {
  const store = getStore()
  hydrateActiveFromStore(store)
  const uid = String(userId || '').trim()
  const row = activeByUser.get(uid)
  if (!row || String(row.status || '') !== 'pending') return false
  archiveSession(store, row, {
    status: 'cancelled',
    failureReason: String(reason || 'user_cancelled'),
    conflictCode: 'user_cancelled',
  })
  activeByUser.delete(uid)
  scheduleSave()
  return true
}

export function completeMcVerifySession(userId, extra = {}) {
  const store = getStore()
  hydrateActiveFromStore(store)
  const uid = String(userId || '').trim()
  const row = activeByUser.get(uid)
  if (!row) return null
  const next = archiveSession(store, row, {
    status: 'succeeded',
    failureReason: null,
    conflictCode: null,
    ...extra,
  })
  activeByUser.delete(uid)
  if (!store.mcVerifyMeta) store.mcVerifyMeta = {}
  if (!store.mcVerifyMeta[uid]) store.mcVerifyMeta[uid] = {}
  store.mcVerifyMeta[uid].retryCount = 0
  store.mcVerifyMeta[uid].retryBlockedUntil = 0
  scheduleSave()
  return next
}

export function failMcVerifySession(userId, reason, extra = {}) {
  const store = getStore()
  hydrateActiveFromStore(store)
  const uid = String(userId || '').trim()
  const row = activeByUser.get(uid)
  if (!row) return null
  const retries = Number(row.retries || 0) + 1
  const blockedUntil = retries >= MAX_RETRY_CHAIN ? nowMs() + RETRY_COOLDOWN_MS : 0
  const next = archiveSession(store, row, {
    status: 'failed',
    failureReason: String(reason || 'verify_failed'),
    retries,
    ...extra,
  })
  activeByUser.delete(uid)
  if (!store.mcVerifyMeta) store.mcVerifyMeta = {}
  if (!store.mcVerifyMeta[uid]) store.mcVerifyMeta[uid] = {}
  store.mcVerifyMeta[uid].retryCount = retries
  store.mcVerifyMeta[uid].retryBlockedUntil = blockedUntil
  scheduleSave()
  return next
}
