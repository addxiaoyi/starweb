import crypto from 'crypto'
import { config } from '../config.js'
import { markKvDirty } from '../db/storeKvSync.js'
import { scheduleSave } from '../persist.js'
import { sendTransactionalMail } from '../mail/transactionalMail.js'

function findUserByLinkedMc(store, mcName) {
  const q = String(mcName || '').trim()
  if (!q) return null
  const lower = q.toLowerCase()
  return (
    store.users.find((u) => {
      const link = u.linkedMcUsername != null ? String(u.linkedMcUsername).trim() : ''
      return link && link.toLowerCase() === lower
    }) || null
  )
}

function isEmailVerified(u) {
  if (!u || typeof u !== 'object') return true
  const v = u.emailVerified
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return true
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim(), 'utf8').digest('hex')
}

function makeTraceId() {
  return crypto.randomBytes(6).toString('hex')
}

function logMcReset(event, payload) {
  try {
    console.info(`[mc-reset] ${event}`, payload)
  } catch {
    /* ignore logging failure */
  }
}

function timingSafeEqHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex')
    const bb = Buffer.from(String(b), 'hex')
    if (ba.length !== bb.length) return false
    return crypto.timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/** @param {string} email @param {string} mcUsername */
export function resolveUserForMcReset(store, email, mcUsername) {
  const em = String(email || '').trim().toLowerCase()
  const mc = String(mcUsername || '').trim()
  if (em) {
    return store.users.find((u) => String(u.email || '').toLowerCase() === em) || null
  }
  if (mc) {
    return findUserByLinkedMc(store, mc)
  }
  return null
}

export function pruneExpiredChallenges(store) {
  if (!Array.isArray(store.mcPasswordResetChallenges)) store.mcPasswordResetChallenges = []
  const now = Date.now()
  store.mcPasswordResetChallenges = store.mcPasswordResetChallenges.filter((c) => {
    const t = new Date(c.expiresAt).getTime()
    return Number.isFinite(t) && t > now
  })
}

/**
 * @returns {{ ok: boolean, silent?: boolean, error?: string, mcUsername?: string }}
 */
export async function createMcGamePasswordChallenge(store, { email, mcUsername, ip }) {
  const traceId = makeTraceId()
  if (!config.mcGamePasswordResetEnabled) {
    logMcReset('request.reject', { traceId, reason: 'disabled', ip: String(ip || '').slice(0, 64) })
    return { ok: false, error: 'disabled' }
  }
  if (config.authxPluginAdapter !== 'vla') {
    logMcReset('request.reject', { traceId, reason: 'vla_required' })
    return { ok: false, error: 'vla_required' }
  }
  pruneExpiredChallenges(store)
  const u = resolveUserForMcReset(store, email, mcUsername)
  if (!u) {
    return { ok: true, silent: true }
  }
  if (!isEmailVerified(u)) {
    return { ok: true, silent: true }
  }
  const mc = String(u.linkedMcUsername || '').trim()
  if (!mc) {
    return { ok: true, silent: true }
  }
  const userEmail = String(u.email || '').trim()
  if (!userEmail) {
    return { ok: true, silent: true }
  }

  const recent = store.mcPasswordResetChallenges.filter((c) => {
    if (c.mcUsername !== mc) return false
    const created = new Date(c.createdAt).getTime()
    return Date.now() - created < 60_000
  })
  if (recent.length >= (config.mcPasswordResetBurstPerMinute || 1)) {
    const latest = recent
      .map((c) => new Date(c.createdAt).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0]
    const retryAfterSec = latest
      ? Math.max(1, Math.ceil((60_000 - (Date.now() - latest)) / 1000))
      : 60
    return { ok: false, error: 'rate_limited', retryAfterSec }
  }

  const code = String(100000 + crypto.randomInt(900000))
  const id = crypto.randomUUID()
  const ttlMin = Math.max(5, Math.min(60, config.mcPasswordResetTtlMinutes || 15))
  const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString()
  store.mcPasswordResetChallenges.push({
    id,
    mcUsername: mc,
    email: userEmail,
    codeHash: hashCode(code),
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt,
    requestIp: String(ip || '').slice(0, 64)
  })
  if (store.mcPasswordResetChallenges.length > 200) {
    store.mcPasswordResetChallenges = store.mcPasswordResetChallenges.slice(-200)
  }
  markKvDirty('mc_password_reset_challenges')
  scheduleSave()

  const site = (config.publicSiteOrigin || config.supertokensWebsiteDomain || '').replace(/\/+$/, '')
  const subject = '[StarMC] 游戏库密码重置验证码'
  const text = `你正在通过网站重置 Minecraft 进服密码（角色名：${mc}）。\n验证码：${code}\n${ttlMin} 分钟内有效。如非本人操作请忽略。\n若需从网页完成：${site}/mc-game-password-reset`
  await sendTransactionalMail({ to: userEmail, subject, text })
  return { ok: true, mcUsername: mc }
}

/**
 * @param {(args: { username: string, newPassword: string }) => Promise<{ status: number, json: object }>} resetPluginPassword
 */
export async function confirmMcGamePasswordReset(store, { mcUsername, code, newPassword }, resetPluginPassword) {
  if (!config.mcGamePasswordResetEnabled) {
    return { ok: false, error: 'disabled', status: 503 }
  }
  if (config.authxPluginAdapter !== 'vla') {
    return { ok: false, error: 'vla_required', status: 400 }
  }
  const mc = String(mcUsername || '').trim()
  const pw = String(newPassword || '')
  if (!mc || mc.length < 3) {
    return { ok: false, error: 'validation_error', status: 400 }
  }
  if (pw.length < 6 || pw.length > config.maxPasswordLength) {
    return { ok: false, error: 'bad_password', status: 400 }
  }
  const codeStr = String(code || '').trim()
  if (!/^\d{6}$/.test(codeStr)) {
    return { ok: false, error: 'bad_code', status: 400, attemptsLeft: 8 }
  }
  pruneExpiredChallenges(store)
  const now = Date.now()
  const list = store.mcPasswordResetChallenges || []
  const idx = list.findIndex((c) => c.mcUsername === mc)
  if (idx < 0) {
    return { ok: false, error: 'no_challenge', status: 400, attemptsLeft: 8 }
  }
  const ch = list[idx]
  if (new Date(ch.expiresAt).getTime() < now) {
    list.splice(idx, 1)
    markKvDirty('mc_password_reset_challenges')
    scheduleSave()
    return { ok: false, error: 'expired', status: 400, attemptsLeft: 8 }
  }
  ch.attempts = (ch.attempts || 0) + 1
  if (ch.attempts > 8) {
    list.splice(idx, 1)
    markKvDirty('mc_password_reset_challenges')
    scheduleSave()
    return { ok: false, error: 'too_many_attempts', status: 429, attemptsLeft: 0 }
  }
  const expect = hashCode(codeStr)
  if (!timingSafeEqHex(expect, ch.codeHash)) {
    markKvDirty('mc_password_reset_challenges')
    scheduleSave()
    return { ok: false, error: 'bad_code', status: 400, attemptsLeft: Math.max(0, 8 - ch.attempts) }
  }

  const r = await resetPluginPassword({ username: mc, newPassword: pw })
  const okHttp = r.status >= 200 && r.status < 300
  if (!okHttp) {
    markKvDirty('mc_password_reset_challenges')
    scheduleSave()
    return {
      ok: false,
      error: 'plugin_reject',
      status: r.status >= 400 && r.status < 600 ? r.status : 502,
      detail: r.json
    }
  }
  list.splice(idx, 1)
  markKvDirty('mc_password_reset_challenges')
  scheduleSave()
  return { ok: true, status: 200 }
}
