import {
  buildDefaultSkinProfile,
  buildSessionProfileFromMojangSnapshot,
  fetchMojangSkinSnapshot
} from '../../features/mojangSkin.js'

function catalogItemById(store, id) {
  return (store.catalog || []).find((c) => c && c.id === id) || null
}

function resolvePublicSkinTextures(store, user, deps) {
  const base = deps.config.publicApiBaseUrl
  if (!base) return null
  const ps = deps.ensurePlayerState(store, user.id)
  const sel = ps.activeSelection
  if (sel && sel.catalogId) {
    const item = catalogItemById(store, sel.catalogId)
    if (item && item.skinTextureUrl) {
      const model = item.model === 'slim' ? 'slim' : 'default'
      const skinUrl = String(item.skinTextureUrl).trim()
      const capeRaw = item.capeTextureUrl != null ? String(item.capeTextureUrl).trim() : ''
      return { skinUrl, model, catalogCapeUrl: capeRaw || null }
    }
  }
  const skinId = Number(ps.applied.skinAssetId) || 0
  if (skinId > 0) {
    const asset = ps.assets[`skin_${skinId}`]
    if (asset && asset.path) {
      const rel = String(asset.path).replace(/\\/g, '/')
      const model = asset.model === 'slim' ? 'slim' : 'default'
      return {
        skinUrl: `${base}/uploads/${encodeURI(rel)}`,
        model,
        catalogCapeUrl: null
      }
    }
  }
  const ms = ps.mojangSkin
  if (ms && ms.syncOk && typeof ms.skinUrl === 'string' && ms.skinUrl) {
    const model = ms.model === 'slim' ? 'slim' : 'default'
    const cape = ms.capeUrl != null && String(ms.capeUrl).trim() ? String(ms.capeUrl).trim() : null
    return { skinUrl: String(ms.skinUrl).trim(), model, catalogCapeUrl: cape }
  }
  return null
}

function profileUndashedIdForSkinBridge(user, ps) {
  const m = ps.mojangSkin
  if (m && m.syncOk && m.mcUuidUndashed && /^[0-9a-f]{32}$/i.test(String(m.mcUuidUndashed))) {
    return String(m.mcUuidUndashed).replace(/-/g, '').toLowerCase()
  }
  const link = user.linkedMcUuid != null ? String(user.linkedMcUuid).trim() : ''
  if (link) {
    const s = link.replace(/-/g, '')
    if (/^[0-9a-f]{32}$/i.test(s)) return s.toLowerCase()
  }
  return String(user.uuid || '')
    .replace(/-/g, '')
    .toLowerCase()
}

function buildVlaCompatibleProfileJson(store, user, profileName, deps) {
  const base = deps.config.publicApiBaseUrl
  const tex = resolvePublicSkinTextures(store, user, deps)
  if (!tex || !tex.skinUrl) return null
  const ps = deps.ensurePlayerState(store, user.id)
  let capeUrl = tex.catalogCapeUrl
  if (!capeUrl && base) {
    const capeId = Number(ps.applied.capeAssetId) || 0
    if (capeId > 0) {
      const asset = ps.assets[`cape_${capeId}`]
      if (asset && asset.path) {
        const rel = String(asset.path).replace(/\\/g, '/')
        capeUrl = `${base}/uploads/${encodeURI(rel)}`
      }
    }
  }
  const id = profileUndashedIdForSkinBridge(user, ps)
  if (!id || id.length !== 32) return null
  const textures = { SKIN: { url: tex.skinUrl } }
  if (tex.model === 'slim') {
    textures.SKIN.metadata = { model: 'slim' }
  }
  if (capeUrl) {
    textures.CAPE = { url: capeUrl }
  }
  return { id, name: profileName, textures }
}

async function buildVlaMojangFallbackProfileJson(mcName, config) {
  if (!config.skinBridgeMojangFallback || !config.mojangSkinSyncEnabled) {
    return null
  }
  const r = await fetchMojangSkinSnapshot(mcName)
  if (!r.ok) return null
  return buildSessionProfileFromMojangSnapshot(r.snapshot, mcName)
}

async function buildVlaFallbackProfileJson(mcName, config) {
  const mojangProfile = await buildVlaMojangFallbackProfileJson(mcName, config)
  if (mojangProfile) return mojangProfile
  return buildDefaultSkinProfile(mcName)
}

/**
 * VLA skin.provider=custom 时 `custom-profile-url` 指向此路径（模板含 {username}.json）。
 * 仅解析已绑定 `linkedMcUsername` 的账号（与进服名一致）；站点昵称不会命中。
 * 返回与 SkinBridgeService 兼容的 `textures` 根结构；纹理 URL 依赖 PUBLIC_API_BASE_URL + /uploads。
 */
export function registerPublicSkinProfileRoutes(app, deps) {
  const {
    config,
    jsonErr,
    getStore,
    asyncHandler,
    skinProfilePublicLimiter,
    findUserByLinkedMcUsername,
    ensurePlayerState
  } = deps

  app.get(
    '/api/public/skin-profile/:mcSegment',
    skinProfilePublicLimiter,
    asyncHandler(async (req, res) => {
      if (!config.skinBridgePublicProfile) {
        return jsonErr(res, 404, '公开档案未启用', 'disabled')
      }
      let seg = String(req.params.mcSegment || '').trim()
      if (seg.toLowerCase().endsWith('.json')) seg = seg.slice(0, -5)
      let mcName
      try {
        mcName = decodeURIComponent(seg)
      } catch {
        return jsonErr(res, 400, '无效的角色名', 'bad_request')
      }
      if (!mcName || mcName.length > 64) {
        return jsonErr(res, 400, '无效的角色名', 'bad_request')
      }
      const store = getStore()
      const user = findUserByLinkedMcUsername(store, mcName)
      if (!user) {
        const fallback = await buildVlaFallbackProfileJson(mcName, config)
        if (fallback) {
          res.setHeader('Cache-Control', 'public, max-age=300')
          return res.json(fallback)
        }
        return jsonErr(res, 404, '未找到已绑定该游戏名的账号', 'not_found')
      }
      if (!config.publicApiBaseUrl) {
        return jsonErr(
          res,
          503,
          '请配置 PUBLIC_API_BASE_URL 为代理/会话服可访问的 API 根地址（含协议与端口，无尾斜杠）',
          'misconfigured'
        )
      }
      const canonicalMc = String(user.linkedMcUsername || '').trim()
      const body = buildVlaCompatibleProfileJson(store, user, canonicalMc || mcName, {
        config,
        ensurePlayerState
      })
      if (!body) {
        const fallback = await buildVlaFallbackProfileJson(canonicalMc || mcName, config)
        if (fallback) {
          res.setHeader('Cache-Control', 'public, max-age=300')
          return res.json(fallback)
        }
        return jsonErr(res, 404, '尚未配置皮肤', 'no_skin')
      }
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.json(body)
    })
  )
}
