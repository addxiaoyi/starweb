const alertIndexCache = new WeakMap()

export function invalidateAlertIndex(sc) {
  alertIndexCache.delete(sc)
}

function ensureAlertIndex(sc) {
  if (alertIndexCache.has(sc)) return alertIndexCache.get(sc)
  const byUser = new Map()
  for (const alert of sc.alerts || []) {
    const uid = String(alert?.userId || 'anonymous')
    if (!byUser.has(uid)) byUser.set(uid, [])
    byUser.get(uid).push(alert)
  }
  alertIndexCache.set(sc, byUser)
  return byUser
}

export function getUserAlertsFromIndex(sc, userId) {
  const idx = ensureAlertIndex(sc)
  return idx.get(String(userId || 'anonymous')) || []
}

export async function attachGeoToAlerts(alerts, resolveGeo) {
  const seen = new Map()
  for (const alert of alerts) {
    const ip = String(alert?.payload?.ip || alert?.ip || '').trim()
    if (!ip) continue
    if (!seen.has(ip)) seen.set(ip, await resolveGeo(ip))
    alert.geo = seen.get(ip)
  }
}

export function shouldRaiseHighRiskAlert(sc, userId, title, windowMs = 30 * 60_000) {
  const now = Date.now()
  const rows = (sc.alerts || []).filter((a) => {
    if (String(a.userId || '') !== String(userId || '')) return false
    if (String(a.level || '').toLowerCase() !== 'high') return false
    if (String(a.title || '') !== String(title || '')) return false
    const t = Date.parse(String(a.at || ''))
    return Number.isFinite(t) && now - t <= windowMs
  })
  return rows.length === 0
}

export function readSecurityCenterPage(sc, userId, { page = 1, pageSize = 20 } = {}) {
  const rows = getUserAlertsFromIndex(sc, userId)
  const start = (page - 1) * pageSize
  const items = rows.slice(start, start + pageSize)
  const unread = rows.filter((a) => !a.read).length
  return { items, total: rows.length, unread }
}

export function markAlertReadById(sc, userId, alertId) {
  const rows = getUserAlertsFromIndex(sc, userId)
  const row = rows.find((a) => String(a.id) === String(alertId))
  if (!row) return false
  row.read = true
  invalidateAlertIndex(sc)
  return true
}

export function markAllAlertsRead(sc, userId) {
  const rows = getUserAlertsFromIndex(sc, userId)
  let n = 0
  for (const row of rows) {
    if (!row.read) {
      row.read = true
      n += 1
    }
  }
  invalidateAlertIndex(sc)
  return n
}

export function deriveRiskFromEvents(events = []) {
  const failed = events.filter((e) => String(e.outcome || '') !== 'success').length
  const score = Math.min(100, failed * 20 + events.length * 2)
  return { score, level: score >= 70 ? 'high' : score >= 35 ? 'medium' : 'low', failed }
}

export function summarizeAlerts(alerts = [], sessions = [], auditLogs = []) {
  const unread = alerts.filter((a) => !a.read).length
  const high = alerts.filter((a) => String(a.level || '').toLowerCase() === 'high').length
  const medium = alerts.filter((a) => String(a.level || '').toLowerCase() === 'medium').length
  return {
    totalAlerts: alerts.length,
    unreadAlerts: unread,
    highRiskAlerts: high,
    mediumRiskAlerts: medium,
    activeSessions: sessions.length,
    auditEvents: auditLogs.length,
  }
}

export function buildTrendPoints(alerts = [], days = 30) {
  const windowMs = Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000
  const since = Date.now() - windowMs
  /** @type {Map<string, number>} */
  const buckets = new Map()
  for (const alert of alerts) {
    const t = Date.parse(String(alert?.at || ''))
    if (!Number.isFinite(t) || t < since) continue
    const key = new Date(t).toISOString().slice(0, 10)
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}

export function topAlertSources(alerts = [], limit = 10) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const alert of alerts) {
    const source = String(alert?.payload?.source || alert?.title || 'unknown')
    counts.set(source, (counts.get(source) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Number(limit) || 10))
    .map(([source, count]) => ({ source, count }))
}
