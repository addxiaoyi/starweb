/**
 * 留言板 (Shoutbox) 模块
 *
 * GET    /api/shoutbox?limit=50  — 获取最新留言（公开，无需登录）
 * POST   /api/shoutbox           — 发送留言（需登录）
 * DELETE /api/shoutbox/:id       — 删除留言（仅作者或管理员）
 *
 * 数据存储在 store.shoutbox[]，最多保留 200 条。
 * 速率限制：每用户每分钟最多 5 条。
 */

/** 简单 HTML 标签剥离 */
function stripHtmlTags(str) {
  return String(str).replace(/<[^>]*>/g, '')
}

/** 速率限制窗口（毫秒） */
const RATE_WINDOW_MS = 60_000
/** 每窗口最大发送数 */
const RATE_MAX = 5
/** 留言最大保留条数 */
const MAX_SHOUTS = 200

export function registerShoutboxRoutes(app, deps) {
  const {
    requireUser,
    jsonOk,
    jsonErr,
    getStore,
    scheduleSave,
    asyncHandler,
    crypto,
  } = deps

  // ── 确保 store.shoutbox 存在 ──────────────────────────────
  function ensureShoutbox(store) {
    if (!Array.isArray(store.shoutbox)) {
      store.shoutbox = []
    }
    return store.shoutbox
  }

  // ── GET /api/shoutbox ────────────────────────────────────
  app.get(
    '/api/shoutbox',
    asyncHandler(async (req, res) => {
      const store = getStore()
      const shoutbox = ensureShoutbox(store)

      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 50, 1),
        200
      )

      const items = shoutbox.slice(0, limit).map((s) => ({
        id: s.id,
        userId: s.userId,
        username: s.username,
        avatar: s.avatar || null,
        message: s.message,
        createdAt: s.createdAt,
      }))

      jsonOk(res, { items, total: shoutbox.length })
    })
  )

  // ── POST /api/shoutbox ───────────────────────────────────
  app.post(
    '/api/shoutbox',
    requireUser,
    asyncHandler(async (req, res) => {
      const rawMessage = req.body?.message
      if (rawMessage == null || typeof rawMessage !== 'string') {
        return jsonErr(res, 400, '缺少 message 字段', 'validation_error')
      }

      const message = stripHtmlTags(rawMessage).trim()
      if (message.length === 0) {
        return jsonErr(res, 400, '留言内容不能为空', 'validation_error')
      }
      if (message.length > 200) {
        return jsonErr(
          res,
          400,
          '留言内容不能超过 200 字符',
          'validation_error'
        )
      }

      const store = getStore()
      const shoutbox = ensureShoutbox(store)
      const userId = String(req.user.id)

      // ── 速率限制 ──────────────────────────────────────────
      const now = Date.now()
      const recentByUser = shoutbox.filter(
        (s) =>
          String(s.userId) === userId &&
          new Date(s.createdAt).getTime() > now - RATE_WINDOW_MS
      )
      if (recentByUser.length >= RATE_MAX) {
        return jsonErr(
          res,
          429,
          '发送太快了，请稍后再试（每分钟最多 5 条）',
          'rate_limit'
        )
      }

      // ── 构建留言 ──────────────────────────────────────────
      const shout = {
        id: crypto.randomUUID(),
        userId,
        username: req.user.username || req.user.email || 'Unknown',
        avatar: req.user.avatar || null,
        message,
        createdAt: new Date().toISOString(),
      }

      shoutbox.unshift(shout)

      // 截断至最大条数
      if (shoutbox.length > MAX_SHOUTS) {
        shoutbox.length = MAX_SHOUTS
      }

      scheduleSave()

      jsonOk(res, shout, 201)
    })
  )

  // ── DELETE /api/shoutbox/:id ─────────────────────────────
  app.delete(
    '/api/shoutbox/:id',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const shoutbox = ensureShoutbox(store)
      const targetId = String(req.params.id || '').trim()

      if (!targetId) {
        return jsonErr(res, 400, '缺少留言 id', 'validation_error')
      }

      const idx = shoutbox.findIndex((s) => s.id === targetId)
      if (idx === -1) {
        return jsonErr(res, 404, '留言不存在', 'not_found')
      }

      const shout = shoutbox[idx]
      const userId = String(req.user.id)
      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : []
      const isAuthor = String(shout.userId) === userId
      const isAdmin = userRoles.includes('admin')

      if (!isAuthor && !isAdmin) {
        return jsonErr(res, 403, '无权删除此留言', 'forbidden')
      }

      shoutbox.splice(idx, 1)
      scheduleSave()

      jsonOk(res, { deleted: targetId })
    })
  )
}
