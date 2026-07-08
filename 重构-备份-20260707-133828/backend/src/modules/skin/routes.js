import {
  appendReviewAuditLog
} from './service.js'
import {
  hasAnyRole,
  requireRolesOrJson
} from '../../utils/permission.js'

function normalizeLibraryItem(item) {
  const creatorName = creatorNameForCatalogItem(item)
  return {
    id: String(item?.id || ''),
    name: String(item?.title || item?.name || item?.id || '未命名'),
    description: String(item?.desc || item?.description || ''),
    tags: Array.isArray(item?.tags) ? item.tags.map((t) => String(t)).filter(Boolean) : (item?.tag ? [String(item.tag)] : []),
    skinUrl: String(item?.skinTextureUrl || item?.skinUrl || ''),
    capeUrl: String(item?.capeUrl || item?.capeTextureUrl || ''),
    previewUrl: String(item?.cover || item?.previewUrl || item?.skinTextureUrl || ''),
    model: item?.model || 'default',
    uploader: creatorName,
    uploaderName: creatorName,
  }
}

function parseIsoMs(value) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : 0
}

function buildDashboardSecurityIndicators(store, user) {
  const sc = (store && typeof store.securityCenter === 'object' && store.securityCenter)
    ? store.securityCenter
    : { sessions: {}, alerts: [], auditLogs: [] }
  const userId = String(user?.id || '')
  const now = Date.now()
  const recentWindow = 30 * 24 * 60 * 60 * 1000
  const bindingActions = new Set(['link_minecraft', 'unlink_minecraft'])
  const sessions = Object.values(sc.sessions || {}).filter((s) => String(s?.userId || '') === userId)
  const activeSessions = sessions.filter((s) => s?.active !== false)
  const sessionIps = new Set(activeSessions.map((s) => String(s?.ip || '').trim()).filter(Boolean))
  const recentAlerts = (Array.isArray(sc.alerts) ? sc.alerts : []).filter(
    (a) => String(a?.userId || '') === userId && now - parseIsoMs(a?.at) <= recentWindow
  )
  const highRiskAlerts = recentAlerts.filter((a) => String(a?.level || '').toLowerCase() === 'high')
  const recentBindingChanges = (Array.isArray(sc.auditLogs) ? sc.auditLogs : []).filter(
    (a) =>
      String(a?.userId || '') === userId &&
      bindingActions.has(String(a?.action || '').toLowerCase()) &&
      now - parseIsoMs(a?.at) <= recentWindow
  ).length
  const hasAbnormalSessions = sessionIps.size > 2 || highRiskAlerts.length > 0
  const triggeredSecurityAlert = recentAlerts.length > 0
  const level = hasAbnormalSessions
    ? 'risk'
    : (!user?.totpEnabled || recentBindingChanges > 0 ? 'attention' : 'safe')

  return {
    totpEnabled: Boolean(user?.totpEnabled),
    hasAbnormalSessions,
    recentBindingChanges,
    recentSecurityAlerts: recentAlerts.length,
    triggeredSecurityAlert,
    activeSessions: activeSessions.length,
    highRiskAlertCount: highRiskAlerts.length,
    level,
  }
}

function ensureSkinMetricsStore(store) {
  if (!store.skinMetrics || typeof store.skinMetrics !== 'object') {
    store.skinMetrics = {}
  }
  return store.skinMetrics
}

function buildCatalogVersion(crypto, catalog, syncedAt) {
  const src = [
    String(syncedAt || ''),
    ...catalog.map((item) =>
      `${String(item?.id || '')}:${String(item?.updatedAt || item?.createdAt || '')}:${String(item?.skinTextureUrl || '')}`
    )
  ].join('|')
  return crypto.createHash('sha1').update(src).digest('hex').slice(0, 16)
}

function catalogLastModified(catalog, fallbackIso) {
  const latest = catalog.reduce((max, item) => {
    const t = parseIsoMs(item?.updatedAt || item?.createdAt)
    return t > max ? t : max
  }, parseIsoMs(fallbackIso))
  return latest > 0 ? new Date(latest).toUTCString() : new Date().toUTCString()
}

function buildCatalogSyncSnapshot(crypto, store) {
  const catalog = Array.isArray(store?.catalog) ? store.catalog : []
  const syncedAt = String(store?.catalogSyncedAt || '')
  const version = buildCatalogVersion(crypto, catalog, syncedAt)
  const etag = `"catalog-${version}"`
  const lastModified = catalogLastModified(catalog, syncedAt)
  return {
    syncedAt,
    version,
    etag,
    lastModified,
    totalItems: catalog.length,
  }
}

function collectSkinTags(item) {
  const tags = Array.isArray(item?.tags)
    ? item.tags
    : item?.tag
      ? [item.tag]
      : []
  return tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
}

function listCatalogTags(item) {
  const tags = Array.isArray(item?.tags)
    ? item.tags
    : item?.tag
      ? [item.tag]
      : []
  return [...new Set(tags.map((tag) => String(tag || '').trim()).filter(Boolean))]
}

function catalogLibraryForItem(item) {
  const explicit = String(item?.library || '').trim()
  if (explicit) return explicit
  const tag = String(item?.tag || '').trim()
  return tag === '官方' ? 'official' : 'local'
}

function catalogSourceForItem(item) {
  return String(item?.source || item?.sourceType || item?.theme || 'catalog').trim() || 'catalog'
}

function catalogCollectionIdForItem(item) {
  const explicit = String(item?.collection || item?.collectionId || item?.series || '').trim()
  if (explicit) return explicit
  const tags = listCatalogTags(item)
  return String(tags[0] || '综合').trim() || '综合'
}

function sameCatalogFacetValue(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

function catalogTextIncludes(value, keyword) {
  return String(value || '').toLowerCase().includes(keyword)
}

function catalogMatchesKeyword(item, keyword) {
  if (!keyword) return true
  const tags = listCatalogTags(item)
  const haystack = [
    item?.id,
    item?.title,
    item?.name,
    item?.desc,
    item?.description,
    item?.tag,
    creatorNameForCatalogItem(item),
    catalogLibraryForItem(item),
    catalogSourceForItem(item),
    catalogCollectionIdForItem(item),
    ...tags,
  ]
  return haystack.some((value) => catalogTextIncludes(value, keyword))
}

function catalogQueryFilters(query = {}) {
  return {
    keyword: String(query.search || query.q || '').trim().toLowerCase(),
    creator: String(query.creator || '').trim(),
    model: String(query.model || '').trim(),
    library: String(query.library || '').trim(),
    source: String(query.source || '').trim(),
    collection: String(query.collection || '').trim(),
    tag: String(query.tag || '').trim(),
    sort: String(query.sort || 'newest').trim().toLowerCase(),
  }
}

function filterCatalogItems(catalog, query = {}) {
  const filters = catalogQueryFilters(query)
  return (Array.isArray(catalog) ? catalog : [])
    .filter((item) => Boolean(item?.skinTextureUrl))
    .filter((item) => catalogMatchesKeyword(item, filters.keyword))
    .filter((item) => !filters.creator || creatorKey(creatorNameForCatalogItem(item)) === creatorKey(filters.creator))
    .filter((item) => !filters.model || filters.model === 'all' || String(item?.model || 'default') === filters.model)
    .filter((item) => !filters.library || filters.library === 'all' || sameCatalogFacetValue(catalogLibraryForItem(item), filters.library))
    .filter((item) => !filters.source || filters.source === 'all' || sameCatalogFacetValue(catalogSourceForItem(item), filters.source))
    .filter((item) => !filters.collection || filters.collection === 'all' || sameCatalogFacetValue(catalogCollectionIdForItem(item), filters.collection))
    .filter((item) => !filters.tag || listCatalogTags(item).some((tag) => sameCatalogFacetValue(tag, filters.tag)))
}

function sortCatalogItems(store, items, sort = 'newest') {
  const mode = String(sort || 'newest').trim().toLowerCase()
  return [...items].sort((a, b) => {
    if (mode === 'popular' || mode === 'heat') {
      const heatA = buildHonorScore(getSkinMetrics(store, String(a?.id || '')))
      const heatB = buildHonorScore(getSkinMetrics(store, String(b?.id || '')))
      if (heatB !== heatA) return heatB - heatA
    }
    if (mode === 'downloads') {
      const downloadsA = Number(getSkinMetrics(store, String(a?.id || '')).downloads || 0)
      const downloadsB = Number(getSkinMetrics(store, String(b?.id || '')).downloads || 0)
      if (downloadsB !== downloadsA) return downloadsB - downloadsA
    }
    const timeDelta = parseIsoMs(b?.updatedAt || b?.createdAt) - parseIsoMs(a?.updatedAt || a?.createdAt)
    if (timeDelta !== 0) return timeDelta
    return String(a?.title || a?.name || a?.id || '').localeCompare(String(b?.title || b?.name || b?.id || ''), 'zh-Hans-CN')
  })
}

function incrementFacet(counter, id, title = id) {
  const key = String(id || '').trim()
  if (!key) return
  const mapKey = key.toLowerCase()
  const prev = counter.get(mapKey) || { id: key, title: String(title || key), count: 0 }
  prev.count += 1
  counter.set(mapKey, prev)
}

function facetRows(counter, limit = 100) {
  return [...counter.values()]
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.title || a.id).localeCompare(String(b.title || b.id), 'zh-Hans-CN'))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      title: row.title,
      count: row.count,
    }))
}

function buildCatalogFacets(items, { tagLimit = 24 } = {}) {
  const libraries = new Map()
  const sources = new Map()
  const collections = new Map()
  const tags = new Map()
  for (const item of items) {
    incrementFacet(libraries, catalogLibraryForItem(item))
    incrementFacet(sources, catalogSourceForItem(item))
    incrementFacet(collections, catalogCollectionIdForItem(item), `${catalogCollectionIdForItem(item)}专题`)
    for (const tag of listCatalogTags(item)) incrementFacet(tags, tag)
  }
  return {
    libraries: facetRows(libraries, 20),
    sources: facetRows(sources, 30),
    collections: facetRows(collections, 50).map((row) => ({ id: row.id, count: row.count })),
    tags: facetRows(tags, Math.max(1, Math.min(100, Number(tagLimit) || 24))).map((row) => ({ id: row.id, count: row.count })),
  }
}

function catalogListItem(store, item) {
  const id = String(item?.id || '')
  const metrics = getSkinMetrics(store, id)
  const tags = listCatalogTags(item)
  return {
    ...item,
    tags,
    tag: String(item?.tag || tags[0] || ''),
    library: catalogLibraryForItem(item),
    source: catalogSourceForItem(item),
    collection: catalogCollectionIdForItem(item),
    uploader: creatorNameForCatalogItem(item),
    uploaderName: creatorNameForCatalogItem(item),
    likeCount: metrics.likes,
    favoriteCount: metrics.favorites,
    viewCount: metrics.views,
    downloadCount: metrics.downloads,
    metrics,
  }
}

function buildCatalogCollections(store, items) {
  const map = new Map()
  for (const raw of items) {
    const id = catalogCollectionIdForItem(raw)
    const key = id.toLowerCase()
    const item = honorSkinFromCatalogItem(store, raw, store.catalogSyncedAt)
    const prev = map.get(key) || {
      id,
      title: `${id}专题`,
      description: `围绕「${id}」聚合服务器皮肤库中的代表作品。`,
      hero: `#${id}`,
      theme: 'catalog-tag',
      tags: new Set(),
      featuredIds: [],
      items: [],
      heat: 0,
      latestAt: '',
    }
    prev.items.push(item)
    prev.heat += Number(item.honorScore || 0)
    for (const tag of item.tags || []) prev.tags.add(String(tag))
    const updatedAt = String(item.updatedAt || '')
    if (!prev.latestAt || parseIsoMs(updatedAt) > parseIsoMs(prev.latestAt)) prev.latestAt = updatedAt
    map.set(key, prev)
  }
  return [...map.values()]
    .map((row) => {
      const sortedItems = row.items
        .slice()
        .sort((a, b) => Number(b.honorScore || 0) - Number(a.honorScore || 0) || parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt))
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        hero: row.hero,
        tags: [...row.tags].slice(0, 10),
        theme: row.theme,
        featuredIds: sortedItems.slice(0, 4).map((item) => item.id),
        items: sortedItems,
        itemCount: row.items.length,
        heat: row.heat,
        latestAt: row.latestAt,
      }
    })
    .sort((a, b) => Number(b.heat || 0) - Number(a.heat || 0) || Number(b.itemCount || 0) - Number(a.itemCount || 0) || a.title.localeCompare(b.title, 'zh-Hans-CN'))
}

function countFavoritesForSkin(store, skinId) {
  if (!store.userFavorites || typeof store.userFavorites !== 'object') return 0
  let count = 0
  for (const list of Object.values(store.userFavorites)) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (String(item?.skinId || '') === String(skinId || '')) count += 1
    }
  }
  return count
}

function getSkinMetrics(store, skinId) {
  const metricsMap = ensureSkinMetricsStore(store)
  const id = String(skinId || '')
  if (!metricsMap[id] || typeof metricsMap[id] !== 'object') {
    metricsMap[id] = {
      views: 0,
      downloads: 0,
      likes: 0,
      favorites: 0,
      updatedAt: new Date().toISOString(),
    }
  }
  const row = metricsMap[id]
  const favorites = countFavoritesForSkin(store, id)
  row.favorites = favorites
  return {
    views: Math.max(0, Number(row.views) || 0),
    downloads: Math.max(0, Number(row.downloads) || 0),
    likes: Math.max(0, Number(row.likes) || 0),
    favorites,
    updatedAt: String(row.updatedAt || ''),
  }
}

function buildHonorScore(metrics = {}) {
  return Number(metrics.favorites || 0) * 5 +
    Number(metrics.likes || 0) * 4 +
    Number(metrics.downloads || 0) * 2 +
    Number(metrics.views || 0) +
    Number(metrics.comments || 0) * 6
}

function creatorNameForCatalogItem(item) {
  const explicit = String(item?.uploaderName || item?.author || item?.creatorName || '').trim()
  if (explicit) return explicit
  const tag = String(item?.tag || '').trim()
  if (tag === '官方') return 'StarMC 官方'
  if (tag) return `${tag}创作者`
  return '社区创作者'
}

function honorSkinFromCatalogItem(store, item, fallbackUpdatedAt = '') {
  const id = String(item?.id || '')
  const metrics = getSkinMetrics(store, id)
  const commentsMap = store.skinComments && typeof store.skinComments === 'object' ? store.skinComments : {}
  const comments = Array.isArray(commentsMap[id]) ? commentsMap[id] : []
  const commentCount = comments.filter((row) => String(row?.status || 'active') !== 'deleted').length
  const tags = Array.isArray(item?.tags)
    ? item.tags.map((tag) => String(tag)).filter(Boolean)
    : (item?.tag ? [String(item.tag)] : [])
  const enrichedMetrics = {
    views: metrics.views,
    downloads: metrics.downloads,
    likes: metrics.likes,
    favorites: metrics.favorites,
    comments: commentCount,
  }
  return {
    ...normalizeLibraryItem(item),
    tags,
    source: String(item?.source || item?.sourceType || 'catalog'),
    updatedAt: String(item?.updatedAt || item?.createdAt || metrics.updatedAt || fallbackUpdatedAt || ''),
    uploaderName: creatorNameForCatalogItem(item),
    metrics: enrichedMetrics,
    honorScore: buildHonorScore(enrichedMetrics),
  }
}

function buildCreatorHonors(honorSkins) {
  const map = new Map()
  for (const item of honorSkins) {
    const name = String(item.uploaderName || '社区创作者')
    const prev = map.get(name) || {
      name,
      itemCount: 0,
      heat: 0,
      totalDownloads: 0,
      totalLikes: 0,
      totalFavorites: 0,
      tags: new Set(),
    }
    prev.itemCount += 1
    prev.heat += Number(item.honorScore || 0)
    prev.totalDownloads += Number(item.metrics?.downloads || 0)
    prev.totalLikes += Number(item.metrics?.likes || 0)
    prev.totalFavorites += Number(item.metrics?.favorites || 0)
    for (const tag of item.tags || []) prev.tags.add(String(tag))
    map.set(name, prev)
  }
  return [...map.values()]
    .sort((a, b) => b.heat - a.heat || b.itemCount - a.itemCount || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .slice(0, 8)
    .map((profile, index) => ({
      rank: index + 1,
      badge: index === 0 ? 'MVP' : index === 1 ? 'Rising' : 'Featured',
      profile: {
        name: profile.name,
        itemCount: profile.itemCount,
        heat: profile.heat,
        totalDownloads: profile.totalDownloads,
        totalLikes: profile.totalLikes,
        totalFavorites: profile.totalFavorites,
        tags: [...profile.tags].slice(0, 6),
      },
    }))
}

function buildCollectionHonors(honorSkins) {
  const map = new Map()
  for (const item of honorSkins) {
    const tag = String(item.tags?.[0] || '综合').trim() || '综合'
    const prev = map.get(tag) || {
      id: tag,
      title: `${tag}专题`,
      itemCount: 0,
      score: 0,
      sampleSkins: [],
    }
    prev.itemCount += 1
    prev.score += Number(item.honorScore || 0)
    if (prev.sampleSkins.length < 4) prev.sampleSkins.push(item)
    map.set(tag, prev)
  }
  return [...map.values()]
    .sort((a, b) => b.score - a.score || b.itemCount - a.itemCount || a.title.localeCompare(b.title, 'zh-Hans-CN'))
    .slice(0, 8)
}

function buildHonorChallenges(collectionHonors) {
  return collectionHonors.slice(0, 4).map((row) => ({
    id: `challenge-${row.id}`,
    title: `${row.id}主题挑战`,
    description: `围绕「${row.id}」主题创作或 Remix，持续补充服务器皮肤库。`,
    tag: row.id,
    participantCount: row.itemCount,
    score: row.score,
    featuredItems: row.sampleSkins,
    entryUrl: `/skins?view=library&q=${encodeURIComponent(row.id)}`,
    submitUrl: `/skins/studio?tag=${encodeURIComponent(row.id)}`,
  }))
}

function buildRecentHonorActivity(store, skinById) {
  const logs = Array.isArray(store.skinInteractionLogs) ? store.skinInteractionLogs : []
  const badges = {
    skin_view: 'VIEW',
    skin_download: 'DL',
    favorite_add: 'FAV',
    skin_like: 'LIKE',
    comment_add: 'COMMENT',
    skin_rollback: 'ROLLBACK',
  }
  const titles = {
    skin_view: '作品获得浏览',
    skin_download: '作品被下载',
    favorite_add: '作品被收藏',
    skin_like: '作品收到点赞',
    comment_add: '作品有新评论',
    skin_rollback: '作品完成版本回滚',
  }
  return logs
    .map((row) => {
      const skinId = String(row?.skinId || '')
      const skin = skinById.get(skinId)
      if (!skin) return null
      const actor = String(row?.username || '').trim() || '社区玩家'
      const type = String(row?.type || 'activity')
      return {
        id: String(row?.id || `${type}:${skinId}:${row?.at || ''}`),
        type,
        badge: badges[type] || 'LIVE',
        title: titles[type] || '社区互动更新',
        subtitle: `${actor} · ${skin.name}`,
        actor,
        skinId,
        skinName: skin.name,
        at: String(row?.at || skin.updatedAt || ''),
        href: `/skins/${encodeURIComponent(skinId)}`,
      }
    })
    .filter(Boolean)
    .sort((a, b) => parseIsoMs(b.at) - parseIsoMs(a.at))
    .slice(0, 8)
}

function ensureWardrobeSlots(playerState) {
  if (Array.isArray(playerState.wardrobeSlots)) return playerState.wardrobeSlots
  if (Array.isArray(playerState.wardrobe)) {
    playerState.wardrobeSlots = playerState.wardrobe
    return playerState.wardrobeSlots
  }
  playerState.wardrobeSlots = []
  return playerState.wardrobeSlots
}

function sanitizeWardrobeText(value, fallback, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return (text || fallback).slice(0, maxLength)
}

function sanitizeWardrobeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.startsWith('data:')) return ''
  if (raw.startsWith('/uploads/')) return raw.slice(0, 2048)
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.toString().slice(0, 2048)
  } catch {
    return ''
  }
}

function normalizeWardrobeSlot(row) {
  const id = String(row?.id || '').trim()
  const skinUrl = sanitizeWardrobeUrl(row?.skinUrl)
  if (!id || !skinUrl) return null
  const serverSlotRaw = String(row?.serverSlot || row?.slot || '').trim()
  const serverSlot = ['default', 'pvp', 'event'].includes(serverSlotRaw) ? serverSlotRaw : undefined
  const createdAt = String(row?.createdAt || row?.updatedAt || new Date().toISOString())
  return {
    id,
    title: sanitizeWardrobeText(row?.title, '未命名方案', 80),
    skinUrl,
    previewUrl: sanitizeWardrobeUrl(row?.previewUrl) || skinUrl,
    model: row?.model === 'slim' ? 'slim' : 'default',
    source: sanitizeWardrobeText(row?.source, 'studio', 300),
    serverSlot,
    createdAt,
    updatedAt: String(row?.updatedAt || createdAt),
    synced: true,
  }
}

function ensureCreatorFollows(playerState) {
  if (!Array.isArray(playerState.creatorFollows)) {
    playerState.creatorFollows = []
  }
  return playerState.creatorFollows
}

function creatorKey(name) {
  return String(name || '').trim().toLowerCase()
}

function creatorMatches(item, name) {
  return creatorKey(creatorNameForCatalogItem(item)) === creatorKey(name)
}

function creatorFollowerCount(store, name) {
  const key = creatorKey(name)
  if (!key || !store.playerState || typeof store.playerState !== 'object') return 0
  let count = 0
  for (const state of Object.values(store.playerState)) {
    const follows = Array.isArray(state?.creatorFollows) ? state.creatorFollows : []
    if (follows.some((row) => creatorKey(row?.creatorName || row?.name) === key)) count += 1
  }
  return count
}

function creatorFollowRecord(playerState, name) {
  const key = creatorKey(name)
  return ensureCreatorFollows(playerState).find((row) => creatorKey(row?.creatorName || row?.name) === key) || null
}

function buildCreatorProfile(store, name, userPlayerState = null) {
  const catalog = Array.isArray(store.catalog) ? store.catalog : []
  const rows = catalog
    .filter((item) => Boolean(item?.skinTextureUrl))
    .filter((item) => creatorMatches(item, name))
    .map((item) => honorSkinFromCatalogItem(store, item, store.catalogSyncedAt))
  if (rows.length === 0) return null

  const tags = new Set()
  const sources = new Set()
  let totalViews = 0
  let totalDownloads = 0
  let totalLikes = 0
  let totalFavorites = 0
  let heat = 0
  let latestAtMs = 0
  let firstAtMs = Number.POSITIVE_INFINITY
  for (const item of rows) {
    for (const tag of item.tags || []) tags.add(String(tag))
    sources.add(String(item.source || 'catalog'))
    totalViews += Number(item.metrics?.views || 0)
    totalDownloads += Number(item.metrics?.downloads || 0)
    totalLikes += Number(item.metrics?.likes || 0)
    totalFavorites += Number(item.metrics?.favorites || 0)
    heat += Number(item.honorScore || 0)
    const updated = parseIsoMs(item.updatedAt)
    if (updated > latestAtMs) latestAtMs = updated
    if (updated > 0 && updated < firstAtMs) firstAtMs = updated
  }
  const profileName = rows[0]?.uploaderName || String(name || '').trim()
  const followed = userPlayerState ? creatorFollowRecord(userPlayerState, profileName) : null
  return {
    id: encodeURIComponent(profileName),
    name: profileName,
    itemCount: rows.length,
    totalViews,
    totalDownloads,
    totalLikes,
    totalFavorites,
    heat,
    latestAt: latestAtMs > 0 ? new Date(latestAtMs).toISOString() : '',
    firstAt: Number.isFinite(firstAtMs) ? new Date(firstAtMs).toISOString() : '',
    tags: [...tags].slice(0, 8),
    collections: [...tags].slice(0, 6),
    sources: [...sources].slice(0, 6),
    sampleSkins: rows
      .slice()
      .sort((a, b) => Number(b.honorScore || 0) - Number(a.honorScore || 0))
      .slice(0, 4),
    badges: [
      rows.length >= 6 ? '高产作者' : '',
      heat >= 200 ? '高热作者' : '',
      tags.size > 0 ? `#${[...tags][0]}` : '',
    ].filter(Boolean),
    summary: `${profileName} 已沉淀 ${rows.length} 件可浏览作品，累计 ${totalDownloads} 次下载。`,
    followerCount: creatorFollowerCount(store, profileName),
    followedByMe: Boolean(followed),
    followedAt: followed?.followedAt ? String(followed.followedAt) : undefined,
  }
}

function buildCreatorActivity(store, name, items) {
  const skinById = new Map(items.map((item) => [String(item.id), item]))
  return buildRecentHonorActivity(store, skinById)
    .map((activity) => ({
      ...activity,
      actor: String(activity.actor || name),
      subtitle: String(activity.subtitle || '').replace(/^.*? · /, `${name} · `),
    }))
    .slice(0, 8)
}

function listFollowedCreatorRecords(playerState) {
  return ensureCreatorFollows(playerState)
    .map((row) => ({
      creatorName: String(row?.creatorName || row?.name || '').trim(),
      followedAt: String(row?.followedAt || ''),
    }))
    .filter((row) => row.creatorName)
}

function patchSkinMetric(store, skinId, patch = {}) {
  const metricsMap = ensureSkinMetricsStore(store)
  const id = String(skinId || '')
  const prev = metricsMap[id] && typeof metricsMap[id] === 'object' ? metricsMap[id] : {}
  metricsMap[id] = {
    views: Math.max(0, Number(patch.views ?? prev.views ?? 0)),
    downloads: Math.max(0, Number(patch.downloads ?? prev.downloads ?? 0)),
    likes: Math.max(0, Number(patch.likes ?? prev.likes ?? 0)),
    favorites: Math.max(0, Number(patch.favorites ?? prev.favorites ?? 0)),
    updatedAt: new Date().toISOString(),
  }
  return metricsMap[id]
}

function buildRelatedItems(store, targetId, limit = 6) {
  const catalog = Array.isArray(store.catalog) ? store.catalog : []
  const target = catalog.find((i) => String(i?.id || '') === String(targetId || ''))
  if (!target) return []
  const targetTags = new Set(collectSkinTags(target))
  const targetModel = String(target?.model || 'default')
  const candidates = []
  for (const item of catalog) {
    if (!item || String(item.id || '') === String(target.id || '')) continue
    if (!item.skinTextureUrl) continue
    const tags = collectSkinTags(item)
    let score = 0
    for (const tag of tags) {
      if (targetTags.has(tag)) score += 3
    }
    if (String(item?.model || 'default') === targetModel) score += 2
    const freshness = parseIsoMs(item?.updatedAt || item?.createdAt)
    score += Math.min(2, freshness > 0 ? 1 : 0)
    if (score <= 0) continue
    candidates.push({ item, score, freshness })
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.freshness - a.freshness
  })
  return candidates.slice(0, limit).map((row) => normalizeLibraryItem(row.item))
}

function ensureSubmissionHistory(submission) {
  if (!Array.isArray(submission.reviewHistory)) submission.reviewHistory = []
  return submission.reviewHistory
}

function appendSubmissionHistory(submission, crypto, payload) {
  const history = ensureSubmissionHistory(submission)
  const action = String(payload?.action || 'unknown')
  const statusBefore = payload?.statusBefore ? String(payload.statusBefore) : undefined
  const statusAfter = payload?.statusAfter ? String(payload.statusAfter) : undefined
  const operatorId = payload?.operatorId ? String(payload.operatorId) : undefined
  const operatorName = payload?.operatorName ? String(payload.operatorName) : undefined
  const note = String(payload?.note || '')
  history.unshift({
    id: String(crypto.randomUUID()),
    at: new Date().toISOString(),
    action,
    statusBefore,
    statusAfter,
    operatorId,
    operatorName,
    note,
  })
  if (history.length > 100) history.length = 100
}

function mapSubmissionHistoryRecord(record) {
  return {
    id: String(record?.id || ''),
    action: String(record?.action || ''),
    statusBefore: record?.statusBefore ? String(record.statusBefore) : undefined,
    statusAfter: record?.statusAfter ? String(record.statusAfter) : undefined,
    operatorId: record?.operatorId ? String(record.operatorId) : undefined,
    operatorName: record?.operatorName ? String(record.operatorName) : undefined,
    note: record?.note ? String(record.note) : '',
    at: String(record?.at || ''),
  }
}

function mapReviewAuditLogRecord(row) {
  const submissionId = String(row?.submissionId || '')
  return {
    id: String(row?.id || ''),
    submissionId,
    title: String(row?.title || submissionId || ''),
    action: String(row?.action || ''),
    operator: String(row?.operator || row?.operatorName || ''),
    note: row?.note ? String(row.note) : '',
    at: String(row?.time || row?.at || ''),
    ip: row?.ip ? String(row.ip) : '',
    statusBefore: row?.statusBefore ? String(row.statusBefore) : '',
    statusAfter: row?.statusAfter ? String(row.statusAfter) : '',
    before: row?.before && typeof row.before === 'object' ? row.before : undefined,
    after: row?.after && typeof row.after === 'object' ? row.after : undefined,
  }
}

function buildSkinReportStatsRows(rows) {
  const reports = Array.isArray(rows) ? rows : []
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const weekMs = 7 * dayMs
  const stats = {
    total: reports.length,
    pending: 0,
    reviewed: 0,
    dismissed: 0,
    other: 0,
    recent24h: 0,
    recent7d: 0,
    byReason: {
      copyright: 0,
      nsfw: 0,
      spam: 0,
      other: 0,
    }
  }

  for (const row of reports) {
    const status = String(row?.status || '').trim().toLowerCase()
    if (status === 'pending') stats.pending += 1
    else if (status === 'reviewed') stats.reviewed += 1
    else if (status === 'dismissed') stats.dismissed += 1
    else stats.other += 1

    const reason = String(row?.reason || '').trim().toLowerCase()
    if (reason === 'copyright') stats.byReason.copyright += 1
    else if (reason === 'nsfw') stats.byReason.nsfw += 1
    else if (reason === 'spam') stats.byReason.spam += 1
    else stats.byReason.other += 1

    const createdAt = parseIsoMs(row?.createdAt)
    if (!createdAt) continue
    if (now - createdAt <= dayMs) stats.recent24h += 1
    if (now - createdAt <= weekMs) stats.recent7d += 1
  }
  return stats
}

const NOTIFICATION_TYPE_LABELS = {
  submission_review: '投稿审核结果',
  submission_reopen: '投稿回退待审',
  security_alert: '安全告警',
  binding_changed: '绑定状态变更',
  report_result: '举报处理结果',
  skin_comment: '皮肤评论通知',
  webhook_failed: 'Webhook 失败',
  system: '系统通知',
}

const SUBMISSION_REVIEW_STATUSES = ['pending', 'approved', 'rejected']

function normalizeSubmissionReviewStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  return SUBMISSION_REVIEW_STATUSES.includes(normalized) ? normalized : ''
}

function ensureSubmissionReviewVersion(submission) {
  const raw = Number(submission?.reviewVersion)
  const normalized = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0
  submission.reviewVersion = normalized
  return normalized
}

function parseExpectedReviewVersion(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { provided: false, valid: true, value: null }
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    return { provided: true, valid: false, value: null }
  }
  return { provided: true, valid: true, value: n }
}

function deriveSubmissionAssetUrls(submission) {
  const rel = String(submission?.localPath || '').trim()
  const url = rel ? `/uploads/${encodeURI(rel)}` : ''
  if (String(submission?.kind || 'skin') === 'cape') {
    return { skinUrl: '', capeUrl: url, previewUrl: url || null }
  }
  return { skinUrl: url, capeUrl: '', previewUrl: url || null }
}

function mapSubmissionRecord(submission, usersById = new Map()) {
  const { skinUrl, capeUrl, previewUrl } = deriveSubmissionAssetUrls(submission)
  const submitter = String(
    submission?.submitterUsername ||
    usersById.get(String(submission?.userId || '')) ||
    submission?.userId ||
    ''
  )
  return {
    id: String(submission?.id || ''),
    userId: String(submission?.userId || ''),
    title: String(submission?.title || submission?.fileName || '未命名投稿'),
    name: String(submission?.title || submission?.fileName || '未命名投稿'),
    description: String(submission?.description || ''),
    tags: Array.isArray(submission?.tags) ? submission.tags.map((t) => String(t)).filter(Boolean) : [],
    submitter,
    authorName: submitter,
    kind: String(submission?.kind || 'skin'),
    model: String(submission?.model || 'auto'),
    skinUrl,
    capeUrl: capeUrl || null,
    previewUrl,
    note: String(submission?.description || ''),
    status: String(submission?.status || 'pending'),
    submittedAt: String(submission?.submittedAt || ''),
    reviewedAt: submission?.reviewedAt || null,
    reviewNote: String(submission?.reviewNote || ''),
    reviewerId: submission?.reviewerId ? String(submission.reviewerId) : '',
    reviewerName: submission?.reviewerName ? String(submission.reviewerName) : '',
    reviewVersion: Number(submission?.reviewVersion || 0),
    resubmitCount: Number(submission?.resubmitCount || 0),
    updatedAt: String(submission?.updatedAt || submission?.reviewedAt || submission?.submittedAt || ''),
  }
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
    requireVerifiedEmail,
    requireReviewerOrAdmin,
    requireModerator,
    upload,
    UPLOAD_DIR,
    path,
    ensurePlayerState,
    isUserEmailVerified,
    resolveSkinStationPreview,
    persistMojangSkinSync,
    triggerVlaSkinRefreshIfConfigured,
    markSubmissionDirty,
    markPlayerStateDirty,
    catalogItemById,
    mojangSkinSyncLimiter,
    markKvDirty,
    asyncHandler,
    crypto
  } = deps
  const requireModeratorSafe = typeof requireModerator === 'function'
    ? requireModerator
    : requireReviewerOrAdmin
  const pageResponse = typeof jsonPage === 'function'
    ? jsonPage
    : (res, payload) => res.json(payload)
  const okResponse = typeof jsonOk === 'function'
    ? jsonOk
    : (res, payload = {}, status = 200) => res
      .status(Number(status))
      .json({ ok: true, success: true, ...(payload && typeof payload === 'object' ? payload : {}) })
  const catalogStreamClients = new Set()

  function writeSseFrame(res, event, payload) {
    if (!res || typeof res.write !== 'function') return false
    try {
      res.write(`event: ${String(event || 'message')}\n`)
      res.write(`data: ${JSON.stringify(payload || {})}\n\n`)
      return true
    } catch {
      return false
    }
  }

  function closeCatalogStreamClient(client) {
    if (!client || client.closed) return
    client.closed = true
    if (client.heartbeatTimer) clearInterval(client.heartbeatTimer)
    if (client.pollTimer) clearInterval(client.pollTimer)
    catalogStreamClients.delete(client)
    if (client.res && !client.res.writableEnded) {
      try {
        client.res.end()
      } catch {
        // ignore
      }
    }
  }

  function notifyCatalogStream(reason = 'catalog_changed', extra = {}) {
    if (catalogStreamClients.size <= 0) return
    const snapshot = buildCatalogSyncSnapshot(crypto, getStore())
    const payload = {
      ...snapshot,
      reason: String(reason || 'catalog_changed'),
      emittedAt: new Date().toISOString(),
      ...extra,
    }
    for (const client of [...catalogStreamClients]) {
      if (!client || client.closed) {
        closeCatalogStreamClient(client)
        continue
      }
      const ok = writeSseFrame(client.res, 'catalog_sync', payload)
      if (!ok) {
        closeCatalogStreamClient(client)
        continue
      }
      client.lastVersion = snapshot.version
      client.lastSentAt = payload.emittedAt
    }
  }

  function roleSetOf(user) {
    return new Set(
      [
        ...(Array.isArray(user?.roles) ? user.roles : []),
        ...(user?.role ? [user.role] : []),
      ]
        .map((r) => String(r || '').toLowerCase())
        .filter(Boolean)
    )
  }

  function canReviewAnySubmission(user) {
    const roles = roleSetOf(user)
    return roles.has('admin') || roles.has('reviewer') || roles.has('moderator')
  }

  function canViewSubmission(user, submission) {
    if (!submission || !user) return false
    if (String(submission.userId || '') === String(user.id || '')) return true
    return canReviewAnySubmission(user)
  }

  function parseExpectedVersionOrFail(res, rawValue) {
    const parsed = parseExpectedReviewVersion(rawValue)
    if (parsed.valid) return parsed
    jsonErr(res, 400, 'expectedVersion 必须为大于等于 0 的整数', 'validation_error', {
      field: 'expectedVersion',
      reason: 'invalid_integer',
    })
    return null
  }

  function rejectVersionConflict(res, submission, parsedExpectedVersion, submissionId) {
    if (!parsedExpectedVersion?.provided) return false
    const actualVersion = ensureSubmissionReviewVersion(submission)
    if (parsedExpectedVersion.value === actualVersion) return false
    jsonErr(res, 409, '版本冲突，请刷新后重试', 'version_conflict', {
      submissionId: String(submissionId || ''),
      expectedVersion: parsedExpectedVersion.value,
      actualVersion,
    })
    return true
  }

  function resolveSubmissionStatusOrFail(res, submission, submissionId, requestedAction) {
    const normalized = normalizeSubmissionReviewStatus(submission?.status)
    if (normalized) return normalized
    jsonErr(res, 409, '投稿状态异常，无法执行该操作', 'invalid_review_transition', {
      submissionId: String(submissionId || ''),
      currentStatus: String(submission?.status || ''),
      requestedAction: String(requestedAction || ''),
      allowedStatuses: SUBMISSION_REVIEW_STATUSES,
    })
    return ''
  }

  function rejectInvalidTransition(res, options = {}) {
    const {
      code = 'invalid_review_transition',
      message = '投稿状态不允许执行该操作',
      submissionId = '',
      currentStatus = '',
      requestedAction = '',
      requiredStatus = '',
      allowedFrom = [],
    } = options
    const details = {
      submissionId: String(submissionId || ''),
      currentStatus: String(currentStatus || ''),
      requestedAction: String(requestedAction || ''),
    }
    if (requiredStatus) details.requiredStatus = String(requiredStatus)
    if (Array.isArray(allowedFrom) && allowedFrom.length > 0) {
      details.allowedFrom = allowedFrom.map((row) => String(row || '')).filter(Boolean)
    }
    return jsonErr(res, 409, message, code, details)
  }

  function ensureUserNotificationsStore(store) {
    if (!store.userNotifications || typeof store.userNotifications !== 'object') {
      store.userNotifications = {}
    }
    return store.userNotifications
  }

  function summarizeNotificationTypes(list, options = {}) {
    const includeKnown = options.includeKnown !== false
    const map = new Map()
    for (const item of Array.isArray(list) ? list : []) {
      const type = String(item?.type || 'system').trim().toLowerCase() || 'system'
      const prev = map.get(type) || {
        type,
        label: String(NOTIFICATION_TYPE_LABELS[type] || type),
        total: 0,
        unread: 0,
      }
      prev.total += 1
      if (!item?.readAt) prev.unread += 1
      map.set(type, prev)
    }
    if (includeKnown) {
      for (const [type, label] of Object.entries(NOTIFICATION_TYPE_LABELS)) {
        if (map.has(type)) continue
        map.set(type, {
          type,
          label: String(label),
          total: 0,
          unread: 0,
        })
      }
    }
    return [...map.values()].sort((a, b) => {
      if (Number(b.unread || 0) !== Number(a.unread || 0)) {
        return Number(b.unread || 0) - Number(a.unread || 0)
      }
      if (Number(b.total || 0) !== Number(a.total || 0)) {
        return Number(b.total || 0) - Number(a.total || 0)
      }
      return String(a.type || '').localeCompare(String(b.type || ''))
    })
  }

  function pushUserNotification(store, userId, payload) {
    const uid = String(userId || '').trim()
    if (!uid) return null
    const notifications = ensureUserNotificationsStore(store)
    const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
    const item = {
      id: String(crypto.randomUUID()),
      userId: uid,
      type: String(payload?.type || 'system'),
      title: String(payload?.title || '系统通知'),
      message: String(payload?.message || ''),
      detail: payload?.detail ?? null,
      createdAt: new Date().toISOString(),
      readAt: null,
    }
    list.unshift(item)
    if (list.length > 300) list.length = 300
    notifications[uid] = list
    markKvDirty('user_notifications')
    return item
  }

  function ensureSkinCommentsStore(store) {
    if (!store.skinComments || typeof store.skinComments !== 'object') {
      store.skinComments = {}
    }
    return store.skinComments
  }

  function ensureSkinCommentLikesStore(store) {
    if (!store.skinCommentLikes || typeof store.skinCommentLikes !== 'object') {
      store.skinCommentLikes = {}
    }
    return store.skinCommentLikes
  }

  function ensureSkinInteractionLogsStore(store) {
    if (!Array.isArray(store.skinInteractionLogs)) {
      store.skinInteractionLogs = []
    }
    return store.skinInteractionLogs
  }

  function ensureSkinVersionHistoryStore(store) {
    if (!store.skinVersionHistory || typeof store.skinVersionHistory !== 'object') {
      store.skinVersionHistory = {}
    }
    return store.skinVersionHistory
  }

  function appendSkinInteractionLog(store, payload) {
    const logs = ensureSkinInteractionLogsStore(store)
    logs.unshift({
      id: String(crypto.randomUUID()),
      at: new Date().toISOString(),
      ...payload,
    })
    if (logs.length > 10000) logs.length = 10000
    markKvDirty('skin_interaction_logs')
  }

  function listSkinCommentLikes(store, commentId) {
    const likesMap = ensureSkinCommentLikesStore(store)
    const key = String(commentId || '')
    const list = Array.isArray(likesMap[key]) ? likesMap[key] : []
    likesMap[key] = list
    return list
  }

  function setSkinCommentLiked(store, commentId, userId, liked) {
    const key = String(commentId || '')
    const uid = String(userId || '')
    const list = listSkinCommentLikes(store, key)
    const exists = list.includes(uid)
    if (liked && !exists) list.unshift(uid)
    if (!liked && exists) {
      const next = list.filter((id) => String(id || '') !== uid)
      const likesMap = ensureSkinCommentLikesStore(store)
      likesMap[key] = next
    }
    markKvDirty('skin_comment_likes')
    const latest = listSkinCommentLikes(store, key)
    return { liked: latest.includes(uid), likeCount: latest.length }
  }

  function getSkinVersionRows(store, skinId) {
    const map = ensureSkinVersionHistoryStore(store)
    const key = String(skinId || '')
    const rows = Array.isArray(map[key]) ? map[key] : []
    map[key] = rows
    return rows
  }

  function snapshotFromCatalogItem(item, extra = {}) {
    return {
      id: String(crypto.randomUUID()),
      at: new Date().toISOString(),
      title: String(item?.title || item?.name || item?.id || '未命名'),
      description: String(item?.desc || item?.description || ''),
      model: String(item?.model || 'default'),
      skinUrl: String(item?.skinTextureUrl || item?.skinUrl || ''),
      capeUrl: String(item?.capeUrl || item?.capeTextureUrl || ''),
      previewUrl: String(item?.cover || item?.previewUrl || item?.skinTextureUrl || ''),
      tags: Array.isArray(item?.tags)
        ? item.tags.map((t) => String(t)).filter(Boolean)
        : (item?.tag ? [String(item.tag)] : []),
      source: {
        type: String(extra?.sourceType || item?.sourceType || 'catalog'),
        submissionId: extra?.submissionId ? String(extra.submissionId) : undefined,
        operatorId: extra?.operatorId ? String(extra.operatorId) : undefined,
        operatorName: extra?.operatorName ? String(extra.operatorName) : undefined,
        note: extra?.note ? String(extra.note) : '',
      },
      ...extra,
    }
  }

  function appendSkinVersion(store, skinId, snapshot) {
    const rows = getSkinVersionRows(store, skinId)
    rows.unshift(snapshot)
    if (rows.length > 200) rows.length = 200
    markKvDirty('skin_version_history')
  }

function sanitizeCommentText(raw) {
  return String(raw || '')
      .replace(/\r\n/g, '\n')
      .split('\u0000')
      .join('')
      .trim()
  }

  function isStaffUser(user) {
    return hasAnyRole(user, ['admin', 'reviewer', 'moderator'])
  }

  function findCommentById(store, commentId) {
    const key = String(commentId || '').trim()
    if (!key) return null
    const commentsMap = ensureSkinCommentsStore(store)
    for (const [skinId, list] of Object.entries(commentsMap)) {
      if (!Array.isArray(list)) continue
      const idx = list.findIndex((row) => String(row?.id || '') === key)
      if (idx >= 0) {
        return { skinId: String(skinId || ''), list, index: idx, item: list[idx] }
      }
    }
    return null
  }

  function isSkinLikedByUser(store, skinId, userId) {
    const sid = String(skinId || '')
    const uid = String(userId || '')
    const logs = ensureSkinInteractionLogsStore(store)
    for (const row of logs) {
      if (String(row?.skinId || '') !== sid) continue
      if (String(row?.userId || '') !== uid) continue
      const t = String(row?.type || '')
      if (t === 'skin_like') return true
      if (t === 'skin_unlike') return false
    }
    return false
  }

  function removeSubmissionCatalogEntry(store, submissionId) {
    const id = String(submissionId || '').trim()
    if (!id || !Array.isArray(store.catalog)) return false
    const before = store.catalog.length
    store.catalog = store.catalog.filter((item) => String(item?.id || '') !== `sub_${id}`)
    return store.catalog.length !== before
  }

  function ensureAsyncTasksStore(store) {
    if (!Array.isArray(store.asyncTasks)) store.asyncTasks = []
    return store.asyncTasks
  }

  function appendAsyncTask(store, payload) {
    const tasks = ensureAsyncTasksStore(store)
    tasks.unshift({
      id: String(crypto.randomUUID()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload,
    })
    if (tasks.length > 1000) tasks.length = 1000
    markKvDirty('async_tasks')
    return tasks[0]
  }

  // ============ 公开皮肤目录（支持搜索/模型/分页） ============

  app.get('/api/skins/share/:code', (req, res) => {
    const code = String(req.params.code || '').trim()
    if (!code) return jsonErr(res, 400, '缺少分享码', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.shareCode || i.id || '') === code)
    if (!item) return jsonErr(res, 404, '分享内容不存在', 'not_found')
    res.json({ item: normalizeLibraryItem(item) })
  })


  app.post('/api/skins/report', requireUser, requireVerifiedEmail, (req, res) => {
    const skinId = String(req.body?.skinId || '').trim()
    const reason = String(req.body?.reason || '').trim()
    const detail = String(req.body?.detail || '').trim()
    if (!skinId || !reason) return jsonErr(res, 400, '缺少举报参数', 'validation_error')
    const store = getStore()
    const source = (store.catalog || []).find((i) => String(i.id || '') === skinId) || null
    if (!Array.isArray(store.skinReports)) store.skinReports = []
    const normalizedReason = ['copyright', 'nsfw', 'spam', 'other'].includes(reason) ? reason : 'other'
    const report = {
      id: crypto.randomUUID(),
      skinId,
      skinName: source ? String(source.title || source.name || skinId) : skinId,
      reason: normalizedReason,
      detail,
      reporterUuid: req.user.uuid,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusText: '已提交，等待审核',
    }
    store.skinReports.push(report)
    if (store.skinReports.length > 5000) store.skinReports.length = 5000
    markKvDirty('skin_reports')
    scheduleSave()
    res.json({
      ok: true,
      message: '举报已提交',
      reportId: report.id,
      status: report.status,
      statusText: report.statusText,
    })
  })

  app.get('/api/skins/report/:id/status', requireUser, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少举报 id', 'validation_error')
    const store = getStore()
    const item = (store.skinReports || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '举报不存在', 'not_found')
    const isOwner = String(item.reporterUuid || '') === String(req.user.uuid || '')
    const canReadAny = hasAnyRole(req.user, ['admin', 'reviewer', 'moderator'])
    if (!isOwner && !canReadAny) {
      requireRolesOrJson(req, res, {
        roles: ['moderator', 'reviewer', 'admin'],
        message: '无权查看该举报状态',
        requiredCapability: 'moderate_reports',
      })
      return
    }
    res.json({
      ok: true,
      report: {
        id: item.id,
        skinId: item.skinId,
        status: item.status,
        statusText: item.statusText || '',
        reviewedBy: item.reviewedBy || undefined,
        reviewedAt: item.reviewedAt || undefined,
        reviewNote: item.reviewNote || undefined,
        updatedAt: item.updatedAt || item.createdAt,
      }
    })
  })

  app.get('/api/user/notifications', requireUser, (req, res) => {
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const uid = String(req.user?.id || '')
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const type = String(req.query.type || '').trim().toLowerCase()
    const unreadOnly = String(req.query.unreadOnly || '').trim().toLowerCase()
    let items = Array.isArray(notifications[uid]) ? [...notifications[uid]] : []
    if (type) items = items.filter((item) => String(item?.type || '').toLowerCase() === type)
    if (unreadOnly === '1' || unreadOnly === 'true') {
      items = items.filter((item) => !item?.readAt)
    }
    items.sort((a, b) => parseIsoMs(b?.createdAt) - parseIsoMs(a?.createdAt))
    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize)
    return pageResponse(res, { items: paged, total, page, pageSize })
  })

  app.get('/api/user/notifications/unread-count', requireUser, (req, res) => {
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const uid = String(req.user?.id || '')
    const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
    const count = list.filter((item) => !item?.readAt).length
    res.json({ ok: true, count })
  })

  app.get('/api/user/notifications/types', requireUser, (req, res) => {
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const uid = String(req.user?.id || '')
    const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
    const includeKnownRaw = String(req.query.includeKnown ?? 'true').trim().toLowerCase()
    const includeKnown = !['0', 'false', 'no'].includes(includeKnownRaw)
    const items = summarizeNotificationTypes(list, { includeKnown })
    res.json({
      ok: true,
      items,
      total: items.reduce((sum, row) => sum + Number(row?.total || 0), 0),
      unread: items.reduce((sum, row) => sum + Number(row?.unread || 0), 0),
    })
  })

  app.patch('/api/user/notifications/:id/read', requireUser, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少通知 id', 'validation_error')
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const uid = String(req.user?.id || '')
    const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
    const item = list.find((n) => String(n?.id || '') === id)
    if (!item) return jsonErr(res, 404, '通知不存在', 'not_found')
    if (!item.readAt) {
      item.readAt = new Date().toISOString()
      markKvDirty('user_notifications')
      scheduleSave()
    }
    res.json({ ok: true, id, readAt: item.readAt })
  })

  app.post('/api/user/notifications/read-all', requireUser, (req, res) => {
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const uid = String(req.user?.id || '')
    const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
    const now = new Date().toISOString()
    let changed = 0
    for (const item of list) {
      if (!item?.readAt) {
        item.readAt = now
        changed += 1
      }
    }
    if (changed > 0) {
      markKvDirty('user_notifications')
      scheduleSave()
    }
    res.json({ ok: true, updated: changed })
  })

  app.get('/api/user/creator-follows', requireUser, (req, res) => {
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const items = listFollowedCreatorRecords(ps)
      .map((record) => {
        const profile = buildCreatorProfile(store, record.creatorName, ps)
        return profile ? { ...profile, followedAt: record.followedAt } : null
      })
      .filter(Boolean)
      .sort((a, b) => parseIsoMs(b.followedAt) - parseIsoMs(a.followedAt))
    const total = items.length
    const start = (page - 1) * pageSize
    return pageResponse(res, { items: items.slice(start, start + pageSize), total, page, pageSize })
  })

  app.get('/api/user/creator-feed', requireUser, (req, res) => {
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const items = listFollowedCreatorRecords(ps)
      .map((record) => {
        const profile = buildCreatorProfile(store, record.creatorName, ps)
        if (!profile) return null
        return {
          creatorName: profile.name,
          followedAt: record.followedAt,
          latestAt: profile.latestAt,
          profile,
          latestWorks: profile.sampleSkins || [],
          recentActivity: buildCreatorActivity(store, profile.name, profile.sampleSkins || []),
        }
      })
      .filter(Boolean)
      .sort((a, b) => parseIsoMs(b.latestAt || b.followedAt) - parseIsoMs(a.latestAt || a.followedAt))
    const total = items.length
    const start = (page - 1) * pageSize
    return pageResponse(res, { items: items.slice(start, start + pageSize), total, page, pageSize })
  })

  app.get('/api/skins/favorites', requireUser, (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
    const store = getStore()
    const favorites = Array.isArray(store.userFavorites?.[req.user.id]) ? store.userFavorites[req.user.id] : []
    const items = favorites.map((item) => ({
      id: String(item.id || ''),
      skinId: String(item.skinId || ''),
      skinName: String(item.skinName || ''),
      skinUrl: String(item.skinUrl || ''),
      previewUrl: item.previewUrl ? String(item.previewUrl) : undefined,
      model: item.model ? String(item.model) : undefined,
      tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t)).filter(Boolean) : [],
      createdAt: String(item.createdAt || '')
    }))
    const total = items.length
    const paged = items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    return pageResponse(res, { items: paged, total, page, pageSize })
  })

  app.get('/api/skins/favorites/check', requireUser, (req, res) => {
    const skinId = String(req.query.skinId || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 skinId', 'validation_error')
    const store = getStore()
    const favorites = Array.isArray(store.userFavorites?.[req.user.id]) ? store.userFavorites[req.user.id] : []
    res.json({ isFavorite: favorites.some((item) => String(item.skinId || '') === skinId) })
  })

  app.post('/api/skins/favorites', requireUser, requireVerifiedEmail, (req, res) => {
    const skinId = String(req.body?.skinId || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 skinId', 'validation_error')
    const store = getStore()
    const source = catalogItemById(store, skinId)
    if (!source) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    if (!store.userFavorites || typeof store.userFavorites !== 'object') store.userFavorites = {}
    const list = Array.isArray(store.userFavorites[req.user.id]) ? store.userFavorites[req.user.id] : []
    if (!list.some((item) => String(item.skinId || '') === skinId)) {
      list.unshift({
        id: crypto.randomUUID(),
        skinId,
        skinName: String(source.title || source.name || skinId),
        skinUrl: String(source.skinTextureUrl || source.skinUrl || ''),
        previewUrl: String(source.cover || source.previewUrl || source.skinTextureUrl || ''),
        model: String(source.model || 'default'),
        tags: Array.isArray(source.tags) ? source.tags.map((t) => String(t)).filter(Boolean) : source.tag ? [String(source.tag)] : [],
        createdAt: new Date().toISOString()
      })
      store.userFavorites[req.user.id] = list
      const row = getSkinMetrics(store, skinId)
      patchSkinMetric(store, skinId, { ...row, favorites: countFavoritesForSkin(store, skinId) })
      markKvDirty('user_favorites')
      markKvDirty('skin_metrics')
      appendSkinInteractionLog(store, {
        skinId,
        type: 'favorite_add',
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
      })
      scheduleSave()
    }
    res.json({ ok: true, message: '收藏成功' })
  })

  app.delete('/api/skins/favorites/:skinId', requireUser, requireVerifiedEmail, (req, res) => {
    const skinId = String(req.params.skinId || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 skinId', 'validation_error')
    const store = getStore()
    const list = Array.isArray(store.userFavorites?.[req.user.id]) ? store.userFavorites[req.user.id] : []
    const next = list.filter((item) => String(item.skinId || '') !== skinId)
    if (!store.userFavorites || typeof store.userFavorites !== 'object') store.userFavorites = {}
    store.userFavorites[req.user.id] = next
    const row = getSkinMetrics(store, skinId)
    patchSkinMetric(store, skinId, { ...row, favorites: countFavoritesForSkin(store, skinId) })
    markKvDirty('user_favorites')
    markKvDirty('skin_metrics')
    appendSkinInteractionLog(store, {
      skinId,
      type: 'favorite_remove',
      userId: String(req.user?.id || ''),
      username: String(req.user?.username || ''),
    })
    scheduleSave()
    res.json({ ok: true, message: '已取消收藏' })
  })

  app.patch('/api/skins/favorites/batch', requireUser, requireVerifiedEmail, (req, res) => {
    const store = getStore()
    const ids = Array.isArray(req.body?.skinIds) ? req.body.skinIds.map((id) => String(id || '').trim()).filter(Boolean) : []
    if (ids.length === 0) return jsonErr(res, 400, '缺少 skinIds', 'validation_error')
    if (!store.userFavorites || typeof store.userFavorites !== 'object') store.userFavorites = {}
    const list = Array.isArray(store.userFavorites[req.user.id]) ? store.userFavorites[req.user.id] : []
    const nextMap = new Map(list.map((item) => [String(item.skinId || ''), { ...item }]))
    const group = String(req.body?.group || '').trim()
    const note = String(req.body?.note || '').trim()
    const updatedIds = []
    for (const skinId of ids) {
      const item = nextMap.get(skinId)
      if (!item) continue
      if (group) item.group = group
      if (note) item.note = note
      item.updatedAt = new Date().toISOString()
      nextMap.set(skinId, item)
      updatedIds.push(skinId)
    }
    const next = Array.from(nextMap.values())
    store.userFavorites[req.user.id] = next
    markKvDirty('user_favorites')
    scheduleSave()
    res.json({ ok: true, items: next.filter((item) => updatedIds.includes(String(item.skinId || ''))), removedSkinIds: [] })
  })

  app.get('/api/skins/:id/comments', (req, res) => {
    const skinId = String(req.params.id || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i?.id || '') === skinId)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')

    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const commentsMap = ensureSkinCommentsStore(store)
    const rows = Array.isArray(commentsMap[skinId]) ? commentsMap[skinId] : []
    commentsMap[skinId] = rows
    let filtered = rows.filter((row) => String(row?.status || 'active') !== 'deleted')
    filtered = filtered
      .slice()
      .sort((a, b) => parseIsoMs(b?.createdAt || b?.updatedAt) - parseIsoMs(a?.createdAt || a?.updatedAt))
    const total = filtered.length
    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize).map((row) => {
      const likeList = listSkinCommentLikes(store, row?.id)
      return {
        id: String(row?.id || ''),
        skinId,
        userId: String(row?.userId || ''),
        username: String(row?.username || ''),
        content: String(row?.content || ''),
        status: String(row?.status || 'active'),
        createdAt: String(row?.createdAt || ''),
        updatedAt: String(row?.updatedAt || row?.createdAt || ''),
        deletedAt: row?.deletedAt ? String(row.deletedAt) : null,
        parentCommentId: row?.parentCommentId ? String(row.parentCommentId) : null,
        parentUsername: row?.parentUsername ? String(row.parentUsername) : null,
        parentAuthorBadge: row?.parentAuthorBadge ? String(row.parentAuthorBadge) : null,
        pinnedAt: row?.pinnedAt ? String(row.pinnedAt) : null,
        pinnedByUserId: row?.pinnedByUserId ? String(row.pinnedByUserId) : null,
        pinnedByUsername: row?.pinnedByUsername ? String(row.pinnedByUsername) : null,
        likeCount: likeList.length,
        likedByMe: likeList.includes(String(req.user?.id || '')),
      }
    })
    return pageResponse(res, { skinId, items, total, page, pageSize })
  })

  app.post('/api/skins/:id/comments', requireUser, requireVerifiedEmail, (req, res) => {
    const skinId = String(req.params.id || '').trim()
    if (!skinId) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const content = sanitizeCommentText(req.body?.content || '')
    const parentCommentId = String(req.body?.parentCommentId || '').trim()
    if (!content) return jsonErr(res, 400, '评论内容不能为空', 'validation_error')
    if (content.length > 500) return jsonErr(res, 400, '评论内容不能超过 500 字', 'validation_error')

    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i?.id || '') === skinId)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')

    const commentsMap = ensureSkinCommentsStore(store)
    const list = Array.isArray(commentsMap[skinId]) ? commentsMap[skinId] : []
    const parent = parentCommentId ? list.find((row) => String(row?.id || '') === parentCommentId && String(row?.status || 'active') !== 'deleted') : null
    if (parentCommentId && !parent) return jsonErr(res, 404, '回复目标不存在', 'not_found')
    const now = new Date().toISOString()
    const comment = {
      id: String(crypto.randomUUID()),
      skinId,
      userId: String(req.user?.id || ''),
      username: String(req.user?.username || ''),
      parentCommentId: parent ? String(parent.id || '') : null,
      parentUsername: parent ? String(parent.username || '') : null,
      content,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    list.unshift(comment)
    if (list.length > 2000) list.length = 2000
    commentsMap[skinId] = list
    appendSkinInteractionLog(store, {
      skinId,
      type: 'comment_create',
      commentId: comment.id,
      userId: String(req.user?.id || ''),
      username: String(req.user?.username || ''),
    })
    if (String(item?.uploaderId || '') && String(item?.uploaderId || '') !== String(req.user?.id || '')) {
      pushUserNotification(store, String(item.uploaderId), {
        type: 'skin_comment',
        title: '你的皮肤收到了新评论',
        message: `皮肤「${String(item?.title || item?.name || skinId)}」收到来自 ${String(req.user?.username || '用户')} 的评论`,
        detail: {
          skinId,
          commentId: comment.id,
        },
      })
    }
    markKvDirty('skin_comments')
    scheduleSave()
    res.status(201).json({ ok: true, item: { ...comment, likeCount: 0 } })
  })

  app.post('/api/skins/comments/:commentId/report', requireUser, requireVerifiedEmail, (req, res) => {
    const commentId = String(req.params.commentId || '').trim()
    if (!commentId) return jsonErr(res, 400, '缺少 commentId', 'validation_error')
    const store = getStore()
    const located = findCommentById(store, commentId)
    if (!located || !located.item) return jsonErr(res, 404, '评论不存在', 'not_found')
    const reason = String(req.body?.reason || 'other').trim() || 'other'
    const detail = String(req.body?.detail || '').trim()
    if (!Array.isArray(store.skinReports)) store.skinReports = []
    const report = {
      id: crypto.randomUUID(),
      skinId: located.skinId,
      skinName: located.skinId,
      reason: 'comment',
      detail: JSON.stringify({ commentId, reason, detail }),
      reporterUuid: req.user.uuid,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusText: '已提交，等待审核',
    }
    store.skinReports.push(report)
    if (store.skinReports.length > 5000) store.skinReports.length = 5000
    markKvDirty('skin_reports')
    scheduleSave()
    res.json({ ok: true, reportId: report.id, status: report.status })
  })

  app.post('/api/skins/comments/:commentId/pin', requireUser, requireModeratorSafe, (req, res) => {
    const commentId = String(req.params.commentId || '').trim()
    if (!commentId) return jsonErr(res, 400, '缺少 commentId', 'validation_error')
    const store = getStore()
    const located = findCommentById(store, commentId)
    if (!located || !located.item) return jsonErr(res, 404, '评论不存在', 'not_found')
    if (located.item.parentCommentId) return jsonErr(res, 400, '只能置顶一级评论', 'validation_error')
    located.item.pinnedAt = new Date().toISOString()
    located.item.pinnedByUserId = String(req.user?.id || '')
    located.item.pinnedByUsername = String(req.user?.username || '')
    located.item.updatedAt = located.item.pinnedAt
    markKvDirty('skin_comments')
    appendSkinInteractionLog(store, {
      skinId: located.skinId,
      type: 'comment_pin',
      commentId,
      userId: String(req.user?.id || ''),
      username: String(req.user?.username || ''),
    })
    scheduleSave()
    res.json({ ok: true, pinned: true, commentId })
  })

  app.delete('/api/skins/comments/:commentId/pin', requireUser, requireModeratorSafe, (req, res) => {
    const commentId = String(req.params.commentId || '').trim()
    if (!commentId) return jsonErr(res, 400, '缺少 commentId', 'validation_error')
    const store = getStore()
    const located = findCommentById(store, commentId)
    if (!located || !located.item) return jsonErr(res, 404, '评论不存在', 'not_found')
    located.item.pinnedAt = null
    located.item.pinnedByUserId = null
    located.item.pinnedByUsername = null
    located.item.updatedAt = new Date().toISOString()
    markKvDirty('skin_comments')
    appendSkinInteractionLog(store, {
      skinId: located.skinId,
      type: 'comment_unpin',
      commentId,
      userId: String(req.user?.id || ''),
      username: String(req.user?.username || ''),
    })
    scheduleSave()
    res.json({ ok: true, pinned: false, commentId })
  })

  app.delete('/api/skins/comments/:commentId', requireUser, (req, res) => {
    const commentId = String(req.params.commentId || '').trim()
    if (!commentId) return jsonErr(res, 400, '缺少 commentId', 'validation_error')
    const store = getStore()
    const located = findCommentById(store, commentId)
    if (!located || !located.item) return jsonErr(res, 404, '评论不存在', 'not_found')
    const isOwner = String(located.item?.userId || '') === String(req.user?.id || '')
    if (!isOwner && !isStaffUser(req.user)) {
      return jsonErr(res, 403, '无权删除该评论', 'forbidden')
    }
    if (String(located.item?.status || 'active') !== 'deleted') {
      located.item.status = 'deleted'
      located.item.deletedAt = new Date().toISOString()
      located.item.deletedByUserId = String(req.user?.id || '')
      located.item.updatedAt = located.item.deletedAt
      markKvDirty('skin_comments')
      appendSkinInteractionLog(store, {
        skinId: located.skinId,
        type: 'comment_delete',
        commentId,
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
      })
      scheduleSave()
    }
    res.json({ ok: true, deleted: true, id: commentId })
  })

  app.post('/api/skins/comments/:commentId/like', requireUser, requireVerifiedEmail, (req, res) => {
    const commentId = String(req.params.commentId || '').trim()
    if (!commentId) return jsonErr(res, 400, '缺少 commentId', 'validation_error')
    const store = getStore()
    const located = findCommentById(store, commentId)
    if (!located || !located.item || String(located.item?.status || 'active') === 'deleted') {
      return jsonErr(res, 404, '评论不存在', 'not_found')
    }
    const beforeLiked = listSkinCommentLikes(store, commentId).includes(String(req.user?.id || ''))
    const result = setSkinCommentLiked(store, commentId, req.user?.id, true)
    if (!beforeLiked && result.liked) {
      const row = getSkinMetrics(store, located.skinId)
      patchSkinMetric(store, located.skinId, {
        ...row,
        likes: row.likes + 1,
        favorites: countFavoritesForSkin(store, located.skinId),
      })
      markKvDirty('skin_metrics')
      appendSkinInteractionLog(store, {
        skinId: located.skinId,
        type: 'comment_like',
        commentId,
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
      })
      scheduleSave()
    }
    res.json({
      ok: true,
      commentId,
      skinId: located.skinId,
      liked: result.liked,
      likeCount: result.likeCount,
    })
  })

  app.delete('/api/skins/comments/:commentId/like', requireUser, requireVerifiedEmail, (req, res) => {
    const commentId = String(req.params.commentId || '').trim()
    if (!commentId) return jsonErr(res, 400, '缺少 commentId', 'validation_error')
    const store = getStore()
    const located = findCommentById(store, commentId)
    if (!located || !located.item || String(located.item?.status || 'active') === 'deleted') {
      return jsonErr(res, 404, '评论不存在', 'not_found')
    }
    const beforeLiked = listSkinCommentLikes(store, commentId).includes(String(req.user?.id || ''))
    const result = setSkinCommentLiked(store, commentId, req.user?.id, false)
    if (beforeLiked && !result.liked) {
      const row = getSkinMetrics(store, located.skinId)
      patchSkinMetric(store, located.skinId, {
        ...row,
        likes: Math.max(0, row.likes - 1),
        favorites: countFavoritesForSkin(store, located.skinId),
      })
      markKvDirty('skin_metrics')
      appendSkinInteractionLog(store, {
        skinId: located.skinId,
        type: 'comment_unlike',
        commentId,
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
      })
      scheduleSave()
    }
    res.json({
      ok: true,
      commentId,
      skinId: located.skinId,
      liked: result.liked,
      likeCount: result.likeCount,
    })
  })

  app.get('/api/admin/skins/reports', requireUser, requireModeratorSafe, (req, res) => {
    const store = getStore()
    const statusFilter = String(req.query.status || '').trim().toLowerCase()
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    let items = Array.isArray(store.skinReports) ? [...store.skinReports] : []
    if (statusFilter && statusFilter !== 'all') {
      items = items.filter((i) => String(i.status || '').toLowerCase() === statusFilter)
    }
    items = items.sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')))
    const total = items.length
    const paged = items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize).map((i) => ({
      id: i.id,
      skinId: i.skinId,
      skinName: i.skinName || i.skinId,
      reporterUuid: i.reporterUuid,
      reason: i.reason,
      detail: i.detail || '',
      status: i.status,
      reviewedBy: i.reviewedBy,
      reviewedAt: i.reviewedAt,
      reviewNote: i.reviewNote,
      createdAt: i.createdAt
    }))
    return pageResponse(res, { items: paged, total, page, pageSize })
  })

  app.get('/api/admin/skins/reports/stats', requireUser, requireModeratorSafe, (req, res) => {
    const store = getStore()
    const items = Array.isArray(store.skinReports) ? store.skinReports : []
    return res.json({
      ok: true,
      stats: buildSkinReportStatsRows(items)
    })
  })

  app.patch('/api/admin/skins/reports/:id', requireUser, requireModeratorSafe, (req, res) => {
    const id = String(req.params.id || '').trim()
    const action = String(req.body?.action || '').trim().toLowerCase()
    const note = String(req.body?.note || '').trim()
    const store = getStore()
    const item = (store.skinReports || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '举报不存在', 'not_found')
    if (!['approve', 'dismiss'].includes(action)) return jsonErr(res, 400, '无效 action', 'validation_error')
    item.status = action === 'approve' ? 'reviewed' : 'dismissed'
    item.statusText = action === 'approve' ? '举报已处理' : '举报已驳回'
    item.reviewedBy = req.user.username
    item.reviewedAt = new Date().toISOString()
    item.updatedAt = item.reviewedAt
    item.reviewNote = note || item.reviewNote || ''
    const reporter = (store.users || []).find((u) => String(u?.uuid || '') === String(item.reporterUuid || ''))
    if (reporter?.id) {
      pushUserNotification(store, reporter.id, {
        type: 'report_result',
        title: action === 'approve' ? '举报处理完成' : '举报已驳回',
        message: action === 'approve'
          ? `你提交的举报「${item.skinName || item.skinId}」已处理`
          : `你提交的举报「${item.skinName || item.skinId}」未通过`,
        detail: {
          reportId: item.id,
          status: item.status,
          reviewNote: item.reviewNote || '',
          reviewedAt: item.reviewedAt,
        },
      })
    }
    markKvDirty('skin_reports')
    scheduleSave()
    res.json({ ok: true, id, status: item.status })
  })

  app.get('/api/skins/catalog', (req, res) => {
    const store = getStore()
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
    const since = String(req.query.since || '').trim()
    const filters = catalogQueryFilters(req.query)

    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const version = buildCatalogVersion(crypto, catalog, store.catalogSyncedAt)
    const etag = `"catalog-${version}"`
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    const filteredItems = filterCatalogItems(catalog, req.query)
    const items = sortCatalogItems(store, filteredItems, filters.sort)

    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize).map((item) => catalogListItem(store, item))

    const sinceMs = parseIsoMs(since)
    const changedItems = sinceMs > 0
      ? items.filter((i) => parseIsoMs(i?.updatedAt || i?.createdAt) > sinceMs)
      : []
    const tagLimit = Math.max(1, Math.min(100, Number(req.query.tagLimit) || 24))

    res.setHeader('ETag', etag)
    res.setHeader('Last-Modified', catalogLastModified(catalog, store.catalogSyncedAt))
    res.setHeader('X-Catalog-Version', version)
    pageResponse(res, {
      items: paged,
      total,
      page,
      pageSize,
      facets: buildCatalogFacets(filteredItems, { tagLimit }),
      sync: {
        syncedAt: store.catalogSyncedAt,
        version,
        changedCount: changedItems.length,
      },
      changedSince: sinceMs > 0
        ? {
            since,
            count: changedItems.length,
            items: changedItems.slice(0, 200).map((i) => normalizeLibraryItem(i)),
          }
        : undefined,
    })
  })

  app.get('/api/skins/categories', (req, res) => {
    const store = getStore()
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const items = filterCatalogItems(catalog, req.query)
    const tagLimit = Math.max(1, Math.min(100, Number(req.query.tagLimit) || 24))
    res.json({
      ok: true,
      total: items.length,
      facets: buildCatalogFacets(items, { tagLimit }),
    })
  })

  app.get('/api/skins/catalog/changes', (req, res) => {
    const store = getStore()
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const since = String(req.query.since || '').trim()
    const sinceMs = parseIsoMs(since)
    if (!sinceMs) {
      return jsonErr(res, 400, '缺少或无效 since 参数（ISO 时间）', 'validation_error')
    }
    const changed = catalog
      .filter((i) => parseIsoMs(i?.updatedAt || i?.createdAt) > sinceMs)
      .map((i) => normalizeLibraryItem(i))
      .slice(0, 500)
    const version = buildCatalogVersion(crypto, catalog, store.catalogSyncedAt)
    res.json({
      ok: true,
      since,
      syncedAt: store.catalogSyncedAt,
      version,
      count: changed.length,
      items: changed,
    })
  })

  app.get('/api/skins/catalog/:id', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i?.id || '') === id)
    if (!item) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    res.json(normalizeLibraryItem(item))
  })

  app.get('/api/skins/collections', (req, res) => {
    const store = getStore()
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const items = filterCatalogItems(catalog, req.query)
    const collections = buildCatalogCollections(store, items)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50))
    const start = (page - 1) * pageSize
    return pageResponse(res, {
      items: collections.slice(start, start + pageSize).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        hero: row.hero,
        tags: row.tags,
        theme: row.theme,
        featuredIds: row.featuredIds,
        itemCount: row.itemCount,
        heat: row.heat,
        latestAt: row.latestAt,
      })),
      total: collections.length,
      page,
      pageSize,
    })
  })

  app.get('/api/skins/collections/:id', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少专题 id', 'validation_error')
    const store = getStore()
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const collections = buildCatalogCollections(store, filterCatalogItems(catalog, req.query))
    const item = collections.find((row) => sameCatalogFacetValue(row.id, id))
    if (!item) return jsonErr(res, 404, '专题不存在', 'not_found')
    res.json({ ok: true, item })
  })

  app.get('/api/skins/search/suggestions', (req, res) => {
    const store = getStore()
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const q = String(req.query.q || req.query.search || '').trim()
    const keyword = q.toLowerCase()
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 10))
    if (!keyword) return res.json({ ok: true, suggestions: [] })

    const rows = []
    const seen = new Set()
    const addSuggestion = (type, value, id = value, score = 0) => {
      const text = String(value || '').trim()
      if (!text || !catalogTextIncludes(text, keyword)) return
      const key = `${type}:${text.toLowerCase()}`
      if (seen.has(key)) return
      seen.add(key)
      rows.push({ type, value: text, id: String(id || text), score })
    }

    for (const item of filterCatalogItems(catalog, { ...req.query, q: '', search: '' })) {
      const title = String(item?.title || item?.name || item?.id || '').trim()
      addSuggestion('skin', title, item?.id, title.toLowerCase().startsWith(keyword) ? 20 : 10)
      addSuggestion('creator', creatorNameForCatalogItem(item), creatorNameForCatalogItem(item), 8)
      addSuggestion('collection', catalogCollectionIdForItem(item), catalogCollectionIdForItem(item), 6)
      for (const tag of listCatalogTags(item)) addSuggestion('tag', tag, tag, 5)
    }

    rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.value.localeCompare(b.value, 'zh-Hans-CN'))
    res.json({
      ok: true,
      suggestions: rows.slice(0, limit).map(({ type, value, id }) => ({ type, value, id })),
    })
  })

  app.get('/api/skins/honor-board', (req, res) => {
    const store = getStore()
    const now = new Date()
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const honorSkins = catalog
      .filter((item) => Boolean(item?.skinTextureUrl))
      .map((item) => honorSkinFromCatalogItem(store, item, store.catalogSyncedAt))

    const sorted = honorSkins.slice().sort((a, b) => (
      Number(b.honorScore || 0) - Number(a.honorScore || 0) ||
      parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt) ||
      a.name.localeCompare(b.name, 'zh-Hans-CN')
    ))
    const skinById = new Map(honorSkins.map((item) => [String(item.id), item]))
    const creatorHonors = buildCreatorHonors(honorSkins)
    const collectionHonors = buildCollectionHonors(honorSkins)
    const challenges = buildHonorChallenges(collectionHonors)

    res.json({
      ok: true,
      season: {
        id: 'current',
        title: '星辉皮肤荣誉殿堂',
        theme: '服务器文化主题',
        description: '把公开互动、创作者贡献和主题投稿汇成可见荣誉，让玩家知道什么正在被看见。',
        startsAt: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        endsAt: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
        submitUrl: '/skins/studio',
      },
      podium: sorted.slice(0, 3).map((item, index) => ({
        rank: index + 1,
        badge: index === 0 ? 'Crown' : index === 1 ? 'Spotlight' : 'Rising',
        reason: `荣誉分 ${Number(item.honorScore || 0)}`,
        item,
      })),
      rising: sorted.slice(0, 6),
      creatorHonors,
      collectionHonors,
      challenges,
      recentActivity: buildRecentHonorActivity(store, skinById),
      metrics: {
        totalItems: honorSkins.length,
        totalCreators: creatorHonors.length,
        totalCollections: collectionHonors.length,
        totalChallenges: challenges.length,
        totalHonorScore: honorSkins.reduce((sum, item) => sum + Number(item.honorScore || 0), 0),
      },
    })
  })

  app.get('/api/skins/creators/:name', (req, res) => {
    const name = String(req.params.name || '').trim()
    if (!name) return jsonErr(res, 400, '缺少创作者名称', 'validation_error')
    const store = getStore()
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 36))
    const sort = String(req.query.sort || 'popular').trim().toLowerCase()
    const profile = buildCreatorProfile(store, name)
    if (!profile) return jsonErr(res, 404, '创作者不存在', 'not_found')
    let items = (profile.sampleSkins || [])
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    items = catalog
      .filter((item) => Boolean(item?.skinTextureUrl))
      .filter((item) => creatorMatches(item, profile.name))
      .map((item) => honorSkinFromCatalogItem(store, item, store.catalogSyncedAt))
    items.sort((a, b) => {
      if (sort === 'latest') return parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt)
      if (sort === 'downloads') return Number(b.metrics?.downloads || 0) - Number(a.metrics?.downloads || 0)
      return Number(b.honorScore || 0) - Number(a.honorScore || 0) || parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt)
    })
    const total = items.length
    const start = (page - 1) * pageSize
    const relatedCreators = [...new Set(catalog
      .filter((item) => Boolean(item?.skinTextureUrl))
      .map((item) => creatorNameForCatalogItem(item))
      .filter((creator) => creatorKey(creator) && creatorKey(creator) !== creatorKey(profile.name)))]
      .map((creator) => buildCreatorProfile(store, creator))
      .filter(Boolean)
      .sort((a, b) => Number(b.heat || 0) - Number(a.heat || 0))
      .slice(0, 6)
    res.json({
      ok: true,
      profile,
      items: items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      recentActivity: buildCreatorActivity(store, profile.name, items),
      relatedCreators,
    })
  })

  app.post('/api/skins/creators/:name/follow', requireUser, requireVerifiedEmail, (req, res) => {
    const name = String(req.params.name || '').trim()
    if (!name) return jsonErr(res, 400, '缺少创作者名称', 'validation_error')
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const profile = buildCreatorProfile(store, name, ps)
    if (!profile) return jsonErr(res, 404, '创作者不存在', 'not_found')
    const follows = ensureCreatorFollows(ps)
    const existing = creatorFollowRecord(ps, profile.name)
    if (!existing) {
      follows.unshift({
        creatorName: profile.name,
        followedAt: new Date().toISOString(),
      })
      if (follows.length > 200) follows.length = 200
      markPlayerStateDirty(req.user.id)
      scheduleSave()
    }
    res.json({
      ok: true,
      followedByMe: true,
      followerCount: creatorFollowerCount(store, profile.name),
    })
  })

  app.delete('/api/skins/creators/:name/follow', requireUser, requireVerifiedEmail, (req, res) => {
    const name = String(req.params.name || '').trim()
    if (!name) return jsonErr(res, 400, '缺少创作者名称', 'validation_error')
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const profile = buildCreatorProfile(store, name, ps)
    if (!profile) return jsonErr(res, 404, '创作者不存在', 'not_found')
    const follows = ensureCreatorFollows(ps)
    const next = follows.filter((row) => creatorKey(row?.creatorName || row?.name) !== creatorKey(profile.name))
    if (next.length !== follows.length) {
      ps.creatorFollows = next
      markPlayerStateDirty(req.user.id)
      scheduleSave()
    }
    res.json({
      ok: true,
      followedByMe: false,
      followerCount: creatorFollowerCount(store, profile.name),
    })
  })

  app.get('/api/skins/tags/popular', (req, res) => {
    const store = getStore()
    const counter = new Map()
    for (const item of store.catalog || []) {
      for (const tag of collectSkinTags(item)) {
        counter.set(tag, (counter.get(tag) || 0) + 1)
      }
    }
    const tags = [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([tag]) => tag)
    res.json({ tags })
  })

  app.get('/api/skins/library/search', (req, res) => {
    const store = getStore()
    const keyword = String(req.query.q || '').trim().toLowerCase()
    const list = (store.catalog || [])
      .filter((i) => Boolean(i?.skinTextureUrl))
      .filter((i) => {
        if (!keyword) return true
        const title = String(i?.title || '').toLowerCase()
        const desc = String(i?.desc || '').toLowerCase()
        const tag = String(i?.tag || '').toLowerCase()
        const uploader = String(i?.uploaderName || '').toLowerCase()
        return title.includes(keyword) || desc.includes(keyword) || tag.includes(keyword) || uploader.includes(keyword)
      })
      .sort((a, b) => parseIsoMs(b?.updatedAt || b?.createdAt) - parseIsoMs(a?.updatedAt || a?.createdAt))
      .map((i) => ({
        ...normalizeLibraryItem(i),
        source: 'catalog',
        updatedAt: i?.updatedAt || i?.createdAt || '',
        skinAssetId: Number(i?.skinAssetId || 0),
        capeAssetId: Number(i?.capeAssetId || 0),
      }))

    const version = buildCatalogVersion(crypto, store.catalog || [], store.catalogSyncedAt)
    res.json({
      ok: true,
      items: list,
      sync: {
        syncedAt: store.catalogSyncedAt,
        version,
      }
    })
  })

  app.get('/api/skins/library/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const client = {
      id: String(crypto.randomUUID()),
      res,
      closed: false,
      lastVersion: '',
      lastSentAt: '',
      heartbeatTimer: null,
      pollTimer: null,
    }
    catalogStreamClients.add(client)

    const sendSnapshot = (event, reason) => {
      const snapshot = buildCatalogSyncSnapshot(crypto, getStore())
      const payload = {
        ...snapshot,
        reason: String(reason || 'catalog_changed'),
        emittedAt: new Date().toISOString(),
      }
      const ok = writeSseFrame(res, event, payload)
      if (ok) {
        client.lastVersion = snapshot.version
        client.lastSentAt = payload.emittedAt
      }
      return ok
    }

    // 首帧：返回当前目录版本，前端可据此立即对齐本地状态
    if (!sendSnapshot('hello', 'stream_opened')) {
      closeCatalogStreamClient(client)
      return
    }

    client.heartbeatTimer = setInterval(() => {
      const ok = writeSseFrame(res, 'heartbeat', {
        now: new Date().toISOString(),
        version: client.lastVersion,
      })
      if (!ok) closeCatalogStreamClient(client)
    }, 25000)

    // 轮询目录版本变化并推送增量信号（前端收到后自行拉取最新列表）
    client.pollTimer = setInterval(() => {
      if (client.closed) return
      const snapshot = buildCatalogSyncSnapshot(crypto, getStore())
      if (snapshot.version === client.lastVersion) return
      const ok = writeSseFrame(res, 'catalog_sync', {
        ...snapshot,
        reason: 'version_changed',
        emittedAt: new Date().toISOString(),
      })
      if (!ok) {
        closeCatalogStreamClient(client)
        return
      }
      client.lastVersion = snapshot.version
    }, 3000)

    const cleanup = () => closeCatalogStreamClient(client)
    req.on('close', cleanup)
    req.on('aborted', cleanup)
    req.on('end', cleanup)
  })

  app.post('/api/skins/library/sync', requireUser, requireVerifiedEmail, (req, res) => {
    const store = getStore()
    if (!Array.isArray(store.skinSyncTasks)) store.skinSyncTasks = []
    const startedAt = new Date().toISOString()
    const changedCount = Number(req.body?.changedCount) || 0
    const task = {
      id: crypto.randomUUID(),
      type: 'catalog_sync',
      status: 'completed',
      source: 'manual',
      startedAt,
      finishedAt: new Date().toISOString(),
      changedCount: Math.max(0, changedCount),
      triggeredBy: req.user.id,
    }
    store.skinSyncTasks.unshift(task)
    if (store.skinSyncTasks.length > 500) store.skinSyncTasks.length = 500
    const asyncTask = appendAsyncTask(store, {
      type: 'catalog_sync',
      status: task.status,
      source: task.source,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      changedCount: task.changedCount,
      triggeredBy: task.triggeredBy,
      refTaskId: task.id,
    })
    store.catalogSyncedAt = task.finishedAt
    const syncSnapshot = buildCatalogSyncSnapshot(crypto, store)
    markKvDirty('skin_sync_tasks')
    scheduleSave()
    notifyCatalogStream('sync_task_completed', {
      taskId: String(task.id || ''),
      changedCount: Number(task.changedCount || 0),
    })
    res.json({
      ok: true,
      message: '同步任务已完成',
      task,
      asyncTask,
      sync: syncSnapshot
    })
  })

  app.get('/api/skins/library/sync-status', (req, res) => {
    const store = getStore()
    const items = Array.isArray(store.skinSyncTasks) ? store.skinSyncTasks.slice(0, 20) : []
    const syncSnapshot = buildCatalogSyncSnapshot(crypto, store)
    res.json({
      ok: true,
      syncedAt: store.catalogSyncedAt,
      sync: syncSnapshot,
      latest: items[0] || null,
      items,
      realtime: {
        enabled: true,
        streamPath: '/api/skins/library/stream',
        activeClients: catalogStreamClients.size,
      }
    })
  })

  // ============ DELETE /api/skins/player/submissions/:id（本人取消 pending 投稿）============

  app.delete('/api/skins/player/submissions/:id', requireUser, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const idx = (store.submissions || []).findIndex(
      (s) => String(s?.id || '') === id && String(s?.userId || '') === String(req.user.id || '')
    )
    if (idx < 0) return jsonErr(res, 404, '投稿不存在或无权删除', 'not_found')
    const sub = store.submissions[idx]
    if (String(sub.status || '') !== 'pending') {
      return jsonErr(res, 409, '仅可取消待审核的投稿', 'not_pending')
    }
    store.submissions.splice(idx, 1)
    markSubmissionDirty(id)
    scheduleSave()
    res.json({ ok: true, message: '已取消投稿' })
  })

  // ============ POST /api/skins/player/submissions/:id/resubmit（本人申请重审）============

  app.post('/api/skins/player/submissions/:id/resubmit', requireUser, requireVerifiedEmail, (req, res) => {
    const id = String(req.params.id || '').trim()
    const note = String(req.body?.note || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    if (note.length > 200) return jsonErr(res, 400, '重审说明不能超过 200 字', 'validation_error')

    const store = getStore()
    const submission = (store.submissions || []).find(
      (s) => String(s?.id || '') === id && String(s?.userId || '') === String(req.user?.id || '')
    )
    if (!submission) return jsonErr(res, 404, '投稿不存在或无权操作', 'not_found')

    const currentStatus = resolveSubmissionStatusOrFail(res, submission, id, 'resubmit')
    if (!currentStatus) return
    if (currentStatus === 'pending') {
      return rejectInvalidTransition(res, {
        code: 'already_pending',
        message: '该投稿已处于待审核状态',
        submissionId: id,
        currentStatus,
        requestedAction: 'resubmit',
        allowedFrom: ['approved', 'rejected'],
      })
    }
    ensureSubmissionReviewVersion(submission)

    const now = new Date().toISOString()
    const removedPublished = currentStatus === 'approved' ? removeSubmissionCatalogEntry(store, submission.id) : false
    submission.status = 'pending'
    submission.reviewedAt = null
    submission.reviewerId = null
    submission.reviewerName = ''
    submission.reviewNote = ''
    submission.resubmitNote = note || submission.resubmitNote || ''
    submission.resubmitCount = Number(submission.resubmitCount || 0) + 1
    submission.reviewVersion = Number(submission.reviewVersion) + 1
    submission.updatedAt = now
    appendSubmissionHistory(submission, crypto, {
      action: 'resubmit',
      statusBefore: currentStatus,
      statusAfter: 'pending',
      operatorId: String(req.user?.id || ''),
      operatorName: String(req.user?.username || ''),
      note: note || '',
    })
    appendReviewAuditLog(store, markKvDirty, crypto, {
      submissionId: submission.id,
      title: submission.title || submission.fileName || submission.id,
      operator: String(req.user?.username || req.user?.id || 'unknown'),
      action: 'resubmit',
      note: note || '',
      statusBefore: currentStatus,
      statusAfter: 'pending',
      before: {
        status: currentStatus,
        reviewVersion: Number(submission.reviewVersion) - 1,
      },
      after: {
        status: 'pending',
        reviewVersion: Number(submission.reviewVersion),
      },
      time: now,
      ip: req.ip || ''
    })
    markSubmissionDirty(submission.id)
    if (removedPublished) markKvDirty('catalog_state')
    scheduleSave()
    res.json({
      ok: true,
      id: submission.id,
      status: submission.status,
      reviewVersion: submission.reviewVersion,
      resubmitCount: submission.resubmitCount,
      message: '已重新提交审核',
      transition: {
        from: currentStatus,
        to: submission.status,
        action: 'resubmit',
      },
    })
  })

  app.get('/api/skins/submissions/audit-logs', requireUser, requireReviewerOrAdmin, (req, res) => {
    if (!config.reviewEntryEnabled) {
      return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    }
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20))
    const actionFilter = String(req.query.action || '').trim().toLowerCase()
    const operatorFilter = String(req.query.operator || '').trim().toLowerCase()
    const submissionIdFilter = String(req.query.submissionId || '').trim()
    const q = String(req.query.q || '').trim().toLowerCase()
    const store = getStore()
    let rows = (Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []).map((row) => mapReviewAuditLogRecord(row))
    if (actionFilter) {
      rows = rows.filter((row) => String(row.action || '').toLowerCase() === actionFilter)
    }
    if (operatorFilter) {
      rows = rows.filter((row) => String(row.operator || '').toLowerCase().includes(operatorFilter))
    }
    if (submissionIdFilter) {
      rows = rows.filter((row) => String(row.submissionId || '') === submissionIdFilter)
    }
    if (q) {
      rows = rows.filter((row) => {
        const haystack = [
          row.id,
          row.submissionId,
          row.title,
          row.action,
          row.operator,
          row.note,
          row.ip,
          row.statusBefore,
          row.statusAfter,
          JSON.stringify(row.before || {}),
          JSON.stringify(row.after || {}),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    rows = rows
      .slice()
      .sort((a, b) => parseIsoMs(b.at) - parseIsoMs(a.at))
    const total = rows.length
    const start = (page - 1) * pageSize
    return pageResponse(res, {
      items: rows.slice(start, start + pageSize),
      total,
      page,
      pageSize,
    })
  })

  app.get('/api/skins/submissions/audit-logs/export', requireUser, requireReviewerOrAdmin, (req, res) => {
    if (!config.reviewEntryEnabled) {
      return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    }
    const actionFilter = String(req.query.action || '').trim().toLowerCase()
    const operatorFilter = String(req.query.operator || '').trim().toLowerCase()
    const submissionIdFilter = String(req.query.submissionId || '').trim()
    const q = String(req.query.q || '').trim().toLowerCase()
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 2000))
    const store = getStore()
    let rows = (Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []).map((row) => mapReviewAuditLogRecord(row))
    if (actionFilter) rows = rows.filter((row) => String(row.action || '').toLowerCase() === actionFilter)
    if (operatorFilter) rows = rows.filter((row) => String(row.operator || '').toLowerCase().includes(operatorFilter))
    if (submissionIdFilter) rows = rows.filter((row) => String(row.submissionId || '') === submissionIdFilter)
    if (q) {
      rows = rows.filter((row) => {
        const haystack = [
          row.id,
          row.submissionId,
          row.title,
          row.action,
          row.operator,
          row.note,
          row.ip,
          row.statusBefore,
          row.statusAfter,
          JSON.stringify(row.before || {}),
          JSON.stringify(row.after || {}),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    rows = rows
      .slice()
      .sort((a, b) => parseIsoMs(b.at) - parseIsoMs(a.at))
      .slice(0, limit)
    const header = ['id', 'at', 'operator', 'action', 'submissionId', 'title', 'statusBefore', 'statusAfter', 'note', 'ip', 'before', 'after']
    const csv = [header, ...rows.map((row) => ([
      row.id,
      row.at,
      row.operator,
      row.action,
      row.submissionId,
      row.title,
      row.statusBefore || '',
      row.statusAfter || '',
      row.note || '',
      row.ip || '',
      JSON.stringify(row.before || {}),
      JSON.stringify(row.after || {}),
    ]))]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="submission-audit-logs-${Date.now()}.csv"`)
    return res.send(`\uFEFF${csv}`)
  })

  // ============ 投稿详情（审核中心用） ============

  app.get('/api/skins/submissions/:id', requireUser, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')

    const store = getStore()
    const sub = (store.submissions || []).find(s => String(s?.id || '') === id)
    if (!sub) return jsonErr(res, 404, '投稿不存在', 'not_found')
    if (!canViewSubmission(req.user, sub)) {
      requireRolesOrJson(req, res, {
        roles: ['moderator', 'reviewer', 'admin'],
        message: '无权查看该投稿',
        requiredCapability: 'review_submissions',
      })
      return
    }

    const usersById = new Map((store.users || []).map((u) => [String(u.id), String(u.username || '')]))
    const item = mapSubmissionRecord(sub, usersById)

    res.json({
      item,
      history: ensureSubmissionHistory(sub).map((h) => mapSubmissionHistoryRecord(h)),
    })
  })

  app.get('/api/skins/submissions', requireUser, requireReviewerOrAdmin, (req, res) => {
    if (!config.reviewEntryEnabled) {
      return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    }
    const statusFilter = String(req.query.status || '').trim().toLowerCase()
    const keyword = String(req.query.keyword || '').trim().toLowerCase()
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const store = getStore()
    const usersById = new Map((store.users || []).map((u) => [String(u.id), String(u.username || '')]))
    let list = (store.submissions || [])
      .filter((s) => {
        if (!statusFilter || statusFilter === 'all') return true
        return String(s?.status || '').toLowerCase() === statusFilter
      })
    if (keyword) {
      list = list.filter((s) => {
        const mapped = mapSubmissionRecord(s, usersById)
        const tags = Array.isArray(mapped.tags) ? mapped.tags.join(' ') : ''
        const haystack = [
          mapped.id,
          mapped.title,
          mapped.description,
          mapped.submitter,
          tags,
          mapped.reviewNote,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(keyword)
      })
    }
    list = list
      .sort((a, b) => {
        const ta = Date.parse(String(a?.submittedAt || '')) || 0
        const tb = Date.parse(String(b?.submittedAt || '')) || 0
        return tb - ta
      })
    const total = list.length
    const start = (page - 1) * pageSize
    const items = list.slice(start, start + pageSize).map((s) => mapSubmissionRecord(s, usersById))
    return pageResponse(res, { items, total, page, pageSize })
  })

  app.get('/api/skins/submissions/:id/history', requireUser, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const submission = (store.submissions || []).find((s) => String(s?.id || '') === id)
    if (!submission) return jsonErr(res, 404, '投稿不存在', 'not_found')
    if (!canViewSubmission(req.user, submission)) {
      requireRolesOrJson(req, res, {
        roles: ['moderator', 'reviewer', 'admin'],
        message: '无权查看该投稿历史',
        requiredCapability: 'review_submissions',
      })
      return
    }
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const history = ensureSubmissionHistory(submission)
      .slice()
      .sort((a, b) => parseIsoMs(b?.at) - parseIsoMs(a?.at))
    const total = history.length
    const start = (page - 1) * pageSize
    const items = history.slice(start, start + pageSize).map((h) => mapSubmissionHistoryRecord(h))
    return pageResponse(res, { items, total, page, pageSize })
  })

  app.get('/api/skins/player/dashboard', requireUser, (req, res) => {
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const favoriteList = Array.isArray(store.userFavorites?.[req.user.id]) ? store.userFavorites[req.user.id] : []
    const recentActivity = favoriteList
      .map((item) => ({
        id: `fav:${String(item?.id || item?.skinId || '')}`,
        type: 'favorite',
        title: '收藏了皮肤',
        subtitle: String(item?.skinName || item?.skinId || '未命名皮肤'),
        at: String(item?.createdAt || ''),
      }))
      .concat(
        (store.submissions || [])
          .filter((s) => String(s?.userId || '') === String(req.user.id || ''))
          .map((s) => ({
            id: `sub:${String(s?.id || '')}`,
            type: 'submission',
            title: '提交了投稿',
            subtitle: String(s?.fileName || s?.id || '未命名资源'),
            at: String(s?.submittedAt || ''),
          }))
      )
      .filter((item) => Boolean(item.at))
      .sort((a, b) => parseIsoMs(b.at) - parseIsoMs(a.at))
      .slice(0, 10)
    const pendingSubmissionCount = store.submissions.filter(
      (s) => s.userId === req.user.id && s.status === 'pending'
    ).length
    const totalSubmissionCount = store.submissions.filter(
      (s) => s.userId === req.user.id
    ).length
    const securityIndicators = buildDashboardSecurityIndicators(store, req.user)
    const ms = ps.mojangSkin
    const preview = resolveSkinStationPreview(store, req.user)
    res.json({
      catalogSyncedAt: store.catalogSyncedAt,
      pendingSubmissionCount,
      favoritesCount: favoriteList.length,
      submissionsCount: totalSubmissionCount,
      activeSelection: ps.activeSelection || undefined,
      recentSelections: ps.recentSelections?.length ? ps.recentSelections : undefined,
      recentActivity,
      emailVerified: isUserEmailVerified(req.user),
      linkedMcUsername: req.user.linkedMcUsername || undefined,
      linkedMcUuid: req.user.linkedMcUuid || undefined,
      mojangSkinSyncEnabled: config.mojangSkinSyncEnabled,
      security: securityIndicators,
      applied: {
        skinAssetId: Number(ps.applied.skinAssetId) || 0,
        capeAssetId: Number(ps.applied.capeAssetId) || 0,
        slot: ps.applied.slot || 'default',
        version: ps.applied.version || 1
      },
      preview: preview || undefined,
      mojangSkin:
        ms && ms.syncOk
          ? {
              syncedAt: ms.syncedAt,
              canonicalName: ms.canonicalName,
              model: ms.model,
              hasCape: Boolean(ms.capeUrl),
              skinUrl:
                typeof ms.skinUrl === 'string' && ms.skinUrl.trim()
                  ? ms.skinUrl.trim()
                  : undefined,
              capeUrl:
                ms.capeUrl != null && String(ms.capeUrl).trim()
                  ? String(ms.capeUrl).trim()
                  : undefined
            }
          : undefined
    })
  })

  app.get('/api/skins/wardrobe', requireUser, (req, res) => {
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
    const items = ensureWardrobeSlots(ps)
      .map((row) => normalizeWardrobeSlot(row))
      .filter(Boolean)
      .sort((a, b) => parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt))
    const total = items.length
    const start = (page - 1) * pageSize
    return pageResponse(res, { items: items.slice(start, start + pageSize), total, page, pageSize })
  })

  app.post('/api/skins/wardrobe', requireUser, requireVerifiedEmail, (req, res) => {
    const skinUrl = sanitizeWardrobeUrl(req.body?.skinUrl)
    if (!skinUrl) {
      return jsonErr(res, 400, '缺少可同步的远程皮肤链接', 'validation_error')
    }
    const now = new Date().toISOString()
    const serverSlotRaw = String(req.body?.serverSlot || req.body?.slot || '').trim()
    const serverSlot = ['default', 'pvp', 'event'].includes(serverSlotRaw) ? serverSlotRaw : undefined
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const slots = ensureWardrobeSlots(ps)
    const existing = slots.find((row) => String(row?.skinUrl || '') === skinUrl)
    const item = normalizeWardrobeSlot({
      id: existing?.id || crypto.randomUUID(),
      title: req.body?.title,
      skinUrl,
      previewUrl: req.body?.previewUrl,
      model: req.body?.model,
      source: req.body?.source,
      serverSlot,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    })
    if (!item) {
      return jsonErr(res, 400, '衣柜槽位内容无效', 'validation_error')
    }
    const nextSlots = [item, ...slots.filter((row) => String(row?.id || '') !== item.id)].slice(0, 50)
    ps.wardrobeSlots = nextSlots
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    res.json({ ok: true, item })
  })

  app.delete('/api/skins/wardrobe/:id', requireUser, requireVerifiedEmail, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const slots = ensureWardrobeSlots(ps)
    const nextSlots = slots.filter((row) => String(row?.id || '') !== id)
    if (nextSlots.length === slots.length) return jsonErr(res, 404, '衣柜槽位不存在', 'not_found')
    ps.wardrobeSlots = nextSlots
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    res.json({ ok: true, deleted: true, id })
  })

  app.post(
    '/api/skins/player/sync-mojang',
    mojangSkinSyncLimiter,
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      if (!config.mojangSkinSyncEnabled) {
        return jsonErr(res, 503, '未启用 Mojang 皮肤同步', 'disabled')
      }
      const mc = String(req.user.linkedMcUsername || '').trim()
      if (!mc) {
        return jsonErr(res, 400, '请先绑定游戏角色', 'not_linked')
      }
      const store = getStore()
      const r = await persistMojangSkinSync(store, req.user.id, mc)
      if (!r.ok) {
        const map = {
          not_found: '该角色在 Mojang 无正版档案（或用户名已变更）',
          rate_limited: 'Mojang 接口限流，请稍后再试',
          timeout: '连接 Mojang 超时',
          network_error: '连接 Mojang 失败',
          no_textures: '档案中无皮肤纹理数据',
          disabled: '服务端已关闭 Mojang 同步'
        }
        const msg = map[r.error] || '同步失败'
        const code = r.error === 'rate_limited' ? 429 : r.error === 'not_found' ? 404 : 502
        return jsonErr(res, code, msg, r.error || 'mojang_sync_failed')
      }
      const snap = r.snapshot
      if (mc) triggerVlaSkinRefreshIfConfigured(mc)
      res.json({
        ok: true,
        message: '已从 Mojang 同步到皮肤库',
        profile: {
          canonicalName: snap.canonicalName,
          model: snap.model,
          hasCape: Boolean(snap.capeUrl),
          syncedAt: ensurePlayerState(store, req.user.id).mojangSkin.syncedAt
        }
      })
    })
  )

  app.get('/api/skins/player/submissions', requireUser, (req, res) => {
    const store = getStore()
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const statusFilter = String(req.query.status || '').trim().toLowerCase()
    let rows = (store.submissions || [])
      .filter((s) => String(s?.userId || '') === String(req.user?.id || ''))
    if (statusFilter && statusFilter !== 'all') {
      rows = rows.filter((s) => String(s?.status || '').toLowerCase() === statusFilter)
    }
    rows.sort((a, b) => parseIsoMs(b?.submittedAt) - parseIsoMs(a?.submittedAt))
    const total = rows.length
    const start = (page - 1) * pageSize
    const items = rows.slice(start, start + pageSize).map((s) => mapSubmissionRecord(s))
    return pageResponse(res, { items, total, page, pageSize })
  })

  app.post('/api/skins/player/select', requireUser, requireVerifiedEmail, (req, res) => {
    const { catalogItemId, slot, includeCape } = req.body || {}
    const id = String(catalogItemId || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 catalogItemId', 'validation_error')
    const store = getStore()
    const item = catalogItemById(store, id)
    if (!item) return jsonErr(res, 404, '大厅条目不存在', 'not_found')
    const ps = ensurePlayerState(store, req.user.id)
    const sl = ['default', 'pvp', 'event'].includes(slot) ? slot : 'default'
    const sel = {
      catalogId: item.id,
      title: item.title,
      slot: sl,
      selectedAt: new Date().toISOString()
    }
    ps.activeSelection = sel
    const recent = ps.recentSelections || []
    recent.unshift({
      catalogId: item.id,
      title: item.title,
      at: sel.selectedAt
    })
    ps.recentSelections = recent.slice(0, 20)
    ps.applied.version = (ps.applied.version || 1) + 1
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    const mc = String(req.user.linkedMcUsername || '').trim()
    if (mc) triggerVlaSkinRefreshIfConfigured(mc)
    res.json({
      ok: true,
      message: includeCape === false ? '已选用（不含披风）' : '已选用',
      selection: sel
    })
  })

  function handleSubmission(kind, req, res) {
    const file = req.file
    if (!file) return jsonErr(res, 400, '缺少文件', 'validation_error')
    const model = String(req.body?.model || 'auto')
    const title = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim()
    const tags = Array.from(
      new Set(
        String(req.body?.tags || '')
          .split(',')
          .map((t) => String(t || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      )
    )
    const now = new Date().toISOString()
    const store = getStore()
    const sub = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      submitterUsername: req.user.username,
      title: title || (file.originalname || file.filename),
      description,
      tags,
      fileName: file.originalname || file.filename,
      kind,
      model: kind === 'skin' ? model : undefined,
      status: 'pending',
      submittedAt: now,
      updatedAt: now,
      localPath: file.filename,
      reviewVersion: 0,
      resubmitCount: 0,
    }
    appendSubmissionHistory(sub, crypto, {
      action: 'submit',
      statusAfter: 'pending',
      operatorId: String(req.user?.id || ''),
      operatorName: String(req.user?.username || ''),
      note: description || '',
    })
    store.submissions.push(sub)
    markSubmissionDirty(sub.id)
    scheduleSave()
    res.status(201).json({ ok: true, message: '已提交审核', id: sub.id })
  }

  app.post('/api/skins/player/submissions', requireUser, requireVerifiedEmail, upload.single('file'), (req, res) => {
    const t = String(req.body?.type || '').toLowerCase()
    if (t === 'cape') return handleSubmission('cape', req, res)
    return handleSubmission('skin', req, res)
  })

  app.post('/api/skins/player/submissions/batch', requireUser, requireVerifiedEmail, upload.array('files', 20), (req, res) => {
    const files = Array.isArray(req.files) ? req.files : []
    if (files.length === 0) return jsonErr(res, 400, '缺少文件', 'validation_error')
    const store = getStore()
    const items = []
    for (const file of files) {
      const now = new Date().toISOString()
      const sub = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        submitterUsername: req.user.username,
        title: String(file.originalname || file.filename),
        description: '',
        tags: [],
        fileName: file.originalname || file.filename,
        kind: 'skin',
        model: String(req.body?.model || 'auto'),
        status: 'pending',
        submittedAt: now,
        updatedAt: now,
        localPath: file.filename,
        batch: true,
        reviewVersion: 0,
        resubmitCount: 0,
      }
      appendSubmissionHistory(sub, crypto, {
        action: 'submit',
        statusAfter: 'pending',
        operatorId: String(req.user?.id || ''),
        operatorName: String(req.user?.username || ''),
        note: '批量投稿',
      })
      store.submissions.push(sub)
      markSubmissionDirty(sub.id)
      items.push({ id: sub.id, fileName: sub.fileName })
    }
    scheduleSave()
    res.status(201).json({ ok: true, message: `已提交 ${items.length} 个文件审核`, items })
  })

  app.post('/api/skins/player/submissions/cape', requireUser, requireVerifiedEmail, upload.single('file'), (req, res) => {
    return handleSubmission('cape', req, res)
  })

  app.post('/api/skins/submissions/:id/reopen', requireUser, requireReviewerOrAdmin, (req, res) => {
    if (!config.reviewEntryEnabled) {
      return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    }
    const submissionId = String(req.params.id || '').trim()
    const note = String(req.body?.note || '').trim()
    const parsedExpectedVersion = parseExpectedVersionOrFail(res, req.body?.expectedVersion)
    if (!parsedExpectedVersion) return
    if (!submissionId) return jsonErr(res, 400, '缺少投稿 id', 'validation_error')
    if (note.length > 200) return jsonErr(res, 400, '重审备注不能超过 200 字', 'validation_error')
    const store = getStore()
    const submission = (store.submissions || []).find((s) => String(s?.id || '') === submissionId)
    if (!submission) return jsonErr(res, 404, '投稿不存在', 'not_found')
    ensureSubmissionReviewVersion(submission)
    if (rejectVersionConflict(res, submission, parsedExpectedVersion, submissionId)) return
    const currentStatus = resolveSubmissionStatusOrFail(res, submission, submissionId, 'reopen')
    if (!currentStatus) return
    if (currentStatus === 'pending') {
      return rejectInvalidTransition(res, {
        code: 'already_pending',
        message: '该投稿已处于待审核状态',
        submissionId,
        currentStatus,
        requestedAction: 'reopen',
        allowedFrom: ['approved', 'rejected'],
      })
    }
    const beforeVersion = Number(submission.reviewVersion || 0)
    const now = new Date().toISOString()
    const removedPublished = currentStatus === 'approved' ? removeSubmissionCatalogEntry(store, submission.id) : false
    submission.status = 'pending'
    submission.reviewedAt = null
    submission.reviewerId = null
    submission.reviewerName = ''
    submission.reviewNote = ''
    submission.reopenNote = note || submission.reopenNote || ''
    submission.reviewVersion = Number(submission.reviewVersion) + 1
    submission.updatedAt = now
    appendSubmissionHistory(submission, crypto, {
      action: 'reopen',
      statusBefore: currentStatus,
      statusAfter: 'pending',
      operatorId: String(req.user?.id || ''),
      operatorName: String(req.user?.username || ''),
      note,
    })
    appendReviewAuditLog(store, markKvDirty, crypto, {
      submissionId,
      title: submission.title || submission.fileName || submission.id,
      operator: String(req.user?.username || req.user?.id || 'unknown'),
      action: 'reopen',
      note,
      statusBefore: currentStatus,
      statusAfter: 'pending',
      before: {
        status: currentStatus,
        reviewVersion: beforeVersion,
      },
      after: {
        status: 'pending',
        reviewVersion: Number(submission.reviewVersion),
      },
      time: now,
      ip: req.ip || ''
    })
    let notifyItem = null
    if (String(submission.userId || '') !== String(req.user?.id || '')) {
      notifyItem = pushUserNotification(store, submission.userId, {
        type: 'submission_reopen',
        title: '投稿已重新进入待审核',
        message: `投稿「${submission.title || submission.fileName || submission.id}」已回退到待审核状态`,
        detail: {
          submissionId,
          by: String(req.user?.username || req.user?.id || ''),
          note,
        },
      })
    }
    markSubmissionDirty(submission.id)
    if (removedPublished) markKvDirty('catalog_state')
    scheduleSave()
    return res.json({
      ok: true,
      id: submissionId,
      status: submission.status,
      reviewVersion: submission.reviewVersion,
      reopenedAt: now,
      transition: {
        from: currentStatus,
        to: submission.status,
        action: 'reopen',
      },
      notify: {
        queued: Boolean(notifyItem),
        notificationId: String(notifyItem?.id || ''),
      },
    })
  })

  app.post('/api/skins/submissions/:id/:action(approve|reject)', requireUser, requireReviewerOrAdmin, (req, res) => {
    if (!config.reviewEntryEnabled) {
      return jsonErr(res, 404, '审核入口未启用', 'review_entry_disabled')
    }
    const submissionId = String(req.params.id || '').trim()
    const action = String(req.params.action || '').trim().toLowerCase()
    const note = String(req.body?.note || '').trim()
    const parsedExpectedVersion = parseExpectedVersionOrFail(res, req.body?.expectedVersion)
    if (!parsedExpectedVersion) return
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim()

    if (!submissionId) return jsonErr(res, 400, '缺少投稿 id', 'validation_error')
    if (action === 'reject' && !note) {
      return jsonErr(res, 400, '驳回时必须填写备注', 'validation_error')
    }
    if (note.length > 200) return jsonErr(res, 400, '审核备注不能超过 200 字', 'validation_error')

    const store = getStore()
    const submission = (store.submissions || []).find((s) => String(s?.id || '') === submissionId)
    if (!submission) return jsonErr(res, 404, '投稿不存在', 'not_found')

    ensureSubmissionReviewVersion(submission)
    if (idempotencyKey) {
      const prev = String(submission.lastReviewIdempotencyKey || '')
      const prevAction = String(submission.lastReviewAction || '')
      if (prev && prev === idempotencyKey && prevAction === action) {
        return res.json({
          ok: true,
          idempotent: true,
          id: submissionId,
          status: submission.status,
          reviewVersion: submission.reviewVersion,
          reviewedAt: submission.reviewedAt || null,
          reviewerName: submission.reviewerName || '',
          reviewNote: submission.reviewNote || '',
        })
      }
    }

    if (rejectVersionConflict(res, submission, parsedExpectedVersion, submissionId)) return

    const currentStatus = resolveSubmissionStatusOrFail(res, submission, submissionId, action)
    if (!currentStatus) return
    if (currentStatus !== 'pending') {
      return rejectInvalidTransition(res, {
        code: 'already_reviewed',
        message: '该投稿已处理，请勿重复审核',
        submissionId,
        currentStatus,
        requestedAction: action,
        requiredStatus: 'pending',
      })
    }

    const beforeVersion = Number(submission.reviewVersion || 0)
    const reviewedAt = new Date().toISOString()
    submission.status = action === 'approve' ? 'approved' : 'rejected'
    submission.reviewedAt = reviewedAt
    submission.reviewNote = note || ''
    submission.reviewerId = req.user.id
    submission.reviewerName = req.user.username
    submission.reviewVersion = Number(submission.reviewVersion) + 1
    submission.updatedAt = reviewedAt
    if (idempotencyKey) {
      submission.lastReviewIdempotencyKey = idempotencyKey
      submission.lastReviewAction = action
    }
    appendSubmissionHistory(submission, crypto, {
      action,
      statusBefore: currentStatus,
      statusAfter: submission.status,
      operatorId: String(req.user?.id || ''),
      operatorName: String(req.user?.username || ''),
      note,
    })

    // 审核通过 → 写回 catalog
    if (action === 'approve' && submission.kind === 'skin' && submission.localPath) {
      if (!Array.isArray(store.catalog)) store.catalog = []
      removeSubmissionCatalogEntry(store, submission.id)
      const pubSkinUrl = `/uploads/${encodeURI(submission.localPath)}`
      // 投稿无封面/标题字段，用文件名作为标题
      const slugName = String(submission.title || submission.fileName || submission.id || '未命名')
        .replace(/\.(png|dat)$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim()
      const catalogItem = {
        id: `sub_${submission.id}`,
        title: slugName,
        desc: note ? `审核备注：${note}` : '',
        tag: Array.isArray(submission.tags) ? String(submission.tags[0] || '') : '',
        cover: pubSkinUrl,
        skinTextureUrl: pubSkinUrl,
        capeUrl: '',
        model: submission.model || 'default',
        createdAt: submission.submittedAt,
        updatedAt: reviewedAt,
        uploaderId: submission.userId,
        uploaderName: submission.submitterUsername || '',
      }
      store.catalog.push(catalogItem)
      appendSkinVersion(
        store,
        catalogItem.id,
        snapshotFromCatalogItem(catalogItem, {
          sourceType: 'submission_review',
          submissionId,
          operatorId: String(req.user?.id || ''),
          operatorName: String(req.user?.username || ''),
          note: note || '',
          reviewAction: action,
        })
      )
      markKvDirty('catalog_state')
    }

    const notifyItem = pushUserNotification(store, submission.userId, {
      type: 'submission_review',
      title: submission.status === 'approved' ? '投稿审核通过' : '投稿审核未通过',
      message: submission.status === 'approved'
        ? `投稿「${submission.title || submission.fileName || submission.id}」已通过审核`
        : `投稿「${submission.title || submission.fileName || submission.id}」被驳回`,
      detail: {
        submissionId,
        status: submission.status,
        reviewNote: note || '',
        reviewedAt,
      },
    })
    markSubmissionDirty(submission.id)

    appendReviewAuditLog(store, markKvDirty, crypto, {
      submissionId,
      title: submission.title || submission.fileName || submission.id,
      operator: String(req.user?.username || req.user?.id || 'unknown'),
      action,
      note,
      statusBefore: currentStatus,
      statusAfter: submission.status,
      before: {
        status: currentStatus,
        reviewVersion: beforeVersion,
      },
      after: {
        status: submission.status,
        reviewVersion: Number(submission.reviewVersion),
      },
      time: reviewedAt,
      ip: req.ip || ''
    })
    scheduleSave()

    return res.json({
      ok: true,
      id: submissionId,
      status: submission.status,
      reviewVersion: submission.reviewVersion,
      reviewedAt,
      reviewerId: String(req.user?.id || ''),
      reviewerName: String(req.user?.username || ''),
      reviewNote: note || '',
      transition: {
        from: currentStatus,
        to: submission.status,
        action,
      },
      notify: {
        queued: Boolean(notifyItem),
        notificationId: String(notifyItem?.id || ''),
      },
    })
  })

  app.get('/api/skins/:id', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const metrics = getSkinMetrics(store, id)
    const commentsMap = ensureSkinCommentsStore(store)
    const comments = Array.isArray(commentsMap[id]) ? commentsMap[id] : []
    const commentCount = comments.filter((row) => String(row?.status || 'active') !== 'deleted').length
    const related = buildRelatedItems(store, id, Math.min(12, Math.max(1, Number(req.query.relatedLimit) || 6)))
    okResponse(res, {
      item: {
        ...normalizeLibraryItem(item),
        stats: {
          favoriteCount: metrics.favorites,
          downloadCount: metrics.downloads,
          viewCount: metrics.views,
          likeCount: metrics.likes,
          commentCount,
        },
      },
      related,
    })
  })

  app.get('/api/skins/:id/stats', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const metrics = getSkinMetrics(store, id)
    const commentsMap = ensureSkinCommentsStore(store)
    const comments = Array.isArray(commentsMap[id]) ? commentsMap[id] : []
    const commentCount = comments.filter((row) => String(row?.status || 'active') !== 'deleted').length
    res.json({
      ok: true,
      skinId: id,
      favoriteCount: metrics.favorites,
      downloadCount: metrics.downloads,
      viewCount: metrics.views,
      likeCount: metrics.likes,
      commentCount,
      updatedAt: metrics.updatedAt,
    })
  })

  app.get('/api/skins/:id/related', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6))
    res.json({
      ok: true,
      skinId: id,
      items: buildRelatedItems(store, id, limit),
    })
  })

  app.get('/api/skins/:id/versions', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const rows = getSkinVersionRows(store, id)
    if (rows.length === 0) {
      appendSkinVersion(store, id, snapshotFromCatalogItem(item, { sourceType: 'catalog_seed' }))
      scheduleSave()
    }
    const sorted = rows
      .slice()
      .sort((a, b) => parseIsoMs(b?.at) - parseIsoMs(a?.at))
    const total = sorted.length
    const start = (page - 1) * pageSize
    const items = sorted.slice(start, start + pageSize).map((row, idx) => ({
      id: String(row?.id || ''),
      skinId: id,
      versionNumber: total - (start + idx),
      at: String(row?.at || ''),
      title: String(row?.title || ''),
      description: String(row?.description || ''),
      model: String(row?.model || 'default'),
      skinUrl: String(row?.skinUrl || ''),
      capeUrl: String(row?.capeUrl || ''),
      previewUrl: String(row?.previewUrl || ''),
      tags: Array.isArray(row?.tags) ? row.tags.map((t) => String(t)).filter(Boolean) : [],
      source: row?.source || {},
    }))
    res.json({ ok: true, skinId: id, items, total, page, pageSize })
  })

  app.get('/api/skins/:id/source-trace', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const versions = getSkinVersionRows(store, id)
    res.json({
      ok: true,
      skinId: id,
      current: {
        id,
        title: String(item?.title || item?.name || id),
        uploaderId: String(item?.uploaderId || ''),
        uploaderName: String(item?.uploaderName || ''),
        updatedAt: String(item?.updatedAt || item?.createdAt || ''),
      },
      sources: versions
        .slice(0, 30)
        .map((row) => ({
          versionId: String(row?.id || ''),
          at: String(row?.at || ''),
          source: row?.source || {},
        })),
    })
  })

  app.post('/api/skins/:id/rollback', requireUser, requireModeratorSafe, (req, res) => {
    const id = String(req.params.id || '').trim()
    const versionId = String(req.body?.versionId || '').trim()
    const versionIndex = Number(req.body?.versionIndex)
    const note = String(req.body?.note || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const rows = getSkinVersionRows(store, id)
    if (rows.length === 0) {
      appendSkinVersion(store, id, snapshotFromCatalogItem(item, { sourceType: 'catalog_seed' }))
    }
    const sorted = rows
      .slice()
      .sort((a, b) => parseIsoMs(b?.at) - parseIsoMs(a?.at))
    let target = null
    if (versionId) {
      target = sorted.find((row) => String(row?.id || '') === versionId) || null
    } else if (Number.isFinite(versionIndex) && versionIndex > 0) {
      target = sorted[versionIndex - 1] || null
    } else {
      target = sorted[1] || sorted[0] || null
    }
    if (!target) return jsonErr(res, 404, '版本不存在', 'not_found')

    item.title = String(target?.title || item?.title || '未命名')
    item.desc = String(target?.description || '')
    item.tag = Array.isArray(target?.tags) ? String(target.tags[0] || '') : String(item?.tag || '')
    item.cover = String(target?.previewUrl || target?.skinUrl || item?.cover || '')
    item.skinTextureUrl = String(target?.skinUrl || item?.skinTextureUrl || '')
    item.capeUrl = String(target?.capeUrl || '')
    item.model = String(target?.model || 'default')
    item.updatedAt = new Date().toISOString()

    appendSkinVersion(
      store,
      id,
      snapshotFromCatalogItem(item, {
        sourceType: 'rollback',
        operatorId: String(req.user?.id || ''),
        operatorName: String(req.user?.username || ''),
        note: note || '',
        rollbackToVersionId: String(target?.id || ''),
      })
    )
    appendSkinInteractionLog(store, {
      skinId: id,
      type: 'skin_rollback',
      userId: String(req.user?.id || ''),
      username: String(req.user?.username || ''),
      rollbackToVersionId: String(target?.id || ''),
      note,
    })
    markKvDirty('catalog_state')
    scheduleSave()
    res.json({
      ok: true,
      skinId: id,
      rolledBackToVersionId: String(target?.id || ''),
      item: normalizeLibraryItem(item),
    })
  })

  app.post('/api/skins/:id/like', requireUser, requireVerifiedEmail, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const likedBefore = isSkinLikedByUser(store, id, req.user?.id)
    const row = getSkinMetrics(store, id)
    if (!likedBefore) {
      patchSkinMetric(store, id, {
        ...row,
        likes: row.likes + 1,
        favorites: countFavoritesForSkin(store, id),
      })
      markKvDirty('skin_metrics')
      appendSkinInteractionLog(store, {
        skinId: id,
        type: 'skin_like',
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
      })
      if (String(item?.uploaderId || '') && String(item?.uploaderId || '') !== String(req.user?.id || '')) {
        pushUserNotification(store, String(item.uploaderId), {
          type: 'skin_like',
          title: '你的皮肤收到新的点赞',
          message: `皮肤「${String(item?.title || item?.name || id)}」获得了新的点赞`,
          detail: { skinId: id },
        })
      }
      scheduleSave()
    }
    const latest = getSkinMetrics(store, id)
    res.json({ ok: true, skinId: id, liked: true, likeCount: latest.likes })
  })

  app.delete('/api/skins/:id/like', requireUser, requireVerifiedEmail, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const likedBefore = isSkinLikedByUser(store, id, req.user?.id)
    const row = getSkinMetrics(store, id)
    if (likedBefore) {
      patchSkinMetric(store, id, {
        ...row,
        likes: Math.max(0, row.likes - 1),
        favorites: countFavoritesForSkin(store, id),
      })
      markKvDirty('skin_metrics')
      appendSkinInteractionLog(store, {
        skinId: id,
        type: 'skin_unlike',
        userId: String(req.user?.id || ''),
        username: String(req.user?.username || ''),
      })
      scheduleSave()
    }
    const latest = getSkinMetrics(store, id)
    res.json({ ok: true, skinId: id, liked: false, likeCount: latest.likes })
  })

  app.get('/api/skins/:id/interactions', requireUser, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const type = String(req.query.type || '').trim()
    const scope = String(req.query.scope || 'mine').trim().toLowerCase()
    const staff = isStaffUser(req.user)
    if (scope === 'all' && !staff) {
      requireRolesOrJson(req, res, {
        roles: ['moderator', 'reviewer', 'admin'],
        message: '无权查看全量互动记录',
        requiredCapability: 'view_interaction_audit',
      })
      return
    }
    let list = ensureSkinInteractionLogsStore(store)
      .filter((row) => String(row?.skinId || '') === id)
    if (type) list = list.filter((row) => String(row?.type || '') === type)
    if (scope !== 'all') {
      list = list.filter((row) => String(row?.userId || '') === String(req.user?.id || ''))
    }
    list = list
      .slice()
      .sort((a, b) => parseIsoMs(b?.at) - parseIsoMs(a?.at))
    const total = list.length
    const start = (page - 1) * pageSize
    const items = list.slice(start, start + pageSize).map((row) => ({
      id: String(row?.id || ''),
      skinId: id,
      type: String(row?.type || ''),
      at: String(row?.at || ''),
      commentId: row?.commentId ? String(row.commentId) : undefined,
      userId: staff ? String(row?.userId || '') : undefined,
      username: String(row?.username || ''),
      note: row?.note ? String(row.note) : undefined,
    }))
    res.json({ ok: true, skinId: id, items, total, page, pageSize, scope })
  })

  app.post('/api/skins/:id/view', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const row = getSkinMetrics(store, id)
    patchSkinMetric(store, id, { ...row, views: row.views + 1, favorites: countFavoritesForSkin(store, id) })
    markKvDirty('skin_metrics')
    appendSkinInteractionLog(store, {
      skinId: id,
      type: 'skin_view',
      userId: '',
      username: '',
    })
    scheduleSave()
    res.json({ ok: true, skinId: id, viewCount: row.views + 1 })
  })

  app.post('/api/skins/:id/download', (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 id', 'validation_error')
    const store = getStore()
    const item = (store.catalog || []).find((i) => String(i.id || '') === id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    const row = getSkinMetrics(store, id)
    patchSkinMetric(store, id, { ...row, downloads: row.downloads + 1, favorites: countFavoritesForSkin(store, id) })
    markKvDirty('skin_metrics')
    appendSkinInteractionLog(store, {
      skinId: id,
      type: 'skin_download',
      userId: '',
      username: '',
    })
    scheduleSave()
    res.json({ ok: true, skinId: id, downloadCount: row.downloads + 1 })
  })

  app.post('/api/skin/upload', requireUser, requireVerifiedEmail, upload.single('file'), (req, res) => {
    if (!req.file) return jsonErr(res, 400, '缺少文件', 'validation_error')
    const uuid = String(req.body?.uuid || '').trim()
    if (uuid !== req.user.uuid) return jsonErr(res, 403, 'uuid 与登录用户不一致', 'forbidden')
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const assetId = ps.nextAssetId++
    const rel = path.relative(UPLOAD_DIR, req.file.path).replace(/\\/g, '/')
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return jsonErr(res, 400, '无效路径', 'validation_error')
    }
    ps.assets[`skin_${assetId}`] = { kind: 'skin', path: rel, model: req.body?.model, slot: req.body?.slot }
    ps.applied.version = (ps.applied.version || 1) + 1
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    const mc = String(req.user.linkedMcUsername || '').trim()
    if (mc) triggerVlaSkinRefreshIfConfigured(mc)
    const pubUrl = `/uploads/${encodeURI(rel)}`
    res.json({ assetId, message: 'ok', url: pubUrl })
  })

  app.post('/api/skin/upload-cape', requireUser, requireVerifiedEmail, upload.single('file'), (req, res) => {
    if (!req.file) return jsonErr(res, 400, '缺少文件', 'validation_error')
    const uuid = String(req.body?.uuid || '').trim()
    if (uuid !== req.user.uuid) return jsonErr(res, 403, 'uuid 与登录用户不一致', 'forbidden')
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const assetId = ps.nextAssetId++
    const rel = path.relative(UPLOAD_DIR, req.file.path).replace(/\\/g, '/')
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return jsonErr(res, 400, '无效路径', 'validation_error')
    }
    ps.assets[`cape_${assetId}`] = { kind: 'cape', path: rel, slot: req.body?.slot }
    ps.applied.version = (ps.applied.version || 1) + 1
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    const mc = String(req.user.linkedMcUsername || '').trim()
    if (mc) triggerVlaSkinRefreshIfConfigured(mc)
    const pubUrl = `/uploads/${encodeURI(rel)}`
    res.json({ assetId, message: 'ok', url: pubUrl })
  })

  app.post('/api/skin/apply', requireUser, requireVerifiedEmail, (req, res) => {
    const { uuid, skinAssetId, capeAssetId, slot } = req.body || {}
    if (String(uuid) !== req.user.uuid) return jsonErr(res, 403, 'uuid 与登录用户不一致', 'forbidden')
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    ps.applied.skinAssetId = Number(skinAssetId) || 0
    ps.applied.capeAssetId = Number(capeAssetId) || 0
    ps.applied.slot = ['default', 'pvp', 'event'].includes(slot) ? slot : 'default'
    ps.applied.version = (ps.applied.version || 1) + 1
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    const mc = String(req.user.linkedMcUsername || '').trim()
    if (mc) triggerVlaSkinRefreshIfConfigured(mc)
    res.json({ ok: true, message: '已应用', version: ps.applied.version })
  })

  app.post('/api/skin/import-apply', requireUser, requireVerifiedEmail, upload.single('file'), asyncHandler(async (req, res) => {
    const uuid = String(req.body?.uuid || '').trim()
    if (uuid !== req.user.uuid) return jsonErr(res, 403, 'uuid 与登录用户不一致', 'forbidden')
    const sourceUrl = String(req.body?.sourceUrl || '').trim()
    const model = String(req.body?.model || 'default').trim() === 'slim' ? 'slim' : 'default'
    const slot = String(req.body?.slot || 'default').trim()
    const title = String(req.body?.title || 'skin').trim() || 'skin'
    const store = getStore()
    const ps = ensurePlayerState(store, req.user.id)
    const assetId = ps.nextAssetId++
    const inputFile = req.file
    const targetPath = inputFile?.path || null
    if (inputFile) {
      const rel = path.relative(UPLOAD_DIR, inputFile.path).replace(/\\/g, '/')
      if (rel.startsWith('..') || path.isAbsolute(rel)) return jsonErr(res, 400, '无效路径', 'validation_error')
      ps.assets[`skin_${assetId}`] = { kind: 'skin', path: rel, model, slot }
    } else if (sourceUrl) {
      ps.assets[`skin_${assetId}`] = { kind: 'skin', remoteUrl: sourceUrl, model, slot, title }
    } else {
      return jsonErr(res, 400, '缺少文件或 sourceUrl', 'validation_error')
    }
    ps.applied.version = (ps.applied.version || 1) + 1
    markPlayerStateDirty(req.user.id)
    scheduleSave()
    const mc = String(req.user.linkedMcUsername || '').trim()
    if (mc) triggerVlaSkinRefreshIfConfigured(mc)
    return res.json({ ok: true, assetId, message: 'ok', url: targetPath ? `/uploads/${encodeURI(path.relative(UPLOAD_DIR, targetPath).replace(/\\/g, '/'))}` : sourceUrl || '' })
  }))
}
