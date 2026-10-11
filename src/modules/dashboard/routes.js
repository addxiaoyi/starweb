function normalizeDashboardConfig(input) {
  const fallback = {
    layout: 'classic',
    widgets: ['cpu', 'mem', 'load', 'disk', 'net', 'proc', 'percpu', 'temp'],
    thresholds: {
      cpuWarn: 70,
      cpuCritical: 90,
      memWarn: 75,
      memCritical: 90,
      loadWarnRate: 0.85,
      loadCriticalRate: 1.2,
      diskWarn: 80,
      diskCritical: 92,
      tempWarn: 65,
      tempCritical: 80
    },
    filters: {
      alertLevel: 'all'
    }
  }

  const src = input && typeof input === 'object' ? input : {}
  const thresholds = src.thresholds && typeof src.thresholds === 'object' ? src.thresholds : {}
  const filters = src.filters && typeof src.filters === 'object' ? src.filters : {}

  const toNum = (v, d) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }

  const widgets = Array.isArray(src.widgets)
    ? src.widgets.map((w) => String(w || '').trim()).filter(Boolean).slice(0, 24)
    : fallback.widgets

  return {
    layout: String(src.layout || fallback.layout),
    widgets: widgets.length ? widgets : fallback.widgets,
    thresholds: {
      cpuWarn: Math.min(100, Math.max(0, toNum(thresholds.cpuWarn, fallback.thresholds.cpuWarn))),
      cpuCritical: Math.min(100, Math.max(0, toNum(thresholds.cpuCritical, fallback.thresholds.cpuCritical))),
      memWarn: Math.min(100, Math.max(0, toNum(thresholds.memWarn, fallback.thresholds.memWarn))),
      memCritical: Math.min(100, Math.max(0, toNum(thresholds.memCritical, fallback.thresholds.memCritical))),
      loadWarnRate: Math.max(0, toNum(thresholds.loadWarnRate, fallback.thresholds.loadWarnRate)),
      loadCriticalRate: Math.max(0, toNum(thresholds.loadCriticalRate, fallback.thresholds.loadCriticalRate)),
      diskWarn: Math.min(100, Math.max(0, toNum(thresholds.diskWarn, fallback.thresholds.diskWarn))),
      diskCritical: Math.min(100, Math.max(0, toNum(thresholds.diskCritical, fallback.thresholds.diskCritical))),
      tempWarn: Math.min(130, Math.max(0, toNum(thresholds.tempWarn, fallback.thresholds.tempWarn))),
      tempCritical: Math.min(130, Math.max(0, toNum(thresholds.tempCritical, fallback.thresholds.tempCritical)))
    },
    filters: {
      alertLevel: ['all', 'warn', 'critical'].includes(String(filters.alertLevel || '').toLowerCase())
        ? String(filters.alertLevel).toLowerCase()
        : fallback.filters.alertLevel
    }
  }
}

export function registerDashboardRoutes(app, deps) {
  const {
    requireUser,
    hasRole,
    getStore,
    jsonErr,
    scheduleSave,
    markKvDirty,
    crypto,
  } = deps

  app.get('/api/user/:userId/dashboard-config', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权查看该用户仪表盘配置', 'forbidden')
    }

    if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') {
      store.dashboardConfigs = {}
    }

    const configRaw = store.dashboardConfigs[targetUserId]
    const normalized = normalizeDashboardConfig(configRaw)
    if (!configRaw) {
      store.dashboardConfigs[targetUserId] = normalized
      markKvDirty('dashboard_configs')
      scheduleSave()
    }

    res.json({ ok: true, userId: targetUserId, config: normalized })
  })

  app.put('/api/user/:userId/dashboard-config', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权修改该用户仪表盘配置', 'forbidden')
    }

    if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') {
      store.dashboardConfigs = {}
    }

    const normalized = normalizeDashboardConfig(req.body?.config)
    store.dashboardConfigs[targetUserId] = normalized
    markKvDirty('dashboard_configs')
    scheduleSave()

    res.json({ ok: true, userId: targetUserId, config: normalized })
  })

  app.post('/api/user/:userId/dashboard-share-token', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权生成该用户只读分享链接', 'forbidden')
    }

    if (!store.dashboardShareTokens || typeof store.dashboardShareTokens !== 'object') {
      store.dashboardShareTokens = {}
    }

    const token = crypto.randomBytes(24).toString('base64url')
    const now = Date.now()
    const ttlSec = Math.max(300, Math.min(7 * 24 * 60 * 60, Number(req.body?.ttlSec) || 24 * 60 * 60))

    store.dashboardShareTokens[token] = {
      userId: targetUserId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSec * 1000).toISOString(),
      createdBy: req.user.id
    }

    for (const [k, v] of Object.entries(store.dashboardShareTokens)) {
      const exp = Date.parse(String(v?.expiresAt || ''))
      if (!Number.isFinite(exp) || exp < Date.now()) {
        delete store.dashboardShareTokens[k]
      }
    }

    scheduleSave()
    res.json({ ok: true, token, expiresInSec: ttlSec })
  })

  app.get('/api/public/dashboard-share/:token', (req, res) => {
    const store = getStore()
    const token = String(req.params.token || '').trim()
    if (!token) return jsonErr(res, 400, '缺少 token', 'validation_error')

    const rec = store.dashboardShareTokens?.[token]
    if (!rec || typeof rec !== 'object') return jsonErr(res, 404, '分享链接不存在', 'not_found')

    const expiresMs = Date.parse(String(rec.expiresAt || ''))
    if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
      delete store.dashboardShareTokens[token]
      scheduleSave()
      return jsonErr(res, 410, '分享链接已过期', 'expired')
    }

    const userId = String(rec.userId || '').trim()
    const cfg = normalizeDashboardConfig(store.dashboardConfigs?.[userId])
    res.json({ ok: true, userId, config: cfg, readonly: true, expiresAt: rec.expiresAt })
  })

  app.get('/api/user/:userId/dashboard-share-tokens', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权查看该用户分享链接', 'forbidden')
    }

    const out = []
    const now = Date.now()
    for (const [token, rec] of Object.entries(store.dashboardShareTokens || {})) {
      if (!rec || typeof rec !== 'object') continue
      if (String(rec.userId || '') !== targetUserId) continue
      const expiresMs = Date.parse(String(rec.expiresAt || ''))
      if (!Number.isFinite(expiresMs) || expiresMs < now) continue
      out.push({
        token,
        createdAt: rec.createdAt,
        expiresAt: rec.expiresAt,
        createdBy: rec.createdBy
      })
    }

    out.sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')))
    res.json({ ok: true, userId: targetUserId, items: out })
  })

  app.delete('/api/user/:userId/dashboard-share-token/:token', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    const token = String(req.params.token || '').trim()
    if (!targetUserId || !token) return jsonErr(res, 400, '缺少参数', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权撤销该分享链接', 'forbidden')
    }

    const rec = store.dashboardShareTokens?.[token]
    if (!rec || String(rec.userId || '') !== targetUserId) {
      return jsonErr(res, 404, '分享链接不存在', 'not_found')
    }

    delete store.dashboardShareTokens[token]
    scheduleSave()
    res.json({ ok: true, revoked: true })
  })

  app.delete('/api/user/:userId/dashboard-share-tokens', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权撤销该用户分享链接', 'forbidden')
    }

    let revoked = 0
    for (const [token, rec] of Object.entries(store.dashboardShareTokens || {})) {
      if (!rec || typeof rec !== 'object') continue
      if (String(rec.userId || '') !== targetUserId) continue
      delete store.dashboardShareTokens[token]
      revoked++
    }

    scheduleSave()
    res.json({ ok: true, revoked })
  })
}
