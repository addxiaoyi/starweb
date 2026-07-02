import { asyncHandler } from '../../middleware/error.js'
import {
  detectInboundAdapter,
  isPluginWebhookAuthConfigured,
  verifyPluginInboundWebhook,
} from './adapter.js'
import { Events } from '../event-bus/events.js'

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
  const { config, jsonErr, getStore, eventBus } = deps

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

    eventBus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
      store: getStore(),
      body,
      meta: {
        vlaInbound: detectInboundAdapter(req) === 'vla',
        remoteAddress: String(
          req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        ).trim(),
        receivedAt: new Date().toISOString(),
      },
    })

    return res.json({ ok: true })
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

    eventBus.publish(Events.PLUGIN_BIND_EMAIL_RECEIVED, {
      store: getStore(),
      body,
      meta: {
        receivedAt: new Date().toISOString(),
      },
    })

    return res.json({ ok: true, queued: true })
  })

  return { callback, bindEmail }
}
