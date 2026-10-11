const MAX_RESPONSE_BYTES = 1024 * 1024

function nonNegativeInt(value, field) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid StarX network status field: ${field}`)
  }
  return number
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function boundedText(value, field, fallback = '', maxLength = 256) {
  const text = cleanText(value, fallback)
  if (text.length > maxLength) {
    throw new Error(`Invalid StarX network status field: ${field}`)
  }
  return text
}

function optionalNonNegativeInt(value, field) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid StarX network status field: ${field}`)
  }
  return number
}

function capabilitiesOf(value, field) {
  const raw = Array.isArray(value) ? value : boundedText(value, field, '', 4096).split(',')
  const values = raw.map((entry) => boundedText(entry, field, '', 64)).filter(Boolean)
  if (values.length > 64 || new Set(values).size !== values.length) {
    throw new Error(`Invalid StarX network status field: ${field}`)
  }
  return values.sort()
}

export function normalizeStarxNetworkStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid StarX network status payload')
  }

  const online = nonNegativeInt(value.onlinePlayers, 'onlinePlayers')
  const max = nonNegativeInt(value.maxPlayers, 'maxPlayers')
  if (online > max && max !== 0) {
    throw new Error('Invalid StarX network status field: onlinePlayers exceeds maxPlayers')
  }
  if (!Array.isArray(value.servers)) {
    throw new Error('Invalid StarX network status field: servers')
  }

  const servers = value.servers.map((server, index) => {
    if (!server || typeof server !== 'object' || Array.isArray(server)) {
      throw new Error(`Invalid StarX network status server at index ${index}`)
    }
    const name = cleanText(server.name)
    if (!name) throw new Error(`Invalid StarX network status server name at index ${index}`)

    return {
      name,
      online: nonNegativeInt(server.onlinePlayers, `servers[${index}].onlinePlayers`),
      max: nonNegativeInt(server.maxPlayers, `servers[${index}].maxPlayers`),
      status: cleanText(server.bridgeState, 'unseen').toLowerCase(),
      transport: cleanText(server.transport, 'unknown').toLowerCase(),
      skinProvider: cleanText(server.skinProvider, 'none').toLowerCase(),
      skinBridge: cleanText(server.skinBridge, 'unavailable').toLowerCase(),
      nodeId: boundedText(server.nodeId, `servers[${index}].nodeId`, name, 64),
      platform: boundedText(server.platform, `servers[${index}].platform`, 'unknown', 32).toLowerCase(),
      execution: boundedText(server.execution, `servers[${index}].execution`, 'unknown', 64),
      minecraft: boundedText(server.minecraft, `servers[${index}].minecraft`, 'unknown', 64),
      implementation: boundedText(
        server.implementation, `servers[${index}].implementation`, 'unknown', 128),
      capabilities: capabilitiesOf(server.capabilities, `servers[${index}].capabilities`),
      uptimeMillis: optionalNonNegativeInt(
        server.uptimeMillis, `servers[${index}].uptimeMillis`),
      lastSeen: boundedText(server.lastSeen, `servers[${index}].lastSeen`) || null,
      httpCommandsAccepted: optionalNonNegativeInt(
        server.httpCommandsAccepted, `servers[${index}].httpCommandsAccepted`) ?? 0,
      httpCommandsDelivered: optionalNonNegativeInt(
        server.httpCommandsDelivered, `servers[${index}].httpCommandsDelivered`) ?? 0,
      httpCommandsRejected: optionalNonNegativeInt(
        server.httpCommandsRejected, `servers[${index}].httpCommandsRejected`) ?? 0,
      httpCommandsQueued: optionalNonNegativeInt(
        server.httpCommandsQueued, `servers[${index}].httpCommandsQueued`) ?? 0,
    }
  })

  const metrics = value.metrics && typeof value.metrics === 'object'
    ? {
        sampleCount: nonNegativeInt(value.metrics.sampleCount ?? 0, 'metrics.sampleCount'),
        lastCollectedAt: cleanText(value.metrics.lastCollectedAt) || null,
      }
    : null

  return {
    online,
    max,
    servers,
    metrics,
    collectedAt: cleanText(value.collectedAt) || null,
  }
}

export function createStarxNetworkClient({ baseUrl, apiKey, timeoutMs = 5000, fetchImpl = fetch }) {
  const base = cleanText(baseUrl).replace(/\/+$/, '')
  const key = cleanText(apiKey)
  if (!base) throw new Error('STARX_NETWORK_API_BASE is required')
  if (!key) throw new Error('STARX_NETWORK_API_KEY is required')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new Error('STARX_NETWORK_API_TIMEOUT_MS must be between 100 and 60000')
  }

  async function request(path, options = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${base}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          'X-API-Key': key,
          ...options.headers,
        },
        signal: controller.signal,
      })
      const text = await response.text()
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error('StarX API response exceeds 1 MiB')
      }
      let body
      try {
        body = JSON.parse(text)
      } catch {
        throw new Error('StarX API returned invalid JSON')
      }
      if (!response.ok) {
        const reason = cleanText(body?.error || body?.status, `HTTP ${response.status}`)
        throw new Error(`StarX API rejected the request: ${reason}`)
      }
      return body
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`StarX API timed out after ${timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async getNetworkStatus() {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(`${base}/v1/network/status`, {
          method: 'GET',
          headers: { Accept: 'application/json', 'X-API-Key': key },
          signal: controller.signal,
        })
        const text = await response.text()
        if (text.length > MAX_RESPONSE_BYTES) {
          throw new Error('StarX network status response exceeds 1 MiB')
        }
        if (!response.ok) {
          throw new Error(`StarX network status returned HTTP ${response.status}`)
        }
        let body
        try {
          body = JSON.parse(text)
        } catch {
          throw new Error('StarX network status returned invalid JSON')
        }
        return normalizeStarxNetworkStatus(body)
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`StarX network status timed out after ${timeoutMs}ms`)
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
    async confirmApproval(input) {
      const token = boundedText(input?.token, 'approval.token', '', 256)
      const playerId = boundedText(input?.playerId, 'approval.playerId', '', 36)
      const username = boundedText(input?.username, 'approval.username', '', 16)
      const email = boundedText(input?.email, 'approval.email', '', 320).toLowerCase()
      const action = boundedText(input?.action, 'approval.action', '', 32)
      const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const allowedActions = new Set([
        'bind_email', 'enable_totp', 'bind_skin_account', 'approve_login',
      ])
      if (!token || !validUuid.test(playerId) || username.length < 3 || !email || !allowedActions.has(action)) {
        throw new Error('Invalid cross-device approval request')
      }
      return request('/v1/admin/approval/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, playerId, username, email, action }),
      })
    },
  }
}
