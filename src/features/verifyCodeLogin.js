import crypto from 'node:crypto'
import { config } from '../config.js'
import { scheduleSave } from '../persist.js'
import { generateEmailVerificationCode } from '../auth/supertokensEmailDelivery.js'
import { isUserBanned } from '../auth/userStatus.js'

const TTL_MS = 10 * 60_000

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function ensureLocalUser(store, email) {
  const addr = normalizeEmail(email)
  let u = store.users.find((x) => normalizeEmail(x.email) === addr)
  if (!u) {
    const username = addr.split('@')[0] || 'player'
    u = {
      id: crypto.randomUUID(),
      uuid: crypto.randomUUID(),
      username,
      email: addr,
      roles: [],
      emailVerified: true,
      linkedMcUsername: null,
      linkedMcUuid: null,
      verifiedMojang: false,
      totpEnabled: false,
      totpSecret: null,
      totpPendingSecret: null,
      recoveryCodes: [],
      recoveryCodesCount: 0,
    }
    store.users.push(u)
  }
  return u
}

function findLocalUserByEmail(store, email) {
  const addr = normalizeEmail(email)
  if (!addr) return null
  return (Array.isArray(store?.users) ? store.users : [])
    .find((user) => normalizeEmail(user?.email) === addr) || null
}

export function canUseVerifyCodeDevFallback(isProd, message) {
  if (isProd) return false

  const reason = String(message || '')
  return reason.includes('SuperTokens 未初始化') || reason.includes('用户不存在')
}

export async function sendVerifyCode(store, { email, ip, mode = 'login', deliver }) {
  const addr = normalizeEmail(email)
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    return { ok: false, error: 'invalid_email' }
  }
  if (!store.verifyCodeChallenges) store.verifyCodeChallenges = {}
  const now = Date.now()
  const prev = Object.values(store.verifyCodeChallenges).find(
    (x) => normalizeEmail(x.email) === addr && now - Number(x.sentAt || 0) < 45_000
  )
  if (prev) return { ok: false, error: 'rate_limited', retryAfterSec: 45 }

  const id = crypto.randomUUID()
  const code = generateEmailVerificationCode()
  store.verifyCodeChallenges[id] = {
    id,
    email: addr,
    code,
    mode,
    sentAt: now,
    expiresAt: now + TTL_MS,
    attempts: 0,
    ip: String(ip || ''),
  }

  if (typeof deliver === 'function') {
    try {
      await deliver({ email: addr, code, mode })
    } catch (error) {
      delete store.verifyCodeChallenges[id]
      scheduleSave()
      console.error('[starmc-api][verify-code] email delivery failed', error)
      return { ok: false, error: 'delivery_failed' }
    }
  }

  scheduleSave()

  const result = { ok: true, id, email: addr, message: '验证码已发送' }
  if (!config.isProd) result.code = code
  return result
}

export async function confirmVerifyCodeLogin(store, body, hooks = {}) {
  const addr = normalizeEmail(body?.email)
  const token = String(body?.code || '').trim()
  const mode = body?.mode === 'register' ? 'register' : 'login'
  const id = String(body?.id || '').trim()

  if (!addr || !token) return { ok: false, error: 'missing_params' }

  const ch =
    (id && store.verifyCodeChallenges?.[id]) ||
    Object.values(store.verifyCodeChallenges || {}).find((x) => normalizeEmail(x.email) === addr)
  if (!ch) return { ok: false, error: 'no_challenge' }
  if (ch.mode && ch.mode !== mode) return { ok: false, error: 'mode_mismatch' }
  if (Date.now() > Number(ch.expiresAt || 0)) return { ok: false, error: 'expired' }
  ch.attempts = Number(ch.attempts || 0) + 1
  if (ch.attempts > 8) return { ok: false, error: 'too_many_attempts', attemptsLeft: 0 }
  if (String(ch.code) !== token) {
    return { ok: false, error: 'bad_code', attemptsLeft: Math.max(0, 8 - ch.attempts) }
  }

  if (mode === 'login') {
    const localUser = findLocalUserByEmail(store, addr)
    if (isUserBanned(localUser)) {
      return {
        ok: false,
        error: 'account_banned',
        bannedAt: localUser.bannedAt || null,
        reason: localUser.banReason || null,
      }
    }
  }

  try {
    let authResult = null
    if (mode === 'register' && typeof hooks.onRegister === 'function') {
      const pw = String(body?.password || 'starmc-dev-pass')
      authResult = await hooks.onRegister(addr, pw, String(body?.username || '').trim())
    } else if (typeof hooks.onLogin === 'function') {
      try {
        authResult = await hooks.onLogin(addr)
      } catch (e) {
        if (canUseVerifyCodeDevFallback(config.isProd, e?.message)) {
          authResult = { userId: ensureLocalUser(store, addr).id, email: addr, devFallback: true }
        } else {
          throw e
        }
      }
    } else {
      if (!canUseVerifyCodeDevFallback(config.isProd, 'SuperTokens 未初始化')) {
        throw new Error('SuperTokens 未初始化')
      }
      authResult = { userId: ensureLocalUser(store, addr).id, email: addr, devFallback: true }
    }

    const user = ensureLocalUser(store, addr)
    if (authResult?.userId) user.supertokensUserId = authResult.userId
    delete store.verifyCodeChallenges[ch.id]
    scheduleSave()

    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles || [],
        emailVerified: true,
        linkedMcUsername: user.linkedMcUsername || undefined,
      },
    }
  } catch (e) {
    const msg = String(e?.message || e)
    if (msg.includes('邮箱已注册')) return { ok: false, error: 'user_exists' }
    if (msg.includes('用户不存在')) return { ok: false, error: 'user_not_found' }
    return { ok: false, error: 'auth_error', detail: msg }
  }
}
