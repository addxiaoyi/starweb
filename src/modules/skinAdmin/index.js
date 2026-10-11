/**
 * 皮肤管理后台 — 举报审核
 *
 * 提供举报列表查看和审核处理功能（通过/拒绝/标记）。
 */

export function registerSkinAdminRoutes(app, deps) {
  const { importGithubSkin } = deps
  const {
    requireUser,
    requireAdmin,
    jsonOk,
    jsonErr,
    getStore,
    scheduleSave,
    asyncHandler,
    resolvePaginationQuery,
    jsonPage,
    UPLOAD_DIR,
  } = deps

  app.post('/api/admin/skins/import-github', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    if (typeof importGithubSkin !== 'function') return jsonErr(res, 503, 'GitHub 导入未配置', 'import_unavailable')
    try {
      const result = await importGithubSkin({
        store: getStore(), uploadsDir: UPLOAD_DIR,
        owner: String(req.body?.owner || '').trim(), repo: String(req.body?.repo || '').trim(),
        filePath: String(req.body?.path || '').trim(), name: req.body?.name, type: req.body?.type,
      })
      if (!result.ok) return jsonErr(res, result.code === 'duplicate_texture' ? 409 : 400, 'GitHub 皮肤导入失败', result.code, result)
      scheduleSave()
      return jsonOk(res, { item: result.item })
    } catch (error) {
      return jsonErr(res, 502, 'GitHub 资源核验失败', 'github_upstream_error', { detail: error.message })
    }
  }))

  app.get('/api/admin/skins/pending-source', requireUser, requireAdmin, (req, res) => {
    const items = (getStore().catalog || []).filter((item) => item?.reviewStatus === 'pending')
    return jsonOk(res, { items, total: items.length })
  })

  app.patch('/api/admin/skins/:id/source-review', requireUser, requireAdmin, (req, res) => {
    const store = getStore()
    const item = (store.catalog || []).find((entry) => String(entry.id) === String(req.params.id))
    if (!item) return jsonErr(res, 404, '皮肤不存在', 'not_found')
    const action = String(req.body?.action || '').trim()
    if (!['approve', 'reject'].includes(action)) return jsonErr(res, 400, '审核动作无效', 'validation_error')
    if (action === 'approve') {
      const sourceUrl = String(req.body?.sourceUrl || '').trim()
      const licenseUrl = String(req.body?.licenseUrl || '').trim()
      const license = String(req.body?.license || '').trim()
      if (!/^https:\/\/github\.com\//i.test(sourceUrl) || !/^https:\/\/github\.com\//i.test(licenseUrl) || !license) {
        return jsonErr(res, 400, '通过审核必须提供 GitHub 来源、许可证和许可证地址', 'license_proof_required')
      }
      item.source = 'open-source-authorized'
      item.license = license
      item.sourceUrl = sourceUrl
      item.licenseUrl = licenseUrl
      item.reviewStatus = 'approved'
      item.public = true
      item.visibility = 'public'
    } else {
      item.reviewStatus = 'rejected'
      item.public = false
      item.visibility = 'private'
    }
    item.sourceReviewedBy = req.user.id
    item.sourceReviewedAt = new Date().toISOString()
    scheduleSave()
    return jsonOk(res, { item })
  })

  // ── 举报列表 ──────────────────────────────────────────────
  app.get(
    '/api/admin/reports',
    requireUser,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const reports = store.reports || []
      const statusFilter = String(req.query.status || '').trim().toLowerCase()
      const filtered = statusFilter
        ? reports.filter((r) => String(r.status || '').toLowerCase() === statusFilter)
        : reports

      if (resolvePaginationQuery && jsonPage) {
        const pagination = resolvePaginationQuery(req.query)
        const items = filtered.slice(pagination.offset, pagination.offset + pagination.pageSize)
        return jsonPage(res, items, filtered.length, pagination)
      }

      jsonOk(res, { items: filtered, total: filtered.length })
    })
  )

  // ── 举报详情 ──────────────────────────────────────────────
  app.get(
    '/api/admin/reports/:id',
    requireUser,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const reportId = String(req.params.id || '').trim()
      if (!reportId) return jsonErr(res, 400, '缺少举报 ID', 'validation_error')

      const store = getStore()
      const report = (store.reports || []).find((r) => String(r.id) === reportId)
      if (!report) return jsonErr(res, 404, '举报不存在', 'not_found')
      jsonOk(res, report)
    })
  )

  // ── 处理举报（PATCH） ─────────────────────────────────────
  app.patch(
    '/api/admin/reports/:id',
    requireUser,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const reportId = String(req.params.id || '').trim()
      if (!reportId) return jsonErr(res, 400, '缺少举报 ID', 'validation_error')

      const store = getStore()
      const reports = store.reports || []
      const report = reports.find((r) => String(r.id) === reportId)
      if (!report) return jsonErr(res, 404, '举报不存在', 'not_found')

      const body = req.body || {}
      const status = typeof body.status === 'string' ? body.status.trim() : undefined
      const resolution = body.resolution !== undefined ? String(body.resolution).trim() : undefined
      const note = body.note !== undefined ? String(body.note).trim() : undefined

      const validStatuses = ['open', 'reviewing', 'resolved', 'rejected', 'dismissed']
      if (status !== undefined && !validStatuses.includes(status)) {
        return jsonErr(res, 400, `无效状态，可选: ${validStatuses.join(', ')}`, 'validation_error')
      }
      if (resolution !== undefined && resolution.length > 500) {
        return jsonErr(res, 400, '处理结论不能超过 500 字符', 'validation_error')
      }
      if (note !== undefined && note.length > 500) {
        return jsonErr(res, 400, '备注不能超过 500 字符', 'validation_error')
      }

      if (status !== undefined) report.status = status
      if (resolution !== undefined) report.resolution = resolution
      if (note !== undefined) report.adminNote = note
      report.reviewedBy = req.user?.id || req.adminId || 'admin'
      report.reviewedAt = new Date().toISOString()

      scheduleSave()
      jsonOk(res, report)
    })
  )

  // ── 处理举报（兼容前端 /api/admin/skins/reports/:id） ─────
  app.patch(
    '/api/admin/skins/reports/:id',
    requireUser,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const reportId = String(req.params.id || '').trim()
      if (!reportId) return jsonErr(res, 400, '缺少举报 ID', 'validation_error')

      const store = getStore()
      const reports = store.reports || []
      const report = reports.find((r) => String(r.id) === reportId)
      if (!report) return jsonErr(res, 404, '举报不存在', 'not_found')

      const body = req.body || {}
      const status = typeof body.status === 'string' ? body.status.trim() : undefined
      const resolution = body.resolution !== undefined ? String(body.resolution).trim() : undefined
      const note = body.note !== undefined ? String(body.note).trim() : undefined

      const validStatuses = ['open', 'reviewing', 'resolved', 'rejected', 'dismissed']
      if (status !== undefined && !validStatuses.includes(status)) {
        return jsonErr(res, 400, `无效状态，可选: ${validStatuses.join(', ')}`, 'validation_error')
      }
      if (resolution !== undefined && resolution.length > 500) {
        return jsonErr(res, 400, '处理结论不能超过 500 字符', 'validation_error')
      }
      if (note !== undefined && note.length > 500) {
        return jsonErr(res, 400, '备注不能超过 500 字符', 'validation_error')
      }

      if (status !== undefined) report.status = status
      if (resolution !== undefined) report.resolution = resolution
      if (note !== undefined) report.adminNote = note
      report.reviewedBy = req.user?.id || req.adminId || 'admin'
      report.reviewedAt = new Date().toISOString()

      scheduleSave()
      jsonOk(res, report)
    })
  )
}
