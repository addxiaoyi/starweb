import crypto from 'node:crypto'
import { performSubmissionReview, performBatchSubmissionReview, summarizeSubmissionStats, appendReviewAuditLog, BATCH_REVIEW_MAX_ITEMS } from './service.js'
import { resolvePaginationQuery } from '../../utils/response.js'
import { attachSignedSkinTexture, buildPluginSyncedSkinProfile, buildPublicSkinProfile } from './publicProfile.js'
import {
  attachSkinLibrarySseClient,
  broadcastCatalogSync,
  bumpCatalogLibraryVersion,
  detachSkinLibrarySseClient,
} from './catalogSync.js'
import { chooseFeaturedSkins } from './featuredSelection.js'
import { hasVerifiedSkinName, resolvePublicSkinName } from './displayName.js'
import { countAiNamingCandidates, runCatalogAiNamingJob } from './catalogAiNaming.js'
import { publicSiteConfig } from '../siteConfig/service.js'
import { buildSkinNamingRequest, readProviderText } from '../texture/aiProvider.js'

const AI_NAMING_BATCH_MAX = 500
const AI_NAMING_IMAGE_MAX_BYTES = 2 * 1024 * 1024
let activeAiNamingJob = null

async function readCatalogTexture(item, runtimeConfig) {
  const source = String(item.textureUrl || item.downloadUrl || item.previewUrl || item.thumbnailUrl || '').trim()
  if (!source) throw new Error('catalog texture is missing')
  const origin = new URL(runtimeConfig.publicApiBaseUrl || 'http://127.0.0.1:8787').origin
  const url = new URL(source, origin)
  if (url.origin !== origin) throw new Error('external catalog textures cannot be sent to AI')
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`catalog texture returned ${response.status}`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > AI_NAMING_IMAGE_MAX_BYTES) throw new Error('catalog texture is too large')
  const image = Buffer.from(await response.arrayBuffer())
  if (image.length === 0 || image.length > AI_NAMING_IMAGE_MAX_BYTES) throw new Error('catalog texture size is invalid')
  return image
}

async function recognizeCatalogSkin(item, siteConfig, runtimeConfig) {
  const image = await readCatalogTexture(item, runtimeConfig)
  const request = buildSkinNamingRequest({ config: siteConfig, image })
  if (!request.url) throw new Error('AI naming endpoint is not configured')
  const response = await fetch(request.url, {
    method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`AI naming request returned ${response.status}`)
  return readProviderText(response, siteConfig.skinAiProtocol)
}

function ensureCatalog(store) {
  if (!Array.isArray(store.catalog)) store.catalog = []
  return store.catalog
}

const GENERATED_CATALOG_LABEL = /^[A-Z][A-Za-z]{2,}_\d{1,3}$/
const FUTURE_CATALOG_TOLERANCE_MS = 24 * 60 * 60 * 1000

export function isPublicCatalogItem(item, now = new Date()) {
  if (item?.public === false || item?.published === false || item?.visibility === 'private-unverified-source') return false
  if (item?.source === 'unverified-legacy-import') return false
  const source = String(item?.source || '').trim().toLowerCase()
  const name = String(item?.name || '').trim()
  const texture = String(item?.textureUrl || item?.previewUrl || item?.thumbnailUrl || item?.downloadUrl || '').trim()
  if (!name || !texture || GENERATED_CATALOG_LABEL.test(name)) return false
  if (item?.reviewStatus === 'pending' || item?.reviewStatus === 'rejected') return false
  if (source === 'mojang-textures') {
    if (!/^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i.test(texture)) return false
  } else if (source === 'open-source-authorized') {
    if (item?.reviewStatus !== 'approved' || !item?.license || !/^https:\/\/github\.com\//i.test(String(item.sourceUrl || ''))) return false
  } else {
    return false
  }
  const createdAt = String(item?.createdAt || item?.created_at || '').trim()
  if (!createdAt) return true
  const timestamp = new Date(createdAt).getTime()
  return Number.isFinite(timestamp) && timestamp <= now.getTime() + FUTURE_CATALOG_TOLERANCE_MS
}

function publicCatalog(store, deps = {}) {
  return ensureCatalog(store).filter((item) => isPublicCatalogItem(item))
}

export function isPlayerSubmission(item) {
  return item?.source === 'submission'
    || Boolean(item?.submissionId)
    || String(item?.id || '').startsWith('sub_')
}

function parseCatalogTags(raw) {
  return String(raw || '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag && tag !== 'all')
}

function matchesCatalogTag(item, tag, store) {
  if (tag === 'player-sync') return item?.source === 'plugin-archive'
  if (tag === 'community') return isPlayerSubmission(item)
  if (tag === 'popular') return actualFavoriteCount(store, item.id) > 0
  if (tag === 'steve' || tag === 'alex') return String(item.type || '').toLowerCase() === tag
  return false
}

function actualFavoriteCount(store, skinId) {
  if (!store.favorites || typeof store.favorites !== 'object') return 0
  return Object.values(store.favorites).reduce((count, ids) => (
    Array.isArray(ids) && ids.includes(skinId) ? count + 1 : count
  ), 0)
}

function skinMetrics(store, skinId) {
  const metrics = store.skinMetrics?.[skinId]
  return { views: Number(metrics?.views || 0), downloads: Number(metrics?.downloads || 0) }
}

function normalizeSkin(item, store) {
  const metrics = skinMetrics(store, item.id)
  return {
    id: item.id,
    name: resolvePublicSkinName(item),
    nameVerified: hasVerifiedSkinName(item),
    nameSource: item.nameSource === 'ai' ? 'ai' : hasVerifiedSkinName(item) ? 'player_or_review' : 'unverified',
    type: item.type || 'steve',
    colors: item.colors || { head: '#c084fc', body: '#475569', arms: '#db2777', legs: '#06b6d4' },
    creator: item.creator || 'Unknown',
    likes: actualFavoriteCount(store, item.id),
    views: metrics.views,
    downloads: metrics.downloads,
    downloadUrl: item.downloadUrl || item.textureUrl || item.previewUrl || item.thumbnailUrl || null,
    shareCode: item.shareCode || item.id,
    author: item.author || item.creator || 'Unknown',
    authorId: item.authorId || '',
    description: item.description || '',
    created_at: item.createdAt || item.created_at || null,
    textureUrl: item.textureUrl || null,
    createdAt: item.createdAt || null,
    source: item.source || null,
    license: item.license || null,
    // Tags imported from third-party catalogues have no moderation source.
    // Publish only the verifiable player-creation classification for now.
    tags: item.source === 'plugin-archive' ? ['player-sync'] : isPlayerSubmission(item) ? ['community'] : [],
  }
}

let catalogIdMap = null
let catalogMapVersion = -1

function getCatalogMap(store) {
  const v = store.library?.version || 0
  if (catalogMapVersion !== v || !catalogIdMap) {
    catalogIdMap = new Map(ensureCatalog(store).map(x => [x.id, x]))
    catalogMapVersion = v
  }
  return catalogIdMap
}

export function registerSkinRoutes(app, deps) {
  const {
    config,
    jsonErr,
    jsonOk,
    jsonPage,
    getStore,
    scheduleSave,
    requireUser,
    requireAdmin,
    requireVerifiedEmail,
    requireReviewerOrAdmin,
    asyncHandler,
    crypto: cryptoDep,
    markSubmissionDirty,
    markKvDirty,
    ensurePlayerState,
    markPlayerStateDirty,
    resolveSkinStationPreview,
    triggerVlaSkinRefreshIfConfigured,
  } = deps
  const adminGuard = requireAdmin || requireReviewerOrAdmin

  app.get('/api/admin/skins/ai-naming', requireUser, adminGuard, (req, res) => {
    const store = getStore()
    return jsonOk(res, {
      job: store.catalogAiNamingJob || null,
      remaining: countAiNamingCandidates(store),
      batchMax: AI_NAMING_BATCH_MAX,
    })
  })

  app.post('/api/admin/skins/ai-naming', requireUser, adminGuard, asyncHandler(async (req, res) => {
    if (activeAiNamingJob) return jsonErr(res, 409, 'AI 命名任务正在运行', 'ai_naming_running')
    const store = getStore()
    const siteConfig = publicSiteConfig(store)
    if (!siteConfig.skinAiEnabled) return jsonErr(res, 503, '请先启用并保存 AI 模型配置', 'ai_skin_not_configured')
    if (!['gemini-native', 'grok-native', 'openai-compatible'].includes(siteConfig.skinAiProtocol)) {
      return jsonErr(res, 400, '当前自定义 PNG 模型不支持视觉命名', 'ai_naming_protocol_unsupported')
    }
    if (siteConfig.skinAiProtocol === 'gemini-native' && !process.env.GEMINI_API_KEY) return jsonErr(res, 503, 'Gemini API 密钥尚未配置', 'ai_provider_key_missing')
    if (siteConfig.skinAiProtocol === 'grok-native' && !process.env.XAI_API_KEY) return jsonErr(res, 503, 'xAI API 密钥尚未配置', 'ai_provider_key_missing')
    if (siteConfig.skinAiProtocol === 'openai-compatible' && !siteConfig.skinAiEndpoint) return jsonErr(res, 503, 'OpenAI 兼容接口尚未配置', 'ai_skin_not_configured')

    const limit = Math.min(AI_NAMING_BATCH_MAX, Math.max(1, Number.parseInt(req.body?.limit, 10) || 100))
    const onProgress = (job) => {
      store.catalogAiNamingJob = { ...job, updatedAt: new Date().toISOString() }
      markKvDirty?.('catalog_state')
      scheduleSave?.()
    }
    activeAiNamingJob = runCatalogAiNamingJob({
      store,
      limit,
      recognize: (item) => recognizeCatalogSkin(item, siteConfig, config),
      onProgress,
    }).finally(() => { activeAiNamingJob = null })
    return jsonOk(res, { started: true, job: store.catalogAiNamingJob, remaining: countAiNamingCandidates(store) })
  }))

  app.get('/api/skins/catalog', asyncHandler(async (req, res) => {
    const store = getStore()
    const catalog = publicCatalog(store, { config })
    const q = String(req.query.search || '').trim().toLowerCase()
    const typeFilter = String(req.query.type || '').trim().toLowerCase()
    const sort = String(req.query.sort || '').trim().toLowerCase()
    const tags = parseCatalogTags(req.query.tags)
    let items = catalog
    if (q) items = items.filter((s) => resolvePublicSkinName(s).toLowerCase().includes(q) || String(s.creator || '').toLowerCase().includes(q))
    if (typeFilter && (typeFilter === 'steve' || typeFilter === 'alex')) items = items.filter((s) => String(s.type || '').toLowerCase() === typeFilter)
    if (tags.length > 0) items = items.filter((item) => tags.every((tag) => tag === 'newest' || matchesCatalogTag(item, tag, store)))
    if (sort === 'popular' || sort === 'likes') items = items.slice().sort((a, b) => actualFavoriteCount(store, b.id) - actualFavoriteCount(store, a.id))
    else if (sort === 'downloads') items = items.slice().sort((a, b) => skinMetrics(store, b.id).downloads - skinMetrics(store, a.id).downloads)
    else if (sort === 'latest' || sort === 'newest' || tags.includes('newest')) items = items.slice().sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return db - da
    })
    const pg = resolvePaginationQuery(req.query, { defaultPageSize: 24, maxPageSize: 100 })
    const slice = items.slice(pg.offset, pg.offset + pg.pageSize).map((item) => normalizeSkin(item, store))
    jsonPage(res, slice, items.length, pg, { version: store.library?.version || 1 })
  }))

  // ── GET /api/skins/collections — 按 collectionId/tags 分组返回皮肤集合 ──
  app.get('/api/skins/collections', asyncHandler(async (req, res) => {
    const store = getStore()
    const catalog = publicCatalog(store, { config })
    const groups = {}
    for (const item of catalog) {
      const key = item.collectionId || (Array.isArray(item.tags) && item.tags[0]) || 'default'
      if (!groups[key]) groups[key] = { id: key, name: key, items: [] }
      groups[key].items.push(normalizeSkin(item, store))
    }
    const collections = Object.values(groups)
    jsonOk(res, { items: collections })
  }))

  // ── GET /api/skins/categories — 只公开可由数据可靠判定的分类 ──
  app.get('/api/skins/categories', asyncHandler(async (req, res) => {
    const store = getStore()
    const catalog = publicCatalog(store, { config })
    const total = catalog.length
    let community = 0
    for (let i = 0; i < total; i++) {
      const item = catalog[i]
      if (isPlayerSubmission(item)) community++
    }
    const categories = [
      { id: 'all', name_zh: '全部', name_en: 'All', count: total },
      { id: 'newest', name_zh: '最新上架', name_en: 'Newest', count: Math.min(total, 50) },
      { id: 'community', name_zh: '玩家自制', name_en: 'Player Creations', count: community },
      { id: 'player-sync', name_zh: '同步玩家皮肤', name_en: 'Synced Players', count: catalog.filter((item) => item.source === 'plugin-archive').length },
    ]
    res.json(categories)
  }))

  // ── GET /api/skins/share/:code — 通过分享码获取皮肤 ──
  app.get('/api/skins/share/:code', asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim()
    if (!code) return jsonErr(res, 400, '缺少分享码', 'validation_error')
    const store = getStore()
    const item = publicCatalog(store, { config }).find((x) => String(x.shareCode || '') === code)
    if (!item) return jsonErr(res, 404, '分享码无效或皮肤不存在', 'not_found')
    jsonOk(res, { skin: normalizeSkin(item, store) })
  }))

  app.get('/api/skins/library/search', asyncHandler(async (req, res) => {
    req.query.search = req.query.q || req.query.search
    return app.handle({ ...req, url: '/api/skins/catalog' }, res)
  }))

  app.get('/api/skins/library/sync-status', (req, res) => {
    const store = getStore()
    jsonOk(res, {
      sync: {
        syncedAt: store.library?.syncedAt || null,
        version: store.library?.version || 1,
        totalItems: ensureCatalog(store).length,
      },
      realtime: { enabled: true, streamPath: '/api/skins/library/stream', activeClients: store.skinLibrarySseClients || 0 },
    })
  })

  app.get('/api/skins/library/stream', (req, res) => {
    const store = getStore()
    attachSkinLibrarySseClient(store, res)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, version: store.library?.version || 1 })}\n\n`)
    const timer = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`)
    }, 15000)
    req.on('close', () => {
      clearInterval(timer)
      detachSkinLibrarySseClient(store, res)
    })
  })

  app.get('/api/skins/favorites', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const ids = store.favorites?.[req.user.id] || []
    const map = getCatalogMap(store)
    const items = ids.map((id) => map.get(id)).filter((item) => item && isPublicCatalogItem(item)).map((item) => normalizeSkin(item, store))
    jsonOk(res, items)
  }))

  app.post('/api/skins/favorites', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const skinId = String(req.body?.skinId || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 skinId', 'validation_error')
    const favoriteItem = getCatalogMap(store).get(skinId)
    if (!favoriteItem || !isPublicCatalogItem(favoriteItem)) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    if (!store.favorites) store.favorites = {}
    const list = new Set(store.favorites[req.user.id] || [])
    if (list.has(skinId)) list.delete(skinId)
    else list.add(skinId)
    store.favorites[req.user.id] = [...list]
    scheduleSave()
    jsonOk(res, { skinId, favorited: list.has(skinId), likes: actualFavoriteCount(store, skinId) })
  }))

  app.delete('/api/skins/favorites', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const skinId = String(req.body?.skinId || '').trim()
    if (!store.favorites?.[req.user.id]) return jsonOk(res, { removed: false, likes: actualFavoriteCount(store, skinId) })
    store.favorites[req.user.id] = store.favorites[req.user.id].filter((id) => id !== skinId)
    scheduleSave()
    jsonOk(res, { removed: true, likes: actualFavoriteCount(store, skinId) })
  }))

  app.get('/api/skins/:skinId/comments', asyncHandler(async (req, res) => {
    const store = getStore()
    const rows = store.comments?.[req.params.skinId] || []
    jsonOk(res, rows)
  }))

  app.post('/api/skins/:skinId/comments', requireUser, asyncHandler(async (req, res) => {
    const COMMENT_COST = 0.2
    const content = String(req.body?.content || '').trim()
    if (!content) return jsonErr(res, 400, '评论不能为空', 'validation_error')
    const store = getStore()
    const user = store.users?.find((entry) => String(entry?.id) === String(req.user.id))
    if (!user) return jsonErr(res, 404, '用户不存在', 'user_not_found')
    if (Number(user.balance || 0) < COMMENT_COST) {
      return jsonErr(res, 402, `积分不足，发表评论需要 ${COMMENT_COST.toFixed(1)} SC`, 'insufficient_balance')
    }
    if (!store.comments) store.comments = {}
    if (!store.comments[req.params.skinId]) store.comments[req.params.skinId] = []
    const row = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      username: req.user.username,
      content,
      createdAt: new Date().toISOString(),
    }
    store.comments[req.params.skinId].unshift(row)
    user.balance = Math.round((Number(user.balance || 0) - COMMENT_COST) * 10) / 10
    scheduleSave()
    jsonOk(res, { comment: row, cost: COMMENT_COST, balance: user.balance })
  }))

  app.post('/api/skins/report', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    if (!Array.isArray(store.reports)) store.reports = []
    store.reports.unshift({
      id: crypto.randomUUID(),
      skinId: req.body?.skinId,
      reason: req.body?.reason,
      reporterId: req.user.id,
      status: 'open',
      createdAt: new Date().toISOString(),
    })
    scheduleSave()
    jsonOk(res, { ok: true })
  }))

  app.get('/api/skins/player/submissions', requireUser, asyncHandler(async (req, res) => {
    const store = getStore()
    const rows = (store.submissions || []).filter((s) => String(s.userId) === String(req.user.id))
    jsonOk(res, rows)
  }))

  app.post('/api/skins/upload', requireUser, requireVerifiedEmail, asyncHandler(async (req, res) => {
    const store = getStore()
    const { name, type = 'steve', description = '', colors } = req.body || {}
    if (!String(name || '').trim()) return jsonErr(res, 400, '缺少名称', 'validation_error')
    const row = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      name: String(name).trim(),
      type,
      description: String(description || ''),
      colors: colors || null,
      status: config.reviewEntryEnabled ? 'pending' : 'approved',
      submittedAt: new Date().toISOString(),
      reviewVersion: 0,
    }
    if (!Array.isArray(store.submissions)) store.submissions = []
    store.submissions.unshift(row)
    markSubmissionDirty?.(row.id)
    scheduleSave()
    jsonOk(res, { message: '投稿已提交', submission: row })
  }))

  app.get('/api/skins/featured', asyncHandler(async (req, res) => {
    const store = getStore()
    const requestedLimit = Number(req.query.limit)
    const limit = Number.isFinite(requestedLimit) ? Math.min(12, Math.max(1, Math.floor(requestedLimit))) : 6
    const items = chooseFeaturedSkins(publicCatalog(store), limit).map((item) => normalizeSkin(item, store))
    jsonOk(res, { items, total: publicCatalog(store).length })
  }))

  app.get('/api/skins/submissions', requireUser, requireReviewerOrAdmin, (req, res) => {
    const store = getStore()
    const status = String(req.query.status || '').trim().toLowerCase()
    const query = String(req.query.search || '').trim().toLowerCase()
    const pagination = resolvePaginationQuery(req.query, { defaultPageSize: 24, maxPageSize: 100 })
    const users = new Map((store.users || []).map((user) => [String(user.id), user]))
    let items = Array.isArray(store.submissions) ? store.submissions.slice() : []

    if (status) items = items.filter((item) => String(item?.status || '').toLowerCase() === status)
    if (query) {
      items = items.filter((item) => {
        const owner = users.get(String(item?.userId || ''))
        return [item?.id, item?.name, item?.description, owner?.username, owner?.email]
          .some((value) => String(value || '').toLowerCase().includes(query))
      })
    }

    items.sort((left, right) => {
      const leftTime = Date.parse(String(left?.submittedAt || left?.createdAt || '')) || 0
      const rightTime = Date.parse(String(right?.submittedAt || right?.createdAt || '')) || 0
      return rightTime - leftTime
    })
    const total = items.length
    const rows = items
      .slice(pagination.offset, pagination.offset + pagination.pageSize)
      .map((item) => {
        const owner = users.get(String(item?.userId || ''))
        return {
          ...item,
          author: String(owner?.username || owner?.email || item?.author || ''),
        }
      })
    jsonPage(res, rows, total, pagination)
  })

  app.get('/api/skins/submissions/stats', requireUser, requireReviewerOrAdmin, (req, res) => {
    if (!config.reviewEntryEnabled) return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    jsonOk(res, summarizeSubmissionStats(getStore()))
  })

  app.post('/api/skins/submissions/:id/:action(approve|reject)', requireUser, requireReviewerOrAdmin, asyncHandler(async (req, res) => {
    if (!config.reviewEntryEnabled) return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    const result = performSubmissionReview(getStore(), {
      markSubmissionDirty,
      markKvDirty,
      scheduleSave,
      crypto: cryptoDep || crypto,
      appendReviewAuditLog,
      bumpCatalogLibraryVersion,
      broadcastCatalogSync,
      operatorId: req.user.id,
      operatorName: req.user.username,
    }, req.params.id, req.params.action, { note: req.body?.note })
    if (!result.ok) return jsonErr(res, 409, result.message, result.code, result.details)
    const submission = getStore().submissions?.find((item) => String(item.id) === String(req.params.id))
    const owner = getStore().users?.find((item) => String(item.id) === String(submission?.userId))
    triggerVlaSkinRefreshIfConfigured?.(owner?.linkedMcUsername)
    jsonOk(res, result)
  }))

  app.post('/api/skins/submissions/batch/:action(approve|reject)', requireUser, requireReviewerOrAdmin, asyncHandler(async (req, res) => {
    if (!config.reviewEntryEnabled) return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    const action = String(req.params.action || '').trim().toLowerCase()
    const globalNote = String(req.body?.note || '').trim()
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : []
    if (rawItems.length === 0) return jsonErr(res, 400, 'items 不能为空', 'validation_error', { field: 'items' })
    if (rawItems.length > BATCH_REVIEW_MAX_ITEMS) {
      return jsonErr(res, 400, `单次最多处理 ${BATCH_REVIEW_MAX_ITEMS} 条投稿`, 'validation_error', { field: 'items', max: BATCH_REVIEW_MAX_ITEMS })
    }
    if (action === 'reject' && !globalNote && rawItems.every((item) => !String(item?.note || '').trim())) {
      return jsonErr(res, 400, '驳回需要备注', 'validation_error', { field: 'note' })
    }
    const reviewDeps = {
      markSubmissionDirty,
      markKvDirty,
      scheduleSave,
      crypto: cryptoDep || crypto,
      appendReviewAuditLog,
      bumpCatalogLibraryVersion,
      broadcastCatalogSync,
      operatorId: req.user.id,
      operatorName: req.user.username,
    }
    const batch = performBatchSubmissionReview(getStore(), reviewDeps, action, rawItems, {
      note: globalNote,
      operatorId: req.user.id,
      operatorName: req.user.username,
    })
    for (const item of batch.results.filter((item) => item.ok)) {
      const submission = getStore().submissions?.find((row) => String(row.id) === String(item.id))
      const owner = getStore().users?.find((row) => String(row.id) === String(submission?.userId))
      triggerVlaSkinRefreshIfConfigured?.(owner?.linkedMcUsername)
    }
    jsonOk(res, batch)
  }))

  app.post('/api/skin/apply', requireUser, requireVerifiedEmail, asyncHandler(async (req, res) => {
    const store = getStore()
    const skinId = String(req.body?.skinId || req.body?.catalogId || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 skinId', 'validation_error', { field: 'skinId' })
    const map = getCatalogMap(store)
    const item = map.get(skinId)
    if (!item) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    const ps = ensurePlayerState?.(store, req.user.id)
    let gameSync = { nextJoin: 'not_linked', onlineRefresh: 'not_linked' }
    if (ps) {
      const selectedAt = new Date().toISOString()
      const linkedProfile = Array.isArray(req.user.minecraftProfiles)
        ? req.user.minecraftProfiles.find((profile) => profile?.isPrimary !== false && String(profile?.username || '').trim())
          || req.user.minecraftProfiles.find((profile) => String(profile?.username || '').trim())
        : null
      const playerUuid = String(linkedProfile?.uuid || req.user.activeMinecraftUuid || req.user.linkedMcUuid || '').trim()
      if (!ps.applied || typeof ps.applied !== 'object') ps.applied = {}
      ps.applied.version = Number(ps.applied.version || 0) + 1
      let selectionVersion = ps.applied.version
      if (playerUuid) {
        ps.selectionByProfile = ps.selectionByProfile && typeof ps.selectionByProfile === 'object' ? ps.selectionByProfile : {}
        ps.appliedByProfile = ps.appliedByProfile && typeof ps.appliedByProfile === 'object' ? ps.appliedByProfile : {}
        ps.selectionByProfile[playerUuid] = { catalogId: skinId, at: selectedAt }
        const profileApplied = ps.appliedByProfile[playerUuid] || {}
        profileApplied.version = Number(profileApplied.version || 0) + 1
        profileApplied.skinCatalogId = skinId
        selectionVersion = profileApplied.version
        ps.appliedByProfile[playerUuid] = profileApplied
        ps.activeSelection = { catalogId: skinId, at: selectedAt }
      } else {
        ps.activeSelection = { catalogId: skinId, at: selectedAt }
      }
      // The session can lag behind a newly linked profile; prefer the persisted profile.
      const username = String(linkedProfile?.username || req.user.linkedMcUsername || '').trim()
      if (username || playerUuid) {
        ps.gameSkinSync = {
          status: 'pending',
          catalogId: skinId,
          username,
          playerUuid,
          requestedAt: selectedAt,
          selectionVersion,
        }
        const refresh = await Promise.resolve(triggerVlaSkinRefreshIfConfigured?.(username, playerUuid))
        const onlineRefresh = String(refresh?.status || 'not_configured')
        ps.gameSkinSync.lastOnlineRefresh = { status: onlineRefresh, at: new Date().toISOString() }
        gameSync = { nextJoin: 'pending', onlineRefresh }
      }
      markPlayerStateDirty?.(req.user.id)
    }
    scheduleSave()
    jsonOk(res, {
      ok: true,
      skinId,
      gameSync,
      preview: resolveSkinStationPreview?.(store, req.user) || null,
    })
  }))

  app.get('/api/skins/:id/download', asyncHandler(async (req, res) => {
    const store = getStore()
    const item = getCatalogMap(store).get(String(req.params.id))
    if (!item || !isPublicCatalogItem(item)) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    const source = String(item.downloadUrl || item.textureUrl || item.previewUrl || item.thumbnailUrl || '').trim()
    if (!source) return jsonErr(res, 404, '该皮肤没有可下载的 PNG', 'texture_missing')

    if (!store.skinMetrics) store.skinMetrics = {}
    const metrics = store.skinMetrics[item.id] || { views: 0, downloads: 0 }
    metrics.downloads = Number(metrics.downloads || 0) + 1
    store.skinMetrics[item.id] = metrics
    scheduleSave()
    res.redirect(302, source)
  }))

  // Keep the single-segment detail route after every named /api/skins/* route.
  app.get('/api/skins/:id', asyncHandler(async (req, res) => {
    const store = getStore()
    const map = getCatalogMap(store)
    const item = map.get(String(req.params.id))
    if (!item || !isPublicCatalogItem(item)) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    if (!store.skinMetrics) store.skinMetrics = {}
    const metrics = store.skinMetrics[item.id] || { views: 0, downloads: 0 }
    metrics.views = Number(metrics.views || 0) + 1
    store.skinMetrics[item.id] = metrics
    scheduleSave()
    jsonOk(res, { skin: normalizeSkin(item, store) })
  }))
}

export function registerSkinTextureRoute(app, { jsonErr }) {
  app.get('/api/skins/texture/:id', (req, res) => jsonErr(res, 404, '纹理不存在', 'not_found'))
}

export function registerPublicSkinProfileRoutes(app, deps) {
  const {
    getStore,
    jsonErr,
    asyncHandler,
    skinProfilePublicLimiter,
    findUserByLinkedMcUsername,
    findUserByLinkedMcUuid,
    ensurePlayerState,
    catalogItemById,
    config,
  } = deps
  app.get('/api/public/skin-profile/:mcSegment', skinProfilePublicLimiter || ((_req, _res, next) => next()), asyncHandler(async (req, res) => {
    const mc = String(req.params.mcSegment || '').trim().replace(/\.json$/i, '')
    const isUuid = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(mc)
    const lookupKey = isUuid ? mc.replaceAll('-', '').toLowerCase() : mc
    const store = getStore()
    const profileDeps = {
      ensurePlayerState,
      catalogItemById,
      publicApiBase: config?.publicApiBaseUrl,
    }
    const archived = await attachSignedSkinTexture(buildPluginSyncedSkinProfile(store, mc, profileDeps))
    const user = isUuid
      ? findUserByLinkedMcUuid?.(store, lookupKey)
      : findUserByLinkedMcUsername?.(store, mc)
    if (!user) {
      if (archived) return res.json(archived)
      return jsonErr(res, 404, '未找到绑定用户或同步皮肤', 'not_found')
    }
    const profileName = isUuid
      ? (user.minecraftProfiles || []).find((profile) => String(profile?.uuid || '').replaceAll('-', '').toLowerCase() === lookupKey)?.username
        || user.linkedMcUsername
        || mc
      : mc
    const playerState = ensurePlayerState?.(store, user.id)
    const websiteProfile = await attachSignedSkinTexture(buildPublicSkinProfile(store, profileName, user, profileDeps, isUuid ? lookupKey : ''))
    const version = String(playerState?.applied?.version || playerState?.selectionVersion || user.skinVersion || store.library?.version || 0)
    const etag = `W/"skin-${lookupKey}-${version}"`
    res.setHeader('cache-control', 'public, max-age=30, stale-while-revalidate=120')
    res.setHeader('etag', etag)
    if (String(req.headers['if-none-match'] || '').split(',').map((value) => value.trim()).includes(etag)) {
      return res.status(304).end()
    }
    if (Object.keys(websiteProfile.textures || {}).length > 0 || !archived) {
      return res.json({ ...websiteProfile, version })
    }
    return res.json({ ...archived, linkedUserId: user.id, version })
  }))
}
