const PLUGIN_HEALTH_PARSED_KEYS = [
  'ok',
  'version',
  'database_ok',
  'databaseOk',
  'uptime_ms',
  'uptimeMs',
  'adapter',
]

export function sanitizePluginHealthProbe(probe) {
  const safe = {
    reachable: Boolean(probe?.reachable),
    status: Number(probe?.status ?? 0) || null,
  }
  if (probe?.path) safe.path = String(probe.path)
  const parsed = probe?.parsed
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    /** @type {Record<string, unknown>} */
    const subset = {}
    for (const key of PLUGIN_HEALTH_PARSED_KEYS) {
      if (parsed[key] !== undefined) subset[key] = parsed[key]
    }
    if (Object.keys(subset).length > 0) safe.parsed = subset
  }
  return safe
}

export function normalizeProxyStatus(status) {
  return status >= 100 && status < 600 ? status : 502
}

function isSuccessStatus(status) {
  return status >= 200 && status < 300
}

function normalizePluginJsonPayload(payload, status) {
  const ok = isSuccessStatus(status)
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const normalized = { ...payload }
    if (typeof normalized.ok !== 'boolean') normalized.ok = ok
    if (typeof normalized.success !== 'boolean') normalized.success = Boolean(normalized.ok)
    return normalized
  }
  return {
    ok,
    success: ok,
    data: payload === undefined ? null : payload,
  }
}

export function respondPluginJson(res, result) {
  const status = normalizeProxyStatus(result?.status)
  return res.status(status).json(normalizePluginJsonPayload(result?.json, status))
}

export function respondPluginJsonOrText(res, result) {
  if (result?.json !== undefined) {
    const status = normalizeProxyStatus(result.status)
    return res.status(status).json(normalizePluginJsonPayload(result.json, status))
  }
  return res.status(normalizeProxyStatus(result?.status)).send(result?.text || '')
}
