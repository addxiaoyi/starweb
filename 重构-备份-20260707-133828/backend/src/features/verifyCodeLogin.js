/**
 * 邮箱验证码登录/注册模块
 * 支持两种模式：
 * 1. 登录：已有账号，通过邮箱验证码登录
 * 2. 注册：输入邮箱和新密码，创建新账号并登录
 */
import crypto from 'crypto'
import { config } from '../config.js'
import { markKvDirty } from '../db/storeKvSync.js'
import { scheduleSave } from '../persist.js'
import { sendTransactionalMail } from '../mail/transactionalMail.js'

// 验证码存储在 persist.js 的 store.verifyCodeChallenges 中

// ============================================================
// 账户级 + IP 级临时封禁（防暴力破解）
// ============================================================
const LOCKOUT_WINDOW_MS = 30 * 60 * 1000   // 30 分钟窗口
const LOCKOUT_MAX_FAILS = 5                 // 窗口内最多失败次数
const LOCKOUT_DURATION_MS = 60 * 60 * 1000 // 封禁持续 1 小时
const IP_LOCKOUT_WINDOW_MS = 10 * 60 * 1000 // IP 封禁窗口 10 分钟
const IP_LOCKOUT_MAX_FAILS = 10               // IP 窗口内最多失败次数（跨账户累计）
const IP_LOCKOUT_DURATION_MS = 30 * 60 * 1000 // IP 封禁 30 分钟

function getLocks(store) {
  if (!store.verifyCodeLocks || typeof store.verifyCodeLocks !== 'object') {
    store.verifyCodeLocks = {}
  }
  return store.verifyCodeLocks
}

/**
 * 检查邮箱是否被临时封禁
 * @returns {{ locked: boolean, until?: number, fails?: number }}  locked=true 表示被封禁
 */
function checkLockout(store, email) {
  const locks = getLocks(store)
  const lockKey = String(email || '').trim().toLowerCase()
  const entry = locks[lockKey]
  if (!entry) return { locked: false }

  const now = Date.now()
  const windowStart = now - LOCKOUT_WINDOW_MS
  const recentFails = (entry.fails || []).filter((t) => t > windowStart)

  // 清理过期失败记录
  if (recentFails.length < (entry.fails || []).length) {
    entry.fails = recentFails
    if (entry.bannedUntil && now > entry.bannedUntil) {
      // 封禁已过期，清除
      delete locks[lockKey]
      return { locked: false }
    }
  }

  if (entry.bannedUntil && now < entry.bannedUntil) {
    return { locked: true, until: entry.bannedUntil, fails: recentFails.length }
  }

  return { locked: false, fails: recentFails.length }
}

/**
 * 记录一次验证失败
 */
function recordFailure(store, email) {
  const locks = getLocks(store)
  const lockKey = String(email || '').trim().toLowerCase()
  const now = Date.now()
  const windowStart = now - LOCKOUT_WINDOW_MS

  if (!locks[lockKey]) {
    locks[lockKey] = { fails: [], bannedUntil: null }
  }

  const entry = locks[lockKey]
  // 只保留窗口内的失败记录
  entry.fails = (entry.fails || []).filter((t) => t > windowStart)
  entry.fails.push(now)

  // 超过阈值，触发封禁
  if (entry.fails.length >= LOCKOUT_MAX_FAILS && !entry.bannedUntil) {
    entry.bannedUntil = now + LOCKOUT_DURATION_MS
  }

  markKvDirty('verify_code_locks')
}

/**
 * 验证成功后清除失败记录
 */
function clearLockout(store, email) {
  const locks = getLocks(store)
  const lockKey = String(email || '').trim().toLowerCase()
  if (locks[lockKey]) {
    delete locks[lockKey]
    markKvDirty('verify_code_locks')
  }
}

// ============================================================
// IP 级封禁（防自动化脚本批量攻击）
// ============================================================

function getIpLocks(store) {
  if (!store.verifyCodeIpLocks || typeof store.verifyCodeIpLocks !== 'object') {
    store.verifyCodeIpLocks = {}
  }
  return store.verifyCodeIpLocks
}

/**
 * 检查 IP 是否被临时封禁
 * @returns {{ locked: boolean, until?: number, fails?: number }}
 */
function checkIpLockout(store, ip) {
  const locks = getIpLocks(store)
  const ipKey = String(ip || '').slice(0, 64)
  if (!ipKey) return { locked: false }

  const entry = locks[ipKey]
  if (!entry) return { locked: false }

  const now = Date.now()
  const windowStart = now - IP_LOCKOUT_WINDOW_MS
  const recentFails = (entry.fails || []).filter((t) => t > windowStart)

  if (recentFails.length < (entry.fails || []).length) {
    entry.fails = recentFails
    if (entry.bannedUntil && now > entry.bannedUntil) {
      delete locks[ipKey]
      return { locked: false }
    }
  }

  if (entry.bannedUntil && now < entry.bannedUntil) {
    return { locked: true, until: entry.bannedUntil, fails: recentFails.length }
  }

  return { locked: false, fails: recentFails.length }
}

/**
 * 记录一次 IP 级验证失败（跨账户累计）
 */
function recordIpFailure(store, ip) {
  if (!ip) return
  const locks = getIpLocks(store)
  const ipKey = ip.slice(0, 64)
  const now = Date.now()
  const windowStart = now - IP_LOCKOUT_WINDOW_MS

  if (!locks[ipKey]) {
    locks[ipKey] = { fails: [], bannedUntil: null }
  }

  const entry = locks[ipKey]
  entry.fails = (entry.fails || []).filter((t) => t > windowStart)
  entry.fails.push(now)

  if (entry.fails.length >= IP_LOCKOUT_MAX_FAILS && !entry.bannedUntil) {
    entry.bannedUntil = now + IP_LOCKOUT_DURATION_MS
    console.warn(`[verify-code][ip-lockout] IP ${ipKey} 被临时封禁（${entry.fails.length} 次失败在 ${IP_LOCKOUT_WINDOW_MS / 60000} 分钟内）`)
  }

  markKvDirty('verify_code_ip_locks')
}

/**
 * 验证成功后清除 IP 封禁记录
 */
function clearIpLockout(store, ip) {
  if (!ip) return
  const locks = getIpLocks(store)
  const ipKey = ip.slice(0, 64)
  if (locks[ipKey]) {
    delete locks[ipKey]
    markKvDirty('verify_code_ip_locks')
  }
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim(), 'utf8').digest('hex')
}

function makeTraceId() {
  return crypto.randomBytes(6).toString('hex')
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

function pruneExpiredVerifyCodes(store) {
  if (!Array.isArray(store.verifyCodeChallenges)) store.verifyCodeChallenges = []
  const now = Date.now()
  store.verifyCodeChallenges = store.verifyCodeChallenges.filter((c) => {
    const t = new Date(c.expiresAt).getTime()
    return Number.isFinite(t) && t > now
  })
}

/**
 * 发送验证码到邮箱
 * @param {object} params
 * @param {string} params.email - 目标邮箱
 * @param {string} params.ip - 请求 IP
 * @param {'login'|'register'} params.mode - 登录或注册模式
 * @returns {{ ok: boolean, error?: string, retryAfterSec?: number, email?: string }}
 */
export async function sendVerifyCode(store, { email, ip, mode = 'login' }) {
  const traceId = makeTraceId()
  const em = String(email || '').trim().toLowerCase()

  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return { ok: false, error: 'invalid_email' }
  }

  // 检查是否启用了邮件服务
  if (!config.smtpHost || !config.smtpFromEmail || !config.smtpPassword) {
    console.log(`[verify-code][${traceId}] SMTP 未配置，仅记录验证码（开发模式）`)
    // 开发模式：直接返回验证码用于测试
  }

  pruneExpiredVerifyCodes(store)

  // 频率限制 1：同一邮箱每分钟最多 1 次
  const recentByEmail = store.verifyCodeChallenges.filter((c) => {
    if (c.email !== em) return false
    const created = new Date(c.createdAt).getTime()
    return Date.now() - created < 60_000
  })

  if (recentByEmail.length >= 1) {
    const latest = recentByEmail
      .map((c) => new Date(c.createdAt).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0]
    const retryAfterSec = latest ? Math.max(1, Math.ceil((60_000 - (Date.now() - latest)) / 1000)) : 60
    return { ok: false, error: 'rate_limited', retryAfterSec }
  }

  // 频率限制 2：同一 IP 每分钟最多 5 次（防邮件轰炸）
  const recentByIp = store.verifyCodeChallenges.filter((c) => {
    if (!ip || c.requestIp !== ip) return false
    const created = new Date(c.createdAt).getTime()
    return Date.now() - created < 60_000
  })

  if (recentByIp.length >= 5) {
    const latest = recentByIp
      .map((c) => new Date(c.createdAt).getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0]
    const retryAfterSec = latest ? Math.max(1, Math.ceil((60_000 - (Date.now() - latest)) / 1000)) : 60
    return { ok: false, error: 'ip_rate_limited', retryAfterSec }
  }

  // P1-B4: 账户级封禁检查
  const lockStatus = checkLockout(store, em)
  if (lockStatus.locked) {
    const retryAfterSec = Math.max(1, Math.ceil((lockStatus.until - Date.now()) / 1000))
    return { ok: false, error: 'account_locked', retryAfterSec }
  }

  // IP 级封禁检查（在发送前拦截）
  if (ip) {
    const ipLockStatus = checkIpLockout(store, ip)
    if (ipLockStatus.locked) {
      const retryAfterSec = Math.max(1, Math.ceil((ipLockStatus.until - Date.now()) / 1000))
      return { ok: false, error: 'ip_locked', retryAfterSec }
    }
  }

  // 生成 6 位数字验证码
  const code = String(100000 + crypto.randomInt(900000))
  const id = crypto.randomUUID()
  const ttlMin = Math.max(5, Math.min(30, config.verifyCodeTtlMinutes || 10))
  const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString()

  store.verifyCodeChallenges = store.verifyCodeChallenges || []
  store.verifyCodeChallenges.push({
    id,
    email: em,
    mode,
    codeHash: hashCode(code),
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt,
    requestIp: String(ip || '').slice(0, 64)
  })

  // 限制存储数量
  if (store.verifyCodeChallenges.length > 500) {
    store.verifyCodeChallenges = store.verifyCodeChallenges.slice(-500)
  }

  markKvDirty('verify_code_challenges')
  scheduleSave()

  const isRegister = mode === 'register'
  const subject = isRegister ? '[StarMC] 注册验证码' : '[StarMC] 登录验证码'
  const text = isRegister
    ? `你正在注册 StarMC 账号（邮箱：${em}）。\n验证码：${code}\n${ttlMin} 分钟内有效。如非本人操作请忽略。`
    : `你正在登录 StarMC 账号（邮箱：${em}）。\n验证码：${code}\n${ttlMin} 分钟内有效。如非本人操作请忽略。\n请求 IP：${ip || '未知'}`

  // 开发模式下记录验证码
  if (!config.smtpHost) {
    console.log(`[verify-code][${traceId}] 开发模式 - 验证码: ${code}`)
  }

  await sendTransactionalMail({ to: em, subject, text })

  return { ok: true, email: maskEmail(em), id }
}

/**
 * 验证验证码并完成登录/注册
 * @param {object} params
 * @param {string} params.email - 邮箱
 * @param {string} params.code - 验证码
 * @param {string} params.password - 新密码（注册模式必填）
 * @param {string} params.mode - login 或 register
 * @param {Function} params.onLogin - 登录成功回调 (email) => Promise<{userId, email}>
 * @param {Function} params.onRegister - 注册成功回调 (email, password) => Promise<{userId, email}>
 * @returns {{ ok: boolean, error?: string, token?: string, user?: object, accessToken?: string, refreshToken?: string }}
 */
export async function confirmVerifyCodeLogin(
  store,
  { id, email, code, password, mode = 'login', ip },
  { onLogin, onRegister }
) {
  const em = String(email || '').trim().toLowerCase()
  const codeStr = String(code || '').trim()

  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return { ok: false, error: 'invalid_email' }
  }

  if (!/^\d{6}$/.test(codeStr)) {
    recordFailure(store, em)
    return { ok: false, error: 'bad_code', attemptsLeft: 5 }
  }

  // P1-B4: 账户级封禁检查
  const lockStatus = checkLockout(store, em)
  if (lockStatus.locked) {
    const retryAfterSec = lockStatus.until
      ? Math.max(1, Math.ceil((lockStatus.until - Date.now()) / 1000))
      : 60
    return { ok: false, error: 'account_locked', attemptsLeft: 0, retryAfterSec }
  }

  // IP 级封禁检查
  if (ip) {
    const ipLockStatus = checkIpLockout(store, ip)
    if (ipLockStatus.locked) {
      const retryAfterSec = Math.max(1, Math.ceil((ipLockStatus.until - Date.now()) / 1000))
      return { ok: false, error: 'ip_locked', attemptsLeft: 0, retryAfterSec }
    }
  }

  // 注册模式需要密码
  if (mode === 'register') {
    const pw = String(password || '')
    if (pw.length < 6 || pw.length > (config.maxPasswordLength || 128)) {
      return { ok: false, error: 'bad_password' }
    }
  }

  // P3-C6: confirm 也执行 prune，防止 challenge 堆积
  pruneExpiredVerifyCodes(store)

  const list = store.verifyCodeChallenges || []

  // P0-A2: 用 UUID (id) 而非 email+mode 索引，消除竞态窗口
  // 同时仍要求 email+mode 匹配，防止跨用户复用 challenge ID
  const idx = id
    ? list.findIndex((c) => c.id === id && c.email === em && c.mode === mode)
    : list.findIndex((c) => c.email === em && c.mode === mode)

  if (idx < 0) {
    // P0-B1: 用户枚举防护——不存在 challenge 时返回与 bad_code 完全一致的响应
    // 攻击者无法区分"从未发过验证码"和"输错验证码"
    recordFailure(store, em)
    if (ip) recordIpFailure(store, ip)
    return { ok: false, error: 'bad_code', attemptsLeft: 5 }
  }

  const ch = list[idx]
  const now = Date.now()

  if (new Date(ch.expiresAt).getTime() < now) {
    recordFailure(store, em)
    if (ip) recordIpFailure(store, ip)
    list.splice(idx, 1)
    markKvDirty('verify_code_challenges')
    scheduleSave()
    return { ok: false, error: 'bad_code', attemptsLeft: 5 }
  }

  ch.attempts = (ch.attempts || 0) + 1

  if (ch.attempts > 5) {
    recordFailure(store, em)
    if (ip) recordIpFailure(store, ip)
    list.splice(idx, 1)
    markKvDirty('verify_code_challenges')
    scheduleSave()
    return { ok: false, error: 'too_many_attempts', attemptsLeft: 0 }
  }

  // P0-A2: 防竞态——已被使用过的 challenge 直接拒绝
  if (ch.used) {
    recordFailure(store, em)
    if (ip) recordIpFailure(store, ip)
    return { ok: false, error: 'bad_code', attemptsLeft: Math.max(0, 5 - ch.attempts) }
  }

  const expect = hashCode(codeStr)
  if (!timingSafeEqHex(expect, ch.codeHash)) {
    recordFailure(store, em)
    if (ip) recordIpFailure(store, ip)
    markKvDirty('verify_code_challenges')
    scheduleSave()
    return { ok: false, error: 'bad_code', attemptsLeft: Math.max(0, 5 - ch.attempts) }
  }

  // 验证成功：标记 used（用 ID 删除而非索引，防止并发 splice 误删）
  ch.used = true
  markKvDirty('verify_code_challenges')
  scheduleSave()
  // 用 ID 重新查找再删除——如果另一个并发请求已经删了，findIndex 返回 -1 就跳过
  const actualIdx = list.findIndex((c) => c.id === ch.id)
  if (actualIdx >= 0) {
    list.splice(actualIdx, 1)
  }

  try {
    let result

    if (mode === 'login') {
      // 登录模式：调用登录回调获取用户信息
      if (onLogin) {
        result = await onLogin(em)
      } else {
        // 如果没有 onLogin 回调，至少返回邮箱信息
        result = { userId: null, email: em }
      }
    } else {
      // 注册模式：调用注册回调
      if (onRegister) {
        result = await onRegister(em, password)
      } else {
        result = { userId: null, email: em }
      }
    }

    // P1-B4: 验证成功后清除账户 + IP 封禁记录
    clearLockout(store, em)
    if (ip) clearIpLockout(store, ip)

    return {
      ok: true,
      user: { email: em, ...result }
    }
  } catch (err) {
    console.error('[verify-code] login/register error:', err)
    const errorMsg = String(err?.message || err)

    // Issue 1: 注册模式下隐藏用户枚举错误，统一返回通用错误
    // 攻击者无法通过区分"user_exists"和"user_not_found"来判断邮箱是否已注册
    // Issue 3: 注册模式下的错误不计入封禁（不是验证码错误）
    // Issue 3: 用户不存在（登录模式）也不计入封禁——不是验证码错误，只是查询失败
    if (mode === 'register') {
      // 注册模式：统一返回 register_failed，不暴露邮箱是否已注册
      return { ok: false, error: 'register_failed', attemptsLeft: Math.max(0, 5 - ch.attempts) }
    }

    if (errorMsg.includes('用户不存在') || errorMsg.includes('not exist')) {
      return { ok: false, error: 'user_not_found' }
    }
    return { ok: false, error: 'auth_error' }
  }
}

/**
 * 邮箱脱敏显示
 */
function maskEmail(email) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}@${domain}`
}
