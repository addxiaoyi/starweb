/**
 * 披风模块 — 披风搜索与装备
 *
 * 披风以资产形式存储在 playerState.assets（键前缀 cape_）中，
 * 与皮肤共享 catalog 存储结构。搜索范围：
 *   1. 公共 catalog 中 type=cape 的条目
 *   2. 用户自有 playerState.assets 中的 cape 资产
 * 装备：将 playerState.applied.capeAssetId / capeCatalogId 更新为目标披风
 */

import { buildOfficialCapeCatalog, fetchOfficialCapeCatalog } from './officialCatalog.js'

function isAuthorizedCatalogCape(item) {
  if (!item || item.public === false || item.published === false) return false
  if (item.reviewStatus === 'pending' || item.reviewStatus === 'rejected') return false
  const source = String(item.source || '').trim().toLowerCase()
  const texture = String(item.capeTextureUrl || item.capeUrl || item.textureUrl || item.url || '').trim()
  if (!texture) return false
  if (source === 'mojang-textures') {
    return /^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i.test(texture)
  }
  if (source === 'open-source-authorized') {
    return Boolean(item.license) && /^https:\/\/github\.com\//i.test(String(item.sourceUrl || ''))
  }
  return false
}

function resolveTargetProfile(user, targetUsername) {
  const requestedName = String(targetUsername || '').trim().toLowerCase()
  const profiles = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
  const linkedName = String(user?.linkedMcUsername || '').trim()
  const linkedUuid = String(user?.linkedMcUuid || '').trim()
  const candidates = [...profiles]
  if (linkedName && !candidates.some((profile) => String(profile?.username || '').trim().toLowerCase() === linkedName.toLowerCase())) {
    candidates.push({ username: linkedName, uuid: linkedUuid })
  }

  const activeUuid = String(user?.activeMinecraftUuid || user?.linkedMcUuid || '').trim()
  const target = requestedName
    ? candidates.find((profile) => String(profile?.username || '').trim().toLowerCase() === requestedName)
    : candidates.find((profile) => String(profile?.uuid || '').trim() === activeUuid) || candidates[0]
  if (!target) return { target: null, code: requestedName ? 'minecraft_profile_not_found' : null }
  return {
    target: {
      username: String(target.username || '').trim(),
      uuid: String(target.uuid || '').trim(),
    },
    code: null,
  }
}

export function registerCapeRoutes(app, deps) {
  const {
    jsonOk,
    jsonErr,
    getStore,
    requireUser,
    asyncHandler,
    scheduleSave,
    ensurePlayerState,
    markPlayerStateDirty,
    triggerVlaSkinRefreshIfConfigured,
    getOfficialCapes,
  } = deps

  const isSubmission = (item) => item?.source === 'submission'
    || Boolean(item?.submissionId)
    || String(item?.id || '').startsWith('sub_')

  const loadOfficialCapes = async () => {
    if (typeof getOfficialCapes === 'function') return getOfficialCapes()
    return fetchOfficialCapeCatalog()
  }

  const publicCapeCatalog = (store, officialCapes) => [
    ...buildOfficialCapeCatalog(store, {
      officialCapes,
      publicApiBase: deps.config?.publicApiBaseUrl || '',
    }),
    ...(store.catalog || [])
      .filter((item) => String(item.type || '').toLowerCase() === 'cape' && isAuthorizedCatalogCape(item))
      .map((item) => ({
        id: item.id,
        name: item.name || '公开披风',
        description: item.description || '',
        author: item.author || '',
        authorId: item.authorId || '',
        cover: item.cover || item.capeTextureUrl || item.capeUrl || item.url || null,
        textureUrl: item.capeTextureUrl || item.capeUrl || item.url || null,
        source: isSubmission(item) ? 'submission' : 'catalog',
        category: 'submissions',
        type: 'cape',
        createdAt: item.createdAt || item.created_at || null,
      })),
  ]

  const filterCapeCatalog = (items, query, category) => items.filter((item) => {
    if ((category === 'official' || category === 'player-sync') && item.category !== 'official') return false
    if (category === 'submissions' && item.category !== 'submissions') return false
    if (!query) return true
    const haystack = [item.name, item.description, item.author, ...(item.holderNames || [])].join(' ').toLowerCase()
    return haystack.includes(query)
  })

  const readCapeCatalog = async (req, store) => {
    const query = String(req.query.q || '').trim().toLowerCase().slice(0, 100)
    const category = ['all', 'official', 'player-sync', 'submissions'].includes(String(req.query.category || 'all'))
      ? String(req.query.category || 'all')
      : 'all'
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 24))
    const items = filterCapeCatalog(publicCapeCatalog(store, await loadOfficialCapes()), query, category)
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize, category }
  }

  app.get('/api/cape/categories', asyncHandler(async (_req, res) => {
    const items = publicCapeCatalog(getStore(), await loadOfficialCapes())
    return jsonOk(res, [
      { id: 'all', name_zh: '全部披风', name_en: 'All Capes', count: items.length },
      { id: 'official', name_zh: '正版披风', name_en: 'Official Capes', count: items.filter((item) => item.category === 'official').length },
      { id: 'submissions', name_zh: '玩家投稿', name_en: 'Player Submissions', count: items.filter((item) => item.category === 'submissions').length },
    ])
  }))

  app.get('/api/cape/catalog', asyncHandler(async (req, res) => {
    return jsonOk(res, await readCapeCatalog(req, getStore()))
  }))

  // ── 搜索披风 ────────────────────────────────────────────
  app.get(
    '/api/cape/search',
    asyncHandler(async (req, res) => {
      const store = getStore()
      const query = String(req.query.q || '').trim().toLowerCase().slice(0, 100)
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))

      // 从 catalog 中筛选 type=cape 的条目
      const catalogCapes = filterCapeCatalog(publicCapeCatalog(store, await loadOfficialCapes()), query, 'all')

      const total = catalogCapes.length
      const start = (page - 1) * pageSize
      const items = catalogCapes.slice(start, start + pageSize)

      jsonOk(res, { items, total, page, pageSize })
    })
  )

  // ── 装备/卸下披风 ──────────────────────────────────────────
  app.post(
    '/api/cape/apply',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const body = req.body || {}
      const action = typeof body.action === 'string' ? body.action.trim() : 'equip'
      const capeId = typeof body.capeId === 'string' ? body.capeId.trim() : body.capeId

      const validActions = ['equip', 'unequip', 'remove']
      if (!validActions.includes(action)) {
        return jsonErr(res, 400, `无效操作，可选: ${validActions.join(', ')}`, 'validation_error')
      }

      const ps = ensurePlayerState(store, req.user.id)
      if (!ps.applied) ps.applied = {}
      const targetResult = resolveTargetProfile(req.user, body.targetUsername)
      if (targetResult.code) {
        return jsonErr(res, 404, '绑定角色不存在', targetResult.code)
      }
      const target = targetResult.target
      if (!ps.appliedByProfile) ps.appliedByProfile = {}
      const applied = target?.uuid
        ? (ps.appliedByProfile[target.uuid] ||= {})
        : ps.applied

      const syncToGame = async () => {
        if (!target?.username) {
          return { targetUsername: null, nextJoin: 'not_linked', onlineRefresh: 'not_linked' }
        }
        const refresh = await Promise.resolve(triggerVlaSkinRefreshIfConfigured?.(target.username))
        const onlineRefresh = String(refresh?.status || 'not_configured')
        ps.gameCapeSync = {
          status: onlineRefresh === 'dispatched' ? 'pending' : onlineRefresh,
          username: target.username,
          requestedAt: new Date().toISOString(),
          lastOnlineRefresh: { status: onlineRefresh, at: new Date().toISOString() },
        }
        return { targetUsername: target.username, nextJoin: 'pending', onlineRefresh }
      }

      const persistSelection = async () => {
        applied.version = Number(applied.version || 0) + 1
        const activeUuid = String(req.user.activeMinecraftUuid || req.user.linkedMcUuid || '')
        if (!target?.uuid || target.uuid === activeUuid) ps.applied = { ...applied }
        const gameSync = await syncToGame()
        markPlayerStateDirty(req.user.id)
        scheduleSave()
        return gameSync
      }

      if (action === 'unequip' || action === 'remove') {
        applied.capeAssetId = null
        applied.capeCatalogId = null
        return jsonOk(res, { ok: true, action: 'unequipped', gameSync: await persistSelection() })
      }

      if (!capeId || typeof capeId !== 'string') {
        return jsonErr(res, 400, '缺少 capeId', 'validation_error')
      }
      if (capeId.length > 100) {
        return jsonErr(res, 400, 'capeId 过长', 'validation_error')
      }

      // Use the same public catalog as the browser so synced player capes are equipable too.
      const catalogItem = publicCapeCatalog(store, await loadOfficialCapes()).find((item) => String(item.id) === String(capeId))

      if (catalogItem) {
        applied.capeCatalogId = String(catalogItem.id)
        applied.capeAssetId = null
        return jsonOk(res, {
          ok: true,
          action: 'equipped',
          source: 'catalog',
          capeId: catalogItem.id,
          gameSync: await persistSelection(),
        })
      }

      // 检查用户自有资产
      const assetKey = `cape_${capeId.replaceAll('-', '_')}`
      const ownedAsset = ps.assets?.[assetKey]
      if (ownedAsset && ownedAsset.status !== 'pending' && ownedAsset.status !== 'rejected') {
        applied.capeAssetId = String(capeId)
        applied.capeCatalogId = null
        return jsonOk(res, {
          ok: true,
          action: 'equipped',
          source: 'owned',
          capeId,
          gameSync: await persistSelection(),
        })
      }

      return jsonErr(res, 404, '未找到该披风', 'cape_not_found')
    })
  )
}
