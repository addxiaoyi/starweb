const OFFICIAL_CAPE_ENDPOINT = 'https://api.mineskin.org/v2/capes'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const HASH_PATTERN = /^[a-f0-9]{64}$/i

let cachedOfficialCapes = null
let cachedExpiresAt = 0
let pendingRequest = null

function httpsTextureUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  return value.replace(/^http:\/\//i, 'https://')
}

function textureHashFromUrl(url) {
  const match = /(?:textures\.minecraft\.net\/texture\/|\/texture\/)([a-f0-9]{64})(?:[?#]|$)/i.exec(String(url || '').trim())
  return match ? match[1].toLowerCase() : ''
}

export function normalizeOfficialCape(raw) {
  if (!raw || typeof raw !== 'object') return null
  const sourceUrl = String(raw.url || raw.textureUrl || '').trim()
  const rawHash = String(raw.hash || '').trim().toLowerCase()
  const hash = HASH_PATTERN.test(rawHash) ? rawHash : textureHashFromUrl(sourceUrl)
  const name = String(raw.alias || raw.name || '').trim()
  const url = httpsTextureUrl(sourceUrl || `https://textures.minecraft.net/texture/${hash}`)
  if (!HASH_PATTERN.test(hash) || !name || !url) return null
  return {
    id: String(raw.uuid || '').trim(),
    name,
    hash,
    url,
    support: String(raw.support || '').trim() || null,
    supported: raw.supported !== false,
  }
}

export function createOfficialCapeIndex(rows) {
  const index = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const cape = normalizeOfficialCape(row)
    if (cape) index.set(cape.hash, cape)
  }
  return index
}

export async function fetchOfficialCapeCatalog({ fetchImpl = fetch, now = Date.now } = {}) {
  const currentTime = Number(now())
  if (cachedOfficialCapes && cachedExpiresAt > currentTime) return cachedOfficialCapes
  if (pendingRequest) return pendingRequest

  pendingRequest = (async () => {
    try {
      const response = await fetchImpl(OFFICIAL_CAPE_ENDPOINT, {
        headers: { accept: 'application/json', 'user-agent': 'StarMC-CapeCatalog/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`official cape catalog returned ${response.status}`)
      const payload = await response.json()
      const next = createOfficialCapeIndex(payload?.capes)
      if (next.size > 0) {
        cachedOfficialCapes = next
        cachedExpiresAt = Number(now()) + CACHE_TTL_MS
      }
      return cachedOfficialCapes || new Map()
    } catch {
      return cachedOfficialCapes || new Map()
    } finally {
      pendingRequest = null
    }
  })()

  return pendingRequest
}

function storedTextureUrl(store, hash, publicApiBase) {
  const path = String(store?.dashboardConfigs?.pluginSkinSync?.textures?.[hash]?.path || '')
    .trim()
    .replace(/\\/g, '/')
  if (!path) return ''
  const relative = `/uploads/${path.replace(/^\/+/, '')}`
  const base = String(publicApiBase || '').replace(/\/+$/, '')
  return base ? `${base}${relative}` : relative
}

function archiveEntries(store) {
  const archive = store?.dashboardConfigs?.pluginSkinSync?.playerArchive
  if (!archive || typeof archive !== 'object') return []
  return Object.values(archive).flatMap((node) => (
    node && typeof node === 'object' ? Object.values(node) : []
  ))
}

function addHolder(group, entry) {
  const playerName = String(entry?.playerName || '').trim()
  if (!playerName) return
  const playerUuid = String(entry?.playerUuid || '').trim().toLowerCase()
  const holderKey = playerUuid || playerName.toLowerCase()
  if (group.holderKeys.has(holderKey)) return
  group.holderKeys.add(holderKey)
  group.holderNames.push(playerName)
}

export function buildOfficialCapeCatalog(store, { officialCapes = new Map(), publicApiBase = '' } = {}) {
  const groups = new Map()
  const officialRows = officialCapes instanceof Map ? officialCapes.values() : Object.values(officialCapes || {})

  for (const official of officialRows) {
    const hash = String(official?.hash || '').trim().toLowerCase()
    if (!HASH_PATTERN.test(hash)) continue
    groups.set(hash, { hash, official, holderKeys: new Set(), holderNames: [] })
  }

  for (const entry of archiveEntries(store)) {
    if (entry?.deleted || !entry?.capeHash || !entry?.playerName) continue
    const hash = String(entry.capeHash).trim().toLowerCase()
    if (!HASH_PATTERN.test(hash)) continue
    const group = groups.get(hash)
    if (group) addHolder(group, entry)
  }

  return [...groups.values()]
    .sort((left, right) => String(left.official?.name || left.hash).localeCompare(String(right.official?.name || right.hash)))
    .map(({ hash, official, holderNames }) => {
      const textureUrl = httpsTextureUrl(official?.url) || storedTextureUrl(store, hash, publicApiBase)
      const officialName = String(official?.name || '').trim() || `官方披风 · ${hash.slice(0, 8)}`
      return {
        id: `cape_official_${hash}`,
        name: officialName,
        title: officialName,
        description: holderNames.length > 0
          ? `Mojang 官方披风，当前有 ${holderNames.length} 位玩家已同步`
          : 'Mojang 官方披风',
        author: 'Mojang',
        authorId: official?.id || '',
        cover: textureUrl || null,
        textureUrl: textureUrl || null,
        source: 'official',
        category: 'official',
        type: 'cape',
        createdAt: null,
        capeHash: hash,
        holderNames,
        holderCount: holderNames.length,
        officialSupport: official?.support || null,
      }
    })
}

export function officialCapeHashFromId(id) {
  const match = /^cape_(?:official_|player_[^_]+_)([a-f0-9]{64})$/i.exec(String(id || '').trim())
  return match ? match[1].toLowerCase() : null
}
