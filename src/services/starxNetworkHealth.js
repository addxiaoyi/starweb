const HEALTHY_BRIDGE_STATES = new Set(['linked', 'online'])

export function summarizeStarxNetworkStatus(status) {
  const servers = Array.isArray(status?.servers) ? status.servers : []
  const observed = servers.length
  const online = servers.filter((server) =>
    HEALTHY_BRIDGE_STATES.has(String(server?.status || '').toLowerCase())).length

  return {
    online,
    observed,
    status: online === 0 ? 'offline' : online === observed ? 'online' : 'degraded',
  }
}

function timestampOf(now) {
  const value = Number(now())
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('StarX network health clock returned an invalid timestamp')
  }
  return value
}

export function shouldRefreshStarxNetworkState(state, {
  now = Date.now,
  retryMs = 30_000,
} = {}) {
  if (!state || typeof state !== 'object') return true
  const lastAttemptAt = Number(state.lastAttemptAt || 0)
  return !Number.isFinite(lastAttemptAt)
    || lastAttemptAt <= 0
    || timestampOf(now) - lastAttemptAt >= retryMs
}

export async function refreshStarxNetworkState({
  client,
  state,
  now = Date.now,
  logger = console,
}) {
  if (!client || typeof client.getNetworkStatus !== 'function') {
    throw new Error('StarX network client is required')
  }
  if (!state || typeof state !== 'object') {
    throw new Error('StarX network state is required')
  }

  const attemptedAt = timestampOf(now)
  state.lastAttemptAt = attemptedAt
  try {
    const status = await client.getNetworkStatus()
    const summary = summarizeStarxNetworkStatus(status)
    state.networkStatusHealthy = summary.status === 'online'
    state.networkStatus = summary.status
    state.networkStatusCounts = { online: summary.online, observed: summary.observed }
    state.lastSuccessAt = new Date(attemptedAt).toISOString()
    return status
  } catch (error) {
    state.networkStatusHealthy = false
    state.lastErrorAt = new Date(attemptedAt).toISOString()
    logger?.warn?.('[starmc-api] StarX network status unavailable:', error?.message || error)
    throw error
  }
}
