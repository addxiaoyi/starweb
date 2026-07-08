import crypto from 'crypto'

/**
 * Velocity-Limbo-Auth 出站事件 / 皮肤 Webhook：hex(HMAC-SHA256(secret, rawBodyUTF8))，请求头 X-VLA-Signature。
 */
export function verifyVlaHexSignature(secret, sigHex, rawPayload) {
  if (!secret || sigHex == null || rawPayload == null) return false
  const expected = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex')
  const a = String(sigHex).trim().toLowerCase()
  const b = expected.toLowerCase()
  if (a.length !== b.length || !/^[0-9a-f]+$/.test(a)) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/**
 * 多条密钥：始终对每个 secret 计算 HMAC 并 timingSafeEqual，再合并结果，避免 `.some()` 在首个匹配处提前结束。
 */
export function verifyVlaHexSignatureAny(secrets, sigHex, rawPayload) {
  const got = String(sigHex || '').trim().toLowerCase()
  if (!got || !/^[0-9a-f]+$/.test(got) || rawPayload == null) return false
  if (!Array.isArray(secrets) || secrets.length === 0) return false
  let matched = false
  for (const secret of secrets) {
    if (!secret) continue
    const expected = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex').toLowerCase()
    let row = false
    if (got.length === expected.length) {
      try {
        row = crypto.timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(expected, 'utf8'))
      } catch {
        row = false
      }
    }
    matched = matched || row
  }
  return matched
}

/**
 * AuthX 登录回调签名：HMAC-SHA256，payload 为 `ts + "." + rawBody`
 * 与插件侧 net.starmc.authx.security.WebhookSignature 对齐。
 */
export function signAuthxWebhookPayload(secret, tsSec, rawPayload) {
  const data = `${tsSec}.${rawPayload == null ? '' : rawPayload}`
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('base64url')
}

/**
 * @param {string} secret - 共享密钥；空串表示跳过签名校验（与历史行为一致）
 */
export function verifyAuthxWebhookPayload(secret, tsSec, sig, rawPayload, nowSec, skewSec = 300) {
  if (!secret) return true
  if (!tsSec || !sig) return false
  const tsNum = Number(tsSec)
  const ref = nowSec == null ? Math.floor(Date.now() / 1000) : nowSec
  if (!Number.isFinite(tsNum) || Math.abs(ref - tsNum) > skewSec) return false
  const expected = signAuthxWebhookPayload(secret, tsSec, rawPayload)
  if (expected.length !== sig.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'))
  } catch {
    return false
  }
}
