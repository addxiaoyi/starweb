import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendOpsAuditLog, retryOpsTask } from '../src/modules/ops/service.js'

function createStore(overrides = {}) {
  return {
    asyncTasks: [],
    skinSyncTasks: [],
    opsAuditLogs: [],
    securityCenter: {
      webhookQueue: []
    },
    ...overrides
  }
}

test('retryOpsTask should replay async task and append follow-up task', () => {
  const now = '2026-04-27T08:00:00.000Z'
  const store = createStore({
    asyncTasks: [
      {
        id: 'task-1',
        status: 'failed',
        finishedAt: '2026-04-27T07:59:00.000Z',
        retryCount: 1,
      }
    ]
  })
  const dirtyKeys = []
  const auditEvents = []
  let idSeq = 0

  const result = retryOpsTask(store, 'task-1', {
    now,
    actorIp: '127.0.0.1',
    createId: () => `id-${++idSeq}`,
    markKvDirty: (key) => dirtyKeys.push(String(key)),
    onAudit: (event) => {
      auditEvents.push(event)
      return { id: 'audit-1' }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.equal(result.body?.source, 'async_tasks')
  assert.equal(result.body?.item?.status, 'pending')
  assert.equal(result.body?.item?.finishedAt, '')
  assert.equal(result.body?.item?.retryCount, 2)
  assert.equal(result.body?.item?.lastRetryAt, now)
  assert.equal(result.body?.asyncTask?.id, 'id-1')
  assert.equal(result.body?.asyncTask?.type, 'ops_task_retry')
  assert.equal(result.body?.asyncTask?.payload?.taskId, 'task-1')
  assert.equal(store.asyncTasks.length, 2)
  assert.equal(store.asyncTasks[0].type, 'ops_task_retry')
  assert.equal(store.asyncTasks[1].id, 'task-1')
  assert.equal(dirtyKeys.includes('async_tasks'), true)
  assert.equal(auditEvents.length, 1)
  assert.equal(auditEvents[0]?.action, 'task_retry')
  assert.equal(auditEvents[0]?.source, 'async_tasks')
  assert.equal(auditEvents[0]?.detail?.retryCount, 2)
})

test('retryOpsTask should replay security webhook queue item', () => {
  const now = '2026-04-27T08:10:00.000Z'
  const dirtyKeys = []
  const store = createStore({
    securityCenter: {
      webhookQueue: [
        {
          id: 'webhook-1',
          status: 'failed',
          attempts: 5,
          lastError: 'timeout'
        }
      ]
    }
  })
  let seq = 0
  const result = retryOpsTask(store, 'webhook-1', {
    now,
    actorIp: '192.168.1.2',
    createId: () => `wid-${++seq}`,
    markKvDirty: (key) => dirtyKeys.push(String(key))
  })

  assert.equal(result.ok, true)
  assert.equal(result.body?.source, 'security_webhook_queue')
  assert.equal(result.body?.item?.status, 'pending')
  assert.equal(result.body?.item?.nextRetryAt, now)
  assert.equal(result.body?.item?.lastError, '')
  assert.equal(result.body?.item?.lastReplayAt, now)
  assert.equal(result.body?.item?.replayBy, '192.168.1.2')
  assert.equal(result.body?.asyncTask?.id, 'wid-1')
  assert.equal(result.body?.asyncTask?.type, 'webhook_manual_retry')
  assert.equal(result.body?.asyncTask?.payload?.source, 'security_webhook_queue')
  assert.equal(store.asyncTasks.length, 1)
  assert.equal(dirtyKeys.includes('security_center_state'), true)
  assert.equal(dirtyKeys.includes('async_tasks'), true)
})

test('retryOpsTask should replay skin sync task and create follow-up retry task', () => {
  const auditEvents = []
  const dirtyKeys = []
  const store = createStore({
    skinSyncTasks: [
      {
        id: 'sync-1',
        type: 'catalog_sync',
        status: 'failed',
        changedCount: 7,
        startedAt: '2026-04-27T07:00:00.000Z',
        finishedAt: '2026-04-27T07:01:00.000Z',
      }
    ]
  })
  let idSeq = 0

  const result = retryOpsTask(store, 'sync-1', {
    now: '2026-04-27T08:30:00.000Z',
    actorUserId: 'admin-1',
    createId: () => `sid-${++idSeq}`,
    markKvDirty: (key) => dirtyKeys.push(String(key)),
    onAudit: (event) => {
      auditEvents.push(event)
      return { id: 'audit-sync-retry-1' }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.equal(result.body?.source, 'skin_sync_tasks')
  assert.equal(result.body?.item?.id, 'sid-1')
  assert.equal(result.body?.item?.status, 'completed')
  assert.equal(result.body?.item?.source, 'ops_retry')
  assert.equal(result.body?.item?.retriedFromTaskId, 'sync-1')
  assert.equal(result.body?.item?.previousStatus, 'failed')
  assert.equal(result.body?.item?.changedCount, 7)
  assert.equal(result.body?.item?.triggeredBy, 'admin-1')
  assert.equal(result.body?.asyncTask?.id, 'sid-2')
  assert.equal(result.body?.asyncTask?.type, 'catalog_sync_retry')
  assert.equal(result.body?.asyncTask?.payload?.source, 'skin_sync_tasks')
  assert.equal(result.body?.asyncTask?.payload?.taskId, 'sync-1')
  assert.equal(result.body?.asyncTask?.payload?.retryTaskId, 'sid-1')
  assert.equal(result.body?.asyncTask?.payload?.replayed, true)
  assert.equal(store.skinSyncTasks.length, 2)
  assert.equal(store.skinSyncTasks[0].id, 'sid-1')
  assert.equal(store.skinSyncTasks[1].id, 'sync-1')
  assert.equal(store.catalogSyncedAt, '2026-04-27T08:30:00.000Z')
  assert.equal(store.asyncTasks.length, 1)
  assert.equal(dirtyKeys.includes('skin_sync_tasks'), true)
  assert.equal(dirtyKeys.includes('catalog_state'), true)
  assert.equal(dirtyKeys.includes('async_tasks'), true)
  assert.equal(result.changed, true)
  assert.equal(auditEvents.length, 1)
  assert.equal(auditEvents[0]?.action, 'task_retry')
  assert.equal(auditEvents[0]?.source, 'skin_sync_tasks')
  assert.equal(auditEvents[0]?.detail?.retryTaskId, 'sid-1')
})

test('retryOpsTask should return not_found when target task does not exist', () => {
  const store = createStore()
  const result = retryOpsTask(store, 'missing-task')
  assert.equal(result.ok, false)
  assert.equal(result.status, 404)
  assert.equal(result.code, 'not_found')
  assert.equal(result.changed, false)
})

test('appendOpsAuditLog should append row and mark dirty key', () => {
  const store = createStore()
  const dirtyKeys = []
  let seq = 0
  const row = appendOpsAuditLog(
    store,
    {
      at: '2026-04-27T09:00:00.000Z',
      action: 'dead_letter_retry',
      source: 'security_webhook',
      actorUserId: 'admin-1',
      actorUsername: 'admin',
      targetId: 'dead-1',
      detail: { replayed: true }
    },
    {
      createId: () => `audit-${++seq}`,
      markKvDirty: (key) => dirtyKeys.push(String(key))
    }
  )

  assert.equal(row.id, 'audit-1')
  assert.equal(row.action, 'dead_letter_retry')
  assert.equal(row.targetId, 'dead-1')
  assert.equal(store.opsAuditLogs.length, 1)
  assert.equal(store.opsAuditLogs[0].id, 'audit-1')
  assert.equal(dirtyKeys.includes('ops_audit_logs'), true)
})
