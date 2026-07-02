/**
 * Minecraft 正版验证（hasJoined）功能模块
 *
 * 验证流程（MicroAuth / 皮肤站通用模式）：
 *  1. 前端 POST /api/user/minecraft/verify/init    → 生成 6 位验证码，写入 store
 *  2. 玩家在游戏内连接服务器（serverId = 验证码）
 *  3. VLA 检测到 hasJoined serverId，调用 Mojang API 验证
 *  4. 验证成功 → VLA POST /api/plugin/authx/callback/verify-premium 通知后端
 *  5. 后端标记 verifiedMojang = true，存 Mojang UUID
 *
 * 参考文献：https://minecraft.wiki/w/Mojang_API#UUID_and_profile_lookups
 */
import crypto from 'crypto'
import { config } from '../config.js'
import { getStore, scheduleSave } from '../persist.js'
import { markUserProfileDirty } from '../db/siteUserProfileSync.js'

/** 验证码有效期：10 分钟 */
const VERIFY_CODE_TTL_MS = 10 * 60 * 1000

/** 验证码长度 */
const CODE_LENGTH = 6

/** 会话历史保留上限 */
const VERIFY_HISTORY_LIMIT = 20

/** 单用户每小时最多发起次数（防并发滥用） */
const VERIFY_INIT_LIMIT_PER_HOUR = 8

/** 连续失败重试链窗口（24 小时） */
const VERIFY_RETRY_CHAIN_WINDOW_MS = 24 * 60 * 60 * 1000

/** Mojang hasJoined endpoint */
const MOJANG_HASJOINED = 'https://sessionserver.mojang.com/session/minecraft/hasjoined'

/** 验证会话存储在 store 中的 key */
export const VERIFY_SESSION_KEY = 'mcVerifySessions'
export const VERIFY_SESSION_STATE = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
})

const ACTIVE_STATES = new Set([VERIFY_SESSION_STATE.PENDING])
const TERMINAL_STATES = new Set([
  VERIFY_SESSION_STATE.SUCCEEDED,
  VERIFY_SESSION_STATE.EXPIRED,
  VERIFY_SESSION_STATE.CANCELLED,
  VERIFY_SESSION_STATE.FAILED,
])

function initSessions(store) {
  if (!store._mcVerifySessions) {
    store._mcVerifySessions = {}
  }
  return store._mcVerifySessions
}

function initSessionHistory(store) {
  if (!store._mcVerifySessionHistory || typeof store._mcVerifySessionHistory !== 'object') {
    store._mcVerifySessionHistory = {}
  }
  return store._mcVerifySessionHistory
}

function initRateWindow(store) {
  if (!store._mcVerifyInitRate || typeof store._mcVerifyInitRate !== 'object') {
    store._mcVerifyInitRate = {}
  }
  return store._mcVerifyInitRate
}

function trimToLen(input, maxLen = 64) {
  const s = String(input || '').trim()
  if (!s) return ''
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null
  const code = trimToLen(raw.code, 12)
  const serverId = trimToLen(raw.serverId, 64)
  const mcUsername = trimToLen(raw.mcUsername, 16).toLowerCase()
  const createdAt = Number(raw.createdAt) || Date.now()
  const expiresAt = Number(raw.expiresAt) || createdAt + VERIFY_CODE_TTL_MS
  const statusRaw = String(raw.status || '').trim().toLowerCase()
  const status = Object.values(VERIFY_SESSION_STATE).includes(statusRaw)
    ? statusRaw
    : raw.verified
      ? VERIFY_SESSION_STATE.SUCCEEDED
      : Date.now() > expiresAt
        ? VERIFY_SESSION_STATE.EXPIRED
        : VERIFY_SESSION_STATE.PENDING
  const retries = Math.max(0, Number(raw.retries) || 0)
  const maxRetries = Math.max(1, Number(raw.maxRetries) || 3)
  return {
    id: trimToLen(raw.id, 80) || crypto.randomUUID(),
    code,
    serverId,
    mcUsername,
    createdAt,
    updatedAt: Number(raw.updatedAt) || createdAt,
    expiresAt,
    status,
    verified: status === VERIFY_SESSION_STATE.SUCCEEDED || Boolean(raw.verified),
    mojangUuid: trimToLen(raw.mojangUuid, 64) || null,
    failureReason: trimToLen(raw.failureReason, 80) || null,
    conflictCode: trimToLen(raw.conflictCode, 80) || null,
    retries,
    maxRetries,
    finishedAt: Number(raw.finishedAt) || null,
  }
}

function publicSessionView(session) {
  return {
    id: session.id,
    code: session.code,
    serverId: session.serverId,
    mcUsername: session.mcUsername,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    status: session.status,
    verified: Boolean(session.verified),
    mojangUuid: session.mojangUuid,
    failureReason: session.failureReason,
    conflictCode: session.conflictCode,
    retries: session.retries,
    maxRetries: session.maxRetries,
    finishedAt: session.finishedAt,
  }
}

function isActiveSession(session) {
  return ACTIVE_STATES.has(String(session?.status || '').toLowerCase())
}

function isTerminalSession(session) {
  return TERMINAL_STATES.has(String(session?.status || '').toLowerCase())
}

function appendHistory(store, userId, session) {
  const historyByUser = initSessionHistory(store)
  const uid = trimToLen(userId, 64)
  if (!uid) return
  if (!Array.isArray(historyByUser[uid])) historyByUser[uid] = []
  historyByUser[uid].unshift(publicSessionView(session))
  if (historyByUser[uid].length > VERIFY_HISTORY_LIMIT) {
    historyByUser[uid].length = VERIFY_HISTORY_LIMIT
  }
}

function markTerminalAndArchive(store, userId, session, status, reason, conflictCode) {
  if (!session) return
  session.status = status
  session.verified = status === VERIFY_SESSION_STATE.SUCCEEDED
  session.failureReason = reason ? trimToLen(reason, 80) : null
  session.conflictCode = conflictCode ? trimToLen(conflictCode, 80) : null
  session.finishedAt = Date.now()
  session.updatedAt = Date.now()
  appendHistory(store, userId, session)
  const sessions = initSessions(store)
  delete sessions[userId]
}

function expireIfNeeded(store, userId, session) {
  if (!session) return null
  if (!isActiveSession(session)) return session
  if (Date.now() <= Number(session.expiresAt || 0)) return session
  markTerminalAndArchive(
    store,
    userId,
    session,
    VERIFY_SESSION_STATE.EXPIRED,
    'timeout',
    null
  )
  return null
}

function checkAndBumpInitRate(store, userId) {
  const bucket = initRateWindow(store)
  const uid = trimToLen(userId, 64)
  const hour = Math.floor(Date.now() / 3600000)
  const current = bucket[uid]
  if (!current || Number(current.hour) !== hour) {
    bucket[uid] = { hour, count: 1 }
    return { ok: true, remaining: VERIFY_INIT_LIMIT_PER_HOUR - 1 }
  }
  const count = Math.max(0, Number(current.count) || 0)
  if (count >= VERIFY_INIT_LIMIT_PER_HOUR) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.floor((hour * 3600000 + 3600000 - Date.now()) / 1000)),
    }
  }
  current.count = count + 1
  return { ok: true, remaining: VERIFY_INIT_LIMIT_PER_HOUR - current.count }
}

function latestSessionHistory(store, userId) {
  const historyByUser = initSessionHistory(store)
  const uid = trimToLen(userId, 64)
  const list = Array.isArray(historyByUser[uid]) ? historyByUser[uid] : []
  return list.length > 0 ? list[0] : null
}

function buildRetryPolicy(store, userId, mcUsername, configuredMaxRetries) {
  const now = Date.now()
  const last = latestSessionHistory(store, userId)
  const maxRetries = Math.max(
    1,
    Number(configuredMaxRetries) || Number(last?.maxRetries) || 3
  )
  const sameUser = String(last?.mcUsername || '') === String(mcUsername || '')
  const withinWindow =
    Number(last?.createdAt) > 0 &&
    now - Number(last.createdAt) <= VERIFY_RETRY_CHAIN_WINDOW_MS
  const isFailureChain =
    sameUser &&
    withinWindow &&
    String(last?.status || '') !== VERIFY_SESSION_STATE.SUCCEEDED &&
    isTerminalSession(last)
  const retrySeed = isFailureChain ? Math.max(0, Number(last?.retries || 0)) : 0
  const retryCount = retrySeed + 1
  const retryWindowEndMs = isFailureChain
    ? Number(last.createdAt) + VERIFY_RETRY_CHAIN_WINDOW_MS
    : now + VERIFY_RETRY_CHAIN_WINDOW_MS
  const retryAfterSeconds = Math.max(1, Math.floor((retryWindowEndMs - now) / 1000))
  return { retryCount, maxRetries, retryAfterSeconds }
}

/**
 * 生成 6 位数字验证码并写入 store
 * @param {string} userId   SuperTokens 用户 ID
 * @param {string} mcUsername 玩家声称的 MC 用户名
 * @param {{ force?: boolean, maxRetries?: number }} [options]
 * @returns {{
 *  ok: boolean,
 *  error?: string,
 *  retryAfterSeconds?: number,
 *  session?: ReturnType<typeof publicSessionView>,
 *  remainingInitQuota?: number,
 *  instructions?: string
 * }}
 */
export function createMcVerifySession(userId, mcUsername, options = {}) {
  const store = getStore()
  const sessions = initSessions(store)

  const uid = trimToLen(userId, 64)
  const normalizedName = trimToLen(mcUsername, 16).toLowerCase()
  if (!uid || !normalizedName) {
    return { ok: false, error: 'bad_username' }
  }

  const force = Boolean(options.force)
  const prev = expireIfNeeded(store, uid, normalizeSession(sessions[uid]))
  if (prev && isActiveSession(prev) && !force) {
    sessions[uid] = prev
    markUserProfileDirty(uid)
    scheduleSave()
    return {
      ok: false,
      error: 'session_conflict',
      session: publicSessionView(prev),
    }
  }
  if (prev && isActiveSession(prev) && force) {
    markTerminalAndArchive(
      store,
      uid,
      prev,
      VERIFY_SESSION_STATE.CANCELLED,
      'superseded_by_new_session',
      'session_replaced'
    )
  }

  const rate = checkAndBumpInitRate(store, uid)
  if (!rate.ok) {
    markUserProfileDirty(uid)
    scheduleSave()
    return {
      ok: false,
      error: 'init_rate_limited',
      retryAfterSeconds: rate.retryAfterSeconds,
    }
  }

  const now = Date.now()
  const retryPolicy = buildRetryPolicy(store, uid, normalizedName, options.maxRetries)
  if (retryPolicy.retryCount > retryPolicy.maxRetries) {
    markUserProfileDirty(uid)
    scheduleSave()
    return {
      ok: false,
      error: 'max_retries_exceeded',
      retryAfterSeconds: retryPolicy.retryAfterSeconds,
      retryCount: retryPolicy.maxRetries,
      maxRetries: retryPolicy.maxRetries,
    }
  }
  const code = String(Math.floor(10 ** (CODE_LENGTH - 1) + Math.random() * (9 * 10 ** (CODE_LENGTH - 1))))
  const session = {
    id: crypto.randomUUID(),
    code,
    serverId: `STMC_V${code}`,
    mcUsername: normalizedName,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + VERIFY_CODE_TTL_MS,
    status: VERIFY_SESSION_STATE.PENDING,
    verified: false,
    mojangUuid: null,
    failureReason: null,
    conflictCode: null,
    retries: retryPolicy.retryCount,
    maxRetries: retryPolicy.maxRetries,
    finishedAt: null,
  }
  sessions[uid] = session

  markUserProfileDirty(uid)
  scheduleSave()

  const serverHost = config.publicSiteUrl
    ? new URL(config.publicSiteUrl).hostname
    : 'your-server.com'
  const instructions =
    `连接服务器后在「服务器地址」栏填写：\n` +
    `${serverHost}?verify=${code}\n` +
    `（或直接连接服务器，系统将自动验证）`

  return {
    ok: true,
    session: publicSessionView(session),
    instructions,
    remainingInitQuota: rate.remaining,
  }
}

/**
 * 获取当前验证码会话状态
 * @param {string} userId
 * @returns {{
 *  hasSession: boolean,
 *  code: string|null,
 *  mcUsername: string|null,
 *  verified: boolean,
 *  mojangUuid: string|null,
 *  expired: boolean,
 *  status: string|null,
 *  failureReason: string|null,
 *  retryCount: number,
 *  maxRetries: number,
 *  createdAt: number|null,
 *  expiresAt: number|null,
 *  lastState: ReturnType<typeof publicSessionView>|null,
 * }}
 */
export function getMcVerifySession(userId) {
  const store = getStore()
  const sessions = initSessions(store)
  const uid = trimToLen(userId, 64)
  const normalized = expireIfNeeded(store, uid, normalizeSession(sessions[uid]))

  if (!normalized) {
    const last = latestSessionHistory(store, uid)
    return {
      hasSession: false,
      code: null,
      mcUsername: null,
      verified: false,
      mojangUuid: null,
      expired: last?.status === VERIFY_SESSION_STATE.EXPIRED,
      status: last?.status || null,
      failureReason: last?.failureReason || null,
      conflictCode: last?.conflictCode || null,
      retryCount: Number(last?.retries || 0),
      maxRetries: Number(last?.maxRetries || 0),
      createdAt: Number(last?.createdAt || 0) || null,
      expiresAt: Number(last?.expiresAt || 0) || null,
      lastState: last,
    }
  }

  sessions[uid] = normalized

  if (!isActiveSession(normalized)) {
    const last = publicSessionView(normalized)
    return {
      hasSession: false,
      code: null,
      mcUsername: null,
      verified: normalized.status === VERIFY_SESSION_STATE.SUCCEEDED,
      mojangUuid: normalized.mojangUuid,
      expired: normalized.status === VERIFY_SESSION_STATE.EXPIRED,
      status: normalized.status,
      failureReason: normalized.failureReason,
      conflictCode: normalized.conflictCode,
      retryCount: normalized.retries,
      maxRetries: normalized.maxRetries,
      createdAt: normalized.createdAt,
      expiresAt: normalized.expiresAt,
      lastState: last,
    }
  }

  return {
    hasSession: true,
    code: normalized.code,
    mcUsername: normalized.mcUsername,
    verified: normalized.verified,
    mojangUuid: normalized.mojangUuid,
    expired: false,
    status: normalized.status,
    failureReason: normalized.failureReason,
    conflictCode: normalized.conflictCode,
    retryCount: normalized.retries,
    maxRetries: normalized.maxRetries,
    createdAt: normalized.createdAt,
    expiresAt: normalized.expiresAt,
    lastState: latestSessionHistory(store, uid),
  }
}

/**
 * 获取验证会话历史（分页）
 * @param {string} userId
 * @param {{ page?: number, pageSize?: number, status?: string }} [options]
 * @returns {{
 *  total: number,
 *  page: number,
 *  pageSize: number,
 *  items: ReturnType<typeof publicSessionView>[]
 * }}
 */
export function getMcVerifySessionHistory(userId, options = {}) {
  const store = getStore()
  const sessions = initSessions(store)
  const historyByUser = initSessionHistory(store)
  const uid = trimToLen(userId, 64)
  if (!uid) {
    return { total: 0, page: 1, pageSize: 20, items: [] }
  }

  // 读取历史前先触发一次过期归档，避免活跃会话超时后看不到终态
  expireIfNeeded(store, uid, normalizeSession(sessions[uid]))

  const page = Math.max(1, Number(options?.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(options?.pageSize) || 20))
  const statusFilter = trimToLen(options?.status, 32).toLowerCase()

  let items = Array.isArray(historyByUser[uid]) ? [...historyByUser[uid]] : []
  if (statusFilter) {
    items = items.filter((row) => String(row?.status || '').toLowerCase() === statusFilter)
  }
  items.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))

  const total = items.length
  const start = (page - 1) * pageSize
  return {
    total,
    page,
    pageSize,
    items: items.slice(start, start + pageSize),
  }
}

/**
 * 清除验证码会话
 * @param {string} userId
 * @param {string} [reason]
 */
export function clearMcVerifySession(userId, reason = 'user_cancelled') {
  const store = getStore()
  const sessions = initSessions(store)
  const uid = trimToLen(userId, 64)
  const current = normalizeSession(sessions[uid])
  if (!current) return false

  if (isActiveSession(current)) {
    markTerminalAndArchive(
      store,
      uid,
      current,
      VERIFY_SESSION_STATE.CANCELLED,
      reason,
      null
    )
  } else {
    delete sessions[uid]
    appendHistory(store, uid, current)
  }
  markUserProfileDirty(uid)
  scheduleSave()
  return true
}

/**
 * 将当前验证会话标记为失败并结束（用于插件回调失败/冲突场景）。
 * @param {string} userId
 * @param {string} reason
 */
export function failMcVerifySession(userId, reason = 'verification_failed', options = {}) {
  const store = getStore()
  const sessions = initSessions(store)
  const uid = trimToLen(userId, 64)
  const current = normalizeSession(sessions[uid])
  if (!current) {
    return { ok: false, code: 'no_active_session' }
  }
  const expectedUsername = trimToLen(options.mcUsername, 16).toLowerCase()
  if (expectedUsername && current.mcUsername && expectedUsername !== current.mcUsername) {
    return { ok: false, code: 'session_username_mismatch', session: publicSessionView(current) }
  }
  if (!isActiveSession(current)) {
    return { ok: false, code: 'session_not_active', session: publicSessionView(current) }
  }
  markTerminalAndArchive(
    store,
    uid,
    current,
    VERIFY_SESSION_STATE.FAILED,
    reason,
    options.conflictCode || null
  )
  markUserProfileDirty(uid)
  scheduleSave()
  return { ok: true, code: 'failed', session: publicSessionView(current) }
}

/**
 * 调用 Mojang hasJoined API 验证玩家是否在指定 serverId 下连接过
 * @param {string} mcUsername
 * @param {string} serverId
 * @returns {Promise<{ ok: boolean, mojangUuid: string|null, error: string|null }>}
 */
export async function mojangHasJoined(mcUsername, serverId) {
  const ua = config.mojangApiUserAgent || 'StarMC-Auth/1.0'
  const timeout = config.mojangApiTimeoutMs ?? 5000
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)

  try {
    const url = `${MOJANG_HASJOINED}/${encodeURIComponent(mcUsername)}?serverId=${encodeURIComponent(serverId)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'application/json' },
      signal: ctrl.signal,
    })

    if (res.status === 204 || res.status === 404) {
      return { ok: false, mojangUuid: null, error: 'not_joined' }
    }
    if (res.status === 429) {
      return { ok: false, mojangUuid: null, error: 'rate_limited' }
    }
    if (!res.ok) {
      return { ok: false, mojangUuid: null, error: 'api_error' }
    }

    const profile = await res.json()
    const uuid = profile?.id ?? null

    return { ok: true, mojangUuid: uuid, error: null }
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { ok: false, mojangUuid: null, error: 'timeout' }
    }
    return { ok: false, mojangUuid: null, error: 'network_error' }
  } finally {
    clearTimeout(t)
  }
}

/**
 * 完成验证：标记会话为已验证（VLA 回调后调用）
 * @param {string} userId
 * @param {string|null} mojangUuid
 */
export function completeMcVerifySession(userId, mojangUuid, options = {}) {
  const store = getStore()
  const sessions = initSessions(store)
  const uid = trimToLen(userId, 64)
  const normalizedMojangUuid = trimToLen(mojangUuid, 64)
  const s = expireIfNeeded(store, uid, normalizeSession(sessions[uid]))

  if (!s || !isActiveSession(s)) {
    return { ok: false, code: 'no_active_session' }
  }
  if (!normalizedMojangUuid) {
    return { ok: false, code: 'missing_mojang_uuid', session: publicSessionView(s) }
  }
  const expectedUsername = trimToLen(options.mcUsername, 16).toLowerCase()
  if (expectedUsername && s.mcUsername && expectedUsername !== s.mcUsername) {
    return { ok: false, code: 'session_username_mismatch', session: publicSessionView(s) }
  }

  s.status = VERIFY_SESSION_STATE.SUCCEEDED
  s.verified = true
  s.mojangUuid = normalizedMojangUuid
  s.updatedAt = Date.now()
  s.finishedAt = Date.now()
  appendHistory(store, uid, s)
  delete sessions[uid]

  // 同步到用户记录
  const u = store.users.find((x) => x.id === uid)
  if (u) {
    u.verifiedMojang = true
    u.linkedMcUuid = normalizedMojangUuid
    markUserProfileDirty(u.id)
  }

  scheduleSave()
  return { ok: true, code: 'succeeded', session: publicSessionView(s) }
}
