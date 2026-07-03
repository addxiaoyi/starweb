import { asyncHandler } from '../../middleware/error.js'
import { Events } from '../event-bus/events.js'

function resolveSkinBridgeSecret(req) {
  const h1 = (req.headers['x-skin-bridge-secret'] || '').trim()
  if (h1) return h1
  return (req.headers['x-skinbridge-secret'] || '').trim()
}

function verifySkinRefreshSecret(req, res, config, jsonErr) {
  if (config.isProd && !config.pluginRefreshSecret) {
    jsonErr(res, 503, '生产环境必须配置 PLUGIN_REFRESH_SECRET', 'misconfigured')
    return false
  }
  if (config.pluginRefreshSecret) {
    const h = resolveSkinBridgeSecret(req)
    if (h !== config.pluginRefreshSecret) {
      jsonErr(res, 401, '未授权', 'unauthorized')
      return false
    }
  }
  return true
}

/**
 * POST /plugin/skin/refresh
 *
 * 供皮肤站/插件桥通知后端刷新指定玩家皮肤。
 * 生产环境必须配置 PLUGIN_REFRESH_SECRET，并通过 X-Skin-Bridge-Secret 校验。
 * 验签通过后通过事件总线发布 PLUGIN_SKIN_REFRESH_RECEIVED，由 subscriber 转发 VLA。
 *
 * @param {import('express').Application} app
 * @param {object} deps
 * @param {object} deps.config
 * @param {Function} deps.jsonErr
 * @param {object} deps.eventBus
 */
export function registerSkinRefreshRoutes(app, deps) {
  const { config, jsonErr, eventBus } = deps

  app.post('/plugin/skin/refresh', asyncHandler(async (req, res) => {
    if (!verifySkinRefreshSecret(req, res, config, jsonErr)) return

    const body = req.body || {}
    const username = String(body.username || '').trim()
    if (!username) {
      return jsonErr(res, 400, '缺少 username', 'validation_error')
    }

    eventBus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body })
    return res.json({ ok: true, queued: true })
  }))
}
