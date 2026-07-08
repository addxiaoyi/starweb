import { randomUUID } from 'node:crypto'

function ensureAsyncTasksStore(store) {
  if (!Array.isArray(store.asyncTasks)) store.asyncTasks = []
  return store.asyncTasks
}

function ensureSecurityCenter(store) {
  if (!store.securityCenter || typeof store.securityCenter !== 'object') {
    store.securityCenter = {}
  }
  if (!Array.isArray(store.securityCenter.webhookQueue)) {
    store.securityCenter.webhookQueue = []
  }
  return store.securityCenter
}

export function ensureOpsAuditLogs(store) {
  if (!Array.isArray(store.opsAuditLogs)) store.opsAuditLogs = []
  return store.opsAuditLogs
}

function appendAsyncTask(store, payload, options = {}) {
  const now = String(options.now || new Date().toISOString())
  const createId = typeof options.createId === 'function' ? options.createId : () => randomUUID()
  const markKvDirty = typeof options.markKvDirty === 'function' ? options.markKvDirty : () => {}
  const tasks = ensureAsyncTasksStore(store)
  const row = {
    id: String(createId()),
    createdAt: now,
    updatedAt: now,
    ...payload
  }
  tasks.unshift(row)
  if (tasks.length > 2000) tasks.length = 2000
  markKvDirty('async_tasks')
  return row
}

export function appendOpsAuditLog(store, payload, options = {}) {
  const createId = typeof options.createId === 'function' ? options.createId : () => randomUUID()
  const markKvDirty = typeof options.markKvDirty === 'function' ? options.markKvDirty : () => {}
  const logs = ensureOpsAuditLogs(store)
  const row = {
    id: String(createId()),
    at: String(payload?.at || new Date().toISOString()),
    action: String(payload?.action || 'event'),
    source: String(payload?.source || ''),
    actorUserId: String(payload?.actorUserId || ''),
    actorUsername: String(payload?.actorUsername || ''),
    targetId: String(payload?.targetId || ''),
    detail: payload?.detail && typeof payload.detail === 'object' ? payload.detail : {}
  }
  logs.unshift(row)
  if (logs.length > 5000) logs.length = 5000
  markKvDirty('ops_audit_logs')
  return row
}

export function retryOpsTask(store, taskIdRaw, options = {}) {
  const taskId = String(taskIdRaw || '').trim()
  if (!taskId) {
    return {
      ok: false,
      status: 400,
      code: 'validation_error',
      message: '缺少任务 id',
      details: null,
      changed: false
    }
  }

  const now = String(options.now || new Date().toISOString())
  const createId = typeof options.createId === 'function' ? options.createId : () => randomUUID()
  const markKvDirty = typeof options.markKvDirty === 'function' ? options.markKvDirty : () => {}
  const actorUserId = String(options.actorUserId || '')
  const actorUsername = String(options.actorUsername || '')
  const actorIp = String(options.actorIp || '')
  const onAudit = typeof options.onAudit === 'function' ? options.onAudit : null

  const appendAudit = (action, source, detail) => {
    if (!onAudit) return null
    return onAudit({
      at: now,
      action: String(action || ''),
      source: String(source || ''),
      taskId,
      actorUserId,
      actorUsername,
      actorIp,
      detail: detail && typeof detail === 'object' ? detail : {}
    })
  }

  const asyncTasks = ensureAsyncTasksStore(store)
  const asyncTaskRow = asyncTasks.find((row) => String(row?.id || '') === taskId)
  if (asyncTaskRow) {
    const previousStatus = String(asyncTaskRow?.status || 'pending')
    const retryCount = Math.max(0, Number(asyncTaskRow?.retryCount || 0)) + 1
    asyncTaskRow.status = 'pending'
    asyncTaskRow.finishedAt = ''
    asyncTaskRow.retryCount = retryCount
    asyncTaskRow.lastRetryAt = now
    asyncTaskRow.updatedAt = now
    markKvDirty('async_tasks')
    const followUpTask = appendAsyncTask(
      store,
      {
        type: 'ops_task_retry',
        status: 'completed',
        payload: {
          source: 'async_tasks',
          taskId,
          previousStatus,
          retryCount
        }
      },
      { now, createId, markKvDirty }
    )
    appendAudit('task_retry', 'async_tasks', {
      previousStatus,
      retryCount,
      replayed: true,
      followUpTaskId: followUpTask.id
    })
    return {
      ok: true,
      status: 200,
      changed: true,
      body: {
        ok: true,
        replayed: true,
        source: 'async_tasks',
        item: asyncTaskRow,
        asyncTask: followUpTask
      }
    }
  }

  const securityCenter = ensureSecurityCenter(store)
  const webhookTask = securityCenter.webhookQueue.find((row) => String(row?.id || '') === taskId)
  if (webhookTask) {
    const previousStatus = String(webhookTask?.status || 'pending')
    webhookTask.status = 'pending'
    webhookTask.nextRetryAt = now
    webhookTask.lastError = ''
    webhookTask.lastReplayAt = now
    webhookTask.replayBy = actorIp || actorUserId || actorUsername || 'admin'
    markKvDirty('security_center_state')
    const followUpTask = appendAsyncTask(
      store,
      {
        type: 'webhook_manual_retry',
        status: 'completed',
        payload: {
          source: 'security_webhook_queue',
          taskId,
          previousStatus,
          replayed: true
        }
      },
      { now, createId, markKvDirty }
    )
    appendAudit('task_retry', 'security_webhook_queue', {
      previousStatus,
      replayed: true,
      followUpTaskId: followUpTask.id
    })
    return {
      ok: true,
      status: 200,
      changed: true,
      body: {
        ok: true,
        replayed: true,
        source: 'security_webhook_queue',
        item: webhookTask,
        asyncTask: followUpTask
      }
    }
  }

  if (!Array.isArray(store.skinSyncTasks)) store.skinSyncTasks = []
  const syncTask = store.skinSyncTasks.find((row) => String(row?.id || '') === taskId)
  if (syncTask) {
    const previousStatus = String(syncTask?.status || 'unknown')
    const changedCount = Math.max(0, Number(syncTask?.changedCount || 0))
    const retriedTask = {
      id: String(createId()),
      type: String(syncTask?.type || 'catalog_sync'),
      status: 'completed',
      source: 'ops_retry',
      startedAt: now,
      finishedAt: now,
      changedCount,
      triggeredBy: actorUserId || actorUsername || actorIp || 'admin',
      retriedFromTaskId: taskId,
      previousStatus
    }
    store.skinSyncTasks.unshift(retriedTask)
    if (store.skinSyncTasks.length > 500) store.skinSyncTasks.length = 500
    store.catalogSyncedAt = now
    markKvDirty('skin_sync_tasks')
    markKvDirty('catalog_state')
    const followUpTask = appendAsyncTask(
      store,
      {
        type: 'catalog_sync_retry',
        status: 'completed',
        source: 'ops_retry',
        payload: {
          source: 'skin_sync_tasks',
          taskId,
          retryTaskId: retriedTask.id,
          previousStatus,
          changedCount,
          replayed: true
        },
        startedAt: now,
        finishedAt: now,
        triggeredBy: actorUserId || actorUsername || actorIp || 'admin',
        refTaskId: retriedTask.id
      },
      { now, createId, markKvDirty }
    )
    appendAudit('task_retry', 'skin_sync_tasks', {
      previousStatus,
      changedCount,
      replayed: true,
      retryTaskId: retriedTask.id,
      followUpTaskId: followUpTask.id
    })
    return {
      ok: true,
      status: 200,
      changed: true,
      body: {
        ok: true,
        replayed: true,
        source: 'skin_sync_tasks',
        item: retriedTask,
        asyncTask: followUpTask
      }
    }
  }

  return {
    ok: false,
    status: 404,
    code: 'not_found',
    message: '任务不存在',
    details: null,
    changed: false
  }
}
