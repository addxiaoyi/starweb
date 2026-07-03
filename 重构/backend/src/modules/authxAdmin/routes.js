import { asyncHandler } from '../../middleware/error.js'
import { Events } from '../event-bus/events.js'
import {
  normalizeProxyStatus,
  respondPluginJson,
  respondPluginJsonOrText
} from './service.js'

function normalizeCommandReply(reply) {
  if (reply && reply.ok === false) {
    return { ok: false, result: reply.result, error: reply.error }
  }
  return { ok: true, result: reply?.result ?? reply }
}

export function registerAuthxAdminRoutes(app, deps) {
  const {
    requireDevAdmin,
    pluginFetchHealth,
    pluginFetchGet,
    config,
    adminPluginGetLimiter,
    jsonErr,
    jsonOk,
    eventBus
  } = deps
  const okResponse = typeof jsonOk === 'function'
    ? jsonOk
    : (res, payload = {}, status = 200) => res
      .status(Number(status))
      .json({ ok: true, success: true, ...(payload && typeof payload === 'object' ? payload : {}) })

  app.get('/api/admin/authx/plugin-health', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const probe = await pluginFetchHealth()
    const ok = probe.reachable && probe.status >= 200 && probe.status < 300
    if (ok) return okResponse(res, { plugin: probe })
    return res.status(502).json({
      ok: false,
      success: false,
      message: '插件健康检查失败',
      code: 'plugin_health_failed',
      error: 'plugin_health_failed',
      details: {
        reachable: Boolean(probe?.reachable),
        status: Number(probe?.status || 0) || null,
      },
      plugin: probe
    })
  }))

  app.get('/api/admin/authx/plugin-metrics', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    if (config.authxPluginAdapter !== 'vla') {
      return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'plugin_metrics_requires_vla')
    }
    const r = await pluginFetchGet('/v1/metrics/prometheus')
    res
      .status(normalizeProxyStatus(r.status))
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(r.text || '')
  }))

  app.get(
    '/api/admin/authx/ban-check',
    adminPluginGetLimiter,
    asyncHandler(async (req, res) => {
      if (!requireDevAdmin(req, res)) return
      if (config.authxPluginAdapter !== 'vla') {
        return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'vla_adapter_required')
      }
      const name = String(req.query.name || '').trim()
      if (!name) {
        return jsonErr(res, 400, '缺少 name', 'validation_error')
      }
      const r = await pluginFetchGet('/v1/ban', { name })
      return respondPluginJsonOrText(res, r)
    })
  )

  app.get(
    '/api/admin/authx/user-exists',
    adminPluginGetLimiter,
    asyncHandler(async (req, res) => {
      if (!requireDevAdmin(req, res)) return
      if (config.authxPluginAdapter !== 'vla') {
        return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'vla_adapter_required')
      }
      const name = String(req.query.name || '').trim()
      if (!name) {
        return jsonErr(res, 400, '缺少 name', 'validation_error')
      }
      const r = await pluginFetchGet('/v1/user/exists', { name })
      return respondPluginJsonOrText(res, r)
    })
  )

  app.post('/api/admin/authx/reset-password', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const { username, newPassword } = req.body || {}
    if (!username) {
      return jsonErr(res, 400, '缺少 username', 'validation_error')
    }
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_RESET_PASSWORD,
      { body: { username, newPassword } }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/bind-email', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const { username, email } = req.body || {}
    if (!username) {
      return jsonErr(res, 400, '缺少 username', 'validation_error')
    }
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_BIND_EMAIL,
      { body: { username, email } }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/unbind-device', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const { username, device } = req.body || {}
    if (!username) {
      return jsonErr(res, 400, '缺少 username', 'validation_error')
    }
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_UNBIND_DEVICE,
      { body: { username, device } }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/kick-online', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_KICK_ONLINE,
      { body: req.body || {} }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/ban', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_BAN,
      { body: req.body || {} }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/delete-user', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_DELETE_USER,
      { body: req.body || {} }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/skin-refresh', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_SKIN_REFRESH,
      { body: req.body || {} }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))

  app.post('/api/admin/authx/link-external-user', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const reply = await eventBus.publishAndWait(
      Events.VLA_COMMAND_LINK_EXTERNAL_USER,
      { body: req.body || {} }
    )
    const normalized = normalizeCommandReply(reply)
    if (!normalized.ok) {
      return jsonErr(res, normalized.result?.status || 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
    }
    return respondPluginJson(res, normalized.result)
  }))
}
