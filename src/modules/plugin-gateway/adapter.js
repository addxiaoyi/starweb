import crypto from 'node:crypto'
import { config } from '../../config.js'

const HMAC_WINDOW_MS = 5 * 60 * 1000
const MAX_REPLAY_CLAIMS = 8192
const replayClaims = new Map()

export function isPluginWebhookAuthConfigured(cfg = config) {
  const secrets = cfg.authxVlaWebhookSecrets || []
  return secrets.length > 0 || Boolean(cfg.authxCallbackSecret)
}

function listWebhookSecrets(cfg = config) {
  const secrets = [...(cfg.authxVlaWebhookSecrets || [])]
  if (!secrets.length && cfg.authxCallbackSecret) secrets.push(String(cfg.authxCallbackSecret).trim())
  return secrets.filter(Boolean)
}

export function verifyPluginWebhookSecret(req, cfg = config) {
  const provided = String(req.headers['x-vla-webhook-secret'] || req.headers['x-webhook-secret'] || '').trim()
  return listWebhookSecrets(cfg).some((s) => provided === s)
}

function timingSafeEqualHex(a, b) {
  try {
    const left = Buffer.from(String(a || ''), 'utf8')
    const right = Buffer.from(String(b || ''), 'utf8')
    if (left.length !== right.length) return false
    return crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

function verifyHmacSignature(req, rawBody, signatureHeader, timestamp, secret) {
  const provided = String(signatureHeader || '').trim().replace(/^sha256=/i, '')
  if (!/^[0-9a-f]{64}$/i.test(provided) || !secret) return false
  const method = String(req.method || '').toUpperCase()
  const target = String(req.originalUrl || req.url || '')
  if (!/^[A-Z]+$/.test(method) || !target.startsWith('/') || /[\r\n]/.test(target)) return false
  const canonical = `STARX-HMAC-V2\n${method}\n${target}\n${timestamp}\n${String(rawBody || '')}`
  const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  return timingSafeEqualHex(expected, provided)
}

function claimSignature(signature, expiresAt, now) {
  const existing = replayClaims.get(signature)
  if (existing && existing > now) return false
  if (existing) replayClaims.delete(signature)
  if (replayClaims.size >= MAX_REPLAY_CLAIMS) {
    for (const [key, expiry] of replayClaims) {
      if (expiry <= now) replayClaims.delete(key)
    }
  }
  if (replayClaims.size >= MAX_REPLAY_CLAIMS) return false
  replayClaims.set(signature, expiresAt)
  return true
}

/**
 * @param {import('express').Request} req
 * @param {typeof config} cfg
 * @param {string} rawBody
 */
export function verifyPluginWebhookAuth(req, cfg = config, rawBody = '') {
  if (!cfg.isProd) {
    if (!isPluginWebhookAuthConfigured(cfg)) return { ok: true, method: 'dev_skip' }
  }

  const secrets = listWebhookSecrets(cfg)
  if (!secrets.length) {
    return cfg.isProd
      ? { ok: false, status: 503, message: 'Webhook secret 未配置' }
      : { ok: true, method: 'dev_no_secret' }
  }

  const sig = req.headers['x-starx-signature']
    || req.headers['x-vla-signature']
    || req.headers['x-authx-signature']
  if (sig) {
    const timestamp = String(req.headers['x-starx-timestamp'] || '').trim()
    if (!/^\d{1,20}$/.test(timestamp)) {
      return { ok: false, status: 401, message: 'HMAC 时间戳无效' }
    }
    const requestTime = Number(timestamp)
    const now = Date.now()
    if (!Number.isSafeInteger(requestTime)
      || requestTime < now - HMAC_WINDOW_MS
      || requestTime > now + HMAC_WINDOW_MS) {
      return { ok: false, status: 401, message: 'HMAC 请求已过期' }
    }
    const ok = secrets.some((secret) => verifyHmacSignature(req, rawBody, sig, timestamp, secret))
    if (!ok) return { ok: false, status: 401, message: 'HMAC 验签失败' }
    const normalized = String(sig).trim().replace(/^sha256=/i, '').toLowerCase()
    if (!claimSignature(normalized, requestTime + HMAC_WINDOW_MS, now)) {
      return { ok: false, status: 401, message: 'HMAC 请求已使用' }
    }
    return { ok: true, method: 'hmac_v2' }
  }

  if (verifyPluginWebhookSecret(req, cfg)) {
    return { ok: true, method: 'shared_secret' }
  }

  return { ok: false, status: 401, message: 'Webhook 验签失败' }
}
