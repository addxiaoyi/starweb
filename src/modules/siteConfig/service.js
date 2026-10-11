const DEFAULT_CONFIG = {
  serverAddresses: [],
  mapUrl: '',
  statusApiUrl: '',
  reviewEntryEnabled: false,
  skinAiEnabled: false,
  skinAiEndpoint: '',
  skinAiCost: 10,
  skinAiModel: '',
  skinAiProtocol: 'multipart-png',
  sponsors: [],
  acknowledgements: [],
  maps: [],
}

function normalizeRows(value, fields, maxRows = 24) {
  if (!Array.isArray(value) || value.length > maxRows) return null
  const rows = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const row = {}
    const userId = String(entry.userId ?? '').trim()
    if (userId.length > 128) return null
    if (userId) row.userId = userId
    for (const [field, limit] of Object.entries(fields)) {
      const text = String(entry[field] ?? '').trim()
      if (text.length > limit) return null
      if (field === 'qq') {
        if (text && !/^\d{5,12}$/.test(text)) return null
        if (!text) continue
      }
      row[field] = text
    }
    if (!row.name && !row.userId) return null
    rows.push(row)
  }
  return rows
}

function resolveAccountRow(store, row) {
  if (!row.userId) return row
  const user = (store?.users || []).find((candidate) => String(candidate?.id || '') === row.userId)
  if (!user) return row.name ? row : null
  const name = String(user.displayName || user.username || row.name || '').trim()
  if (!name) return row.name ? row : null
  const resolved = { ...row, name }
  if (user.avatar) resolved.avatar = String(user.avatar)
  if (user.bio) resolved.bio = String(user.bio)
  return resolved
}

function publicRows(store, value, fields) {
  return (normalizeRows(value, fields) || [])
    .map((row) => resolveAccountRow(store, row))
    .filter(Boolean)
}

function normalizeMaps(value) {
  if (!Array.isArray(value) || value.length > 12) return null
  const maps = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const id = String(entry.id ?? '').trim()
    const name = String(entry.name ?? '').trim()
    const url = String(entry.url ?? '').trim()
    const apiUrl = String(entry.apiUrl ?? '').trim()
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !name || name.length > 80) return null
    if ((url && !isHttpUrl(url)) || (apiUrl && !isHttpUrl(apiUrl))) return null
    maps.push({ id, name, url, apiUrl })
  }
  return maps
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function normalizeAddresses(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null
  const addresses = value.map((entry) => String(entry || '').trim().toLowerCase())
  if (addresses.some((entry) => !/^[a-z0-9.-]{3,253}(?::\d{1,5})?$/.test(entry))) return null
  return [...new Set(addresses)]
}

export function publicSiteConfig(store) {
  const source = store?.dashboardConfigs?.site || {}
  return {
    serverAddresses: Array.isArray(source.serverAddresses) ? source.serverAddresses : DEFAULT_CONFIG.serverAddresses,
    mapUrl: typeof source.mapUrl === 'string' ? source.mapUrl : DEFAULT_CONFIG.mapUrl,
    statusApiUrl: typeof source.statusApiUrl === 'string' ? source.statusApiUrl : DEFAULT_CONFIG.statusApiUrl,
    reviewEntryEnabled: source.reviewEntryEnabled === true,
    skinAiEnabled: source.skinAiEnabled === true,
    skinAiEndpoint: typeof source.skinAiEndpoint === 'string' ? source.skinAiEndpoint : DEFAULT_CONFIG.skinAiEndpoint,
    skinAiCost: Number.isFinite(source.skinAiCost) ? source.skinAiCost : DEFAULT_CONFIG.skinAiCost,
    skinAiModel: typeof source.skinAiModel === 'string' ? source.skinAiModel : DEFAULT_CONFIG.skinAiModel,
    skinAiProtocol: ['multipart-png', 'openai-compatible', 'gemini-native', 'grok-native'].includes(source.skinAiProtocol) ? source.skinAiProtocol : DEFAULT_CONFIG.skinAiProtocol,
    sponsors: publicRows(store, source.sponsors, { name: 80, amount: 80, message: 300, qq: 12 }),
    acknowledgements: publicRows(store, source.acknowledgements, { name: 80, role: 120, qq: 12 }),
    maps: normalizeMaps(source.maps) || [],
  }
}

export function applySiteConfigPatch(store, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, code: 'invalid_patch' }
  const entries = Object.entries(patch)
  for (const [key, value] of entries) {
    if (!(key in DEFAULT_CONFIG)) return { ok: false, code: 'unknown_key', key }
    if (key === 'serverAddresses' && !normalizeAddresses(value)) return { ok: false, code: 'invalid_value', key }
    if ((key === 'mapUrl' || key === 'statusApiUrl' || key === 'skinAiEndpoint') && typeof value !== 'string' && value !== '') {
      return { ok: false, code: 'invalid_value', key }
    }
    if ((key === 'mapUrl' || key === 'statusApiUrl' || key === 'skinAiEndpoint') && value && !isHttpUrl(value)) return { ok: false, code: 'invalid_value', key }
    if ((key === 'reviewEntryEnabled' || key === 'skinAiEnabled') && typeof value !== 'boolean') return { ok: false, code: 'invalid_value', key }
    if (key === 'skinAiCost' && (!Number.isFinite(value) || value < 1 || value > 1000)) return { ok: false, code: 'invalid_value', key }
    if (key === 'skinAiModel' && (typeof value !== 'string' || value.length > 120)) return { ok: false, code: 'invalid_value', key }
    if (key === 'skinAiProtocol' && !['multipart-png', 'openai-compatible', 'gemini-native', 'grok-native'].includes(value)) return { ok: false, code: 'invalid_value', key }
    if (key === 'sponsors' && !normalizeRows(value, { name: 80, amount: 80, message: 300, qq: 12 })) return { ok: false, code: 'invalid_value', key }
    if (key === 'acknowledgements' && !normalizeRows(value, { name: 80, role: 120, qq: 12 })) return { ok: false, code: 'invalid_value', key }
    if (key === 'maps' && !normalizeMaps(value)) return { ok: false, code: 'invalid_value', key }
  }

  if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') store.dashboardConfigs = {}
  const current = publicSiteConfig(store)
  const next = { ...current }
  for (const [key, value] of entries) {
    if (key === 'serverAddresses') next[key] = normalizeAddresses(value)
    else if (key === 'sponsors') next[key] = normalizeRows(value, { name: 80, amount: 80, message: 300, qq: 12 })
    else if (key === 'acknowledgements') next[key] = normalizeRows(value, { name: 80, role: 120, qq: 12 })
    else if (key === 'maps') next[key] = normalizeMaps(value)
    else next[key] = value
  }
  store.dashboardConfigs.site = next
  return { ok: true, config: publicSiteConfig(store) }
}
