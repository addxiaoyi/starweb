/**
 * 地图标记 (Map Anchors) 模块
 *
 * GET    /api/map/anchors      — 公开，返回所有地图锚点
 * POST   /api/map/anchors      — 需登录，添加新锚点
 * DELETE /api/map/anchors/:id  — 需登录，删除自己的锚点（管理员可删除任何）
 *
 * 数据存储在 store.mapAnchors[]。
 * 首次运行时写入 seed data（出生点、末地传送门、下界交通枢纽）。
 */

/** 合法锚点类型 */
const VALID_TYPES = ['base', 'landmark', 'farm', 'shop', 'portal', 'other']

/** 坐标绝对值上限 */
const COORD_LIMIT = 30000

/** 内置种子锚点 */
const SEED_ANCHORS = [
  {
    id: 'spawn',
    name: '出生点',
    description: '世界出生位置',
    x: 0,
    z: 0,
    type: 'base',
    icon: '🏠',
    color: '#10b981',
    system: true,
    createdBy: 'system',
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
  },
  {
    id: 'end-portal',
    name: '末地传送门',
    description: '末地要塞入口',
    x: 1200,
    z: -800,
    type: 'portal',
    icon: '🌀',
    color: '#8b5cf6',
    system: true,
    createdBy: 'system',
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
  },
  {
    id: 'nether-hub',
    name: '下界交通枢纽',
    description: '下界主要交通中心',
    x: 0,
    z: 0,
    type: 'portal',
    icon: '🔥',
    color: '#ef4444',
    system: true,
    createdBy: 'system',
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
  },
]

/** 简单 HTML 标签剥离 */
function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '')
}

export function registerMapRoutes(app, deps) {
  const {
    requireUser,
    jsonOk,
    jsonErr,
    getStore,
    scheduleSave,
    asyncHandler,
    crypto,
  } = deps

  // ── 确保 store.mapAnchors 存在并包含种子数据 ─────────────
  function ensureMapAnchors(store) {
    if (!Array.isArray(store.mapAnchors)) {
      store.mapAnchors = [...SEED_ANCHORS]
      return store.mapAnchors
    }
    // 确保种子锚点始终存在
    for (const seed of SEED_ANCHORS) {
      if (!store.mapAnchors.find((a) => a.id === seed.id)) {
        store.mapAnchors.push({ ...seed })
      }
    }
    return store.mapAnchors
  }

  // ── GET /api/map/anchors ─────────────────────────────────
  app.get(
    '/api/map/anchors',
    asyncHandler(async (_req, res) => {
      const store = getStore()
      const anchors = ensureMapAnchors(store)

      const items = anchors.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
        x: a.x,
        z: a.z,
        type: a.type || 'other',
        icon: a.icon || '📍',
        color: a.color || '#6b7280',
        createdBy: a.createdBy || 'unknown',
        createdAt: a.createdAt,
        system: Boolean(a.system),
      }))

      jsonOk(res, { items })
    })
  )

  // ── POST /api/map/anchors ────────────────────────────────
  app.post(
    '/api/map/anchors',
    requireUser,
    asyncHandler(async (req, res) => {
      const { name, description, x, z, type, icon, color } = req.body || {}

      // ── name 校验 ───────────────────────────────────────
      if (name == null || typeof name !== 'string') {
        return jsonErr(res, 400, '缺少 name 字段', 'validation_error')
      }
      const trimmedName = stripHtml(name).trim()
      if (trimmedName.length === 0 || trimmedName.length > 50) {
        return jsonErr(
          res,
          400,
          'name 长度必须在 1-50 字符之间',
          'validation_error'
        )
      }

      // ── description 校验 ────────────────────────────────
      let trimmedDesc = ''
      if (description != null) {
        if (typeof description !== 'string') {
          return jsonErr(
            res,
            400,
            'description 必须是字符串',
            'validation_error'
          )
        }
        trimmedDesc = stripHtml(description).trim()
        if (trimmedDesc.length > 200) {
          return jsonErr(
            res,
            400,
            'description 不能超过 200 字符',
            'validation_error'
          )
        }
      }

      // ── x / z 校验 ─────────────────────────────────────
      const numX = Number(x)
      const numZ = Number(z)
      if (!Number.isFinite(numX) || !Number.isFinite(numZ)) {
        return jsonErr(res, 400, 'x 和 z 必须为有效数值', 'validation_error')
      }
      if (
        Math.abs(numX) > COORD_LIMIT ||
        Math.abs(numZ) > COORD_LIMIT
      ) {
        return jsonErr(
          res,
          400,
          `x 和 z 的范围为 -${COORD_LIMIT} 到 ${COORD_LIMIT}`,
          'validation_error'
        )
      }

      // ── type 校验 ──────────────────────────────────────
      const anchorType = type || 'other'
      if (!VALID_TYPES.includes(anchorType)) {
        return jsonErr(
          res,
          400,
          `type 必须是以下之一: ${VALID_TYPES.join(', ')}`,
          'validation_error'
        )
      }

      const store = getStore()
      const anchors = ensureMapAnchors(store)

      const anchor = {
        id: crypto.randomUUID(),
        name: trimmedName,
        description: trimmedDesc,
        x: numX,
        z: numZ,
        type: anchorType,
        icon: typeof icon === 'string' ? icon.slice(0, 4) : '📍',
        color: typeof color === 'string' ? color.slice(0, 9) : '#6b7280',
        system: false,
        createdBy: req.user.username || req.user.email || 'Unknown',
        createdAt: new Date().toISOString(),
      }

      anchors.push(anchor)
      scheduleSave()

      jsonOk(res, anchor, 201)
    })
  )

  // ── DELETE /api/map/anchors/:id ──────────────────────────
  app.delete(
    '/api/map/anchors/:id',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const anchors = ensureMapAnchors(store)
      const targetId = String(req.params.id || '').trim()

      if (!targetId) {
        return jsonErr(res, 400, '缺少锚点 id', 'validation_error')
      }

      const idx = anchors.findIndex((a) => a.id === targetId)
      if (idx === -1) {
        return jsonErr(res, 404, '锚点不存在', 'not_found')
      }

      const anchor = anchors[idx]

      // 系统锚点不可删除
      if (anchor.system) {
        return jsonErr(res, 403, '系统锚点不可删除', 'forbidden')
      }

      const username = req.user.username || req.user.email || ''
      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : []
      const isAuthor = anchor.createdBy === username
      const isAdmin = userRoles.includes('admin')

      if (!isAuthor && !isAdmin) {
        return jsonErr(res, 403, '无权删除此锚点', 'forbidden')
      }

      anchors.splice(idx, 1)
      scheduleSave()

      jsonOk(res, { deleted: targetId })
    })
  )
}
