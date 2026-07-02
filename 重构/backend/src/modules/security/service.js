function cleanString(value) {
  return String(value ?? '')
    .split('\u0000').join('')
    .replace(/\uFFFD/g, '')
}

function cleanDeep(value) {
  if (Array.isArray(value)) return value.map(cleanDeep)
  if (!value || typeof value !== 'object') return typeof value === 'string' ? cleanString(value) : value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] = cleanDeep(entry)
  }
  return out
}

export function summarizeAlerts(alerts, sessions, auditLogs) {
  const byLevel = { high: 0, medium: 0, low: 0 }
  for (const a of alerts) {
    const lv = String(a?.level || '').toLowerCase()
    if (lv === 'high') byLevel.high += 1
    else if (lv === 'medium') byLevel.medium += 1
    else byLevel.low += 1
  }

  const unread = alerts.filter((a) => !a.read).length
  const activeSessions = sessions.filter((s) => s?.active !== false).length

  return {
    totals: {
      alerts: alerts.length,
      unread,
      auditLogs: auditLogs.length,
      sessions: sessions.length,
      activeSessions
    },
    byLevel
  }
}

export function buildTrendPoints(alerts, requestedDays) {
  const days = Math.min(90, Math.max(7, Number(requestedDays) || 30))
  const now = Date.now()

  const bucket = new Map()
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now - i * 86400000).toISOString().slice(0, 10)
    bucket.set(day, { day, total: 0, unread: 0, high: 0 })
  }

  for (const a of alerts) {
    const day = String(a?.at || '').slice(0, 10)
    const row = bucket.get(day)
    if (!row) continue
    row.total += 1
    if (!a.read) row.unread += 1
    if (String(a?.level || '').toLowerCase() === 'high') row.high += 1
  }

  return {
    days,
    points: Array.from(bucket.values())
  }
}

export function topAlertSources(alerts, requestedLimit) {
  const limit = Math.min(50, Math.max(5, Number(requestedLimit) || 10))

  const byIp = new Map()
  const byGeo = new Map()
  for (const a of alerts) {
    const ip = String(a?.payload?.ip || a?.payload?.lastIp || '').trim() || 'unknown'
    const geo = String(a?.geo || '未知地区')
    byIp.set(ip, (byIp.get(ip) || 0) + 1)
    byGeo.set(geo, (byGeo.get(geo) || 0) + 1)
  }

  const topIps = Array.from(byIp.entries())
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  const topGeos = Array.from(byGeo.entries())
    .map(([geo, count]) => ({ geo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  return { topIps, topGeos }
}

export function readSecurityCenterPage(sc, userId, pageRaw, pageSizeRaw) {
  const page = Math.max(1, Number(pageRaw) || 1)
  const pageSize = Math.min(200, Math.max(10, Number(pageSizeRaw) || 50))
  const sessions = Object.values(sc.sessions || {})
    .filter((s) => s?.userId === userId)
    .map((s) => cleanDeep(s))
  const allAlerts = sc.alerts.filter((a) => a.userId === userId).map((a) => cleanDeep(a))
  const totalAlerts = allAlerts.length
  const start = (page - 1) * pageSize
  const alerts = allAlerts.slice(start, start + pageSize)
  const unreadAlerts = allAlerts.filter((a) => !a.read).length
  const auditLogs = sc.auditLogs.filter((a) => a.userId === userId).slice(0, 200).map((a) => cleanDeep(a))

  return {
    sessions,
    alerts,
    unreadAlerts,
    totalAlerts,
    page,
    pageSize,
    hasMoreAlerts: start + pageSize < totalAlerts,
    auditLogs
  }
}

export function buildSecurityCenterMfa(user) {
  return {
    totpEnabled: Boolean(user?.totpEnabled),
    recoveryCodesCount: Number(user?.recoveryCodesCount || 0)
  }
}

export function markAlertReadById(sc, userId, alertId) {
  const id = String(alertId || '').trim()
  if (!id) return { ok: false, error: 'missing_id' }
  const item = sc.alerts.find((a) => a.id === id && a.userId === userId)
  if (!item) return { ok: false, error: 'not_found' }
  item.read = true
  item.readAt = new Date().toISOString()
  return { ok: true, item }
}

export function markAllAlertsRead(sc, userId) {
  let count = 0
  for (const a of sc.alerts) {
    if (a.userId !== userId || a.read) continue
    a.read = true
    a.readAt = new Date().toISOString()
    count += 1
  }
  return { count }
}

export function buildSessionRecord(crypto, req, userId) {
  const sessionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const ip = String(req.ip || req.socket.remoteAddress || '').trim()
  const ua = String(req.headers['user-agent'] || '').slice(0, 300)
  return {
    id: sessionId,
    userId,
    createdAt: now,
    lastSeenAt: now,
    ip,
    userAgent: ua,
    deviceId: String(req.body?.deviceId || '').trim() || undefined,
    active: true
  }
}

export function revokeSessionById(sc, userId, sessionIdRaw) {
  const sessionId = String(sessionIdRaw || '').trim()
  const target = sc.sessions[sessionId]
  if (!target || target.userId !== userId) {
    return { ok: false, error: 'not_found' }
  }
  target.active = false
  target.revokedAt = new Date().toISOString()
  return { ok: true, sessionId }
}

export function revokeAllSessions(sc, userId) {
  let count = 0
  for (const s of Object.values(sc.sessions || {})) {
    if (s?.userId !== userId || s?.active === false) continue
    s.active = false
    s.revokedAt = new Date().toISOString()
    count += 1
  }
  return { count }
}
