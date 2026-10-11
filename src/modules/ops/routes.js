import { jsonPage, resolvePaginationQuery } from '../../utils/response.js'

export function registerOpsRoutes(app, deps) {
  const {
    requireUser,
    requireOpsTaskAccess,
    requireAuditLogAccess,
    getStore,
    jsonErr,
    scheduleSave,
    ensureAsyncTasksStore,
    appendAsyncTask,
    updateAsyncTask,
    ensureDeadLetterQueue,
    ensureSecurityCenter,
    parseTimeMs,
    markKvDirty,
    createRetryOpsTaskHandler,
    createRetryDeadLetterHandler,
    crypto,
  } = deps

  app.get('/api/admin/ops/tasks', requireUser, (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const store = getStore()
    const pagination = resolvePaginationQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200
    })
    const status = String(req.query.status || '').trim().toLowerCase()
    const type = String(req.query.type || '').trim().toLowerCase()

    const asyncTasks = ensureAsyncTasksStore(store).map((row) => ({
      id: String(row?.id || ''),
      source: 'async_tasks',
      type: String(row?.type || ''),
      status: String(row?.status || 'pending'),
      createdAt: String(row?.createdAt || ''),
      updatedAt: String(row?.updatedAt || row?.createdAt || ''),
      payload: row
    }))
    const syncTasks = (Array.isArray(store.skinSyncTasks) ? store.skinSyncTasks : []).map((row) => ({
      id: String(row?.id || ''),
      source: 'skin_sync_tasks',
      type: String(row?.type || 'catalog_sync'),
      status: String(row?.status || 'unknown'),
      createdAt: String(row?.startedAt || row?.finishedAt || ''),
      updatedAt: String(row?.finishedAt || row?.startedAt || ''),
      payload: row
    }))
    const webhookTasks = ensureSecurityCenter(store).webhookQueue.map((row) => ({
      id: String(row?.id || ''),
      source: 'security_webhook_queue',
      type: 'security_webhook',
      status: String(row?.status || 'pending'),
      createdAt: String(row?.at || ''),
      updatedAt: String(row?.lastTryAt || row?.sentAt || row?.lastReplayAt || row?.at || ''),
      payload: row
    }))
    let items = [...asyncTasks, ...syncTasks, ...webhookTasks]
    if (status) items = items.filter((row) => String(row.status).toLowerCase() === status)
    if (type) items = items.filter((row) => String(row.type).toLowerCase().includes(type))
    items = items
      .sort((a, b) => parseTimeMs(b.updatedAt) - parseTimeMs(a.updatedAt))
    const total = items.length
    const start = pagination.offset
    return jsonPage(res, items.slice(start, start + pagination.pageSize), total, pagination)
  })

  app.post('/api/admin/ops/tasks', requireUser, (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const type = String(req.body?.type || '').trim()
    if (!type) return jsonErr(res, 400, '缺少 type', 'validation_error')
    const store = getStore()
    const row = appendAsyncTask(store, {
      type,
      status: String(req.body?.status || 'pending'),
      payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
      createdBy: String(req.body?.createdBy || req.ip || ''),
    })
    scheduleSave()
    res.status(201).json({ ok: true, item: row })
  })

  app.patch('/api/admin/ops/tasks/:id', requireUser, (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少任务 id', 'validation_error')
    const store = getStore()
    const patch = {}
    if (req.body?.status !== undefined) patch.status = String(req.body.status || '')
    if (req.body?.payload !== undefined && req.body.payload && typeof req.body.payload === 'object') {
      patch.payload = req.body.payload
    }
    if (req.body?.finishedAt !== undefined) patch.finishedAt = String(req.body.finishedAt || '')
    const row = updateAsyncTask(store, id, patch)
    if (!row) return jsonErr(res, 404, '任务不存在', 'not_found')
    scheduleSave()
    res.json({ ok: true, item: row })
  })

  const retryOpsTaskHandler = createRetryOpsTaskHandler({
    requireDevAdmin: requireOpsTaskAccess,
    jsonErr,
    getStore,
    scheduleSave,
    markKvDirty,
    createId: () => crypto.randomUUID(),
  })
  app.post('/api/admin/ops/tasks/:id/retry', requireUser, retryOpsTaskHandler)

  app.get('/api/admin/ops/dead-letters', requireUser, (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const store = getStore()
    const pagination = resolvePaginationQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200
    })
    const type = String(req.query.type || '').trim().toLowerCase()
    const resolved = String(req.query.resolved || '').trim().toLowerCase()
    let items = ensureDeadLetterQueue(store).slice()
    if (type) items = items.filter((row) => String(row?.type || '').toLowerCase().includes(type))
    if (resolved === 'true') items = items.filter((row) => Boolean(row?.resolvedAt))
    if (resolved === 'false') items = items.filter((row) => !row?.resolvedAt)
    items.sort((a, b) => parseTimeMs(b?.at) - parseTimeMs(a?.at))
    const total = items.length
    const start = pagination.offset
    return jsonPage(res, items.slice(start, start + pagination.pageSize), total, pagination)
  })

  const retryDeadLetterHandler = createRetryDeadLetterHandler({
    requireDevAdmin: requireOpsTaskAccess,
    jsonErr,
    getStore,
    scheduleSave,
    markKvDirty,
    ensureDeadLetterQueue,
    ensureSecurityCenter,
    appendAsyncTask,
    createId: () => crypto.randomUUID(),
  })
  app.post('/api/admin/ops/dead-letters/:id/retry', requireUser, retryDeadLetterHandler)

  app.get('/api/admin/audit/logs', requireUser, (req, res) => {
    if (!requireAuditLogAccess(req, res)) return
    const store = getStore()
    const moduleFilter = String(req.query.module || '').trim().toLowerCase()
    const actionFilter = String(req.query.action || '').trim().toLowerCase()
    const q = String(req.query.q || '').trim().toLowerCase()
    const pagination = resolvePaginationQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200
    })

    const userAdminLogs = (Array.isArray(store.userAdminAuditLogs) ? store.userAdminAuditLogs : []).map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.at || ''),
      module: 'user_admin',
      action: String(row?.action || ''),
      actorUserId: String(row?.actorUserId || ''),
      actorUsername: String(row?.actorUsername || ''),
      targetUserId: String(row?.targetUserId || ''),
      targetUsername: String(row?.targetUsername || ''),
      detail: row?.detail || {},
      diff: row?.detail?.before && row?.detail?.after ? { before: row.detail.before, after: row.detail.after } : undefined
    }))
    const reviewLogs = (Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []).map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.time || row?.at || ''),
      module: 'skin_review',
      action: String(row?.action || ''),
      actorUserId: '',
      actorUsername: String(row?.operator || ''),
      targetUserId: '',
      targetUsername: '',
      detail: row || {}
    }))
    const securityLogs = ensureSecurityCenter(store).auditLogs.map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.at || ''),
      module: 'security',
      action: String(row?.action || ''),
      actorUserId: String(row?.userId || ''),
      actorUsername: '',
      targetUserId: String(row?.userId || ''),
      targetUsername: '',
      detail: row?.detail || {}
    }))
    const opsLogs = (Array.isArray(store.opsAuditLogs) ? store.opsAuditLogs : []).map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.at || ''),
      module: 'ops',
      action: String(row?.action || ''),
      actorUserId: String(row?.actorUserId || ''),
      actorUsername: String(row?.actorUsername || ''),
      targetUserId: String(row?.targetId || ''),
      targetUsername: '',
      detail: row?.detail || {}
    }))
    let items = [...userAdminLogs, ...reviewLogs, ...securityLogs, ...opsLogs]
    if (moduleFilter) items = items.filter((row) => String(row.module || '').toLowerCase() === moduleFilter)
    if (actionFilter) items = items.filter((row) => String(row.action || '').toLowerCase().includes(actionFilter))
    if (q) {
      items = items.filter((row) => {
        const haystack = [
          row.action,
          row.actorUsername,
          row.actorUserId,
          row.targetUsername,
          row.targetUserId,
          JSON.stringify(row.detail || {})
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    items = items.sort((a, b) => parseTimeMs(b.at) - parseTimeMs(a.at))
    const total = items.length
    const start = pagination.offset
    return jsonPage(res, items.slice(start, start + pagination.pageSize), total, pagination)
  })

  app.get('/api/admin/audit/export', requireUser, (req, res) => {
    if (!requireAuditLogAccess(req, res)) return
    const store = getStore()
    const moduleFilter = String(req.query.module || '').trim().toLowerCase()
    const rows = []
    const pick = (module, at, action, actor, target, detail) => {
      if (moduleFilter && moduleFilter !== module) return
      rows.push([module, at, action, actor, target, JSON.stringify(detail || {})])
    }
    for (const row of Array.isArray(store.userAdminAuditLogs) ? store.userAdminAuditLogs : []) {
      pick(
        'user_admin',
        String(row?.at || ''),
        String(row?.action || ''),
        String(row?.actorUsername || row?.actorUserId || ''),
        String(row?.targetUsername || row?.targetUserId || ''),
        row?.detail || {}
      )
    }
    for (const row of Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []) {
      pick(
        'skin_review',
        String(row?.time || row?.at || ''),
        String(row?.action || ''),
        String(row?.operator || ''),
        String(row?.submissionId || ''),
        row || {}
      )
    }
    for (const row of ensureSecurityCenter(store).auditLogs) {
      pick(
        'security',
        String(row?.at || ''),
        String(row?.action || ''),
        String(row?.userId || ''),
        String(row?.userId || ''),
        row?.detail || {}
      )
    }
    for (const row of Array.isArray(store.opsAuditLogs) ? store.opsAuditLogs : []) {
      pick(
        'ops',
        String(row?.at || ''),
        String(row?.action || ''),
        String(row?.actorUsername || row?.actorUserId || ''),
        String(row?.targetId || ''),
        row?.detail || {}
      )
    }
    const header = ['module', 'at', 'action', 'actor', 'target', 'detail']
    const csvSafe = (value) => {
      let s = String(value ?? '')
      s = s.replace(/"/g, '""')
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s}"`
    }
    const csv = [header, ...rows]
      .map((cols) => cols.map(csvSafe).join(','))
      .join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`)
    res.send(`\uFEFF${csv}`)
  })
}
