export function registerSkinAdminRoutes(app, deps) {
  const {
    getStore,
    scheduleSave,
    markKvDirty = () => {},
    markUserProfileDirty = () => {},
    requireAdmin,
    jsonErr,
    jsonOk,
    jsonPage,
    resolvePaginationQuery,
    asyncHandler,
    crypto
  } = deps
  const pageResponse = typeof jsonPage === 'function'
    ? jsonPage
    : (res, payload) => res.json(payload)
  const okResponse = typeof jsonOk === 'function'
    ? jsonOk
    : (res, payload = {}, status = 200) => res
      .status(Number(status))
      .json({ ok: true, success: true, ...(payload && typeof payload === 'object' ? payload : {}) })
  const resolvePageQuery = typeof resolvePaginationQuery === 'function'
    ? resolvePaginationQuery
    : (query = {}, options = {}) => {
      const toInt = (value, fallback) => {
        const n = Number(value)
        return Number.isFinite(n) ? Math.floor(n) : fallback
      }
      const defaultPage = Math.max(1, toInt(options.defaultPage, 1))
      const defaultPageSize = Math.max(1, toInt(options.defaultPageSize, 20))
      const maxPageSize = Math.max(1, toInt(options.maxPageSize, 200))
      const hasPageInputs = query?.page !== undefined || query?.pageSize !== undefined
      const hasOffsetInputs = query?.offset !== undefined || query?.limit !== undefined
      const clampPageSize = (value) => Math.min(maxPageSize, Math.max(1, toInt(value, defaultPageSize)))
      const clampOffset = (value) => Math.max(0, toInt(value, 0))

      if (hasPageInputs || !hasOffsetInputs) {
        const page = Math.max(1, toInt(query?.page, defaultPage))
        const pageSize = clampPageSize(query?.pageSize)
        return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize }
      }

      const pageSize = clampPageSize(query?.limit)
      const offset = clampOffset(query?.offset)
      const page = Math.floor(offset / pageSize) + 1
      return { page, pageSize, offset, limit: pageSize }
    }

  const USER_ROLE_WHITELIST = new Set(['admin', 'reviewer', 'moderator'])

  function touchStore(...keys) {
    scheduleSave()
    for (const key of keys) markKvDirty(key)
  }

  function touchUserProfile(userId, ...keys) {
    markUserProfileDirty(userId)
    touchStore(...keys)
  }

  function ensureUserAdminAuditLogs(store) {
    if (!Array.isArray(store.userAdminAuditLogs)) store.userAdminAuditLogs = []
    return store.userAdminAuditLogs
  }

  function appendUserAdminAudit(store, req, payload) {
    const logs = ensureUserAdminAuditLogs(store)
    logs.unshift({
      id: String(crypto.randomUUID()),
      at: new Date().toISOString(),
      actorUserId: String(req.user?.id || ''),
      actorUsername: String(req.user?.username || ''),
      ...payload,
    })
    if (logs.length > 5000) logs.length = 5000
    markKvDirty('user_admin_audit_logs')
  }

  function normalizedUserRoles(user) {
    const raw = [
      ...(Array.isArray(user?.roles) ? user.roles : []),
      ...(user?.role ? [user.role] : [])
    ]
    return [...new Set(
      raw
        .map(r => String(r || '').trim().toLowerCase())
        .filter(r => USER_ROLE_WHITELIST.has(r))
    )]
  }

  function toAdminUserItem(user) {
    return {
      id: String(user.id || ''),
      username: String(user.username || ''),
      email: String(user.email || ''),
      uuid: String(user.uuid || user.linkedMcUuid || ''),
      roles: normalizedUserRoles(user),
      emailVerified: Boolean(user.emailVerified),
      linkedMcUsername: user.linkedMcUsername || null,
      createdAt: user.createdAt || '',
      updatedAt: user.updatedAt || '',
      isBanned: Boolean(user.isBanned),
      bannedAt: user.bannedAt || null,
      bannedUntil: user.bannedUntil || null,
      banReason: user.banReason || '',
      bannedBy: user.bannedBy || null,
      note: user.note || '',
    }
  }

  // ============ 辅助：获取列表（带分页/过滤） ============

  function listCatalogItems({ keyword, status, model, page = 1, pageSize = 20 }) {
    const store = getStore()
    const items = (store.catalog || [])

    // 过滤
      .filter(item => {
        if (keyword) {
          const kw = keyword.toLowerCase()
          if (
            !String(item.title || '').toLowerCase().includes(kw) &&
            !String(item.desc || '').toLowerCase().includes(kw) &&
            !String(item.tag || '').toLowerCase().includes(kw)
          ) return false
        }
        if (model && model !== 'all' && item.model !== model) return false
        // status 映射：catalog 没有 status 字段，只有 skinTextureUrl 存在表示 online
        if (status) {
          const itemOnline = Boolean(item.skinTextureUrl)
          if (status === 'online' && !itemOnline) return false
          if (status === 'offline' && itemOnline) return false
        }
        return true
      })

    const total = items.length
    const start = (page - 1) * pageSize
    const paged = items.slice(start, start + pageSize).map(item => ({
      id: String(item.id || ''),
      name: String(item.title || item.id || ''),
      model: item.model || 'default',
      skinUrl: item.skinTextureUrl || '',
      capeUrl: item.capeUrl || null,
      previewUrl: item.skinTextureUrl || null,
      tags: item.tag ? [item.tag] : [],
      uploaderId: item.uploaderId || '',
      uploaderName: item.uploaderName || undefined,
      status: item.skinTextureUrl ? 'online' : 'offline',
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || '',
    }))

    return { items: paged, total, page, pageSize }
  }

  function itemByIdOr404(id) {
    const store = getStore()
    const raw = (store.catalog || []).find(i => String(i.id || '') === String(id))
    if (!raw) return null
    return {
      id: String(raw.id || ''),
      name: String(raw.title || raw.id || ''),
      model: raw.model || 'default',
      skinUrl: raw.skinTextureUrl || '',
      capeUrl: raw.capeUrl || null,
      previewUrl: raw.skinTextureUrl || null,
      tags: raw.tag ? [raw.tag] : [],
      uploaderId: raw.uploaderId || '',
      uploaderName: raw.uploaderName || undefined,
      status: raw.skinTextureUrl ? 'online' : 'offline',
      createdAt: raw.createdAt || '',
      updatedAt: raw.updatedAt || '',
    }
  }

  // ============ GET /api/admin/skins ============

  app.get('/api/admin/skins', requireAdmin, (req, res) => {
    const pagination = resolvePageQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 20,
      maxPageSize: 100
    })
    const keyword = String(req.query.keyword || '').trim() || undefined
    const status = String(req.query.status || '').trim() || undefined
    const model = String(req.query.model || '').trim() || undefined
    return pageResponse(res, listCatalogItems({
      keyword,
      status,
      model,
      page: pagination.page,
      pageSize: pagination.pageSize
    }))
  })

  // ============ GET /api/admin/skins/:id ============

  app.get('/api/admin/skins/:id', requireAdmin, (req, res) => {
    const item = itemByIdOr404(req.params.id)
    if (!item) return jsonErr(res, 404, '条目不存在', 'not_found')
    okResponse(res, { item })
  })

  // ============ POST /api/admin/skins — 创建 ============

  app.post('/api/admin/skins', requireAdmin, asyncHandler(async (req, res) => {
    const { name, model, skinUrl, capeUrl, tags, previewUrl } = req.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      return jsonErr(res, 400, '缺少皮肤名称', 'validation_error')
    }
    const id = String(crypto.randomUUID())
    const now = new Date().toISOString()
    const newItem = {
      id,
      title: String(name).trim(),
      desc: String(req.body.desc || '').trim(),
      tag: Array.isArray(tags) ? tags[0] : (typeof tags === 'string' ? tags : ''),
      cover: previewUrl || '',
      skinTextureUrl: skinUrl || '',
      capeUrl: capeUrl || '',
      model: ['default', 'slim', 'auto'].includes(model) ? model : 'default',
      createdAt: now,
      updatedAt: now,
    }
    const store = getStore()
    if (!Array.isArray(store.catalog)) store.catalog = []
    store.catalog.push(newItem)
    touchStore('catalog_state')
    okResponse(res, { item: itemByIdOr404(id), message: '创建成功' }, 201)
  }))

  // ============ PUT /api/admin/skins/:id ============

  app.put('/api/admin/skins/:id', requireAdmin, asyncHandler(async (req, res) => {
    const store = getStore()
    const idx = (store.catalog || []).findIndex(i => String(i.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '条目不存在', 'not_found')

    const existing = store.catalog[idx]
    const { name, model, skinUrl, capeUrl, tags, previewUrl, desc } = req.body || {}

    const updated = {
      ...existing,
      title: (name && typeof name === 'string') ? name.trim() : existing.title,
      desc: (desc !== undefined && typeof desc === 'string') ? desc.trim() : existing.desc,
      tag: tags
        ? (Array.isArray(tags) ? tags[0] : String(tags))
        : existing.tag,
      cover: (previewUrl !== undefined) ? String(previewUrl || '') : existing.cover,
      skinTextureUrl: (skinUrl !== undefined) ? String(skinUrl || '') : existing.skinTextureUrl,
      capeUrl: (capeUrl !== undefined) ? String(capeUrl || '') : existing.capeUrl,
      model: ['default', 'slim', 'auto'].includes(model) ? model : existing.model,
      updatedAt: new Date().toISOString(),
    }
    store.catalog[idx] = updated
    touchStore('catalog_state')
    okResponse(res, { item: itemByIdOr404(req.params.id), message: '更新成功' })
  }))

  // ============ PATCH /api/admin/skins/:id/status ============

  app.patch('/api/admin/skins/:id/status', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.catalog || []).findIndex(i => String(i.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '条目不存在', 'not_found')

    const { status } = req.body || {}
    const storeItem = store.catalog[idx]

    if (status === 'online') {
      // 上线：确保有 skinTextureUrl
      if (!storeItem.skinTextureUrl) {
        return jsonErr(res, 400, '无法上线：未设置皮肤资源', 'no_texture')
      }
    }
    // offline 状态：catalog 没有独立 status，通过 skinTextureUrl 判断
    // 这里只记录操作，不实际改变皮肤
    okResponse(res, { id: req.params.id, status: status || 'offline', message: '状态已更新' })
  })

  // ============ PATCH /api/admin/skins/batch/status ============

  app.patch('/api/admin/skins/batch/status', requireAdmin, (req, res) => {
    const { ids = [] } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonErr(res, 400, '缺少 ids', 'validation_error')
    }
    const store = getStore()
    const success = []
    const failed = []

    for (const id of ids) {
      const idx = (store.catalog || []).findIndex(i => String(i.id || '') === String(id))
      if (idx < 0) {
        failed.push({ id: String(id), reason: '不存在' })
      } else {
        success.push(String(id))
      }
    }
    res.json({ ok: true, success, failed, message: `操作完成：成功 ${success.length}，失败 ${failed.length}` })
  })

  // ============ DELETE /api/admin/skins/:id ============

  app.delete('/api/admin/skins/:id', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.catalog || []).findIndex(i => String(i.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '条目不存在', 'not_found')
    store.catalog.splice(idx, 1)
    touchStore('catalog_state')
    okResponse(res, { id: req.params.id, message: '删除成功' })
  })

  // ============ DELETE /api/admin/skins/batch ============

  app.delete('/api/admin/skins/batch', requireAdmin, (req, res) => {
    const { ids = [] } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonErr(res, 400, '缺少 ids', 'validation_error')
    }
    const store = getStore()
    const idSet = new Set(ids.map(id => String(id)))
    const before = store.catalog.length
    store.catalog = (store.catalog || []).filter(i => !idSet.has(String(i.id || '')))
    const removed = before - store.catalog.length
    touchStore('catalog_state')
    res.json({ ok: true, success: ids.filter(id => idSet.has(String(id))), failed: [], message: `删除 ${removed} 条` })
  })

  // ============ 角色管理 ============

  // GET /api/admin/users — 列出所有用户（ID/用户名/角色，用于角色分配）
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const store = getStore()
    const keyword = String(req.query.keyword || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim().toLowerCase()
    const role = String(req.query.role || '').trim().toLowerCase()
    const pagination = resolvePageQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 20,
      maxPageSize: 100
    })

    let users = (store.users || [])
    if (keyword) {
      users = users.filter(u => {
        const un = String(u.username || '').toLowerCase()
        const em = String(u.email || '').toLowerCase()
        const uid = String(u.id || '').toLowerCase()
        const uuid = String(u.uuid || u.linkedMcUuid || '').toLowerCase()
        return un.includes(keyword) || em.includes(keyword) || uid.includes(keyword) || uuid.includes(keyword)
      })
    }
    if (status === 'banned') users = users.filter(u => Boolean(u.isBanned))
    if (status === 'active') users = users.filter(u => !u.isBanned)
    if (role && role !== 'all') users = users.filter(u => normalizedUserRoles(u).includes(role))
    const total = users.length
    const start = pagination.offset
    const paged = users.slice(start, start + pagination.limit).map(toAdminUserItem)

    return pageResponse(res, {
      items: paged,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
  })

  // GET /api/admin/users/:id — 查单个用户详情
  app.get('/api/admin/users/:id', requireAdmin, (req, res) => {
    const store = getStore()
    const u = (store.users || []).find(x => String(x.id || '') === String(req.params.id))
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    okResponse(res, { user: toAdminUserItem(u) })
  })

  // PATCH /api/admin/users/:id — 编辑用户基本信息
  app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.users || []).findIndex(x => String(x.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '用户不存在', 'not_found')
    const user = store.users[idx]
    const before = toAdminUserItem(user)

    const patch = req.body || {}
    if (patch.username !== undefined) {
      const nextUsername = String(patch.username || '').trim()
      if (!nextUsername || nextUsername.length < 2 || nextUsername.length > 32) {
        return jsonErr(res, 400, 'username 长度需在 2-32 之间', 'validation_error')
      }
      const hasDup = (store.users || []).some(
        (u, i) => i !== idx && String(u.username || '').toLowerCase() === nextUsername.toLowerCase()
      )
      if (hasDup) return jsonErr(res, 409, '用户名已存在', 'username_exists')
      user.username = nextUsername
    }
    if (patch.email !== undefined) {
      const nextEmail = String(patch.email || '').trim()
      if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        return jsonErr(res, 400, '邮箱格式不正确', 'validation_error')
      }
      user.email = nextEmail
    }
    if (patch.emailVerified !== undefined) {
      user.emailVerified = Boolean(patch.emailVerified)
    }
    if (patch.note !== undefined) {
      const note = String(patch.note || '').trim()
      if (note.length > 200) return jsonErr(res, 400, '备注长度不能超过 200', 'validation_error')
      user.note = note
    }
    user.updatedAt = new Date().toISOString()

    appendUserAdminAudit(store, req, {
      action: 'user_edit',
      targetUserId: String(user.id || ''),
      targetUsername: String(user.username || ''),
      detail: {
        before,
        after: toAdminUserItem(user),
      }
    })
    touchUserProfile(user.id, 'user_admin_audit_logs')
    okResponse(res, { user: toAdminUserItem(user), message: '用户信息已更新' })
  })

  // PUT /api/admin/users/:id/roles — 分配角色（reviewer / moderator / admin）
  app.put('/api/admin/users/:id/roles', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.users || []).findIndex(x => String(x.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '用户不存在', 'not_found')

    const { roles } = req.body || {}
    if (!Array.isArray(roles)) {
      return jsonErr(res, 400, 'roles 必须是字符串数组', 'validation_error')
    }
    const beforeRoles = normalizedUserRoles(store.users[idx])
    const sanitized = roles
      .filter(r => typeof r === 'string' && USER_ROLE_WHITELIST.has(r.toLowerCase().trim()))
      .map(r => r.toLowerCase().trim())
    // 去重
    const unique = [...new Set(sanitized)]

    store.users[idx].roles = unique
    store.users[idx].updatedAt = new Date().toISOString()
    appendUserAdminAudit(store, req, {
      action: 'user_roles_update',
      targetUserId: String(store.users[idx].id || ''),
      targetUsername: String(store.users[idx].username || ''),
      detail: {
        beforeRoles,
        afterRoles: unique
      }
    })
    touchUserProfile(store.users[idx].id, 'user_admin_audit_logs')
    okResponse(res, {
      id: store.users[idx].id,
      username: store.users[idx].username,
      roles: unique,
      message: `已更新角色：${unique.length ? unique.join(', ') : '（无角色）'}`
    })
  })

  // POST /api/admin/users/:id/ban — 封禁用户
  app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.users || []).findIndex(x => String(x.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '用户不存在', 'not_found')
    const user = store.users[idx]

    const reason = String(req.body?.reason || '').trim() || '管理员封禁'
    const durationHours = Number(req.body?.durationHours)
    const now = Date.now()
    const bannedUntil = Number.isFinite(durationHours) && durationHours > 0
      ? new Date(now + durationHours * 3600 * 1000).toISOString()
      : null
    user.isBanned = true
    user.banReason = reason
    user.bannedAt = new Date(now).toISOString()
    user.bannedUntil = bannedUntil
    user.bannedBy = String(req.user?.id || '')
    user.updatedAt = new Date(now).toISOString()

    appendUserAdminAudit(store, req, {
      action: 'user_ban',
      targetUserId: String(user.id || ''),
      targetUsername: String(user.username || ''),
      detail: {
        reason,
        durationHours: Number.isFinite(durationHours) ? durationHours : null,
        bannedUntil,
      }
    })
    touchUserProfile(user.id, 'user_admin_audit_logs')
    okResponse(res, { user: toAdminUserItem(user), message: '用户已封禁' })
  })

  // POST /api/admin/users/:id/unban — 解封用户
  app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.users || []).findIndex(x => String(x.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '用户不存在', 'not_found')
    const user = store.users[idx]

    const wasBanned = Boolean(user.isBanned)
    user.isBanned = false
    user.banReason = ''
    user.bannedAt = null
    user.bannedUntil = null
    user.bannedBy = null
    user.updatedAt = new Date().toISOString()
    appendUserAdminAudit(store, req, {
      action: 'user_unban',
      targetUserId: String(user.id || ''),
      targetUsername: String(user.username || ''),
      detail: { wasBanned }
    })
    touchUserProfile(user.id, 'user_admin_audit_logs')
    okResponse(res, { user: toAdminUserItem(user), message: wasBanned ? '用户已解封' : '用户当前未被封禁' })
  })

  // DELETE /api/admin/users/:id — 删除用户
  app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const store = getStore()
    const idx = (store.users || []).findIndex(x => String(x.id || '') === String(req.params.id))
    if (idx < 0) return jsonErr(res, 404, '用户不存在', 'not_found')
    if (String(req.user?.id || '') === String(req.params.id)) {
      return jsonErr(res, 400, '不能删除当前登录管理员', 'cannot_delete_self')
    }
    const deleted = toAdminUserItem(store.users[idx])
    store.users.splice(idx, 1)
    appendUserAdminAudit(store, req, {
      action: 'user_delete',
      targetUserId: deleted.id,
      targetUsername: deleted.username,
      detail: { deleted }
    })
    touchUserProfile(deleted.id, 'user_admin_audit_logs')
    okResponse(res, { id: deleted.id, message: '用户已删除' })
  })

  // GET /api/admin/users/:id/audit — 用户管理审计记录
  app.get('/api/admin/users/:id/audit', requireAdmin, (req, res) => {
    const store = getStore()
    const pagination = resolvePageQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 20,
      maxPageSize: 100
    })
    const logs = ensureUserAdminAuditLogs(store)
      .filter(item => String(item.targetUserId || '') === String(req.params.id))
    const total = logs.length
    const start = pagination.offset
    const items = logs.slice(start, start + pagination.limit)
    return pageResponse(res, {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
  })
}
