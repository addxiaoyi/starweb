import { verifyVlaHexSignatureAny, verifyAuthxWebhookPayload } from '../../authxWebhook.js'
import { config } from '../../config.js'

/**
 * 入站插件 webhook 适配器选择策略：
 * - 优先按请求头识别（X-VLA-Signature → vla，X-AuthX-Signature → authx）。
 * - 当未识别到任何适配器头但配置了 AuthX callback secret 时，detectInboundAdapter 返回 authx；
 *   这是为了兼容旧版 AuthX 插件在 secret 模式下不强制发送 X-AuthX-Signature 的行为。
 * - 当未配置任何密钥时，verifyPluginInboundWebhook 返回 true，保留开发环境放行行为。
 */
export function detectInboundAdapter(req) {
  if (String(req.headers['x-vla-signature'] || '').trim()) return 'vla'
  if (config.authxCallbackSecret || req.headers['x-authx-signature']) return 'authx'
  return null
}

export function isPluginWebhookAuthConfigured() {
  return config.authxVlaWebhookSecrets.length > 0 || Boolean(config.authxCallbackSecret)
}

export function verifyPluginInboundWebhook(req, rawPayload) {
  const adapter = detectInboundAdapter(req)
  if (adapter === 'vla') {
    const sig = String(req.headers['x-vla-signature'] || '').trim()
    return verifyVlaHexSignatureAny(config.authxVlaWebhookSecrets, sig, rawPayload)
  }
  if (adapter === 'authx') {
    return verifyAuthxWebhookPayload(
      config.authxCallbackSecret,
      String(req.headers['x-authx-timestamp'] || '').trim(),
      String(req.headers['x-authx-signature'] || '').trim(),
      rawPayload
    )
  }
  // 开发环境未配置任何密钥时放行（与历史行为一致）
  return !isPluginWebhookAuthConfigured()
}

export function parsePluginPayload(rawPayload) {
  if (!rawPayload || !rawPayload.trim()) return {}
  return JSON.parse(rawPayload)
}
