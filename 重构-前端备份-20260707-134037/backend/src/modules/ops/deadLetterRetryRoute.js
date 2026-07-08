import { randomUUID } from 'node:crypto'
import { appendOpsAuditLog } from './service.js'

function noop() {}

function ensureDeadLetterQueueFallback(store) {
  if (!Array.isArray(store.deadLetterQueue)) store.deadLetterQueue = []
  return store.deadLetterQueue
}

function ensureSecurityCenterFallback(store) {
  if (!store.securityCenter || typeof store.securityCenter !== 'object') {
    store.securityCenter = {}
  }
  if (!Array.isArray(store.securityCenter.webhookQueue)) {
    store.securityCenter.webhookQueue = []
  }
  return store.securityCenter
}

export function createRetryDeadLetterHandler(deps = {}) {
  const requireDevAdmin = typeof deps.requireDevAdmin === 'function'
    ? deps.requireDevAdmin
    : () => true
  const jsonErr = typeof deps.jsonErr === 'function'
    ? deps.jsonErr
    : (res, status, message, code = 'error', details) => res.status(status).json({
      ok: false,
      message,
      code,
      details: details ?? null
    })
  const getStore = typeof deps.getStore === 'function' ? deps.getStore : () => ({})
  const scheduleSave = typeof deps.scheduleSave === 'function' ? deps.scheduleSave : noop
  const markKvDirty = typeof deps.markKvDirty === 'function' ? deps.markKvDirty : noop
  const ensureDeadLetterQueue = typeof deps.ensureDeadLetterQueue === 'function'
    ? deps.ensureDeadLetterQueue
    : ensureDeadLetterQueueFallback
  const ensureSecurityCenter = typeof deps.ensureSecurityCenter === 'function'
    ? deps.ensureSecurityCenter
    : ensureSecurityCenterFallback
  const appendAsyncTask = typeof deps.appendAsyncTask === 'function' ? deps.appendAsyncTask : noop
  const appendOpsAuditLogFn = typeof deps.appendOpsAuditLogFn === 'function'
    ? deps.appendOpsAuditLogFn
    : appendOpsAuditLog
  const createId = typeof deps.createId === 'function' ? deps.createId : () => randomUUID()
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString()

  return (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const id = String(req.params?.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少 dead letter id', 'validation_error')
    const store = getStore()
    const queue = ensureDeadLetterQueue(store)
    const row = queue.find((x) => String(x?.id || '') === id)
    if (!row) return jsonErr(res, 404, '死信记录不存在', 'not_found')

    const sourceId = String(row?.sourceId || '')
    let replayed = false
    if (String(row?.type || '') === 'security_webhook' && sourceId) {
      const sc = ensureSecurityCenter(store)
      const item = sc.webhookQueue.find((q) => String(q?.id || '') === sourceId)
      if (item) {
        item.status = 'pending'
        item.nextRetryAt = now()
        item.lastError = ''
        markKvDirty('security_center_state')
        replayed = true
      }
    }

    row.retriedAt = now()
    row.resolvedAt = row.retriedAt
    row.resolvedBy = String(req.ip || 'admin')
    row.retryResult = replayed ? 'replayed' : 'no_target'
    markKvDirty('dead_letter_queue')
    appendAsyncTask(store, {
      type: 'dead_letter_retry',
      status: replayed ? 'completed' : 'failed',
      payload: {
        deadLetterId: id,
        sourceId,
        replayed
      }
    })
    appendOpsAuditLogFn(
      store,
      {
        action: 'dead_letter_retry',
        source: String(row?.type || ''),
        actorUserId: String(req.user?.id || ''),
        actorUsername: String(req.user?.username || req.ip || 'admin'),
        targetId: id,
        detail: {
          sourceId,
          replayed,
          retryResult: row.retryResult
        }
      },
      { createId, markKvDirty }
    )
    scheduleSave()
    return res.json({ ok: true, replayed, item: row })
  }
}
