import crypto from 'node:crypto'
import { isPluginWebhookAuthConfigured } from '../plugin-gateway/adapter.js'
import { listPluginNodes, publicPluginNetwork } from '../plugin-enrollment/service.js'
import { asyncHandler } from '../../middleware/error.js'
import { applyStoredPluginBridge, updateStoredPluginBridge } from './pluginBridgeConfig.js'

function avatarMinecraftUsername(user) {
  const profiles = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
  return String(
    profiles.find((profile) => String(profile?.username || '').trim())?.username
    || user?.linkedMcUsername
    || ''
  ).trim() || undefined
}

export function registerAuthxAdminRoutes(app, deps) {
  const {
    requireUser,
    requireDevAdmin,
    pluginFetchHealth,
    pluginFetchGet,
    pluginFetchJson,
    reconfigureStarxNetworkClient = () => false,
    getStore,
    config,
    adminPluginGetLimiter,
    jsonOk,
    circuitBreakerStatus = {},
    pluginFetchCounters = {},
    requireSuperAdmin = requireDevAdmin,
    persistCircuitBreaker = () => {},
    scheduleSave = () => {},
    markKvDirty = () => {},
    appendAuditLog = () => {},
  } = deps

  let bridgeRuntime = applyStoredPluginBridge(getStore(), config)
  reconfigureStarxNetworkClient()

  app.get('/api/admin/authx/plugin-health', requireUser, asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const probe = await pluginFetchHealth()
    const safeProbe = { reachable: Boolean(probe?.reachable), status: Number(probe?.status ?? 0) || null }
    const ok = probe?.reachable && probe.status >= 200 && probe.status < 300
    if (ok) return jsonOk(res, { plugin: safeProbe })
    return res.status(502).json({
      ok: false,
      success: false,
      message: '插件健康检查失败',
      code: 'plugin_health_failed',
      error: 'plugin_health_failed',
      plugin: safeProbe,
      details: { reachable: safeProbe.reachable, status: safeProbe.status },
    })
  }))

  app.get('/api/admin/authx/bridge-status', requireUser, adminPluginGetLimiter, asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    bridgeRuntime = applyStoredPluginBridge(getStore(), config)
    reconfigureStarxNetworkClient()
    const probe = await pluginFetchHealth()
    const webhookConfigured = isPluginWebhookAuthConfigured(config)
    const adapter = bridgeRuntime.adapter
    const pluginBase = bridgeRuntime.pluginBase
    const apiKeyConfigured = bridgeRuntime.apiKeyConfigured
    const ready =
      (adapter === 'starx' || adapter === 'vla') &&
      apiKeyConfigured &&
      webhookConfigured &&
      probe?.reachable &&
      probe.status >= 200 &&
      probe.status < 300 &&
      !circuitBreakerStatus.isOpen
    jsonOk(res, {
      adapter,
      pluginBase,
      ready,
      plugin: probe,
      circuitBreaker: circuitBreakerStatus,
      counters: {
        total: pluginFetchCounters.total || 0,
        success: pluginFetchCounters.success || 0,
        failed: pluginFetchCounters.failed || 0,
      },
      webhookConfigured,
      apiKeyConfigured,
      apiKeyMask: bridgeRuntime.apiKeyMask,
      credentialSource: bridgeRuntime.credentialSource,
      credentialLocked: bridgeRuntime.credentialLocked,
      credentialError: bridgeRuntime.credentialError || null,
      pollingEnabled: bridgeRuntime.pollingEnabled,
      pollIntervalMs: bridgeRuntime.pollIntervalMs,
      vlaApiKeyConfigured: apiKeyConfigured,
    })
  }))

  const saveBridgeConfig = asyncHandler(async (req, res) => {
    if (!requireSuperAdmin(req, res)) return
    if (String(req.body?.confirmation || '').trim() !== 'CONFIGURE PLUGIN') {
      return res.status(400).json({ ok: false, code: 'confirmation_required', message: '请输入 CONFIGURE PLUGIN 完成二次确认' })
    }
    const reason = String(req.body?.reason || '').trim()
    if (reason.length < 3) return res.status(400).json({ ok: false, code: 'reason_required', message: '请填写至少 3 个字符的变更原因' })

    try {
      bridgeRuntime = updateStoredPluginBridge(getStore(), req.body, config)
    } catch (error) {
      const code = String(error?.code || 'plugin_bridge_config_invalid')
      const status = code === 'plugin_bridge_secret_key_missing' ? 503 : 400
      return res.status(status).json({ ok: false, code, message: String(error?.message || '插件桥接配置无效') })
    }
    reconfigureStarxNetworkClient()
    markKvDirty('dashboard_configs')
    appendAuditLog('plugin_bridge_config_updated', {
      adapter: bridgeRuntime.adapter,
      pluginBase: bridgeRuntime.pluginBase,
      apiKeyChanged: Boolean(String(req.body?.apiKey || '').trim()) || req.body?.clearApiKey === true,
      pollingEnabled: bridgeRuntime.pollingEnabled,
      pollIntervalMs: bridgeRuntime.pollIntervalMs,
      reason,
    }, req)
    scheduleSave()
    return jsonOk(res, {
      config: {
        ...bridgeRuntime,
        webhookConfigured: isPluginWebhookAuthConfigured(config),
      },
    })
  })
  app.post('/api/admin/authx/bridge-config', requireUser, saveBridgeConfig)
  if (typeof app.patch === 'function') {
    app.patch('/api/admin/authx/bridge-config', requireUser, saveBridgeConfig)
  }

  app.post('/api/admin/authx/bridge-test', requireUser, asyncHandler(async (req, res) => {
    if (!requireSuperAdmin(req, res)) return
    const message = String(req.body?.message || 'star-web.top bridge test').trim().slice(0, 256)
    const nonce = crypto.randomUUID()
    const sentAt = new Date().toISOString()
    const health = await pluginFetchHealth()
    const ping = await pluginFetchJson('/v1/admin/bridge/ping', { nonce, message, sentAt })
    const network = await pluginFetchGet('/v1/server/status')
    const pingOk = ping?.status >= 200 && ping?.status < 300 && ping?.json?.nonce === nonce
    const networkOk = network?.status >= 200 && network?.status < 300
    const healthOk = health?.reachable && health.status >= 200 && health.status < 300
    return jsonOk(res, {
      success: Boolean(healthOk && pingOk && networkOk),
      testedAt: new Date().toISOString(),
      health: { reachable: Boolean(health?.reachable), status: Number(health?.status || 0) },
      outboundMessage: { nonce, acknowledged: pingOk, status: Number(ping?.status || 0) },
      activeFetch: {
        status: Number(network?.status || 0),
        ok: networkOk,
        onlinePlayers: Number(network?.json?.onlinePlayers ?? network?.json?.online ?? 0),
        servers: Array.isArray(network?.json?.servers) ? network.json.servers.length : 0,
      },
    })
  }))

  app.get('/api/admin/authx/circuit-breaker', requireUser, adminPluginGetLimiter, (req, res) => {
    if (!requireDevAdmin(req, res)) return
    jsonOk(res, { circuitBreaker: circuitBreakerStatus })
  })

  app.post('/api/admin/authx/circuit-breaker/toggle', requireUser, (req, res) => {
    if (!requireSuperAdmin(req, res)) return
    const open = req.body?.open
    if (typeof open !== 'boolean') {
      return res.status(400).json({ ok: false, code: 'validation_error', message: 'open 必须是布尔值' })
    }
    const expected = open ? 'OPEN CIRCUIT' : 'CLOSE CIRCUIT'
    if (String(req.body?.confirmation || '').trim() !== expected) {
      return res.status(400).json({ ok: false, code: 'confirmation_required', message: `请输入 ${expected} 完成二次确认` })
    }
    const reason = String(req.body?.reason || '').trim()
    if (!reason) {
      return res.status(400).json({ ok: false, code: 'reason_required', message: '必须填写操作原因' })
    }
    circuitBreakerStatus.isOpen = open
    circuitBreakerStatus.failures = 0
    circuitBreakerStatus.halfOpenAfter = open ? Number.MAX_SAFE_INTEGER : 0
    persistCircuitBreaker({ open, reason, actor: req.user })
    return jsonOk(res, { circuitBreaker: circuitBreakerStatus })
  })

  app.get('/api/admin/telemetry/system', requireUser, (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const store = getStore()
    const registeredNodes = listPluginNodes(store)
    const network = publicPluginNetwork(store)
    const servers = network.nodes.flatMap((node) => Array.isArray(node?.snapshot?.servers) ? node.snapshot.servers : [])
    const serversOnline = servers.filter((server) => String(server?.status || '').toLowerCase() === 'online').length
    const issues = network.nodes.flatMap((node) => (Array.isArray(node?.snapshot?.servers) ? node.snapshot.servers : [])
      .filter((server) => String(server?.status || '').toLowerCase() !== 'online')
      .map((server) => ({
        nodeId: String(server?.nodeId || server?.name || 'unknown'),
        name: String(server?.name || server?.nodeId || 'unknown'),
        platform: String(server?.platform || ''),
        status: String(server?.status || 'unknown').toLowerCase(),
        onlinePlayers: Number(server?.onlinePlayers) || 0,
        maxPlayers: Number(server?.maxPlayers) || 0,
        nodeLastSeenAt: node.lastSeenAt || null,
        capabilities: Array.isArray(server?.capabilities) ? server.capabilities : [],
      })))
    const serverStatus = servers.length === 0
      ? 'unreported'
      : serversOnline === servers.length
        ? 'healthy'
        : serversOnline === 0
          ? 'offline'
          : 'degraded'
    const lastSeenAt = registeredNodes
      .map((node) => node.lastSeenAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null
    const telemetryEvents = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []
    jsonOk(res, {
      telemetry: {
        enabled: Boolean(config.telemetryEnabled),
        total: telemetryEvents.length,
        lastReceivedAt: telemetryEvents[0]?.receivedAt || null,
        collectionStatus: !config.telemetryEnabled
          ? 'disabled'
          : telemetryEvents.length > 0
            ? 'collecting'
            : 'not_collected',
      },
      pluginHeartbeat: {
        registered: registeredNodes.length,
        online: network.nodes.length,
        offline: Math.max(0, registeredNodes.length - network.nodes.length),
        onlinePlayers: network.onlinePlayers,
        maxPlayers: network.maxPlayers,
        lastSeenAt,
      },
      network: {
        serversObserved: servers.length,
        serversOnline,
        serverStatus,
        issues,
      },
      pluginCounters: pluginFetchCounters,
    })
  })

  app.get('/api/admin/users', requireUser, adminPluginGetLimiter, (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const store = getStore()
    const query = String(req.query?.search || '').trim().toLowerCase()
    const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query?.pageSize, 10) || 20))
    let users = Array.isArray(store.users) ? store.users : []
    if (query) {
      users = users.filter((user) => [user.id, user.username, user.email, user.linkedMcUsername]
        .some((value) => String(value || '').toLowerCase().includes(query)))
    }
    const total = users.length
    const offset = (page - 1) * pageSize
    const items = users.slice(offset, offset + pageSize).map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      linkedMcUsername: user.linkedMcUsername,
      avatarMinecraftUsername: avatarMinecraftUsername(user),
      banned: user.banned === true || Boolean(user.bannedAt),
      bannedAt: user.bannedAt || null,
      banReason: user.banReason || null,
      bannedBy: user.bannedBy || null,
      createdAt: user.createdAt,
    }))
    jsonOk(res, { items, total, page, pageSize })
  })

  app.get('/api/admin/skins/reports', requireUser, adminPluginGetLimiter, (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const store = getStore()
    jsonOk(res, { items: store.reports || [] })
  })
}
