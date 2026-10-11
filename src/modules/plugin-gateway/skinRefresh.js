import { config } from '../../config.js'

export function registerSkinRefreshRoutes(app, deps) {
  const { jsonErr, eventBus } = deps
  const handler = (req, res) => {
    const secret = String(req.headers['x-skin-bridge-secret'] || req.headers['x-skinbridge-secret'] || '').trim()
    if (config.isProd && (!config.pluginRefreshSecret || secret !== config.pluginRefreshSecret)) {
      return jsonErr(res, 503, 'PLUGIN_REFRESH_SECRET 未配置或错误', 'misconfigured')
    }
    eventBus?.publish?.('plugin.skin_refresh.received', { body: req.body })
    return res.json({ ok: true, success: true })
  }
  app.post('/plugin/skin/refresh', handler)
}
