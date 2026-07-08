import rateLimit from 'express-rate-limit'
import { buildErrorBody } from '../utils/response.js'

function clientIp(req) {
  const rip = String(req.ip || '').trim()
  if (rip) return rip
  return String(req.socket?.remoteAddress || '').trim() || 'unknown'
}

function configMax(envKey, fallback) {
  const n = Number(process.env[envKey])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function botRegexList() {
  const builtins = [
    /python-requests/i,
    /curl\//i,
    /wget\//i,
    /libwww-perl/i,
    /aiohttp/i,
    /httpclient/i,
    /scrapy/i,
    /selenium/i,
    /playwright/i,
    /puppeteer/i,
    /headless/i,
    /phantomjs/i,
    /go-http-client/i,
    /java\//i,
    /okhttp/i
  ]
  const custom = String(process.env.BOT_UA_BLOCKLIST || '')
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return new RegExp(s, 'i')
      } catch {
        return null
      }
    })
    .filter(Boolean)
  return [...builtins, ...custom]
}

const BAD_BOT_UA_REGEX = botRegexList()

function isSuspiciousBot(req) {
  const ua = String(req.headers['user-agent'] || '').trim()
  if (!ua) return true
  return BAD_BOT_UA_REGEX.some((re) => re.test(ua))
}

function compactDetails(raw = {}) {
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue
    out[key] = value
  }
  return out
}

export function buildRateLimitDetails(req, options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs))
    ? Number(options.nowMs)
    : Date.now()
  const resetRaw = req?.rateLimit?.resetTime
  const resetMs = Number.isFinite(Number(resetRaw))
    ? Number(resetRaw)
    : Number.isFinite(new Date(String(resetRaw || '')).getTime())
      ? new Date(String(resetRaw || '')).getTime()
      : NaN
  const retryAfterSec = Number.isFinite(resetMs)
    ? Math.max(1, Math.ceil((resetMs - nowMs) / 1000))
    : undefined
  const limit = Number(req?.rateLimit?.limit)
  const remaining = Number(req?.rateLimit?.remaining)
  const windowMs = Number.isFinite(Number(options.windowMs))
    ? Number(options.windowMs)
    : Number(req?.rateLimit?.windowMs)

  return compactDetails({
    retryAfterSec,
    limit: Number.isFinite(limit) ? limit : undefined,
    remaining: Number.isFinite(remaining) ? remaining : undefined,
    windowSec: Number.isFinite(windowMs) && windowMs > 0 ? Math.ceil(windowMs / 1000) : undefined
  })
}

export function buildRateLimitBody(req, options = {}) {
  const details = buildRateLimitDetails(req, options)
  return buildErrorBody(
    String(options.message || '请求过于频繁，请稍后再试'),
    'too_many_requests',
    details
  )
}

function createRateLimitHandler(message) {
  return (req, res, _next, options = {}) => {
    const details = buildRateLimitDetails(req, { windowMs: options.windowMs })
    if (Number.isFinite(Number(details.retryAfterSec)) && Number(details.retryAfterSec) > 0) {
      res.setHeader('Retry-After', String(details.retryAfterSec))
    }
    return res.status(Number(options.statusCode || 429)).json(
      buildErrorBody(
        String(message || '请求过于频繁，请稍后再试'),
        'too_many_requests',
        details
      )
    )
  }
}

function createJsonRateLimiter(options = {}) {
  return rateLimit({
    windowMs: Number(options.windowMs),
    max: Number(options.max),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    skip: typeof options.skip === 'function' ? options.skip : undefined,
    handler: createRateLimitHandler(String(options.message || '请求过于频繁，请稍后再试'))
  })
}

/** 全局限流（防刷接口）；健康检查不计入 */
export const globalLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_GLOBAL', 300),
  message: '请求过于频繁，请稍后再试',
  skip: (req) =>
    req.path === '/health' ||
    req.path === '/api/health' ||
    req.path === '/healthz' ||
    (req.method === 'GET' && req.path.startsWith('/uploads/')) ||
    (req.method === 'POST' && req.path === '/api/metrics/web-vitals')
})

/**
 * 基础防爬虫：拦截明显脚本化 UA 或空 UA（仅针对公开读取接口，不影响后台与登录流程）。
 */
export function antiCrawlerGuard(req, res, next) {
  const path = String(req.path || '')
  const isPublicReadRoute =
    req.method === 'GET' &&
    (path.startsWith('/api/public/') ||
      path.startsWith('/api/skins/catalog') ||
      path.startsWith('/api/skin/current') ||
      path.startsWith('/uploads/'))

  if (!isPublicReadRoute) return next()
  if (!isSuspiciousBot(req)) return next()

  return res.status(403).json(
    buildErrorBody('疑似爬虫流量，已拒绝访问', 'bot_detected')
  )
}

/**
 * /uploads 专用读限流（防资源遍历抓取/带宽打爆）。
 * 注意：该规则在 globalLimiter 之外额外生效。
 */
export const uploadsReadLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_UPLOADS_READ', 240),
  message: '下载过于频繁，请稍后再试'
})

/**
 * POST /api/plugin/authx/callback 专用（原在全局限流中被豁免，易被刷写 store）。
 * 仍叠加全局限流；本中间件额外收紧单 IP 频率。环境变量 RATE_LIMIT_AUTHX_CALLBACK 覆盖每分钟上限。
 */
export const authxWebhookCallbackLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_AUTHX_CALLBACK', 45),
  message: '回调请求过于频繁'
})

/** 登录/注册：更严（用于 /auth） */
export const authLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: configMax('RATE_LIMIT_AUTH', 20),
  message: '尝试次数过多，请 15 分钟后再试'
})

/** 用户代理 VLA 只读（/api/user/mc-*），略严于全局限流，防扫库 */
export const mcUserReadLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_MC_USER', 60),
  message: '查询过于频繁，请稍后再试'
})

/** 管理端代理插件只读 GET（ban-check / user-exists） */
export const adminPluginGetLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_ADMIN_PLUGIN_GET', 120),
  message: '请求过于频繁，请稍后再试'
})

/** VLA / 会话服拉取的公开皮肤档案 JSON（防扫库） */
export const skinProfilePublicLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_SKIN_PROFILE_PUBLIC', 180),
  message: '请求过于频繁，请稍后再试'
})

/** 验证码发送：单 IP 每小时最多 30 次，同一邮箱每分钟最多 1 次（业务层额外检查） */
export const verifyCodeSendLimiter = createJsonRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: configMax('RATE_LIMIT_VERIFY_CODE_SEND', 30),
  message: '验证码请求过于频繁，请稍后再试'
})

/** 公开：游戏库密码重置请求（防刷邮箱） */
export const mcGamePasswordRequestLimiter = createJsonRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: configMax('RATE_LIMIT_MC_GAME_PW_REQUEST', 12),
  message: '重置请求过于频繁，请一小时后再试'
})

export const mcGamePasswordConfirmLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: configMax('RATE_LIMIT_MC_GAME_PW_CONFIRM', 20),
  message: '尝试次数过多，请稍后再试'
})

/** 用户主动「从 Mojang 同步皮肤」；避免刷 Mojang 接口 */
export const mojangSkinSyncLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: configMax('RATE_LIMIT_MOJANG_SKIN_SYNC', 8),
  message: '同步过于频繁，请稍后再试'
})
