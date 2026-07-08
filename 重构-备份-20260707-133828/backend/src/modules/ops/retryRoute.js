import { randomUUID } from 'node:crypto'
import { appendOpsAuditLog, retryOpsTask } from './service.js'

function noop() {}

export function createRetryOpsTaskHandler(deps = {}) {
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
  const createId = typeof deps.createId === 'function' ? deps.createId : () => randomUUID()
  const retryOpsTaskFn = typeof deps.retryOpsTaskFn === 'function' ? deps.retryOpsTaskFn : retryOpsTask
  const appendOpsAuditLogFn = typeof deps.appendOpsAuditLogFn === 'function'
    ? deps.appendOpsAuditLogFn
    : appendOpsAuditLog

  return (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const id = String(req.params?.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少任务 id', 'validation_error')
    const store = getStore()
    const result = retryOpsTaskFn(store, id, {
      actorUserId: String(req.user?.id || ''),
      actorUsername: String(req.user?.username || ''),
      actorIp: String(req.ip || ''),
      createId,
      markKvDirty,
      onAudit: (auditEvent) => appendOpsAuditLogFn(
        store,
        {
          at: auditEvent?.at,
          action: auditEvent?.action,
          source: auditEvent?.source,
          actorUserId: auditEvent?.actorUserId,
          actorUsername: auditEvent?.actorUsername || auditEvent?.actorIp || '',
          targetId: auditEvent?.taskId,
          detail: {
            ...(auditEvent?.detail && typeof auditEvent.detail === 'object' ? auditEvent.detail : {}),
            actorIp: String(auditEvent?.actorIp || '')
          }
        },
        { createId, markKvDirty }
      )
    })

    if (result.changed) scheduleSave()
    if (!result.ok) {
      return jsonErr(res, result.status, result.message, result.code, result.details)
    }
    return res.status(result.status).json(result.body)
  }
}
