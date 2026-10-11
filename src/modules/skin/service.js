export function summarizeSubmissionStats(store) {
  const rows = Array.isArray(store?.submissions) ? store.submissions : []
  let pending = 0
  let approved = 0
  let rejected = 0
  let latestSubmittedAt = null
  for (const row of rows) {
    const status = String(row?.status || '').toLowerCase()
    if (status === 'pending') pending += 1
    else if (status === 'approved') approved += 1
    else if (status === 'rejected') rejected += 1
    const at = row?.submittedAt || row?.createdAt
    if (at && (!latestSubmittedAt || at > latestSubmittedAt)) latestSubmittedAt = at
  }
  return { pending, approved, rejected, total: rows.length, latestSubmittedAt }
}

export function filterReviewAuditLogs(store, filters = {}) {
  const actionFilter = String(filters.action || '').trim().toLowerCase()
  const operatorFilter = String(filters.operator || '').trim().toLowerCase()
  const submissionIdFilter = String(filters.submissionId || '').trim()
  const q = String(filters.q || '').trim().toLowerCase()

  let rows = Array.isArray(store.reviewAuditLogs) ? [...store.reviewAuditLogs] : []
  if (actionFilter) rows = rows.filter((r) => String(r.action || '').toLowerCase() === actionFilter)
  if (operatorFilter) rows = rows.filter((r) => String(r.operator || '').toLowerCase().includes(operatorFilter))
  if (submissionIdFilter) rows = rows.filter((r) => String(r.submissionId || '') === submissionIdFilter)
  if (q) {
    rows = rows.filter((r) =>
      [r.title, r.note, r.operator, r.submissionId]
        .map((x) => String(x || '').toLowerCase())
        .some((x) => x.includes(q))
    )
  }
  return rows
}

export function appendReviewAuditLog(store, markKvDirty, crypto, payload) {
  if (!Array.isArray(store.reviewAuditLogs)) store.reviewAuditLogs = []
  store.reviewAuditLogs.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...payload })
  if (store.reviewAuditLogs.length > 5000) store.reviewAuditLogs.length = 5000
  markKvDirty('review_audit_logs')
}

export function parseExpectedVersion(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { provided: false, valid: true, value: null }
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    return { provided: true, valid: false, value: null }
  }
  return { provided: true, valid: true, value: n }
}

function removeSubmissionCatalogEntry(store, submissionId) {
  const id = String(submissionId || '').trim()
  if (!id || !Array.isArray(store.catalog)) return false
  const before = store.catalog.length
  store.catalog = store.catalog.filter((item) => String(item?.id || '') !== `sub_${id}`)
  return store.catalog.length !== before
}

function syncSubmissionAssetStatus(store, submission, status) {
  const userId = String(submission.userId || '').trim()
  const assetId = String(submission.assetId || submission.id || '').trim()
  const kind = String(submission.kind || '').trim()
  if (!userId || !assetId || (kind !== 'skin' && kind !== 'cape')) return false

  const state = store.playerState?.[userId]
  if (!state?.assets || typeof state.assets !== 'object') return false
  const key = `${kind}_${assetId.replaceAll('-', '_')}`
  const asset = state.assets[key]
  if (!asset) return false
  asset.status = status
  asset.reviewedAt = submission.reviewedAt
  asset.reviewNote = submission.reviewNote
  return true
}

function publishApprovedSubmissionToCatalog(store, submission, note, deps) {
  if (submission.kind && submission.kind !== 'skin') return false
  const localPath = submission.localPath || submission.texturePath
  if (!localPath) return false
  if (!Array.isArray(store.catalog)) store.catalog = []
  removeSubmissionCatalogEntry(store, submission.id)
  const pubSkinUrl = `/uploads/${encodeURI(String(localPath).replace(/\\/g, '/'))}`
  const slugName = String(submission.title || submission.name || submission.fileName || submission.id || '未命名')
    .replace(/\.(png|dat)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  const catalogItem = {
    id: `sub_${submission.id}`,
    source: 'submission',
    submissionId: submission.id,
    name: slugName,
    title: slugName,
    type: submission.type || submission.model || 'steve',
    model: submission.model || submission.type || 'default',
    creator: submission.submitterUsername || submission.creator || 'Unknown',
    skinTextureUrl: pubSkinUrl,
    cover: pubSkinUrl,
    textureUrl: pubSkinUrl,
    createdAt: submission.submittedAt || new Date().toISOString(),
    updatedAt: submission.reviewedAt || new Date().toISOString(),
    uploaderId: submission.userId,
    uploaderName: submission.submitterUsername || '',
    desc: note ? `审核备注：${note}` : '',
  }
  store.catalog.push(catalogItem)
  deps.markKvDirty?.('catalog_state')
  deps.bumpCatalogLibraryVersion?.(store)
  deps.broadcastCatalogSync?.(store, { reason: 'submission_approved', submissionId: submission.id })
  return true
}

export function performSubmissionReview(store, deps, submissionId, action, options = {}) {
  const parsedVersion = parseExpectedVersion(options.expectedVersion)
  if (parsedVersion.provided && !parsedVersion.valid) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'expectedVersion 必须是 >= 0 的整数',
      details: { field: 'expectedVersion' },
    }
  }

  const sub = store.submissions?.find((s) => String(s.id) === String(submissionId))
  if (!sub) return { ok: false, code: 'not_found', message: '投稿不存在' }

  const status = String(sub.status || '').toLowerCase()
  if (status !== 'pending') {
    return {
      ok: false,
      code: 'already_reviewed',
      message: '投稿已审核',
      details: { submissionId, currentStatus: status, requestedAction: action, requiredStatus: 'pending' },
    }
  }

  const actualVersion = Number(sub.reviewVersion || 0)
  if (parsedVersion.provided && parsedVersion.value !== actualVersion) {
    return {
      ok: false,
      code: 'version_conflict',
      message: '版本冲突，请刷新后重试',
      details: { submissionId, expectedVersion: parsedVersion.value, actualVersion },
    }
  }

  const next = action === 'approve' ? 'approved' : 'rejected'
  if (action === 'reject' && !String(options.note || '').trim()) {
    return { ok: false, code: 'validation_error', message: '驳回需要备注', details: { field: 'note' } }
  }

  const reviewedAt = new Date().toISOString()
  sub.status = next
  sub.reviewedAt = reviewedAt
  sub.note = options.note || null
  sub.reviewNote = options.note || ''
  sub.reviewerId = options.operatorId || null
  sub.reviewerName = options.operatorName || null
  sub.reviewVersion = actualVersion + 1
  syncSubmissionAssetStatus(store, sub, next)

  if (action === 'approve') {
    publishApprovedSubmissionToCatalog(store, sub, options.note, deps)
  }

  deps.appendReviewAuditLog?.(store, deps.markKvDirty, deps.crypto, {
    submissionId: sub.id,
    title: sub.name || sub.title || sub.fileName || sub.id,
    action,
    operator: options.operatorName || options.operatorId || 'system',
    note: options.note || '',
    statusBefore: 'pending',
    statusAfter: next,
    before: { status: 'pending', reviewVersion: actualVersion },
    after: { status: next, reviewVersion: sub.reviewVersion },
    time: reviewedAt,
    ip: options.ip || '',
  })

  let notifyItem = null
  if (typeof deps.pushUserNotification === 'function' && sub.userId) {
    notifyItem = deps.pushUserNotification(store, sub.userId, {
      type: 'submission_review',
      title: next === 'approved' ? '投稿审核通过' : '投稿审核未通过',
      message:
        next === 'approved'
          ? `投稿「${sub.name || sub.title || sub.id}」已通过审核`
          : `投稿「${sub.name || sub.title || sub.id}」被驳回`,
      detail: {
        submissionId: sub.id,
        status: next,
        reviewNote: options.note || '',
        reviewedAt,
      },
    })
  }

  deps.markSubmissionDirty?.(sub.id)
  deps.scheduleSave?.()

  return {
    ok: true,
    id: sub.id,
    status: next,
    reviewVersion: sub.reviewVersion,
    transition: { from: 'pending', to: next, action },
    notify: {
      queued: Boolean(notifyItem),
      notificationId: String(notifyItem?.id || ''),
    },
  }
}

export function performSubmissionReopen(store, deps, submissionId, options = {}) {
  const parsedVersion = parseExpectedVersion(options.expectedVersion)
  if (parsedVersion.provided && !parsedVersion.valid) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'expectedVersion 必须是 >= 0 的整数',
      details: { field: 'expectedVersion' },
    }
  }

  const sub = store.submissions?.find((s) => String(s.id) === String(submissionId))
  if (!sub) return { ok: false, code: 'not_found', message: '投稿不存在' }

  const status = String(sub.status || '').toLowerCase()
  if (status === 'pending') {
    return {
      ok: false,
      code: 'already_pending',
      message: '投稿已在待审状态',
      details: { submissionId, currentStatus: status, requestedAction: 'reopen' },
    }
  }
  if (status !== 'approved' && status !== 'rejected') {
    return {
      ok: false,
      code: 'invalid_review_transition',
      message: '当前状态无法重开',
      details: { submissionId, currentStatus: status, requestedAction: 'reopen', allowedFrom: ['approved', 'rejected'] },
    }
  }

  const actualVersion = Number(sub.reviewVersion || 0)
  if (parsedVersion.provided && parsedVersion.value !== actualVersion) {
    return {
      ok: false,
      code: 'version_conflict',
      message: '版本冲突，请刷新后重试',
      details: { submissionId, expectedVersion: parsedVersion.value, actualVersion },
    }
  }

  if (status === 'approved') {
    removeSubmissionCatalogEntry(store, sub.id)
    deps.markKvDirty?.('catalog_state')
    deps.bumpCatalogLibraryVersion?.(store)
    deps.broadcastCatalogSync?.(store, { reason: 'submission_reopened', submissionId: sub.id })
  }

  const at = new Date().toISOString()
  sub.status = 'pending'
  sub.reopenedAt = at
  sub.reviewVersion = actualVersion + 1

  deps.appendReviewAuditLog?.(store, deps.markKvDirty, deps.crypto, {
    submissionId: sub.id,
    title: sub.name || sub.title || sub.fileName || sub.id,
    action: 'reopen',
    operator: options.operatorName || options.operatorId || 'system',
    note: options.note || '',
    statusBefore: status,
    statusAfter: 'pending',
    time: at,
    ip: options.ip || '',
  })

  deps.markSubmissionDirty?.(sub.id)
  deps.scheduleSave?.()

  return {
    ok: true,
    id: sub.id,
    status: 'pending',
    reviewVersion: sub.reviewVersion,
    transition: { from: status, to: 'pending', action: 'reopen' },
  }
}

export function performSubmissionResubmit(store, deps, submissionId, userId, patch = {}) {
  const parsedVersion = parseExpectedVersion(patch.expectedVersion)
  if (parsedVersion.provided && !parsedVersion.valid) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'expectedVersion 必须是 >= 0 的整数',
      details: { field: 'expectedVersion' },
    }
  }

  const sub = store.submissions?.find((s) => String(s.id) === String(submissionId))
  if (!sub) return { ok: false, code: 'not_found', message: '投稿不存在' }
  if (String(sub.userId) !== String(userId)) {
    return { ok: false, code: 'forbidden', message: '只能重提自己的投稿' }
  }

  const status = String(sub.status || '').toLowerCase()
  if (status !== 'rejected') {
    return {
      ok: false,
      code: 'invalid_review_transition',
      message: '仅被驳回的投稿可重新提交',
      details: { submissionId, currentStatus: status, requestedAction: 'resubmit', requiredStatus: 'rejected' },
    }
  }

  const actualVersion = Number(sub.reviewVersion || 0)
  if (parsedVersion.provided && parsedVersion.value !== actualVersion) {
    return {
      ok: false,
      code: 'version_conflict',
      message: '版本冲突，请刷新后重试',
      details: { submissionId, expectedVersion: parsedVersion.value, actualVersion },
    }
  }

  const at = new Date().toISOString()
  if (patch.name != null && String(patch.name).trim()) sub.name = String(patch.name).trim()
  if (patch.description != null) sub.description = String(patch.description)
  if (patch.colors != null) sub.colors = patch.colors
  sub.status = 'pending'
  sub.resubmittedAt = at
  sub.submittedAt = at
  sub.reviewVersion = actualVersion + 1
  sub.note = null
  sub.reviewNote = ''

  deps.appendReviewAuditLog?.(store, deps.markKvDirty, deps.crypto, {
    submissionId: sub.id,
    title: sub.name || sub.title || sub.fileName || sub.id,
    action: 'resubmit',
    operator: patch.username || userId,
    note: patch.note || '',
    statusBefore: 'rejected',
    statusAfter: 'pending',
    time: at,
    ip: patch.ip || '',
  })

  deps.markSubmissionDirty?.(sub.id)
  deps.scheduleSave?.()

  return {
    ok: true,
    id: sub.id,
    status: 'pending',
    reviewVersion: sub.reviewVersion,
    transition: { from: 'rejected', to: 'pending', action: 'resubmit' },
  }
}

const BATCH_REVIEW_MAX_ITEMS = 50

export function performBatchSubmissionReview(store, deps, action, rawItems, options = {}) {
  const results = []
  let succeeded = 0
  let failed = 0
  for (const item of rawItems) {
    const submissionId = String(item?.id || '').trim()
    const note = String(item?.note || options.note || '').trim()
    const result = performSubmissionReview(store, deps, submissionId, action, {
      note,
      expectedVersion: item?.expectedVersion,
      operatorId: options.operatorId,
      operatorName: options.operatorName,
      ip: options.ip,
    })
    if (result.ok) {
      succeeded += 1
      results.push({ id: submissionId, ok: true, ...result })
    } else {
      failed += 1
      results.push({ id: submissionId, ...result })
    }
  }
  return {
    ok: true,
    processed: rawItems.length,
    succeeded,
    failed,
    results,
  }
}

export { BATCH_REVIEW_MAX_ITEMS }
