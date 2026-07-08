/**
 * 从 Mojang 公开 HTTP API 拉取 Java 版正版玩家皮肤元数据，供皮肤站落库与 VLA 档案使用。
 *
 * 接口约定见 Minecraft Wiki： https://minecraft.wiki/w/Mojang_API
 * （profiles.minecraft.com / session.minecraftserver.com 若迁移，可在此集中改 URL）
 */
import crypto from 'crypto'
import { config } from '../config.js'

const PROFILE_BY_NAME =
  'https://api.mojang.com/users/profiles/minecraft/'
const SESSION_PROFILE =
  'https://sessionserver.mojang.com/session/minecraft/profile/'

const DEFAULT_STEVE_SKIN_URL =
  'http://textures.minecraft.net/texture/60a5bd016b3c9a1b9272e4929e30827a67be4ebb219017adbbc4a4d22ebd5b1'

function safeProfileName(name) {
  const s = String(name || '').trim()
  if (!s) return 'Player'
  return s.slice(0, 16)
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function defaultSteveSkinUrl() {
  return DEFAULT_STEVE_SKIN_URL
}

export function offlineProfileIdForName(name) {
  const n = safeProfileName(name)
  const b = crypto.createHash('md5').update(`OfflinePlayer:${n}`, 'utf8').digest()
  b[6] = (b[6] & 0x0f) | 0x30
  b[8] = (b[8] & 0x3f) | 0x80
  return b.toString('hex')
}

/**
 * @param {string} undashed 32 位十六进制
 * @returns {string | null}
 */
export function mojangUuidInsertDashes(undashed) {
  const s = String(undashed || '').replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(s)) return null
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/**
 * @param {object} sessionProfile sessionserver JSON（含 properties）
 * @returns {{ skinUrl: string, model: 'default'|'slim', capeUrl: string | null, texturesValue: string, texturesSignature: string } | null}
 */
export function parseTexturesFromSessionProfile(sessionProfile) {
  if (!sessionProfile || typeof sessionProfile !== 'object') return null
  const props = sessionProfile.properties
  if (!Array.isArray(props)) return null
  const tex = props.find((p) => p && p.name === 'textures')
  if (!tex || typeof tex.value !== 'string' || !tex.value) return null
  let decoded
  try {
    const raw = Buffer.from(tex.value, 'base64').toString('utf8')
    decoded = JSON.parse(raw)
  } catch {
    return null
  }
  const textures = decoded && typeof decoded === 'object' ? decoded.textures : null
  if (!textures || typeof textures !== 'object') return null
  const skin = textures.SKIN
  if (!skin || typeof skin.url !== 'string' || !skin.url) return null
  const model =
    skin.metadata && skin.metadata.model === 'slim' ? 'slim' : 'default'
  const cape = textures.CAPE
  const capeUrl =
    cape && typeof cape.url === 'string' && cape.url ? cape.url : null
  const sig =
    typeof tex.signature === 'string' && tex.signature ? tex.signature : ''
  return {
    skinUrl: skin.url,
    model,
    capeUrl,
    texturesValue: tex.value,
    texturesSignature: sig
  }
}

/**
 * @param {object} snapshot fetchMojangSkinSnapshot 返回的 snapshot
 * @param {string} fallbackName 请求时的玩家名
 * @returns {{ id: string, name: string, properties: Array<{ name: string, value: string, signature?: string }> } | null}
 */
export function buildSessionProfileFromMojangSnapshot(snapshot, fallbackName) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const id = String(snapshot.mcUuidUndashed || '').replace(/-/g, '').toLowerCase()
  const value = typeof snapshot.texturesValue === 'string' ? snapshot.texturesValue : ''
  if (!/^[0-9a-f]{32}$/.test(id) || !value) return null
  const name = String(snapshot.canonicalName || fallbackName || '').trim()
  const prop = { name: 'textures', value }
  if (typeof snapshot.texturesSignature === 'string' && snapshot.texturesSignature) {
    prop.signature = snapshot.texturesSignature
  }
  return {
    id,
    name: name || String(fallbackName || ''),
    properties: [prop]
  }
}

/**
 * 给未绑定站内账号、也查不到 Mojang 正版档案的离线名一个稳定默认皮肤。
 *
 * 返回官方 session profile 形状，VLA 可直接提取 properties[].textures；
 * value 内部使用 deterministic offline UUID，避免不同离线玩家共用同一个 profile id。
 *
 * @param {string} fallbackName 请求时的玩家名
 * @returns {{ id: string, name: string, properties: Array<{ name: string, value: string }> } | null}
 */
export function buildDefaultSkinProfile(fallbackName) {
  if (!config.skinBridgeDefaultFallback) return null
  const skinUrl = String(
    config.skinBridgeDefaultSkinUrl || DEFAULT_STEVE_SKIN_URL
  ).trim()
  if (!isHttpUrl(skinUrl)) return null
  const name = safeProfileName(fallbackName)
  const id = offlineProfileIdForName(name)
  const textures = {
    SKIN: { url: skinUrl }
  }
  if (config.skinBridgeDefaultModel === 'slim') {
    textures.SKIN.metadata = { model: 'slim' }
  }
  const payload = {
    timestamp: 0,
    profileId: id,
    profileName: name,
    textures
  }
  return {
    id,
    name,
    properties: [
      {
        name: 'textures',
        value: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
      }
    ]
  }
}

/**
 * @param {string} mcUsername 进服名（与绑定一致）
 * @returns {Promise<{ ok: true, snapshot: object } | { ok: false, error: string, status?: number }>}
 */
export async function fetchMojangSkinSnapshot(mcUsername) {
  if (!config.mojangSkinSyncEnabled) {
    return { ok: false, error: 'disabled' }
  }
  const name = String(mcUsername || '').trim()
  if (!name) {
    return { ok: false, error: 'bad_username' }
  }
  const ua = config.mojangApiUserAgent || 'StarMC-SkinSync/1.0'
  const timeout = config.mojangApiTimeoutMs
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const url1 = PROFILE_BY_NAME + encodeURIComponent(name)
    const r1 = await fetch(url1, {
      headers: { 'User-Agent': ua, Accept: 'application/json' },
      signal: ctrl.signal
    })
    if (r1.status === 204 || r1.status === 404) {
      return { ok: false, error: 'not_found', status: r1.status }
    }
    if (r1.status === 429) {
      return { ok: false, error: 'rate_limited', status: 429 }
    }
    if (!r1.ok) {
      return { ok: false, error: 'profile_lookup_failed', status: r1.status }
    }
    const j1 = await r1.json()
    const idRaw = j1 && j1.id != null ? String(j1.id).replace(/-/g, '') : ''
    const canonical =
      j1 && j1.name != null ? String(j1.name) : name
    if (!/^[0-9a-f]{32}$/i.test(idRaw)) {
      return { ok: false, error: 'bad_profile_response' }
    }
    const url2 = `${SESSION_PROFILE}${idRaw}?unsigned=false`
    const r2 = await fetch(url2, {
      headers: { 'User-Agent': ua, Accept: 'application/json' },
      signal: ctrl.signal
    })
    if (r2.status === 204 || r2.status === 404) {
      return { ok: false, error: 'session_not_found', status: r2.status }
    }
    if (r2.status === 429) {
      return { ok: false, error: 'rate_limited', status: 429 }
    }
    if (!r2.ok) {
      return { ok: false, error: 'session_lookup_failed', status: r2.status }
    }
    const sessionProfile = await r2.json()
    const parsed = parseTexturesFromSessionProfile(sessionProfile)
    if (!parsed) {
      return { ok: false, error: 'no_textures' }
    }
    const dashed = mojangUuidInsertDashes(idRaw)
    return {
      ok: true,
      snapshot: {
        mcUuidUndashed: idRaw.toLowerCase(),
        mcUuidDashed: dashed,
        canonicalName: canonical,
        skinUrl: parsed.skinUrl,
        model: parsed.model,
        capeUrl: parsed.capeUrl,
        texturesValue: parsed.texturesValue,
        texturesSignature: parsed.texturesSignature
      }
    }
  } catch (e) {
    const aborted = e && e.name === 'AbortError'
    return { ok: false, error: aborted ? 'timeout' : 'network_error' }
  } finally {
    clearTimeout(t)
  }
}
