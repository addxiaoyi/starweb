import crypto from 'node:crypto'
import sharp from 'sharp'
import { validateTexturePng } from '../texture/validation.js'

const HASH_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const PLAYER_PATTERN = /^[A-Za-z0-9_]{3,16}$/
const SYNC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/
const MAX_MANIFEST_ENTRIES = 1000
const MAX_MANIFEST_PAGES = 100
const MAX_MANIFEST_TOTAL_ENTRIES = 100_000
const PENDING_MANIFEST_TTL_MS = 15 * 60 * 1000
const MAX_TEXTURE_BYTES = 512 * 1024

function pluginNode(store, nodeId) {
  return store?.dashboardConfigs?.pluginEnrollment?.nodes?.find((node) => node.nodeId === nodeId) || null
}

function syncState(store) {
  if (!store.dashboardConfigs.pluginSkinSync || typeof store.dashboardConfigs.pluginSkinSync !== 'object') {
    store.dashboardConfigs.pluginSkinSync = {
      manifests: {},
      pendingManifests: {},
      playerArchive: {},
      textures: store.dashboardConfigs.pluginTextureStore || {},
    }
  }
  const state = store.dashboardConfigs.pluginSkinSync
  if (!state.manifests || typeof state.manifests !== 'object') state.manifests = {}
  if (!state.pendingManifests || typeof state.pendingManifests !== 'object') state.pendingManifests = {}
  if (!state.playerArchive || typeof state.playerArchive !== 'object') state.playerArchive = {}
  if (!state.textures || typeof state.textures !== 'object') state.textures = {}
  return state
}

function normalizeHash(value, required = false) {
  const hash = String(value || '').trim().toLowerCase()
  if (!hash && !required) return null
  return HASH_PATTERN.test(hash) ? hash : undefined
}

function normalizeManifestEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const playerUuid = String(entry.playerUuid || '').trim().toLowerCase()
  const playerName = String(entry.playerName || '').trim()
  const skinHash = normalizeHash(entry.skinHash, entry.deleted !== true)
  const capeHash = normalizeHash(entry.capeHash)
  const model = String(entry.model || 'classic').toLowerCase()
  const source = String(entry.source || '').trim().toLowerCase()
  const updatedAt = new Date(String(entry.updatedAt || ''))
  if (!UUID_PATTERN.test(playerUuid) || !PLAYER_PATTERN.test(playerName)) return null
  if (skinHash === undefined || capeHash === undefined || !['classic', 'slim'].includes(model)) return null
  if (!/^[a-z0-9._-]{1,40}$/.test(source) || !Number.isFinite(updatedAt.getTime())) return null
  return {
    playerUuid,
    playerName,
    skinHash,
    capeHash,
    model,
    source,
    updatedAt: updatedAt.toISOString(),
    deleted: entry.deleted === true,
  }
}

function pagination(payload) {
  const hasMetadata = payload?.syncId !== undefined || payload?.page !== undefined || payload?.pages !== undefined
  if (!hasMetadata) return { ok: true, syncId: null, page: 0, pages: 1 }
  const syncId = String(payload?.syncId || '').trim()
  const page = Number(payload?.page)
  const pages = Number(payload?.pages)
  if (!SYNC_ID_PATTERN.test(syncId)
      || !Number.isInteger(page)
      || !Number.isInteger(pages)
      || pages < 1
      || pages > MAX_MANIFEST_PAGES
      || page < 0
      || page >= pages) {
    return { ok: false, code: 'manifest_page_invalid' }
  }
  return { ok: true, syncId, page, pages }
}

function missingTextures(state, entries) {
  const missing = new Map()
  for (const entry of entries) {
    if (entry.deleted) continue
    if (entry.skinHash && !state.textures[entry.skinHash]) missing.set(entry.skinHash, 'skin')
    if (entry.capeHash && !state.textures[entry.capeHash]) missing.set(entry.capeHash, 'cape')
  }
  return [...missing].map(([hash, kind]) => ({ hash, kind }))
}

function cleanupPendingManifests(state, nowMs) {
  for (const [nodeId, pending] of Object.entries(state.pendingManifests)) {
    const updatedMs = Date.parse(String(pending?.updatedAt || ''))
    if (!Number.isFinite(updatedMs) || nowMs - updatedMs > PENDING_MANIFEST_TTL_MS) {
      delete state.pendingManifests[nodeId]
    }
  }
}

function archiveEntries(state, nodeId, entries, nowIso) {
  const current = state.playerArchive[nodeId]
  const archive = current && typeof current === 'object' ? { ...current } : {}
  for (const entry of entries) {
    if (entry.deleted) {
      delete archive[entry.playerUuid]
      continue
    }
    archive[entry.playerUuid] = {
      ...entry,
      nodeId,
      archivedAt: nowIso,
    }
  }
  if (Object.keys(archive).length > MAX_MANIFEST_TOTAL_ENTRIES) {
    return { ok: false, code: 'skin_archive_too_large' }
  }
  state.playerArchive[nodeId] = archive
  return { ok: true }
}

function completePendingManifest(state, nodeId, pending, nowIso) {
  const entries = []
  const players = new Set()
  for (let page = 0; page < pending.pages; page++) {
    const pageEntries = pending.entriesByPage[String(page)]
    if (!Array.isArray(pageEntries)) return { ok: true, complete: false }
    for (const entry of pageEntries) {
      if (players.has(entry.playerUuid)) {
        delete state.pendingManifests[nodeId]
        return { ok: false, code: 'manifest_duplicate_player' }
      }
      players.add(entry.playerUuid)
      entries.push(entry)
      if (entries.length > MAX_MANIFEST_TOTAL_ENTRIES) {
        delete state.pendingManifests[nodeId]
        return { ok: false, code: 'manifest_total_too_large' }
      }
    }
  }
  const archived = archiveEntries(state, nodeId, entries, nowIso)
  if (!archived.ok) {
    delete state.pendingManifests[nodeId]
    return archived
  }
  state.manifests[nodeId] = { entries, syncedAt: nowIso, syncId: pending.syncId }
  delete state.pendingManifests[nodeId]
  return { ok: true, complete: true }
}

export function recordSkinManifest(store, nodeId, payload) {
  const node = pluginNode(store, nodeId)
  if (!node || node.status !== 'active') return { ok: false, code: 'node_unavailable' }
  if (!Array.isArray(payload?.entries)) return { ok: false, code: 'manifest_invalid' }
  if (payload.entries.length > MAX_MANIFEST_ENTRIES) return { ok: false, code: 'manifest_too_large' }
  const entries = payload.entries.map(normalizeManifestEntry)
  if (entries.some((entry) => entry === null)) return { ok: false, code: 'manifest_invalid' }
  const paging = pagination(payload)
  if (!paging.ok) return paging

  const state = syncState(store)
  const now = new Date()
  const nowIso = now.toISOString()
  cleanupPendingManifests(state, now.getTime())

  if (paging.syncId === null) {
    const archived = archiveEntries(state, nodeId, entries, nowIso)
    if (!archived.ok) return archived
    state.manifests[nodeId] = { entries, syncedAt: nowIso }
    delete state.pendingManifests[nodeId]
    return {
      ok: true,
      accepted: entries.length,
      complete: true,
      missingHashes: missingTextures(state, entries),
    }
  }

  let pending = state.pendingManifests[nodeId]
  if (!pending || pending.syncId !== paging.syncId) {
    pending = {
      syncId: paging.syncId,
      pages: paging.pages,
      entriesByPage: {},
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    state.pendingManifests[nodeId] = pending
  } else if (pending.pages !== paging.pages) {
    return { ok: false, code: 'manifest_page_mismatch' }
  }

  pending.entriesByPage[String(paging.page)] = entries
  pending.updatedAt = nowIso
  const completion = completePendingManifest(state, nodeId, pending, nowIso)
  if (!completion.ok) return completion

  return {
    ok: true,
    accepted: entries.length,
    syncId: paging.syncId,
    page: paging.page,
    pages: paging.pages,
    receivedPages: completion.complete ? paging.pages : Object.keys(pending.entriesByPage).length,
    complete: completion.complete,
    missingHashes: missingTextures(state, entries),
  }
}

export async function acceptTextureBytes(bytes, expectedHash, kind) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_TEXTURE_BYTES) return { ok: false, code: 'texture_too_large' }
  if (!HASH_PATTERN.test(String(expectedHash || '')) || !['skin', 'cape'].includes(kind)) return { ok: false, code: 'texture_invalid' }
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== expectedHash) return { ok: false, code: 'hash_mismatch' }
  const dimensions = await validateTexturePng(bytes, kind)
  if (!dimensions.ok) return { ok: false, code: dimensions.code === 'invalid_dimensions' ? 'dimensions_invalid' : dimensions.code }
  try {
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
    if (metadata.format !== 'png' || metadata.width !== dimensions.width || metadata.height !== dimensions.height) {
      return { ok: false, code: 'invalid_png' }
    }
  } catch {
    return { ok: false, code: 'invalid_png' }
  }
  return { ok: true, width: dimensions.width, height: dimensions.height, bytes: bytes.length }
}

export function isTextureRequested(store, nodeId, hash, kind) {
  const state = store?.dashboardConfigs?.pluginSkinSync
  const finalEntries = state?.manifests?.[nodeId]?.entries
  const pending = state?.pendingManifests?.[nodeId]
  const pendingEntries = pending?.entriesByPage
    ? Object.values(pending.entriesByPage).flatMap((page) => Array.isArray(page) ? page : [])
    : []
  const entries = [
    ...(Array.isArray(finalEntries) ? finalEntries : []),
    ...pendingEntries,
  ]
  return entries.some((entry) => !entry.deleted && (
    (kind === 'skin' && entry.skinHash === hash)
      || (kind === 'cape' && entry.capeHash === hash)
  ))
}

export function recordPluginTexture(store, hash, texture) {
  const state = syncState(store)
  state.textures[hash] = { ...texture, hash }
  return state.textures[hash]
}

export function pluginSkinSyncSummary(store) {
  const state = syncState(store)
  const nodeIds = new Set([...Object.keys(state.manifests), ...Object.keys(state.pendingManifests)])
  return [...nodeIds].sort().map((nodeId) => {
    const manifest = state.manifests[nodeId]
    const pending = state.pendingManifests[nodeId]
    return {
      nodeId,
      syncedAt: manifest?.syncedAt || null,
      entries: Array.isArray(manifest?.entries) ? manifest.entries.length : 0,
      pendingSyncId: pending?.syncId || null,
      receivedPages: pending?.entriesByPage ? Object.keys(pending.entriesByPage).length : 0,
      totalPages: Number.isInteger(pending?.pages) ? pending.pages : 0,
      archivedPlayers: state.playerArchive[nodeId] && typeof state.playerArchive[nodeId] === 'object'
        ? Object.keys(state.playerArchive[nodeId]).length
        : 0,
      availableTextures: Object.keys(state.textures).length,
    }
  })
}
