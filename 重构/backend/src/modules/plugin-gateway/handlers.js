import { asyncHandler } from '../../middleware/error.js'
import {
  detectInboundAdapter,
  isPluginWebhookAuthConfigured,
  parsePluginPayload,
  verifyPluginInboundWebhook,
} from './adapter.js'
import { Events } from '../event-bus/events.js'

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function setDeprecationHeaders(req, res) {
  const baseUrl = req.baseUrl || ''
  if (baseUrl === '/api/plugin/authx') {
    res.setHeader('Sunset', 'Thu, 31 Dec 2026 00:00:00 GMT')
    res.setHeader('Deprecation', 'true')
  }
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function readRawPayload(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (typeof req.body === 'string') return req.body
  return ''
}

/**
 * 校验并解析插件 webhook 请求。
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} deps
 * @param {object} deps.config
 * @param {Function} deps.jsonErr
 * @returns {{ ok: true, body: object, rawPayload: string } | { ok: false }}
 */
function verifyAndParsePluginWebhook(req, res, deps) {
  const { config, jsonErr } = deps
  setDeprecationHeaders(req, res)

  if (config.isProd && !isPluginWebhookAuthConfigured(config)) {
    jsonErr(res, 503, '生产环境未配置 webhook 认证密钥', 'misconfigured')
    return { ok: false }
  }

  const rawPayload = readRawPayload(req)
  if (!verifyPluginInboundWebhook(req, rawPayload, config)) {
    jsonErr(res, 401, '未授权或签名校验失败', 'unauthorized')
    return { ok: false }
  }

  let body = {}
  if (rawPayload.trim()) {
    const parsed = parsePluginPayload(rawPayload)
    if (!parsed.ok) {
      jsonErr(res, 400, 'JSON 无效', 'validation_error')
      return { ok: false }
    }
    body = parsed.body
  }

  return { ok: true, body, rawPayload }
}

/**
 * 创建插件网关请求处理器。
 *
 * @param {object} deps
 * @param {object} deps.config
 * @param {Function} deps.jsonErr
 * @param {Function} deps.getStore
 * @param {object} deps.eventBus
 * @returns {{ callback: Function, bindEmail: Function }}
 */
export function createPluginGatewayHandlers(deps) {
  const { config, jsonErr, getStore, eventBus } = deps

  const callback = asyncHandler(async (req, res) => {
    const result = verifyAndParsePluginWebhook(req, res, { config, jsonErr })
    if (!result.ok) return result

    const { body } = result
    const event = String(body.event || '').trim()
    if (!event) {
      return jsonErr(res, 400, '缺少 event', 'validation_error')
    }

    eventBus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
      store: getStore(),
      body,
      meta: {
        vlaInbound: detectInboundAdapter(req, config) === 'vla',
        remoteAddress: String(
          req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        ).trim(),
        receivedAt: new Date().toISOString(),
      },
    })

    return res.json({ ok: true })
  })

  const bindEmail = asyncHandler(async (req, res) => {
    const result = verifyAndParsePluginWebhook(req, res, { config, jsonErr })
    if (!result.ok) return result

    const { body } = result

    try {
      const reply = await eventBus.publishAndWait(Events.PLUGIN_BIND_EMAIL_RECEIVED, {
        store: getStore(),
        body,
        meta: {
          receivedAt: new Date().toISOString(),
        },
      })
      if (!reply.ok) {
        const err = reply.error
        return jsonErr(res, err.status || 400, err.message || '绑定失败', err.code || 'bind_email_failed', err.payload)
      }
      return res.json({ ok: true, ...reply.result })
    } catch (err) {
      return jsonErr(res, 502, '绑定处理失败', 'bind_email_failed', { reason: err.message })
    }
  })

  return { callback, bindEmail }
}
