import {
  decryptPluginBridgeApiKey,
  encryptPluginBridgeApiKey,
  isPluginBridgeSecretKeyReady,
  maskPluginApiKey,
} from './pluginBridgeSecret.js'

const ADAPTERS = new Set(['starx', 'vla'])
const MIN_POLL_MS = 5_000
const MAX_POLL_MS = 300_000

function environmentApiKey(adapter, env = process.env) {
  const value = adapter === 'starx' ? env.STARX_NETWORK_API_KEY : env.AUTHX_VLA_API_KEY
  return String(value ?? '').trim()
}

export function normalizePluginBridgeBase(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) throw Object.assign(new Error('插件地址不能为空且不能超过 2048 个字符'), { code: 'invalid_plugin_base' })
  let url
  try {
    url = new URL(raw)
  } catch {
    throw Object.assign(new Error('插件地址必须是有效的 HTTP(S) URL'), { code: 'invalid_plugin_base' })
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error('插件地址必须是不含凭据、查询或片段的 HTTP(S) URL'), { code: 'invalid_plugin_base' })
  }
  let normalized = url.toString()
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized
}

export function normalizePluginBridgePollInterval(value, fallback = 15_000) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < MIN_POLL_MS || number > MAX_POLL_MS) {
    const safeFallback = Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Number(fallback) || 15_000))
    if (value === undefined || value === null || value === '') return safeFallback
    throw Object.assign(new Error('主动轮询间隔必须在 5 秒到 5 分钟之间'), { code: 'invalid_poll_interval' })
  }
  return number
}

export function applyStoredPluginBridge(store, config, options = {}) {
  const stored = store?.dashboardConfigs?.pluginBridge
  if (!stored || typeof stored !== 'object') {
    return {
      configured: Boolean(config.starxNetworkApiBase || config.authxPluginBase),
      adapter: config.starxNetworkApiBase ? 'starx' : config.authxPluginAdapter,
      pluginBase: config.starxNetworkApiBase || config.authxPluginBase || '',
      apiKeyConfigured: Boolean(config.starxNetworkApiKey || config.authxVlaApiKey),
      apiKeyMask: maskPluginApiKey(config.starxNetworkApiKey || config.authxVlaApiKey),
      credentialSource: config.starxNetworkApiKey || config.authxVlaApiKey ? 'environment' : 'none',
      credentialLocked: false,
      pollingEnabled: config.pluginBridgePollingEnabled !== false,
      pollIntervalMs: normalizePluginBridgePollInterval(config.pluginBridgePollIntervalMs),
    }
  }

  const adapter = ADAPTERS.has(stored.adapter) ? stored.adapter : 'starx'
  const pluginBase = normalizePluginBridgeBase(stored.pluginBase)
  const pollingEnabled = stored.pollingEnabled !== false
  const pollIntervalMs = normalizePluginBridgePollInterval(stored.pollIntervalMs, config.pluginBridgePollIntervalMs)
  let apiKey = environmentApiKey(adapter, options.env)
  let credentialSource = apiKey ? 'environment' : 'none'
  let credentialLocked = false
  let credentialError = null

  if (stored.apiKeyEncrypted) {
    try {
      apiKey = decryptPluginBridgeApiKey(stored.apiKeyEncrypted, config.pluginBridgeSecretKey)
      credentialSource = 'encrypted_store'
    } catch (error) {
      apiKey = ''
      credentialSource = 'locked'
      credentialLocked = true
      credentialError = String(error?.code || 'plugin_bridge_secret_invalid')
    }
  }

  config.authxPluginAdapter = adapter
  config.authxPluginBase = pluginBase
  config.pluginBridgePollingEnabled = pollingEnabled
  config.pluginBridgePollIntervalMs = pollIntervalMs
  if (adapter === 'starx') {
    config.starxNetworkApiBase = pluginBase
    config.starxNetworkApiKey = apiKey
  } else {
    config.starxNetworkApiBase = ''
    config.starxNetworkApiKey = ''
    config.authxVlaApiKey = apiKey
  }

  return {
    configured: true,
    adapter,
    pluginBase,
    apiKeyConfigured: Boolean(apiKey),
    apiKeyMask: stored.apiKeyMask || maskPluginApiKey(apiKey),
    credentialSource,
    credentialLocked,
    credentialError,
    pollingEnabled,
    pollIntervalMs,
  }
}

export function updateStoredPluginBridge(store, input, config, options = {}) {
  const adapter = String(input?.adapter || 'starx').trim().toLowerCase()
  if (!ADAPTERS.has(adapter)) throw Object.assign(new Error('仅支持 StarX 或 VLA 适配器'), { code: 'invalid_adapter' })
  const pluginBase = normalizePluginBridgeBase(input?.pluginBase)
  const pollingEnabled = input?.pollingEnabled !== false
  const pollIntervalMs = normalizePluginBridgePollInterval(input?.pollIntervalMs, config.pluginBridgePollIntervalMs)
  const current = store?.dashboardConfigs?.pluginBridge
  const next = {
    adapter,
    pluginBase,
    pollingEnabled,
    pollIntervalMs,
    updatedAt: new Date().toISOString(),
  }

  if (current?.apiKeyEncrypted && input?.clearApiKey !== true && !String(input?.apiKey || '').trim()) {
    next.apiKeyEncrypted = current.apiKeyEncrypted
    next.apiKeyMask = current.apiKeyMask || null
  }

  const apiKey = String(input?.apiKey || '').trim()
  if (apiKey) {
    if (!isPluginBridgeSecretKeyReady(config.pluginBridgeSecretKey)) {
      throw Object.assign(new Error('服务器未配置可用于加密插件 API Key 的 PLUGIN_BRIDGE_SECRET_KEY'), { code: 'plugin_bridge_secret_key_missing' })
    }
    next.apiKeyEncrypted = encryptPluginBridgeApiKey(apiKey, config.pluginBridgeSecretKey, options)
    next.apiKeyMask = maskPluginApiKey(apiKey)
  }

  if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') store.dashboardConfigs = {}
  store.dashboardConfigs.pluginBridge = next
  return applyStoredPluginBridge(store, config, options)
}
