import crypto from 'node:crypto'
import net from 'node:net'

const DEFAULT_TTL_SECONDS = 15 * 60
const MAX_TTL_SECONDS = 24 * 60 * 60
const NODE_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/i
const PLATFORMS = new Set(['paper', 'folia', 'velocity', 'bungee', 'standalone'])
const ALLOWED_CAPABILITIES = new Set([
  'network.status',
  'public.player-count',
  'players.snapshot',
  'server.status',
  'server.commands',
  'skin.refresh',
  'cape.refresh',
  'auth.events',
])

function enrollmentState(store) {
  if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') store.dashboardConfigs = {}
  if (!store.dashboardConfigs.pluginEnrollment || typeof store.dashboardConfigs.pluginEnrollment !== 'object') {
    store.dashboardConfigs.pluginEnrollment = { bootstraps: [], nodes: [] }
  }
  const state = store.dashboardConfigs.pluginEnrollment
  if (!Array.isArray(state.bootstraps)) state.bootstraps = []
  if (!Array.isArray(state.nodes)) state.nodes = []
  return state
}

function nowIso(clock) {
  return clock().toISOString()
}

function digest(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function safeHashEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function makeToken(prefix) {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`
}

function validNode(nodeId, platform) {
  return NODE_PATTERN.test(String(nodeId || '')) && PLATFORMS.has(String(platform || '').toLowerCase())
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((entry) => String(entry || '').trim()).filter((entry) => ALLOWED_CAPABILITIES.has(entry)))]
}

function boundedText(value, limit) {
  const text = String(value ?? '').trim()
  return text.length <= limit ? text : null
}

function boundedNumber(value, min, max) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined
}

function normalizeServerSnapshot(server) {
  if (!server || typeof server !== 'object' || Array.isArray(server)) return null
  const nodeId = boundedText(server.nodeId, 64)
  if (!nodeId || !NODE_PATTERN.test(nodeId)) return null
  const onlinePlayers = boundedNumber(server.onlinePlayers, 0, 100_000)
  const maxPlayers = boundedNumber(server.maxPlayers, 0, 100_000)
  const tps = boundedNumber(server.tps, 0, 100)
  const mspt = boundedNumber(server.mspt, 0, 60_000)
  if ([onlinePlayers, maxPlayers, tps, mspt].includes(undefined)) return null
  const status = String(server.status || 'unknown').toLowerCase()
  if (!['online', 'offline', 'degraded', 'maintenance', 'unknown'].includes(status)) return null
  const name = boundedText(server.name || nodeId, 80)
  const platform = boundedText(server.platform, 32)
  const minecraftVersion = boundedText(server.minecraftVersion, 32)
  if (name === null || platform === null || minecraftVersion === null) return null
  return {
    nodeId,
    name,
    platform,
    minecraftVersion,
    status,
    onlinePlayers: onlinePlayers ?? 0,
    maxPlayers: maxPlayers ?? 0,
    tps: tps ?? null,
    mspt: mspt ?? null,
    maintenance: server.maintenance === true,
    capabilities: normalizeCapabilities(server.capabilities),
  }
}

export function normalizeNodeSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.servers !== undefined && (!Array.isArray(value.servers) || value.servers.length > 128)) return null
  const servers = (value.servers || []).map(normalizeServerSnapshot)
  if (servers.some((server) => server === null)) return null
  const onlinePlayers = boundedNumber(value.onlinePlayers, 0, 100_000)
  const maxPlayers = boundedNumber(value.maxPlayers, 0, 100_000)
  const tps = boundedNumber(value.tps, 0, 100)
  const mspt = boundedNumber(value.mspt, 0, 60_000)
  if ([onlinePlayers, maxPlayers, tps, mspt].includes(undefined)) return null
  const pluginVersion = boundedText(value.pluginVersion, 32)
  const minecraftVersion = boundedText(value.minecraftVersion, 32)
  if (pluginVersion === null || minecraftVersion === null) return null
  return {
    pluginVersion,
    minecraftVersion,
    onlinePlayers: onlinePlayers ?? 0,
    maxPlayers: maxPlayers ?? 0,
    tps: tps ?? null,
    mspt: mspt ?? null,
    maintenance: value.maintenance === true,
    servers,
  }
}

export function createBootstrapToken(store, input, options = {}) {
  const clock = options.clock || (() => new Date())
  const nodeId = String(input?.nodeId || '').trim()
  const platform = String(input?.platform || '').trim().toLowerCase()
  if (!validNode(nodeId, platform)) return { ok: false, code: 'invalid_node' }
  const ttlSeconds = Math.min(MAX_TTL_SECONDS, Math.max(60, Number(input.ttlSeconds) || DEFAULT_TTL_SECONDS))
  const issuedAt = clock()
  const token = makeToken('stx_boot_')
  const record = {
    id: crypto.randomUUID(),
    tokenHash: digest(token),
    nodeId,
    platform,
    capabilities: normalizeCapabilities(input.capabilities),
    createdAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
    usedAt: null,
  }
  enrollmentState(store).bootstraps.push(record)
  return { ok: true, token, id: record.id, expiresAt: record.expiresAt }
}

export function consumeBootstrapToken(store, token, input, options = {}) {
  const clock = options.clock || (() => new Date())
  const record = enrollmentState(store).bootstraps.find((entry) => safeHashEqual(entry.tokenHash, digest(String(token || ''))))
  if (!record) return { ok: false, code: 'bootstrap_invalid' }
  if (record.usedAt) return { ok: false, code: 'bootstrap_used' }
  if (new Date(record.expiresAt).getTime() <= clock().getTime()) return { ok: false, code: 'bootstrap_expired' }
  if (record.nodeId !== input?.nodeId) return { ok: false, code: 'node_mismatch' }
  if (record.platform !== String(input?.platform || '').toLowerCase()) return { ok: false, code: 'platform_mismatch' }
  record.usedAt = nowIso(clock)
  return { ok: true, grant: record }
}

export function issueNodeCredential(store, input, options = {}) {
  const clock = options.clock || (() => new Date())
  const nodeId = String(input?.nodeId || '').trim()
  const platform = String(input?.platform || '').trim().toLowerCase()
  if (!validNode(nodeId, platform)) return { ok: false, code: 'invalid_node' }
  const token = makeToken('stx_node_')
  const state = enrollmentState(store)
  const current = state.nodes.find((entry) => entry.nodeId === nodeId)
  const node = current || { nodeId, createdAt: nowIso(clock) }
  Object.assign(node, {
    platform,
    credentialHash: digest(token),
    capabilities: normalizeCapabilities(input.capabilities),
    callbackUrl: input.callbackUrl || '',
    status: 'active',
    rotatedAt: current ? nowIso(clock) : null,
    revokedAt: null,
    lastSeenAt: null,
  })
  if (!current) state.nodes.push(node)
  return { ok: true, token, nodeId, scopes: ['heartbeat:write'] }
}

function findCredentialNode(store, token) {
  const hash = digest(String(token || ''))
  return enrollmentState(store).nodes.find((entry) => safeHashEqual(entry.credentialHash, hash))
}

export function authenticateNodeCredential(store, token) {
  const node = findCredentialNode(store, token)
  if (!node) return { ok: false, code: 'credential_invalid' }
  if (node.status === 'revoked') return { ok: false, code: 'node_revoked' }
  return { ok: true, node }
}

export function recordNodeHeartbeat(store, token, input, options = {}) {
  const clock = options.clock || (() => new Date())
  const auth = authenticateNodeCredential(store, token)
  if (!auth.ok) return auth
  const { node } = auth
  if (node.nodeId !== input?.nodeId) return { ok: false, code: 'node_mismatch' }
  const snapshot = input.snapshot === undefined ? null : normalizeNodeSnapshot(input.snapshot)
  if (input.snapshot !== undefined && snapshot === null) return { ok: false, code: 'snapshot_invalid' }
  node.lastSeenAt = nowIso(clock)
  node.capabilities = normalizeCapabilities(input.capabilities || node.capabilities)
  node.snapshot = snapshot
  return { ok: true, nodeId: node.nodeId, receivedAt: node.lastSeenAt }
}

export function rotateNodeCredential(store, nodeId, options = {}) {
  const node = enrollmentState(store).nodes.find((entry) => entry.nodeId === nodeId)
  if (!node) return { ok: false, code: 'node_not_found' }
  return issueNodeCredential(store, node, options)
}

export function revokePluginNode(store, nodeId, options = {}) {
  const clock = options.clock || (() => new Date())
  const node = enrollmentState(store).nodes.find((entry) => entry.nodeId === nodeId)
  if (!node) return { ok: false, code: 'node_not_found' }
  node.status = 'revoked'
  node.revokedAt = nowIso(clock)
  return { ok: true }
}

export function listPluginNodes(store) {
  return enrollmentState(store).nodes.map(({ credentialHash: _secret, snapshot, ...node }) => ({
    ...node,
    snapshot: snapshot || null,
  }))
}

export function publicPluginNetwork(store, options = {}) {
  const clock = options.clock || (() => new Date())
  const freshMs = Math.max(15, Number(options.freshSeconds) || 90) * 1000
  const now = clock().getTime()
  const nodes = enrollmentState(store).nodes
    .filter((node) => node.status === 'active' && node.snapshot && Number.isFinite(new Date(node.lastSeenAt).getTime()))
    .filter((node) => now - new Date(node.lastSeenAt).getTime() <= freshMs)
    .map((node) => ({
      nodeId: node.nodeId,
      platform: node.platform,
      capabilities: node.capabilities || [],
      lastSeenAt: node.lastSeenAt,
      snapshot: node.snapshot,
    }))
  return {
    collectedAt: new Date(now).toISOString(),
    onlinePlayers: nodes.reduce((sum, node) => sum + (Number(node.snapshot.onlinePlayers) || 0), 0),
    maxPlayers: nodes.reduce((sum, node) => sum + (Number(node.snapshot.maxPlayers) || 0), 0),
    nodes,
  }
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number)
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0
}

export function validateCallbackUrl(value, options = {}) {
  try {
    const url = new URL(String(value || ''))
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return { ok: false, code: 'callback_invalid' }
    const host = url.hostname.toLowerCase()
    const isLocal = host === 'localhost' || host === '::1' || (net.isIPv4(host) && isPrivateIpv4(host))
    if (isLocal && options.allowPrivate !== true) return { ok: false, code: 'callback_private' }
    if (net.isIPv6(host) && host !== '::1') return { ok: false, code: 'callback_ip_literal' }
    return { ok: true, url: url.toString() }
  } catch {
    return { ok: false, code: 'callback_invalid' }
  }
}
