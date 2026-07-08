import {
  summarizeAlerts,
  buildTrendPoints,
  topAlertSources,
  readSecurityCenterPage,
  buildSecurityCenterMfa,
  markAlertReadById,
  markAllAlertsRead,
  buildSessionRecord,
  revokeSessionById,
  revokeAllSessions
} from './service.js'

export function registerSecurityRoutes(app, deps) {
  const {
    requireUser,
    requireAdmin,
    getStore,
    ensureSecurityCenter,
    appendSecurityAudit,
    scheduleSave,
    jsonErr,
    jsonOk,
    deriveRiskFromEvents,
    requiresStepUpForHighRisk,
    verifyStepUp,
    crypto,
    asyncHandler,
    config,
    pluginFetchGet,
    resolveGeoForIp,
    appendSecurityAlert
  } = deps
  const okResponse = typeof jsonOk === 'function'
    ? jsonOk
    : (res, payload = {}, status = 200) => res
      .status(Number(status))
      .json({ ok: true, success: true, ...(payload && typeof payload === 'object' ? payload : {}) })

  function maskIpForLog(ip) {
    const raw = String(ip || '').trim()
    if (!raw) return 'unknown'
    if (raw.includes(':')) {
      return raw.split(':').slice(0, 3).join(':') + ':****'
    }
    const seg = raw.split('.')
    if (seg.length === 4) {
      return `${seg[0]}.${seg[1]}.*.*`
    }
    return 'masked'
  }

  app.get('/api/security/center', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const currentSessionId = typeof req.session?.getHandle === 'function'
      ? String(req.session.getHandle() || '').trim()
      : ''
    if (currentSessionId) {
      const existing = sc.sessions?.[currentSessionId]
      sc.sessions[currentSessionId] = existing && typeof existing === 'object'
        ? {
            ...existing,
            id: currentSessionId,
            active: true,
            lastSeenAt: new Date().toISOString(),
          }
        : {
            ...buildSessionRecord(crypto, req, req.user.id),
            id: currentSessionId,
            userId: req.user.id,
            active: true,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          }
    }
    const mcName = String(req.user.linkedMcUsername || '').trim()
    let events = []
    if (config.authxPluginAdapter === 'vla' && mcName) {
      const r = await pluginFetchGet('/v1/security/events', { name: mcName, limit: '100' })
      const items = r.json?.items || r.json?.events || []
      events = Array.isArray(items) ? items : []
    }

    for (const a of sc.alerts) {
      if (a?.userId !== req.user.id) continue
      const ip = String(a?.payload?.ip || a?.payload?.lastIp || '').trim()
      a.geo = await resolveGeoForIp(store, ip)
    }
    const risk = deriveRiskFromEvents(events, sc.rules)

    if (risk.level === 'high') {
      appendSecurityAlert(store, req.user.id, 'high', '检测到高风险登录行为', {
        score: risk.score,
        suspicious: risk.suspicious,
        unknownIp: risk.unknownIp
      })
    }

    const pageData = readSecurityCenterPage(sc, req.user.id, req.query.page, req.query.pageSize)

    appendSecurityAudit(store, req.user.id, 'security_center_view', {
      riskLevel: risk.level,
      riskScore: risk.score,
      page: pageData.page,
      pageSize: pageData.pageSize
    })
    scheduleSave()

    okResponse(res, {
      rules: sc.rules,
      risk,
      currentSessionId: currentSessionId || null,
      ...pageData,
      mfa: buildSecurityCenterMfa(req.user)
    })
  }))

  app.get('/api/security/analytics/summary', requireUser, (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const alerts = sc.alerts.filter((a) => a.userId === req.user.id)
    const sessions = Object.values(sc.sessions || {}).filter((s) => s?.userId === req.user.id)
    const auditLogs = sc.auditLogs.filter((a) => a.userId === req.user.id)

    const summary = summarizeAlerts(alerts, sessions, auditLogs)

    okResponse(res, summary)
  })

  app.get('/api/security/analytics/trend', requireUser, (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const alerts = sc.alerts.filter((a) => a.userId === req.user.id)

    const trend = buildTrendPoints(alerts, Number(req.query.days) || 30)

    okResponse(res, trend)
  })

  app.get('/api/security/analytics/top-sources', requireUser, (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const alerts = sc.alerts.filter((a) => a.userId === req.user.id)

    const top = topAlertSources(alerts, Number(req.query.limit) || 10)

    okResponse(res, top)
  })

  app.post('/api/security/alerts/read', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const result = markAlertReadById(sc, req.user.id, req.body?.id)
    if (!result.ok && result.error === 'missing_id') {
      return jsonErr(res, 400, '缺少告警 ID', 'validation_error')
    }
    if (!result.ok) {
      return jsonErr(res, 404, '告警不存在', 'not_found')
    }
    appendSecurityAudit(store, req.user.id, 'alert_read', { id: result.item.id })
    scheduleSave()
    okResponse(res)
  })

  app.post('/api/security/alerts/read-all', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const { count } = markAllAlertsRead(sc, req.user.id)
    appendSecurityAudit(store, req.user.id, 'alert_read_all', { count })
    scheduleSave()
    okResponse(res, { count })
  })

  app.post('/api/security/session/register', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const session = buildSessionRecord(crypto, req, req.user.id)
    sc.sessions[session.id] = session
    appendSecurityAudit(store, req.user.id, 'session_register', { sessionId: session.id, ip: session.ip })
    scheduleSave()
    okResponse(res, { sessionId: session.id })
  })

  app.post('/api/security/session/revoke', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const result = revokeSessionById(sc, req.user.id, req.body?.sessionId)
    if (!result.ok) {
      return jsonErr(res, 404, '会话不存在', 'not_found')
    }
    appendSecurityAudit(store, req.user.id, 'session_revoke', { sessionId: result.sessionId })
    scheduleSave()
    okResponse(res)
  })

  app.post('/api/security/session/revoke-one', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const result = revokeSessionById(sc, req.user.id, req.body?.sessionId)
    if (!result.ok) {
      return jsonErr(res, 404, '会话不存在', 'not_found')
    }
    appendSecurityAudit(store, req.user.id, 'session_revoke', { sessionId: result.sessionId, alias: 'revoke-one' })
    scheduleSave()
    okResponse(res)
  })

  app.post('/api/security/session/revoke-all', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const risk = deriveRiskFromEvents([], sc.rules)
    if (requiresStepUpForHighRisk(req.user, sc, risk.level) && !verifyStepUp(req, req.user)) {
      return jsonErr(res, 403, '高风险操作需要二次验证（TOTP）', 'step_up_required')
    }
    const { count } = revokeAllSessions(sc, req.user.id)
    appendSecurityAudit(store, req.user.id, 'session_revoke_all', { count })
    scheduleSave()
    okResponse(res, { count })
  })

  app.get('/api/security/login-history', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const userId = String(req.user?.id || '').trim() || 'anonymous'
    const rows = (Array.isArray(sc.loginEvents) ? sc.loginEvents : [])
      .filter((row) => String(row?.userId || 'anonymous') === userId)
      .sort((a, b) => Number(b?.tsMs || 0) - Number(a?.tsMs || 0))
    const total = rows.length
    const start = (page - 1) * pageSize
    okResponse(res, {
      total,
      page,
      pageSize,
      items: rows.slice(start, start + pageSize).map((row) => ({
        id: row.id,
        at: row.createdAt || new Date(Number(row?.tsMs || Date.now())).toISOString(),
        action: row.method || 'login_success',
        ip: row.ip || null,
        geo: row.location || null,
        deviceKey: row.fingerprint || null,
        deviceName: row.deviceProfile || null,
        riskScore: row.riskScore || 0,
        riskLevel: row.riskLevel || 'low',
        asn: row.asn || null,
        isp: row.isp || null,
      })),
    })
  })

  app.get('/api/security/devices/whitelist', requireUser, (req, res) => {
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const userId = String(req.user?.id || '').trim() || 'anonymous'
    const bucket = sc.trustedDevices?.[userId] && typeof sc.trustedDevices[userId] === 'object'
      ? sc.trustedDevices[userId]
      : {}
    const items = Object.values(bucket)
      .map((row) => ({
        id: String(row?.fingerprint || ''),
        deviceKey: String(row?.fingerprint || ''),
        deviceId: String(row?.fingerprint || ''),
        deviceName: String(row?.deviceProfile || 'trusted_device'),
        note: String(row?.username || ''),
        createdAt: row?.firstSeenAt || null,
        lastSeenAt: row?.lastSeenAt || null,
        source: 'security_center',
        loginCount: Number(row?.loginCount || 0),
        lastIp: row?.lastIp || null,
        lastLocation: row?.lastLocation || null,
        lastAsn: row?.lastAsn || null,
      }))
      .filter((row) => Boolean(row.deviceKey))
      .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
    okResponse(res, { items })
  })

  app.post('/api/security/devices/whitelist', requireUser, (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) return jsonErr(res, 400, '缺少 sessionId', 'validation_error')
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const session = sc.sessions?.[sessionId]
    if (!session || String(session?.userId || '') !== String(req.user?.id || '')) {
      return jsonErr(res, 404, '会话不存在', 'not_found')
    }
    const fingerprint = String(session?.deviceId || '').trim()
    if (!fingerprint) {
      return jsonErr(res, 400, '当前会话无设备指纹，无法加入受信设备', 'missing_device_fingerprint')
    }
    const bucket = sc.trustedDevices[String(req.user?.id || '').trim() || 'anonymous'] || {}
    const now = new Date().toISOString()
    const previous = bucket[fingerprint] || {}
    bucket[fingerprint] = {
      fingerprint,
      username: String(req.user?.linkedMcUsername || req.user?.username || '').trim(),
      firstSeenAt: previous.firstSeenAt || now,
      lastSeenAt: now,
      loginCount: Number(previous.loginCount || 0),
      lastIp: String(session?.ip || '').trim() || previous.lastIp || null,
      lastLocation: previous.lastLocation || null,
      lastAsn: previous.lastAsn || null,
      deviceProfile: 'trusted_device',
    }
    sc.trustedDevices[String(req.user?.id || '').trim() || 'anonymous'] = bucket
    appendSecurityAudit(store, req.user.id, 'trusted_device_add', { fingerprint, sessionId })
    scheduleSave()
    okResponse(res, { ok: true, deviceKey: fingerprint })
  })

  app.delete('/api/security/devices/whitelist/:deviceKey', requireUser, (req, res) => {
    const key = String(req.params.deviceKey || '').trim()
    if (!key) return jsonErr(res, 400, '缺少 deviceKey', 'validation_error')
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const userId = String(req.user?.id || '').trim() || 'anonymous'
    const bucket = sc.trustedDevices?.[userId] && typeof sc.trustedDevices[userId] === 'object'
      ? sc.trustedDevices[userId]
      : null
    if (!bucket || !bucket[key]) {
      return jsonErr(res, 404, '受信设备不存在', 'not_found')
    }
    delete bucket[key]
    appendSecurityAudit(store, req.user.id, 'trusted_device_remove', { fingerprint: key })
    scheduleSave()
    okResponse(res, { ok: true, deviceKey: key })
  })

  app.get('/api/security/admin/rules', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const sc = ensureSecurityCenter(getStore())
    okResponse(res, { rules: sc.rules })
  })

  app.post('/api/security/admin/rules', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const body = req.body || {}
    const before = { ...sc.rules }
    sc.rules = {
      ...sc.rules,
      failWeight: Number(body.failWeight ?? sc.rules.failWeight),
      unknownIpWeight: Number(body.unknownIpWeight ?? sc.rules.unknownIpWeight),
      highRiskThreshold: Number(body.highRiskThreshold ?? sc.rules.highRiskThreshold),
      mediumRiskThreshold: Number(body.mediumRiskThreshold ?? sc.rules.mediumRiskThreshold),
      requireMfaOnHighRisk: body.requireMfaOnHighRisk === undefined ? sc.rules.requireMfaOnHighRisk : Boolean(body.requireMfaOnHighRisk),
      enableWebhookReplay: body.enableWebhookReplay === undefined ? sc.rules.enableWebhookReplay : Boolean(body.enableWebhookReplay)
    }
    appendSecurityAudit(store, req.user.id, 'admin_rules_update', { before, after: sc.rules })
    scheduleSave()
    okResponse(res, { rules: sc.rules })
  })

  app.get('/api/security/export.csv', requireUser, (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const logs = sc.auditLogs.filter((a) => a.userId === req.user.id)
    const rows = [['时间', '动作', '详情'], ...logs.map((l) => [l.at, l.action, JSON.stringify(l.detail || {})])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="security-${Date.now()}.csv"`)
    res.send(`\uFEFF${csv}`)
  })

  app.get('/api/security/login-history/export.csv', requireUser, (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const logs = sc.auditLogs.filter((a) => a.userId === req.user.id)
    const rows = [['时间', '动作', '详情'], ...logs.map((l) => [l.at, l.action, JSON.stringify(l.detail || {})])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="security-${Date.now()}.csv"`)
    res.send(`\uFEFF${csv}`)
  })

  app.get('/api/security/webhook-queue', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const sc = ensureSecurityCenter(getStore())
    okResponse(res, { items: sc.webhookQueue.slice(0, 200) })
  })

  app.post('/api/security/webhook-replay', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const id = String(req.body?.id || '').trim()
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const item = sc.webhookQueue.find((x) => x.id === id)
    if (!item) return jsonErr(res, 404, '队列项不存在', 'not_found')
    item.status = 'replayed'
    item.attempts = Number(item.attempts || 0) + 1
    item.lastReplayAt = new Date().toISOString()
    appendSecurityAudit(store, req.user.id, 'webhook_replay', { id: item.id, eventId: item.eventId })
    scheduleSave()
    okResponse(res, { item })
  })

  app.post('/api/security/webhook-replay-batch', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const mode = String(req.body?.mode || 'failed').trim()
    let targets = sc.webhookQueue.filter((x) => x.status === 'failed')
    if (mode === 'pending') targets = sc.webhookQueue.filter((x) => x.status === 'pending')
    if (mode === 'all') targets = sc.webhookQueue.slice(0, 200)
    let count = 0
    for (const item of targets.slice(0, 100)) {
      item.status = 'replayed'
      item.attempts = Number(item.attempts || 0) + 1
      item.lastReplayAt = new Date().toISOString()
      count += 1
    }
    appendSecurityAudit(store, req.user.id, 'webhook_replay_batch', { mode, count })
    scheduleSave()
    okResponse(res, { count })
  })

  app.get('/api/security/admin/geo-cache', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const sc = ensureSecurityCenter(getStore())
    const items = Object.entries(sc.geoCache || {}).map(([ip, v]) => ({
      ip,
      label: v?.label || '',
      updatedAt: v?.updatedAt || ''
    }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 500)
    okResponse(res, { count: items.length, items })
  })

  app.get('/api/security/admin/login-events', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50))
    const q = String(req.query.q || '').trim().toLowerCase()
    const method = String(req.query.method || '').trim().toLowerCase()
    const riskLevel = String(req.query.riskLevel || '').trim().toLowerCase()

    let items = Array.isArray(sc.loginEvents) ? sc.loginEvents.slice() : []
    if (q) {
      items = items.filter((row) => {
        const haystack = [
          row.username,
          row.uuid,
          row.ip,
          row.location,
          row.asn,
          row.isp,
          row.externalUserId,
          row.deviceProfile,
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    if (method) {
      items = items.filter((row) => String(row?.method || '').trim().toLowerCase() === method)
    }
    if (riskLevel) {
      items = items.filter((row) => String(row?.riskLevel || '').trim().toLowerCase() === riskLevel)
    }
    items.sort((a, b) => Number(b?.tsMs || 0) - Number(a?.tsMs || 0))
    const total = items.length
    const start = (page - 1) * pageSize
    okResponse(res, {
      total,
      page,
      pageSize,
      items: items.slice(start, start + pageSize),
    })
  })

  app.post('/api/security/admin/geo-cache/clear', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return
    const store = getStore()
    const sc = ensureSecurityCenter(store)
    const ip = String(req.body?.ip || '').trim()
    if (ip) {
      delete sc.geoCache[ip]
      appendSecurityAudit(store, req.user.id, 'geo_cache_clear_one', { ip })
      scheduleSave()
      return okResponse(res, { cleared: 1 })
    }
    const count = Object.keys(sc.geoCache || {}).length
    sc.geoCache = {}
    appendSecurityAudit(store, req.user.id, 'geo_cache_clear_all', { count })
    scheduleSave()
    okResponse(res, { cleared: count })
  })

  /**
   * 客户端安全事件上报
   * 处理如：F12 开启、右键拦截、资源拖拽等异常行为
   */
  app.post('/api/security/report', (req, res) => {
    const { type, details, timestamp, userAgent } = req.body || {}
    const store = getStore()
    const ip = String(req.ip || 'unknown').trim()
    const maskedIp = maskIpForLog(ip)
    
    // 基础校验
    if (!type || !details) {
      return jsonErr(res, 400, '缺少事件数据', 'validation_error')
    }

    // 确定关联用户 (如果有)
    let userId = 'anonymous'
    try {
      // 尝试获取 session，但不强制要求登录
      const sessionUserId = req.session?.getUserId()
      if (sessionUserId) userId = sessionUserId
    } catch {
      // 忽略 session 获取失败
    }

    // 记录到审计日志 (脱敏处理)
    appendSecurityAudit(store, userId, `client_security_${String(type).toLowerCase()}`, {
      clientTimestamp: timestamp,
      details: String(details).slice(0, 500), // 限制长度
      userAgent: String(userAgent || '').slice(0, 255),
      ip: maskedIp
    })

    // 如果是高危行为 (如 DEV_TOOLS)，记录告警
    if (type === 'DEV_TOOLS' || type === 'DOWNLOAD_ATTEMPT') {
      appendSecurityAlert(store, userId, 'medium', `检测到客户端异常行为: ${type}`, {
        type,
        details,
        ip: maskedIp,
        userAgent
      })
    }

    scheduleSave()
    okResponse(res, { status: 'recorded' })
  })
}
