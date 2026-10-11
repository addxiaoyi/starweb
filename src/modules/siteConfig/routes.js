import { applySiteConfigPatch, publicSiteConfig } from './service.js'

export function registerSiteConfigRoutes(app, deps) {
  const {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    markKvDirty,
    appendAuditLog,
    asyncHandler,
  } = deps

  app.get('/api/public/site-config', (req, res) => jsonOk(res, { config: publicSiteConfig(getStore()) }))

  app.get('/api/admin/site-config', requireUser, requireAdmin, (req, res) => {
    return jsonOk(res, { config: publicSiteConfig(getStore()) })
  })

  app.patch('/api/admin/site-config', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const result = applySiteConfigPatch(getStore(), req.body)
    if (!result.ok) return jsonErr(res, 400, '站点配置无效', result.code, { key: result.key })
    markKvDirty?.('dashboard_configs')
    appendAuditLog?.('site_config_updated', { keys: Object.keys(req.body || {}) }, req)
    scheduleSave?.()
    return jsonOk(res, { config: result.config })
  }))
}
