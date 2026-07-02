import { asyncHandler } from '../../middleware/error.js'
import {
  normalizeProxyStatus,
  respondPluginJson,
  respondPluginJsonOrText
} from './service.js'

export function registerAuthxAdminRoutes(app, deps) {
  const {
    requireDevAdmin,
    pluginFetchHealth,
    pluginFetchJson,
    pluginFetchGet,
    config,
    adminPluginGetLimiter,
    jsonErr,
    jsonOk
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

  app.post('/api/admin/authx/reset-password', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const { username, newPassword } = req.body || {}
    const r = await pluginFetchJson('/api/plugin/authx/admin/reset-password', { username, newPassword })
    return respondPluginJson(res, r)
  }))

  app.post('/api/admin/authx/bind-email', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const { username, email } = req.body || {}
    const r = await pluginFetchJson('/api/plugin/authx/admin/bind-email', { username, email })
    return respondPluginJson(res, r)
  }))

  app.post('/api/admin/authx/unbind-device', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const { username, device } = req.body || {}
    const r = await pluginFetchJson('/api/plugin/authx/admin/unbind-device', { username, device })
    return respondPluginJson(res, r)
  }))

  app.post('/api/admin/authx/kick-online', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const r = await pluginFetchJson('/api/plugin/authx/admin/kick-online', req.body || {})
    return respondPluginJson(res, r)
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

  app.post('/api/admin/authx/ban', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const r = await pluginFetchJson('/api/plugin/authx/admin/ban', req.body || {})
    return respondPluginJson(res, r)
  }))

  app.post('/api/admin/authx/delete-user', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const r = await pluginFetchJson('/api/plugin/authx/admin/delete-user', req.body || {})
    return respondPluginJson(res, r)
  }))

  app.post('/api/admin/authx/skin-refresh', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const r = await pluginFetchJson('/api/plugin/authx/admin/skin-refresh', req.body || {})
    return respondPluginJson(res, r)
  }))

  app.post('/api/admin/authx/link-external-user', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const r = await pluginFetchJson('/api/plugin/authx/admin/link-external-user', req.body || {})
    return respondPluginJson(res, r)
  }))
}
