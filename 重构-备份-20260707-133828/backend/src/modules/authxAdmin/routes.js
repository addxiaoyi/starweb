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

function requireVlaAdapter(config, jsonErr, res) {
  if (config.authxPluginAdapter !== 'vla') {
    jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'vla_adapter_required')
    return false
  }
  return true
}

function registerCommandRoute(app, deps, { path, event, validate }) {
  const middlewares = []
  if (typeof deps.adminPluginGetLimiter === 'function') {
    middlewares.push(deps.adminPluginGetLimiter)
  }
  app.post(path, ...middlewares, asyncHandler(async (req, res) => {
    if (!deps.requireDevAdmin(req, res)) return
    const validationError = validate ? validate(req.body || {}) : null
    if (validationError) return deps.jsonErr(res, 400, validationError.message, validationError.code)
    if (!deps.eventBus.hasSubscribers(event)) {
      return deps.jsonErr(res, 503, `没有注册 ${event} 的处理程序，请检查插件适配器配置`, 'no_subscriber')
    }
    try {
      const reply = await deps.eventBus.publishAndWait(event, { body: req.body || {} })
      const normalized = normalizeCommandReply(reply)
      if (!normalized.ok) {
        return deps.jsonErr(res, normalized.result?.status ?? 502, normalized.error || '插件命令执行失败', 'plugin_command_failed', normalized.result?.json)
      }
      return respondPluginJson(res, normalized.result)
    } catch (err) {
      return deps.jsonErr(res, 502, '插件命令执行失败', 'plugin_command_failed', { reason: err.message })
    }
  }))
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
    circuitBreakerStatus,
    pluginFetchCounters,
    eventHandlerFailures,
  } = deps
  const okResponse = jsonOk

  app.get('/api/admin/authx/circuit-breaker', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const now = Date.now()
    const counters = { ...pluginFetchCounters }
    delete counters.history
    return okResponse(res, {
      failures: circuitBreakerStatus?.failures ?? 0,
      isOpen: circuitBreakerStatus?.isOpen ?? false,
      halfOpenAfter: circuitBreakerStatus?.halfOpenAfter ?? 0,
      remainingCooldownMs: circuitBreakerStatus?.isOpen
        ? Math.max(0, (circuitBreakerStatus.halfOpenAfter || 0) - now)
        : 0,
      counters,
      recentHandlerFailures: eventHandlerFailures?.slice(0, 20) ?? [],
    })
  }))

  app.get('/api/admin/authx/plugin-stats', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const history = Array.isArray(pluginFetchCounters?.history) ? pluginFetchCounters.history : []
    const now = Date.now()
    const range = String(req.query.range || '').trim()
    const trendCfg =
      range === '15m' ? { bucketMs: 60 * 1000, count: 15 }
      : range === '1h' ? { bucketMs: 5 * 60 * 1000, count: 12 }
      : { bucketMs: 60 * 60 * 1000, count: 24 }
    const bucketStart = now - trendCfg.bucketMs * trendCfg.count
    const trend = Array.from({ length: trendCfg.count }, (_, i) => {
      const start = bucketStart + i * trendCfg.bucketMs
      return { ts: new Date(start).toISOString(), total: 0, success: 0, failed: 0, successRate: 0 }
    })
    for (const ev of history) {
      const t = Number(ev?.ts || 0)
      if (!Number.isFinite(t) || t < bucketStart || t >= now) continue
      const idx = Math.floor((t - bucketStart) / trendCfg.bucketMs)
      if (idx < 0 || idx >= trend.length) continue
      trend[idx].total += 1
      if (ev?.ok === true) trend[idx].success += 1
      else trend[idx].failed += 1
    }
    for (const b of trend) {
      b.successRate = b.total > 0 ? Number(((b.success / b.total) * 100).toFixed(2)) : 0
    }
    const latencies = history
      .map((x) => Number(x?.latencyMs || 0))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b)
    function percentile(arr, p) {
      if (arr.length === 0) return 0
      const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1))
      return arr[idx]
    }
    return okResponse(res, {
      total: history.length,
      latency: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
        max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
      },
      trend,
    })
  }))

  app.get('/api/admin/authx/plugin-health', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const probe = await pluginFetchHealth()
    const safeProbe = { reachable: Boolean(probe?.reachable), status: Number(probe?.status ?? 0) || null }
    const ok = probe.reachable && probe.status >= 200 && probe.status < 300
    if (ok) return okResponse(res, { plugin: safeProbe })
    return res.status(502).json({
      ok: false,
      success: false,
      message: '插件健康检查失败',
      code: 'plugin_health_failed',
      error: 'plugin_health_failed',
      details: {
        reachable: Boolean(probe?.reachable),
        status: Number(probe?.status ?? 0) || null,
      },
    })
  }))

  app.get('/api/admin/authx/plugin-metrics', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    if (!requireVlaAdapter(config, jsonErr, res)) return
    const r = await pluginFetchGet('/v1/metrics/prometheus')
    res
      .status(normalizeProxyStatus(r.status))
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(r.text || '')
  }))

  app.get('/api/admin/authx/ban-check', adminPluginGetLimiter, asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    if (!requireVlaAdapter(config, jsonErr, res)) return
    const name = String(req.query.name || '').trim()
    if (!name) return jsonErr(res, 400, '缺少 name', 'validation_error')
    const r = await pluginFetchGet('/v1/ban', { name })
    return respondPluginJsonOrText(res, r)
  }))

  app.get('/api/admin/authx/user-exists', adminPluginGetLimiter, asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    if (!requireVlaAdapter(config, jsonErr, res)) return
    const name = String(req.query.name || '').trim()
    if (!name) return jsonErr(res, 400, '缺少 name', 'validation_error')
    const r = await pluginFetchGet('/v1/user/exists', { name })
    return respondPluginJsonOrText(res, r)
  }))

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/reset-password',
    event: Events.VLA_COMMAND_RESET_PASSWORD,
    validate: (body) => {
      if (!body.username) return { message: '缺少 username', code: 'validation_error' }
      return null
    }
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/bind-email',
    event: Events.VLA_COMMAND_BIND_EMAIL,
    validate: (body) => {
      if (!body.username) return { message: '缺少 username', code: 'validation_error' }
      return null
    }
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/unbind-device',
    event: Events.VLA_COMMAND_UNBIND_DEVICE,
    validate: (body) => {
      if (!body.username) return { message: '缺少 username', code: 'validation_error' }
      return null
    }
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/kick-online',
    event: Events.VLA_COMMAND_KICK_ONLINE
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/ban',
    event: Events.VLA_COMMAND_BAN
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/delete-user',
    event: Events.VLA_COMMAND_DELETE_USER
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/skin-refresh',
    event: Events.VLA_COMMAND_SKIN_REFRESH
  })

  registerCommandRoute(app, deps, {
    path: '/api/admin/authx/link-external-user',
    event: Events.VLA_COMMAND_LINK_EXTERNAL_USER
  })
}
