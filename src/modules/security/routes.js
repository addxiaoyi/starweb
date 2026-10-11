import {
  readSecurityCenterPage,
  markAllAlertsRead,
  markAlertReadById,
  deriveRiskFromEvents,
  getUserAlertsFromIndex,
  summarizeAlerts,
  buildTrendPoints,
  topAlertSources,
} from './service.js'
import {
  listUserSessions,
  revokeOtherUserSessions,
  revokeUserSession,
} from '../../auth/sessionInventory.js'

export function registerSecurityRoutes(app, deps) {
  const {
    requireUser,
    getStore,
    ensureSecurityCenter,
    appendSecurityAudit,
    scheduleSave,
    jsonErr,
    jsonOk,
    asyncHandler,
    sessionCore,
    crypto,
    maskIpForLog,
  } = deps

  if (!sessionCore) {
    throw new Error('registerSecurityRoutes requires a SuperTokens sessionCore adapter')
  }

  app.get(
    '/api/security/center',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const sc = ensureSecurityCenter(store)
      const page = readSecurityCenterPage(sc, req.user.id, { page: 1, pageSize: 50 })
      const logs = (sc.auditLogs || [])
        .filter((l) => String(l.userId || '') === String(req.user.id))
        .slice(0, 50)
        .map((l) => ({ message: l.message || l.action, at: l.at }))
      jsonOk(res, {
        alerts: page.items,
        unreadCount: page.unread,
        logs,
        risk: deriveRiskFromEvents(
          (sc.loginEvents || []).filter((e) => String(e.userId || '') === String(req.user.id)).slice(0, 20)
        ),
      })
    })
  )

  app.post(
    '/api/security/alerts/read-all',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const sc = ensureSecurityCenter(store)
      const n = markAllAlertsRead(sc, req.user.id)
      scheduleSave()
      jsonOk(res, { marked: n })
    })
  )

  app.post(
    '/api/security/alerts/:id/read',
    requireUser,
    asyncHandler(async (req, res) => {
      const alertId = String(req.params.id || '').trim()
      if (!alertId) return jsonErr(res, 400, '缺少告警 ID', 'validation_error')

      const store = getStore()
      const sc = ensureSecurityCenter(store)
      const ok = markAlertReadById(sc, req.user.id, alertId)
      if (!ok) return jsonErr(res, 404, '告警不存在', 'not_found')
      scheduleSave()
      jsonOk(res, { ok: true })
    })
  )

  app.get(
    '/api/user/security-center',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const sc = ensureSecurityCenter(store)
      const page = readSecurityCenterPage(sc, req.user.id, { page: 1, pageSize: 50 })
      const logs = (sc.auditLogs || [])
        .filter((l) => String(l.userId || '') === String(req.user.id))
        .slice(0, 50)
        .map((l) => ({ message: l.message || l.action, at: l.at }))
      jsonOk(res, {
        alerts: page.items,
        unreadCount: page.unread,
        logs,
        risk: deriveRiskFromEvents(
          (sc.loginEvents || []).filter((e) => String(e.userId || '') === String(req.user.id)).slice(0, 20)
        ),
      })
    })
  )

  // ── 用户会话列表 ──────────────────────────────────────────
  app.get(
    '/api/user/sessions',
    requireUser,
    asyncHandler(async (req, res) => {
      const sessions = await listUserSessions({
        core: sessionCore,
        userId: req.session.getUserId(),
        currentHandle: req.session.getHandle(),
      })
      jsonOk(res, { sessions })
    })
  )

  app.get('/api/user/trusted-devices', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const uid = String(req.user.id)
    const bucket = ensureSecurityCenter(store).trustedDevices?.[uid] || {}
    const items = Object.values(bucket)
      .filter((device) => device && typeof device === 'object')
      .map((device) => ({
        id: trustedDeviceId(crypto, device.fingerprint),
        label: device.deviceProfile || '未知设备',
        firstSeenAt: device.firstSeenAt || null,
        lastSeenAt: device.lastSeenAt || null,
        loginCount: Number(device.loginCount || 0),
        lastIp: maskIpForLog(device.lastIp),
        lastLocation: device.lastLocation || '未记录',
        lastAsn: device.lastAsn || '未记录',
      }))
      .sort((left, right) => String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || '')))
    jsonOk(res, { items })
  }))

  app.post('/api/user/trusted-devices/:deviceId/revoke', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const uid = String(req.user.id)
    const bucket = ensureSecurityCenter(store).trustedDevices?.[uid] || {}
    const entry = Object.entries(bucket).find(([fingerprint]) =>
      trustedDeviceId(crypto, fingerprint) === String(req.params.deviceId || '').trim())
    if (!entry) return jsonErr(res, 404, '可信设备不存在', 'trusted_device_not_found')
    delete bucket[entry[0]]
    appendSecurityAudit(store, uid, 'trusted_device_revoke', { deviceId: req.params.deviceId })
    scheduleSave()
    jsonOk(res, { revoked: true })
  }))

  app.post('/api/user/trusted-devices/revoke-others', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const uid = String(req.user.id)
    const bucket = ensureSecurityCenter(store).trustedDevices?.[uid] || {}
    const keepId = String(req.body?.keepDeviceId || '').trim()
    let revoked = 0
    for (const fingerprint of Object.keys(bucket)) {
      if (trustedDeviceId(crypto, fingerprint) === keepId) continue
      delete bucket[fingerprint]
      revoked++
    }
    appendSecurityAudit(store, uid, 'trusted_device_revoke_all_other', { keepDeviceId: keepId, revoked })
    scheduleSave()
    jsonOk(res, { revoked })
  }))

  // ── 登录历史 ──────────────────────────────────────────────
  app.get(
    '/api/security/login-history',
    requireUser,
    asyncHandler(async (req, res) => {
      const sc = ensureSecurityCenter(getStore())
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
      const userId = String(req.user.id)
      const events = (sc.loginEvents || [])
        .filter((e) => String(e?.userId || '') === userId)
      const total = events.length
      const start = (page - 1) * pageSize
      const items = events.slice(start, start + pageSize).map((e) => ({
        id: e.id,
        method: e.method || 'unknown',
        ip: e.ip || null,
        location: e.location || null,
        device: e.deviceProfile || null,
        outcome: e.outcome || 'success',
        riskLevel: e.riskLevel || 'low',
        riskScore: e.riskScore || 0,
        createdAt: e.createdAt || null,
      }))
      jsonOk(res, { items, total, page, pageSize })
    })
  )

  // ── 撤销单个会话 ─────────────────────────────────────────
  app.post(
    '/api/security/sessions/:sessionId/revoke',
    requireUser,
    asyncHandler(async (req, res) => {
      const targetHandle = String(req.params.sessionId || '').trim()
      if (!targetHandle) return jsonErr(res, 400, '缺少会话 ID', 'validation_error')

      const currentHandle = req.session.getHandle()
      if (targetHandle === currentHandle) {
        return jsonErr(res, 409, '请使用退出登录结束当前会话', 'current_session')
      }

      const store = getStore()
      const revoked = await revokeUserSession({
        core: sessionCore,
        userId: req.session.getUserId(),
        handle: targetHandle,
      })
      if (!revoked) {
        return jsonErr(res, 404, '会话不存在或无权操作', 'session_not_found')
      }
      appendSecurityAudit(store, req.user.id, 'session_revoke', {
        sessionId: targetHandle,
        ip: req.ip,
      })
      scheduleSave()
      jsonOk(res, { revoked: true })
    })
  )

  // ── 撤销所有会话（保留当前） ──────────────────────────────
  app.post(
    '/api/security/sessions/revoke-all',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const revoked = await revokeOtherUserSessions({
        core: sessionCore,
        userId: req.session.getUserId(),
        currentHandle: req.session.getHandle(),
      })
      appendSecurityAudit(store, req.user.id, 'session_revoke_all', {
        revoked,
        ip: req.ip,
      })
      scheduleSave()
      jsonOk(res, { revoked })
    })
  )

  // ── 告警列表（独立分页接口） ──────────────────────────────
  app.get(
    '/api/security/alerts',
    requireUser,
    asyncHandler(async (req, res) => {
      const sc = ensureSecurityCenter(getStore())
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
      const result = readSecurityCenterPage(sc, req.user.id, { page, pageSize })
      jsonOk(res, {
        items: result.items,
        total: result.total,
        unread: result.unread,
        page,
        pageSize,
      })
    })
  )

  app.get('/api/security/analytics/summary', requireUser, asyncHandler(async (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const userId = String(req.user.id)
    const alerts = getUserAlertsFromIndex(sc, userId)
    const sessions = await listUserSessions({
      core: sessionCore,
      userId: req.session.getUserId(),
      currentHandle: req.session.getHandle(),
    })
    const auditLogs = (sc.auditLogs || []).filter((a) => String(a.userId || '') === userId)
    jsonOk(res, summarizeAlerts(alerts, sessions, auditLogs))
  }))

  app.get('/api/security/analytics/trend', requireUser, asyncHandler(async (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const alerts = getUserAlertsFromIndex(sc, req.user.id)
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    jsonOk(res, buildTrendPoints(alerts, days))
  }))

  app.get('/api/security/analytics/top-sources', requireUser, asyncHandler(async (req, res) => {
    const sc = ensureSecurityCenter(getStore())
    const alerts = getUserAlertsFromIndex(sc, req.user.id)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
    jsonOk(res, { items: topAlertSources(alerts, limit) })
  }))
}

function trustedDeviceId(cryptoImpl, fingerprint) {
  const value = String(fingerprint || '').trim()
  if (!value) return 'unknown'
  return cryptoImpl.createHash('sha256').update(value).digest('hex').slice(0, 24)
}

export { registerSecurityRoutes as default }
