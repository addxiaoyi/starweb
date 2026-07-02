import { verifyVlaHexSignatureAny, verifyAuthxWebhookPayload } from '../../authxWebhook.js'
import { config } from '../../config.js'

/**
 * 入站插件 webhook 适配器选择策略：
 * - 优先按请求头识别（X-VLA-Signature → vla，X-AuthX-Signature → authx）。
 * - 当未识别到任何适配器头但配置了 AuthX callback secret 时，detectInboundAdapter 返回 authx；
 *   这是为了兼容旧版 AuthX 插件在 secret 模式下不强制发送 X-AuthX-Signature 的行为。
 * - 当未配置任何密钥时，verifyPluginInboundWebhook 返回 true，保留开发环境放行行为。
 *
 * @param {import('express').Request} req
 * @param {object} [configOverride] - 可选配置覆盖；未提供时使用全局 config
 */
export function detectInboundAdapter(req, configOverride) {
  const cfg = configOverride || config
  if (String(req.headers['x-vla-signature'] || '').trim()) return 'vla'
  if (cfg.authxCallbackSecret || req.headers['x-authx-signature']) return 'authx'
  return null
}

/**
 * @param {object} [configOverride] - 可选配置覆盖；未提供时使用全局 config
 */
export function isPluginWebhookAuthConfigured(configOverride) {
  const cfg = configOverride || config
  return cfg.authxVlaWebhookSecrets.length > 0 || Boolean(cfg.authxCallbackSecret)
}

/**
 * @param {import('express').Request} req
 * @param {string} rawPayload
 * @param {object} [configOverride] - 可选配置覆盖；未提供时使用全局 config
 */
export function verifyPluginInboundWebhook(req, rawPayload, configOverride) {
  const cfg = configOverride || config
  const adapter = detectInboundAdapter(req, cfg)
  if (adapter === 'vla') {
    const sig = String(req.headers['x-vla-signature'] || '').trim()
    return verifyVlaHexSignatureAny(cfg.authxVlaWebhookSecrets, sig, rawPayload)
  }
  if (adapter === 'authx') {
    return verifyAuthxWebhookPayload(
      cfg.authxCallbackSecret,
      String(req.headers['x-authx-timestamp'] || '').trim(),
      String(req.headers['x-authx-signature'] || '').trim(),
      rawPayload
    )
  }
  // 开发环境未配置任何密钥时放行（与历史行为一致）
  return !isPluginWebhookAuthConfigured(cfg)
}

/**
 * 解析插件 webhook payload。
 *
 * @param {string} rawPayload
 * @returns {{ ok: true, body: unknown } | { ok: false }}
 */
export function parsePluginPayload(rawPayload) {
  try {
    return { ok: true, body: JSON.parse(rawPayload) }
  } catch {
    return { ok: false }
  }
}
