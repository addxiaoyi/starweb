export function normalizeSubmissionItem(sub) {
  return {
    id: String(sub?.id || ''),
    title: String(sub?.title || sub?.fileName || '未命名投稿'),
    submitter: String(sub?.submitter || sub?.submitterUsername || sub?.userId || ''),
    submittedAt: String(sub?.submittedAt || ''),
    skinUrl: sub?.skinUrl || undefined,
    capeUrl: sub?.capeUrl || undefined,
    model: sub?.model || undefined,
    note: sub?.note || undefined,
    status: String(sub?.status || '')
  }
}

export function appendReviewAuditLog(store, markKvDirty, crypto, payload) {
  if (!Array.isArray(store.reviewAuditLogs)) store.reviewAuditLogs = []
  store.reviewAuditLogs.unshift({
    id: crypto.randomUUID(),
    ...payload
  })
  if (store.reviewAuditLogs.length > 5000) {
    store.reviewAuditLogs.length = 5000
  }
  markKvDirty('review_audit_logs')
}
