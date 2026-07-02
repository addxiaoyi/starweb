import { asyncHandler } from '../../middleware/error.js'
import {
  detectInboundAdapter,
  isPluginWebhookAuthConfigured,
  verifyPluginInboundWebhook,
} from './adapter.js'
import { handlePluginCallback } from './callbackService.js'
import { handlePluginBindEmail, PluginBindEmailError } from './bindEmailService.js'

const BIND_EMAIL_ERROR_MESSAGES = {
  invalid_email: '邮箱格式不正确',
  validation_error: '请输入有效的游戏角色名（3–16 字符）',
  mc_already_linked: '该角色已绑定到其他网站账号',
  email_already_linked: '该邮箱已绑定其他角色，请先解绑',
}

function setDeprecationHeaders(res, req) {
  const baseUrl = req.baseUrl || ''
  if (baseUrl === '/api/plugin/authx') {
    res.setHeader('Sunset', 'Thu, 31 Dec 2026 00:00:00 GMT')
    res.setHeader('Deprecation', 'true')
  }
}

function readRawPayload(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  return String(req.body ?? '')
}

export function createPluginGatewayHandlers(deps) {
  const { config, jsonErr, getStore, callbackDeps, bindEmailDeps } = deps

  function checkMisconfigured(res) {
    if (config.isProd && !isPluginWebhookAuthConfigured()) {
      return jsonErr(
        res,
        503,
        '生产环境必须配置 AUTHX_VLA_WEBHOOK_SECRET(S) 或 AUTHX_CALLBACK_SECRET 后方可接收插件回调',
        'misconfigured'
      )
    }
    return null
  }

  const callback = asyncHandler(async (req, res) => {
    setDeprecationHeaders(res, req)

    const misconfigured = checkMisconfigured(res)
    if (misconfigured) return misconfigured

    const rawPayload = readRawPayload(req)
    if (!verifyPluginInboundWebhook(req, rawPayload)) {
      return jsonErr(res, 401, '未授权或签名校验失败', 'unauthorized')
    }

    let body = {}
    if (rawPayload.trim()) {
      try {
        body = JSON.parse(rawPayload)
      } catch {
        return jsonErr(res, 400, 'JSON 无效', 'validation_error')
      }
    }

    const event = String(body.event || '').trim()
    if (!event) {
      return jsonErr(res, 400, '缺少 event', 'validation_error')
    }

    const store = getStore()
    const vlaInbound = detectInboundAdapter(req) === 'vla'
    const remoteAddress = String(
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
    ).trim()

    const result = handlePluginCallback(store, body, {
      vlaInbound,
      remoteAddress,
      receivedAt: new Date().toISOString(),
      deps: callbackDeps,
    })

    return res.json({ ok: true, id: result.record.id })
  })

  const bindEmail = asyncHandler(async (req, res) => {
    setDeprecationHeaders(res, req)

    const misconfigured = checkMisconfigured(res)
    if (misconfigured) return misconfigured

    const rawPayload = readRawPayload(req)
    if (!verifyPluginInboundWebhook(req, rawPayload)) {
      return jsonErr(res, 401, '未授权或签名校验失败', 'unauthorized')
    }

    let body = {}
    if (rawPayload.trim()) {
      try {
        body = JSON.parse(rawPayload)
      } catch {
        return jsonErr(res, 400, 'JSON 无效', 'validation_error')
      }
    }

    const store = getStore()

    try {
      const result = await handlePluginBindEmail(store, body, bindEmailDeps)
      return res.json(result)
    } catch (err) {
      if (err instanceof PluginBindEmailError) {
        const details = { ...err.payload }
        delete details.message
        return jsonErr(
          res,
          err.status,
          BIND_EMAIL_ERROR_MESSAGES[err.code] || err.payload?.message || err.code,
          err.code,
          Object.keys(details).length > 0 ? details : undefined
        )
      }
      throw err
    }
  })

  return { callback, bindEmail }
}
