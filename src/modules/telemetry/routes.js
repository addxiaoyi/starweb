import { jsonPage, resolvePaginationQuery } from '../../utils/response.js'

export function registerTelemetryRoutes(app, deps) {
  const {
    config,
    getStore,
    scheduleSave,
    requireTelemetryAccess,
    maskIpForLog,
    classifyDeviceType,
    pruneTelemetryEvents,
    checkTelemetryRateLimit,
    makeReqLogger,
    crypto,
  } = deps

  app.post('/api/metrics/web-vitals', (req, res) => {
    const p = req.body
    if (!p || typeof p !== 'object') return res.sendStatus(400)
    if (typeof p.name !== 'string' || typeof p.value !== 'number') return res.sendStatus(400)

    const pathname = typeof p.pathname === 'string' && p.pathname.trim() ? p.pathname.trim() : '/'
    const ts = Number(p.ts)
    const tsOk = Number.isFinite(ts) && ts > 0
    const metricName = String(p.name || '').toUpperCase()
    const metricValue = Number(p.value)

    if (process.env.LOG_WEB_VITALS === '1') {
      console.log('[web-vitals]', {
        name: metricName,
        value: metricValue,
        rating: p.rating,
        navigationType: p.navigationType,
        pathname,
        ts: tsOk ? ts : Date.now(),
        ip: maskIpForLog(req.ip)
      })
    }

    if (process.env.WEB_VITALS_ALERT_LOG === '1') {
      const threshold =
        metricName === 'LCP' ? 4000
        : metricName === 'INP' ? 500
        : metricName === 'CLS' ? 0.25
        : null
      if (threshold != null && metricValue > threshold) {
        console.warn('[web-vitals][alert]', {
          name: metricName,
          value: metricValue,
          threshold,
          pathname,
          rating: p.rating,
          navigationType: p.navigationType,
          ts: tsOk ? ts : Date.now(),
          ip: req.ip
        })
      }
    }

    res.sendStatus(204)
  })

  app.post('/api/telemetry', (req, res) => {
    const safeEnd = (status = 204) => {
      if (!res.headersSent) {
        res.status(status)
      }
      return res.end()
    }
    const reqLog = makeReqLogger(req)

    try {
      if (!config.telemetryEnabled) {
        return safeEnd(204)
      }

      const events = Array.isArray(req.body?.events) ? req.body.events : []
      if (events.length === 0) {
        reqLog.done(204, { reason: 'empty_events' })
        return safeEnd(204)
      }

      const ip = String(req.ip || 'unknown')
      const maxBatch = 50
      const incoming = Math.min(maxBatch, events.length)
      if (!checkTelemetryRateLimit(ip, incoming)) {
        reqLog.done(204, { reason: 'rate_limited' })
        return safeEnd(204)
      }

      const accepted = []
      const ua = String(req.headers['user-agent'] || '')
      for (const ev of events.slice(0, maxBatch)) {
        if (!ev || typeof ev !== 'object') continue
        if (String(ev.type || '') !== 'route_view') continue
        const item = {
          id: crypto.randomUUID(),
          type: 'route_view',
          path: String(ev.path || '').slice(0, 256),
          name: String(ev.name || '').slice(0, 128),
          section: String(ev.section || 'core').slice(0, 64),
          title: String(ev.title || '').slice(0, 128),
          ts: Number(ev.ts) > 0 ? Number(ev.ts) : Date.now(),
          ip: maskIpForLog(req.ip),
          uaHash: crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16),
          role: String(ev.role || 'guest').slice(0, 32),
          actor: String(ev.actor || '').slice(0, 64),
          deviceType: classifyDeviceType(ua),
          receivedAt: new Date().toISOString()
        }
        if (!item.path) continue
        accepted.push(item)
      }

      if (accepted.length === 0) {
        reqLog.done(204, { reason: 'no_valid_events' })
        return safeEnd(204)
      }

      const store = getStore()
      if (!Array.isArray(store.telemetryEvents)) store.telemetryEvents = []
      store.telemetryEvents.unshift(...accepted)
      pruneTelemetryEvents(store)
      try {
        scheduleSave()
      } catch (e) {
        console.warn('[starmc-api] telemetry scheduleSave failed:', e?.message || e)
      }

      if (process.env.LOG_ROUTE_TELEMETRY === '1') {
        console.log('[route-telemetry]', {
          count: accepted.length,
          sample: accepted[0],
          total: store.telemetryEvents.length,
          batchTs: Date.now()
        })
      }

      reqLog.done(202, { accepted: accepted.length })
      return res.status(202).json({ ok: true, accepted: accepted.length })
    } catch (e) {
      console.warn('[starmc-api] telemetry ingest failed:', e?.message || e)
      reqLog.done(204, { reason: 'exception' })
      return safeEnd(204)
    }
  })

  app.get('/api/admin/telemetry/stats', (req, res) => {
    if (!requireTelemetryAccess(req, res)) return
    const store = getStore()
    const allEvents = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []

    const range = String(req.query.range || '').trim()
    const now = Date.now()
    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : 0

    const events = rangeMs > 0
      ? allEvents.filter((ev) => {
        const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
        return Number.isFinite(t) && now - t <= rangeMs
      })
      : allEvents

    const total = events.length
    const bySection = {}
    const byPath = {}
    const byRole = {}
    const byDeviceType = {}
    const dailyTrend = new Map()
    const weeklyTrend = new Map()
    const monthlyTrend = new Map()

    const weekKeyOf = (t) => {
      const d = new Date(t)
      const year = d.getUTCFullYear()
      const dayUtc = Date.UTC(year, d.getUTCMonth(), d.getUTCDate())
      const firstUtc = Date.UTC(year, 0, 1)
      const week = Math.floor((dayUtc - firstUtc) / (7 * 24 * 60 * 60 * 1000)) + 1
      return `${year}-W${String(week).padStart(2, '0')}`
    }

    const bumpMap = (map, key) => {
      const k = String(key || 'unknown')
      map.set(k, Number(map.get(k) || 0) + 1)
    }

    for (const ev of events) {
      const section = String(ev?.section || 'core')
      const path = String(ev?.path || '')
      const role = String(ev?.role || 'guest')
      const deviceType = String(ev?.deviceType || 'unknown')
      const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
      bySection[section] = Number(bySection[section] || 0) + 1
      if (path) byPath[path] = Number(byPath[path] || 0) + 1
      byRole[role] = Number(byRole[role] || 0) + 1
      byDeviceType[deviceType] = Number(byDeviceType[deviceType] || 0) + 1
      if (Number.isFinite(t) && t > 0) {
        const d = new Date(t)
        const dayKey = d.toISOString().slice(0, 10)
        const monthKey = d.toISOString().slice(0, 7)
        bumpMap(dailyTrend, dayKey)
        bumpMap(weeklyTrend, weekKeyOf(t))
        bumpMap(monthlyTrend, monthKey)
      }
    }

    const topPaths = Object.entries(byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }))

    const funnel = {
      home: Number(byPath['/'] || 0),
      skin: Number(byPath['/skin'] || 0),
      auth: Number(byPath['/auth'] || 0)
    }

    const trendBy = (map, limit) =>
      Array.from(map.entries())
        .map(([bucket, count]) => ({ bucket, count }))
        .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))
        .slice(-limit)

    const pathCounts = Object.values(byPath).map((n) => Number(n || 0))
    const mean = pathCounts.length > 0
      ? pathCounts.reduce((sum, n) => sum + n, 0) / pathCounts.length
      : 0
    const variance = pathCounts.length > 0
      ? pathCounts.reduce((sum, n) => sum + (n - mean) ** 2, 0) / pathCounts.length
      : 0
    const std = Math.sqrt(variance)
    const anomalyThreshold = mean + std * 2
    const anomalyPaths = Object.entries(byPath)
      .filter(([, count]) => Number(count) >= Math.max(20, anomalyThreshold))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }))

    res.json({
      ok: true,
      total,
      bySection,
      topPaths,
      funnel,
      dimensions: {
        role: byRole,
        deviceType: byDeviceType
      },
      trend: {
        day: trendBy(dailyTrend, 30),
        week: trendBy(weeklyTrend, 16),
        month: trendBy(monthlyTrend, 12)
      },
      anomalies: {
        pathBurst: anomalyPaths
      },
      range: range || 'all'
    })
  })

  app.get('/api/admin/telemetry/events', (req, res) => {
    if (!requireTelemetryAccess(req, res)) return
    const reqLog = makeReqLogger(req)
    const store = getStore()
    const events = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []
    const pagination = resolvePaginationQuery(req.query, {
      defaultPageSize: 100,
      maxPageSize: 500
    })
    const section = String(req.query.section || '').trim().toLowerCase()
    const pathQuery = String(req.query.path || '').trim().toLowerCase()
    const range = String(req.query.range || '').trim()

    const now = Date.now()
    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : 0

    let filtered = events
    if (rangeMs > 0) {
      filtered = filtered.filter((ev) => {
        const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
        return Number.isFinite(t) && now - t <= rangeMs
      })
    }
    if (section) {
      filtered = filtered.filter((e) => String(e?.section || '').toLowerCase() === section)
    }
    if (pathQuery) {
      filtered = filtered.filter((e) => String(e?.path || '').toLowerCase().includes(pathQuery))
    }

    const items = filtered.slice(pagination.offset, pagination.offset + pagination.pageSize)
    reqLog.done(200, {
      route: 'telemetry_events',
      total: filtered.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      offset: pagination.offset,
      range: range || 'all'
    })
    // BUG FIX RUNTIME-2: jsonPage expects (res, items, total, pageInfo, extra).
    return jsonPage(res, items, filtered.length, pagination, { range: range || 'all' })
  })

  app.get('/api/admin/telemetry/export', (req, res) => {
    if (!requireTelemetryAccess(req, res)) return
    const store = getStore()
    const events = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []
    const section = String(req.query.section || '').trim().toLowerCase()
    const pathQuery = String(req.query.path || '').trim().toLowerCase()
    const range = String(req.query.range || '').trim()
    const format = String(req.query.format || 'csv').trim().toLowerCase()

    const now = Date.now()
    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : range === '7d' ? 7 * 24 * 60 * 60 * 1000
      : 0

    let filtered = events
    if (rangeMs > 0) {
      filtered = filtered.filter((ev) => {
        const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
        return Number.isFinite(t) && now - t <= rangeMs
      })
    }
    if (section) filtered = filtered.filter((e) => String(e?.section || '').toLowerCase() === section)
    if (pathQuery) filtered = filtered.filter((e) => String(e?.path || '').toLowerCase().includes(pathQuery))
    filtered = filtered.slice(0, 5000)

    if (format === 'json') {
      return res.json({ ok: true, total: filtered.length, items: filtered })
    }

    const rows = [
      ['receivedAt', 'path', 'name', 'section', 'role', 'deviceType', 'ip', 'uaHash']
    ]
    for (const ev of filtered) {
      rows.push([
        String(ev?.receivedAt || ''),
        String(ev?.path || ''),
        String(ev?.name || ''),
        String(ev?.section || ''),
        String(ev?.role || ''),
        String(ev?.deviceType || ''),
        String(ev?.ip || ''),
        String(ev?.uaHash || '')
      ])
    }
    // BUG FIX INJ-1: escape CSV cells against both quoting breaks AND
    // spreadsheet formula injection.  A cell whose first character is
    // =, +, -, @, TAB or CR is interpreted as a formula when the export is
    // opened in Excel / WPS / Google Sheets (e.g. =cmd|' /C calc'!A0 or
    // =HYPERLINK("http://evil","click")).  Telemetry path/name/ip come from
    // client-supplied data, so prefix those characters with a single quote
    // to neutralise them.
    const csvSafe = (value) => {
      let s = String(value ?? '')
      s = s.replace(/"/g, '""')
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s}"`
    }
    const csv = rows
      .map((r) => r.map(csvSafe).join(','))
      .join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="telemetry-export-${Date.now()}.csv"`)
    res.send(`\uFEFF${csv}`)
  })
}
