import fs from 'node:fs/promises'
import path from 'node:path'
import {
  authenticateNodeCredential,
  consumeBootstrapToken,
  createBootstrapToken,
  issueNodeCredential,
  listPluginNodes,
  publicPluginNetwork,
  recordNodeHeartbeat,
  revokePluginNode,
  rotateNodeCredential,
  validateCallbackUrl,
} from './service.js'
import {
  acceptTextureBytes,
  isTextureRequested,
  pluginSkinSyncSummary,
  recordPluginTexture,
  recordSkinManifest,
} from './skinSync.js'
import { isPublicCatalogItem } from '../skin/routes.js'

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || '').trim())
  return match?.[1] || ''
}

function normalizedUuid(value) {
  const uuid = String(value || '').trim().replaceAll('-', '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(uuid) ? uuid : ''
}

function matchingLinkedUser(store, playerUuid, username) {
  const normalizedPlayerUuid = normalizedUuid(playerUuid)
  const normalizedName = String(username || '').trim().toLowerCase()
  if (!normalizedPlayerUuid || !normalizedName) return null

  return (store.users || []).find((user) => {
    const profiles = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
    const hasProfile = profiles.some((profile) =>
      normalizedUuid(profile?.uuid) === normalizedPlayerUuid
      && String(profile?.username || '').trim().toLowerCase() === normalizedName)
    if (hasProfile) return true
    return normalizedUuid(user?.linkedMcUuid) === normalizedPlayerUuid
      && String(user?.linkedMcUsername || '').trim().toLowerCase() === normalizedName
  }) || null
}

function applyCatalogSelection(store, userId, playerUuid, catalogId) {
  if (!store.playerState || typeof store.playerState !== 'object') store.playerState = {}
  const state = store.playerState[userId] || { activeSelection: null, applied: {}, selectionByProfile: {} }
  if (!state.applied || typeof state.applied !== 'object') state.applied = {}
  if (!state.selectionByProfile || typeof state.selectionByProfile !== 'object') state.selectionByProfile = {}
  const at = new Date().toISOString()
  state.selectionByProfile[playerUuid] = { catalogId, at }
  state.applied.version = Number(state.applied.version || 0) + 1
  store.playerState[userId] = state
  return at
}

function isAuthorizedCape(item) {
  if (!item || item.public === false || item.published === false) return false
  if (item.reviewStatus === 'pending' || item.reviewStatus === 'rejected') return false
  const source = String(item.source || '').trim().toLowerCase()
  const texture = String(item.capeTextureUrl || item.capeUrl || item.textureUrl || item.url || '').trim()
  if (source === 'mojang-textures') return /^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i.test(texture)
  return source === 'open-source-authorized'
    && Boolean(item.license)
    && /^https:\/\/github\.com\//i.test(String(item.sourceUrl || ''))
}

export function registerPluginEnrollmentRoutes(app, deps) {
  const {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    markKvDirty,
    appendAuditLog,
    asyncHandler,
    config = {},
    uploadsDir,
  } = deps

  const persist = () => {
    markKvDirty?.('dashboard_configs')
    scheduleSave?.()
  }

  app.get('/api/admin/plugin-nodes', requireUser, requireAdmin, (_req, res) => {
    return jsonOk(res, { nodes: listPluginNodes(getStore()) })
  })

  app.post('/api/admin/plugin-nodes/bootstrap', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const result = createBootstrapToken(getStore(), req.body)
    if (!result.ok) return jsonErr(res, 400, '节点信息无效', result.code)
    persist()
    appendAuditLog?.('plugin_bootstrap_created', { nodeId: req.body?.nodeId, platform: req.body?.platform }, req)
    return jsonOk(res, { bootstrap: result })
  }))

  app.post('/api/admin/plugin-nodes/:nodeId/rotate', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const result = rotateNodeCredential(getStore(), req.params.nodeId)
    if (!result.ok) return jsonErr(res, 404, '插件节点不存在', result.code)
    persist()
    appendAuditLog?.('plugin_credential_rotated', { nodeId: req.params.nodeId }, req)
    return jsonOk(res, { credential: result })
  }))

  app.delete('/api/admin/plugin-nodes/:nodeId', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const result = revokePluginNode(getStore(), req.params.nodeId)
    if (!result.ok) return jsonErr(res, 404, '插件节点不存在', result.code)
    persist()
    appendAuditLog?.('plugin_node_revoked', { nodeId: req.params.nodeId }, req)
    return jsonOk(res, { nodeId: req.params.nodeId })
  }))

  app.post('/api/v1/plugin/enroll', asyncHandler(async (req, res) => {
    const callbackUrl = String(req.body?.callbackUrl || '').trim()
    if (callbackUrl) {
      const callback = validateCallbackUrl(callbackUrl, { allowPrivate: config.pluginEnrollmentAllowPrivate === true })
      if (!callback.ok) return jsonErr(res, 400, '插件回调地址不安全', callback.code)
    }
    const consumed = consumeBootstrapToken(getStore(), req.body?.bootstrapToken, req.body)
    if (!consumed.ok) return jsonErr(res, 401, '插件引导令牌无效或已失效', consumed.code)
    const credential = issueNodeCredential(getStore(), {
      nodeId: consumed.grant.nodeId,
      platform: consumed.grant.platform,
      capabilities: req.body?.capabilities || consumed.grant.capabilities,
      callbackUrl,
    })
    persist()
    appendAuditLog?.('plugin_node_enrolled', { nodeId: credential.nodeId, platform: consumed.grant.platform }, req)
    return jsonOk(res, { credential })
  }))

  app.post('/api/v1/plugin/heartbeat', asyncHandler(async (req, res) => {
    const result = recordNodeHeartbeat(getStore(), bearerToken(req), req.body)
    if (!result.ok) {
      if (result.code === 'credential_invalid' || result.code === 'node_revoked') {
        return jsonErr(res, 401, '插件节点凭据无效', result.code)
      }
      if (result.code === 'node_mismatch') {
        return jsonErr(res, 403, '插件节点凭据与 nodeId 不匹配', result.code)
      }
      return jsonErr(res, 400, '插件心跳数据无效', result.code)
    }
    persist()
    return jsonOk(res, result)
  }))

  app.post('/api/v1/plugin/skins/apply', asyncHandler(async (req, res) => {
    const auth = authenticateNodeCredential(getStore(), bearerToken(req))
    if (!auth.ok) return jsonErr(res, 401, '插件节点凭据无效', auth.code)
    if (!auth.node.capabilities?.includes('skin.refresh')) {
      return jsonErr(res, 403, '插件节点未获皮肤同步权限', 'skin_refresh_not_allowed')
    }

    const catalogId = String(req.body?.catalogId || '').trim()
    const playerUuid = String(req.body?.playerUuid || '').trim()
    const username = String(req.body?.username || '').trim()
    if (!catalogId || !normalizedUuid(playerUuid) || !username) {
      return jsonErr(res, 400, '皮肤编号、玩家 UUID 和玩家名不能为空', 'validation_error')
    }

    const store = getStore()
    const item = (store.catalog || []).find((entry) => String(entry?.id || '') === catalogId)
    if (!item || !isPublicCatalogItem(item)) return jsonErr(res, 404, '皮肤不存在或尚未公开', 'skin_not_found')

    const user = matchingLinkedUser(store, playerUuid, username)
    if (!user) return jsonErr(res, 403, '该游戏角色未绑定到网站账户', 'player_not_linked')

    const at = applyCatalogSelection(store, user.id, playerUuid, catalogId)
    persist()
    appendAuditLog?.('plugin_skin_applied', { nodeId: auth.node.nodeId, catalogId, playerUuid, username }, req)
    return jsonOk(res, {
      catalogId,
      playerUuid,
      username,
      appliedAt: at,
      state: 'pending',
      applied: false,
      message: '网站选择已保存，等待当前游戏服务器确认生效',
    })
  }))

  app.post('/api/v1/plugin/capes/apply', asyncHandler(async (req, res) => {
    const auth = authenticateNodeCredential(getStore(), bearerToken(req))
    if (!auth.ok) return jsonErr(res, 401, '插件节点凭据无效', auth.code)
    if (!auth.node.capabilities?.includes('skin.refresh')) {
      return jsonErr(res, 403, '插件节点未获披风同步权限', 'skin_refresh_not_allowed')
    }
    const catalogId = String(req.body?.catalogId || '').trim()
    const playerUuid = String(req.body?.playerUuid || '').trim()
    const username = String(req.body?.username || '').trim()
    if (!catalogId || !normalizedUuid(playerUuid) || !username) {
      return jsonErr(res, 400, '披风编号、玩家 UUID 和玩家名不能为空', 'validation_error')
    }
    const store = getStore()
    const item = (store.catalog || []).find((entry) => String(entry?.id || '') === catalogId)
    if (!item || String(item.type || '').toLowerCase() !== 'cape' || !isAuthorizedCape(item)) {
      return jsonErr(res, 404, '披风不存在或尚未公开', 'cape_not_found')
    }
    const user = matchingLinkedUser(store, playerUuid, username)
    if (!user) return jsonErr(res, 403, '该游戏角色未绑定到网站账户', 'player_not_linked')
    const state = getStore().playerState?.[user.id] || {}
    state.applied = state.applied && typeof state.applied === 'object' ? state.applied : {}
    state.appliedByProfile = state.appliedByProfile && typeof state.appliedByProfile === 'object' ? state.appliedByProfile : {}
    const applied = state.appliedByProfile[playerUuid] || {}
    applied.capeCatalogId = catalogId
    applied.version = Number(applied.version || 0) + 1
    state.appliedByProfile[playerUuid] = applied
    const activeUuid = String(user.activeMinecraftUuid || user.linkedMcUuid || '').trim()
    if (playerUuid === activeUuid) state.applied = { ...applied }
    if (!store.playerState || typeof store.playerState !== 'object') store.playerState = {}
    store.playerState[user.id] = state
    const appliedAt = new Date().toISOString()
    persist()
    appendAuditLog?.('plugin_cape_applied', { nodeId: auth.node.nodeId, catalogId, playerUuid, username }, req)
    return jsonOk(res, { catalogId, playerUuid, username, appliedAt, state: 'pending', applied: false, message: '网站选择已保存，等待当前游戏服务器确认生效' })
  }))

  app.post('/api/v1/plugin/skins/manifest', asyncHandler(async (req, res) => {
    const auth = authenticateNodeCredential(getStore(), bearerToken(req))
    if (!auth.ok) return jsonErr(res, 401, '插件节点凭据无效', auth.code)
    const result = recordSkinManifest(getStore(), auth.node.nodeId, req.body)
    if (!result.ok) return jsonErr(res, 400, '皮肤清单无效', result.code)
    persist()
    return jsonOk(res, result)
  }))

  app.post('/api/v1/plugin/textures/:hash', asyncHandler(async (req, res) => {
    const auth = authenticateNodeCredential(getStore(), bearerToken(req))
    if (!auth.ok) return jsonErr(res, 401, '插件节点凭据无效', auth.code)
    const encoded = String(req.body?.pngBase64 || '')
    // 512 KiB decoded bytes require at most ceil(512 KiB / 3) * 4 Base64 characters.
    // Reject before decoding so a valid credential cannot force avoidable large allocations.
    if (encoded.length > 699_052) return jsonErr(res, 413, 'PNG 数据超过 512 KiB', 'texture_too_large')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return jsonErr(res, 400, 'PNG 数据无效', 'base64_invalid')
    const bytes = Buffer.from(encoded, 'base64')
    const kind = String(req.body?.kind || '')
    if (!isTextureRequested(getStore(), auth.node.nodeId, req.params.hash, kind)) {
      return jsonErr(res, 409, '该纹理未出现在当前节点清单中', 'texture_not_requested')
    }
    const checked = await acceptTextureBytes(bytes, req.params.hash, kind)
    if (!checked.ok) return jsonErr(res, 400, '纹理文件无效', checked.code)
    if (!uploadsDir) return jsonErr(res, 503, '纹理存储未配置', 'storage_unavailable')
    const directory = path.join(uploadsDir, 'plugin-textures')
    const file = path.join(directory, `${req.params.hash}.png`)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(file, bytes, { flag: 'wx' }).catch((error) => {
      if (error?.code !== 'EEXIST') throw error
    })
    const texture = recordPluginTexture(getStore(), req.params.hash, {
      kind,
      path: `plugin-textures/${req.params.hash}.png`,
      nodeId: auth.node.nodeId,
      width: checked.width,
      height: checked.height,
      bytes: checked.bytes,
      storedAt: new Date().toISOString(),
    })
    persist()
    return jsonOk(res, { texture })
  }))

  app.get('/api/admin/plugin-skins/sync-status', requireUser, requireAdmin, (_req, res) => {
    return jsonOk(res, { nodes: pluginSkinSyncSummary(getStore()) })
  })

  app.get('/api/public/plugin-network', (_req, res) => {
    return jsonOk(res, { network: publicPluginNetwork(getStore()) })
  })
}
