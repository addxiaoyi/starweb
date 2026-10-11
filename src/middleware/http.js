import rateLimit from 'express-rate-limit'
import { config } from '../config.js'

function makeLimiter(windowMs, max, message = '请求过于频繁') {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, success: false, message, code: 'too_many_requests', error: 'too_many_requests' },
  })
}

export const globalLimiter = makeLimiter(60_000, config.rateLimitGlobal || 600)
export const authLimiter = makeLimiter(60_000, config.rateLimitAuth || 120)
export const uploadsReadLimiter = makeLimiter(60_000, 1200)
export const authxWebhookCallbackLimiter = makeLimiter(60_000, 600)
export const mcUserReadLimiter = makeLimiter(60_000, config.rateLimitMcUser || 60)
export const adminPluginGetLimiter = makeLimiter(60_000, config.rateLimitAdminPluginGet || 120)
export const skinProfilePublicLimiter = makeLimiter(60_000, 600)
export const mcGamePasswordRequestLimiter = makeLimiter(15 * 60_000, 5, '重置验证码请求过于频繁')
export const mcGamePasswordConfirmLimiter = makeLimiter(15 * 60_000, 10)
export const mojangSkinSyncLimiter = makeLimiter(60_000, 30)
export const verifyCodeSendLimiter = makeLimiter(10 * 60_000, 8, '验证码发送过于频繁')
export const verifyCodeConfirmLimiter = makeLimiter(10 * 60_000, 20, '验证码校验过于频繁')

const AUTHENTICATED_MACHINE_ROUTES = new Set([
  '/api/v1/plugin/email-challenge/send',
])

export function securityHeaderGuard(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
}

export function antiCrawlerGuard(req, res, next) {
  const ua = String(req.headers['user-agent'] || '').trim()
  if (!ua) return next()
  if (AUTHENTICATED_MACHINE_ROUTES.has(req.path)) return next()
  const isReadOnly = req.method === 'GET' || req.method === 'HEAD'
  if (/curl|wget|python-requests|scrapy|sqlmap|nikto|nmap|masscan|zgrab|gobuster|dirbuster|wpscan/i.test(ua) && !isReadOnly && !req.path.startsWith('/api/health')) {
    return res.status(403).json({
      ok: false,
      success: false,
      message: 'Forbidden',
      code: 'forbidden',
      error: 'forbidden',
    })
  }
  next()
}
