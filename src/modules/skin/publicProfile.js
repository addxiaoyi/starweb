import { officialCapeHashFromId } from '../cape/officialCatalog.js'

const MINE_SKIN_ENDPOINT = 'https://api.mineskin.org/v2/skins'
const mineSkinCache = new Map()

function mineSkinApiKey() {
  return String(process.env.MINESKIN_API_KEY || '').trim()
}

async function convertSkinUrlToProperty(textureUrl, model) {
  const key = `${textureUrl}|${model}`
  const cached = mineSkinCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.property

  const apiKey = mineSkinApiKey()
  if (!apiKey) return null
  const request = (body, headers = {}) => fetch(MINE_SKIN_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, ...headers },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  let response = await request(JSON.stringify({ url: textureUrl, variant: model === 'slim' ? 'slim' : 'classic' }), { 'content-type': 'application/json' })
  if (!response.ok) {
    const imageResponse = await fetch(textureUrl, { signal: AbortSignal.timeout(15_000) })
    if (!imageResponse.ok) throw new Error(`texture fetch returned ${imageResponse.status}`)
    const form = new FormData()
    form.append('file', new Blob([await imageResponse.arrayBuffer()], { type: 'image/png' }), 'skin.png')
    form.append('variant', model === 'slim' ? 'slim' : 'classic')
    response = await request(form)
  }
  if (!response.ok) throw new Error(`MineSkin returned ${response.status}`)
  const payload = await response.json()
  const value = String(payload?.skin?.texture?.value || payload?.texture?.value || '').trim()
  const signature = String(payload?.skin?.texture?.signature || payload?.texture?.signature || '').trim()
  if (!value || !signature) throw new Error('MineSkin response did not include a signed texture')
  const property = { value, signature }
  mineSkinCache.set(key, { property, expiresAt: Date.now() + 10 * 60 * 1000 })
  return property
}

export async function attachSignedSkinTexture(profile) {
  const textureUrl = String(profile?.textureUrl || '').trim()
  if (!textureUrl || profile?.textures?.SKIN?.value) return profile
  try {
    const property = await convertSkinUrlToProperty(textureUrl, profile.model)
    if (!property) return { ...profile, textureError: 'skin_signature_not_configured' }
    return {
      ...profile,
      textureError: null,
      skinValue: property.value,
      skinSignature: property.signature,
      textures: {
        ...profile.textures,
        SKIN: { ...profile.textures.SKIN, value: property.value, signature: property.signature },
      },
    }
  } catch (error) {
    return { ...profile, textureError: 'skin_signature_generation_failed' }
  }
}

/**
 * 公开皮肤档案解析（VLA skin.custom-profile-url 与前端预览共用）。
 * 判定顺序与 resolveSkinStationPreview 一致，支持可选绝对 URL 前缀。
 */
function minecraftProfileFor(user, mcUsername, mcUuid = '') {
  const wantedUuid = String(mcUuid || '').trim().replaceAll('-', '').toLowerCase()
  const profiles = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
  if (wantedUuid) {
    return profiles.find((profile) => String(profile?.uuid || '').trim().replaceAll('-', '').toLowerCase() === wantedUuid) || null
  }
  const name = String(mcUsername || '').trim().toLowerCase()
  return profiles.find((profile) => String(profile?.username || '').trim().toLowerCase() === name) || null
}

export function resolvePublicSkinTextures(store, user, deps, mcUsername = '', mcUuid = '') {
  const { ensurePlayerState, catalogItemById } = deps
  const ps = ensurePlayerState(store, user.id)
  const profile = minecraftProfileFor(user, mcUsername, mcUuid)
  const profileId = String(profile?.uuid || '').trim()
  const applied = (profileId && (ps.appliedByProfile?.[profileId] || ps.appliedByProfile?.[profileId.replaceAll('-', '')])) || ps.applied || {}
  const sel = (profileId && (ps.selectionByProfile?.[profileId] || ps.selectionByProfile?.[profileId.replaceAll('-', '')])) || ps.activeSelection

  const resolveOwnedAssetUrl = (kind, rawId) => {
    const id = String(rawId || '').trim()
    if (!id) return undefined
    const key = `${kind}_${id.replaceAll('-', '_')}`
    const asset = ps.assets?.[key] || ps.assets?.[`${kind}_${id}`]
    const assetPath = asset?.localPath || asset?.path
    if (!asset || asset.status === 'pending' || asset.status === 'rejected' || !assetPath) return undefined
    return `/uploads/${encodeURI(String(assetPath).replace(/\\/g, '/'))}`
  }

  const resolveCapeUrl = () => {
    const catalogId = String(applied.capeCatalogId || '').trim()
    if (catalogId) {
      const item = catalogItemById(store, catalogId)
      const catalogCape = item?.capeTextureUrl ?? item?.capeUrl ?? item?.cover
      if (catalogCape && String(catalogCape).trim()) return String(catalogCape).trim()
      const pluginCape = pluginCapeById(store, catalogId)
      const pluginCapeUrl = pluginCape
        ? pluginTextureUrl(store, pluginCape.capeHash, deps.publicApiBase || deps.config?.publicApiBase || '')
        : null
      if (pluginCapeUrl) return pluginCapeUrl
      const officialHash = officialCapeHashFromId(catalogId)
      if (officialHash) return `https://textures.minecraft.net/texture/${officialHash}`
    }
    return resolveOwnedAssetUrl('cape', applied.capeAssetId)
  }

  const selectedCapeUrl = resolveCapeUrl()
  if (sel && sel.catalogId) {
    const item = catalogItemById(store, sel.catalogId)
    if (item) {
      const skinRaw =
        item.skinTextureUrl != null
          ? String(item.skinTextureUrl).trim()
          : item.textureUrl != null
            ? String(item.textureUrl).trim()
          : item.cover != null
            ? String(item.cover).trim()
            : item.previewUrl != null
              ? String(item.previewUrl).trim()
              : item.downloadUrl != null
                ? String(item.downloadUrl).trim()
                : ''
      if (skinRaw) {
        const model = item.model === 'slim' ? 'slim' : 'default'
        const capeRaw =
          item.capeTextureUrl != null
            ? String(item.capeTextureUrl).trim()
            : item.capeUrl != null
              ? String(item.capeUrl).trim()
              : ''
        return {
          skinUrl: skinRaw,
          capeUrl: selectedCapeUrl || capeRaw || undefined,
          model,
        }
      }
    }
  }

  const skinId = String(applied.skinAssetId || '').trim()
  if (skinId) {
    const skinKey = `skin_${skinId.replaceAll('-', '_')}`
    const asset = ps.assets?.[skinKey] || ps.assets?.[`skin_${skinId}`]
    const skinUrl = resolveOwnedAssetUrl('skin', skinId)
    if (asset && skinUrl) {
      const model = asset.model === 'slim' ? 'slim' : 'default'
      return { skinUrl, capeUrl: selectedCapeUrl, model }
    }
  }

  const ms = ps.mojangSkin
  if (ms?.syncOk && typeof ms.skinUrl === 'string' && ms.skinUrl) {
    const model = ms.model === 'slim' ? 'slim' : 'default'
    const cape =
      ms.capeUrl != null && String(ms.capeUrl).trim() ? String(ms.capeUrl).trim() : undefined
    return { skinUrl: String(ms.skinUrl).trim(), capeUrl: selectedCapeUrl || cape, model }
  }

  // A cape can be selected before the account has a cached website skin.
  // Velocity merges this CAPE into the player's existing GameProfile skin.
  if (selectedCapeUrl) {
    return { skinUrl: null, capeUrl: selectedCapeUrl, model: 'default' }
  }

  return null
}

function toAbsoluteUrl(url, publicApiBase) {
  const raw = String(url || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  const base = String(publicApiBase || '').replace(/\/+$/, '')
  return base ? `${base}${raw.startsWith('/') ? raw : `/${raw}`}` : raw
}

function starxProfileId(user, mcUsername, mcUuid = '') {
  const profile = minecraftProfileFor(user, mcUsername, mcUuid)
  return String(profile?.uuid || user.uuid || user.linkedMcUuid || user.linkedMcUsername || mcUsername || user.id || '').trim()
}

function textureMap(textureUrl, capeUrl, model) {
  const textures = {}
  if (textureUrl) {
    textures.SKIN = { url: textureUrl }
    if (model === 'slim') textures.SKIN.metadata = { model: 'slim' }
  }
  if (capeUrl) textures.CAPE = { url: capeUrl }
  return textures
}

function pluginArchiveEntries(store) {
  const archive = store?.dashboardConfigs?.pluginSkinSync?.playerArchive
  if (!archive || typeof archive !== 'object') return []
  return Object.values(archive).flatMap((node) => node && typeof node === 'object' ? Object.values(node) : [])
}

function pluginTextureUrl(store, hash, publicApiBase) {
  const texture = store?.dashboardConfigs?.pluginSkinSync?.textures?.[hash]
  const texturePath = String(texture?.path || '').trim().replace(/\\/g, '/')
  if (!texturePath) return null
  return toAbsoluteUrl(`/uploads/${texturePath.replace(/^\/+/, '')}`, publicApiBase)
}

function pluginCapeById(store, id) {
  const match = /^cape_(?:player_([^_]+)_|official_)([a-f0-9]{64})$/i.exec(String(id || ''))
  if (!match) return null
  const compactUuid = String(match[1] || '').toLowerCase()
  if (!compactUuid) {
    return pluginArchiveEntries(store).find((entry) => (
      String(entry?.capeHash || '').toLowerCase() === match[2].toLowerCase()
    )) || null
  }
  const playerUuid = compactUuid.length === 32
    ? compactUuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
    : compactUuid
  return pluginArchiveEntries(store).find((entry) => (
    String(entry?.playerUuid || '').toLowerCase() === playerUuid
    && String(entry?.capeHash || '').toLowerCase() === match[2].toLowerCase()
  )) || null
}

const DEFAULT_SKIN_SOURCES = new Set(['', 'default', 'builtin', 'steve', 'alex', 'classic'])

function isEligiblePluginSkin(entry) {
  const source = String(entry?.source || '').trim().toLowerCase()
  const playerName = String(entry?.playerName || '').trim().toLowerCase()
  return !DEFAULT_SKIN_SOURCES.has(source)
    && !['steve', 'alex', 'default'].includes(playerName)
}

export function buildPluginSyncedSkinProfile(store, mcUsername, deps = {}) {
  const requestedName = String(mcUsername || '').trim()
  const lowerName = requestedName.toLowerCase()
  const candidates = pluginArchiveEntries(store)
    .filter((entry) => !entry?.deleted && String(entry?.playerName || '').trim().toLowerCase() === lowerName)
    .sort((left, right) => Date.parse(String(right?.updatedAt || right?.archivedAt || ''))
      - Date.parse(String(left?.updatedAt || left?.archivedAt || '')))
  const entry = candidates[0]
  if (!entry?.skinHash) return null
  const base = deps.publicApiBase || deps.config?.publicApiBase || ''
  const textureUrl = pluginTextureUrl(store, entry.skinHash, base)
  if (!textureUrl) return null
  const capeUrl = entry.capeHash ? pluginTextureUrl(store, entry.capeHash, base) : null
  const model = entry.model === 'slim' ? 'slim' : 'default'
  return {
    ok: true,
    id: String(entry.playerUuid || ''),
    name: requestedName,
    username: requestedName,
    linkedUserId: null,
    source: 'plugin-archive',
    textureUrl,
    capeUrl: capeUrl || undefined,
    model,
    textures: textureMap(textureUrl, capeUrl, model),
  }
}

export function listPluginSyncedSkinCatalog(store, deps = {}) {
  const base = deps.publicApiBase || deps.config?.publicApiBase || ''
  return pluginArchiveEntries(store).flatMap((entry) => {
    if (entry?.deleted || !entry?.skinHash || !entry?.playerName || !isEligiblePluginSkin(entry)) return []
    const textureUrl = pluginTextureUrl(store, entry.skinHash, base)
    if (!textureUrl) return []
    return [{
      id: `player_${String(entry.playerUuid || entry.playerName).replaceAll('-', '')}`,
      name: String(entry.playerName),
      creator: String(entry.playerName),
      author: String(entry.playerName),
      authorId: String(entry.playerUuid || ''),
      type: entry.model === 'slim' ? 'alex' : 'steve',
      description: '来自服务器插件同步的玩家皮肤',
      textureUrl,
      createdAt: entry.updatedAt || entry.archivedAt || null,
      source: 'plugin-archive',
    }]
  })
}

export function buildPublicSkinProfile(store, mcUsername, user, deps = {}, mcUuid = '') {
  const textures = resolvePublicSkinTextures(store, user, deps, mcUsername, mcUuid)
  const base = deps.publicApiBase || deps.config?.publicApiBase || ''
  if (!textures) {
    return {
      ok: true,
      id: starxProfileId(user, mcUsername, mcUuid),
      name: mcUsername,
      username: mcUsername,
      linkedUserId: user.id,
      textureUrl: null,
      textures: {},
    }
  }
  const textureUrl = toAbsoluteUrl(textures.skinUrl, base)
  const capeUrl = textures.capeUrl ? toAbsoluteUrl(textures.capeUrl, base) : undefined
  return {
    ok: true,
    id: starxProfileId(user, mcUsername, mcUuid),
    name: mcUsername,
    username: mcUsername,
    linkedUserId: user.id,
    textureUrl,
    capeUrl,
    model: textures.model,
    textures: textureMap(textureUrl, capeUrl, textures.model),
  }
}
