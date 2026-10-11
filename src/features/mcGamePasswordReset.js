import crypto from 'node:crypto'
import { scheduleSave } from '../persist.js'
import { generateEmailVerificationCode } from '../auth/supertokensEmailDelivery.js'

const TTL_MS = 15 * 60_000

export async function createMcGamePasswordChallenge(store, { email, linkedMcUsername, ip }) {
  const addr = String(email || '').trim().toLowerCase()
  const mc = String(linkedMcUsername || '').trim()
  if (!addr || !mc) return { ok: false, error: 'validation_error' }
  if (!store.mcGamePasswordChallenges) store.mcGamePasswordChallenges = {}
  const key = `${addr}#${mc.toLowerCase()}`
  const now = Date.now()
  const prev = store.mcGamePasswordChallenges[key]
  if (prev && now - Number(prev.sentAt || 0) < 60_000) {
    return { ok: false, error: 'rate_limited', retryAfterSec: 60 }
  }
  const code = generateEmailVerificationCode()
  store.mcGamePasswordChallenges[key] = {
    code,
    email: addr,
    mcUsername: mc,
    sentAt: now,
    expiresAt: now + TTL_MS,
    attempts: 0,
    ip: String(ip || ''),
    id: crypto.randomUUID(),
  }
  scheduleSave()
  return { ok: true, message: '验证码已发送（开发环境请查日志或 SMTP）', code }
}

export async function confirmMcGamePasswordReset(store, { mcUsername, code, newPassword }, pluginReset) {
  const mc = String(mcUsername || '').trim()
  const token = String(code || '').trim()
  const np = String(newPassword || '')
  if (!mc || !token || !np) return { ok: false, error: 'validation_error', status: 400 }
  if (np.length < 6 || np.length > 72) return { ok: false, error: 'bad_password', status: 400 }
  const entries = Object.values(store.mcGamePasswordChallenges || {})
  const ch = entries.find((x) => String(x.mcUsername || '').toLowerCase() === mc.toLowerCase())
  if (!ch) return { ok: false, error: 'no_challenge', status: 400 }
  if (Date.now() > Number(ch.expiresAt || 0)) return { ok: false, error: 'expired', status: 400 }
  ch.attempts = Number(ch.attempts || 0) + 1
  if (ch.attempts > 8) return { ok: false, error: 'too_many_attempts', status: 429 }
  if (String(ch.code) !== token) return { ok: false, error: 'bad_code', status: 400 }
  if (typeof pluginReset === 'function') {
    const pr = await pluginReset({ username: mc, newPassword: np })
    if (!pr || pr.status < 200 || pr.status >= 300) {
      return { ok: false, error: 'plugin_reject', status: pr?.status || 502 }
    }
  }
  delete store.mcGamePasswordChallenges[`${ch.email}#${mc.toLowerCase()}`]
  scheduleSave()
  return { ok: true, message: '游戏密码已重置' }
}
