import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRetryOpsTaskHandler } from '../src/modules/ops/retryRoute.js'

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = Number(code)
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

function jsonErr(res, status, message, code = 'error', details) {
  return res.status(status).json({
    ok: false,
    message,
    code,
    details: details ?? null
  })
}

function createHarness({ store, requireDevAdmin } = {}) {
  const state = store || {
    asyncTasks: [],
    securityCenter: { webhookQueue: [] },
    skinSyncTasks: [],
    opsAuditLogs: []
  }
  const dirtyKeys = []
  let saveCount = 0
  let idSeq = 0

  const handler = createRetryOpsTaskHandler({
    requireDevAdmin: typeof requireDevAdmin === 'function'
      ? requireDevAdmin
      : () => true,
    jsonErr,
    getStore: () => state,
    scheduleSave: () => { saveCount += 1 },
    markKvDirty: (key) => dirtyKeys.push(String(key)),
    createId: () => `id-${++idSeq}`,
  })

  function call(req = {}) {
    const res = createRes()
    const request = {
      params: {},
      body: {},
      user: { id: 'admin-1', username: 'admin' },
      ip: '127.0.0.1',
      ...req
    }
    handler(request, res)
    return res
  }

  return {
    store: state,
    dirtyKeys,
    getSaveCount: () => saveCount,
    call
  }
}

test('ops retry route should return validation_error when id is missing', () => {
  const h = createHarness()
  const res = h.call({ params: { id: '' } })
  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.code, 'validation_error')
  assert.equal(h.getSaveCount(), 0)
})

test('ops retry route should return not_found when task does not exist', () => {
  const h = createHarness()
  const res = h.call({ params: { id: 'missing-task' } })
  assert.equal(res.statusCode, 404)
  assert.equal(res.body?.code, 'not_found')
  assert.equal(h.getSaveCount(), 0)
  assert.equal(h.store.opsAuditLogs.length, 0)
})

test('ops retry route should replay task, schedule save and append audit log', () => {
  const h = createHarness({
    store: {
      asyncTasks: [
        {
          id: 'task-1',
          status: 'failed',
          retryCount: 1,
          finishedAt: '2026-04-27T13:00:00.000Z',
          payload: { source: 'test' }
        }
      ],
      securityCenter: { webhookQueue: [] },
      skinSyncTasks: [],
      opsAuditLogs: []
    }
  })

  const res = h.call({
    params: { id: 'task-1' },
    user: { id: 'admin-2', username: 'root' },
    ip: '10.0.0.8'
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(res.body?.replayed, true)
  assert.equal(res.body?.source, 'async_tasks')
  assert.equal(res.body?.item?.status, 'pending')
  assert.equal(res.body?.item?.retryCount, 2)
  assert.equal(h.getSaveCount(), 1)
  assert.equal(h.store.asyncTasks.length, 2)
  assert.equal(h.store.asyncTasks[0]?.type, 'ops_task_retry')
  assert.equal(h.store.opsAuditLogs.length, 1)
  assert.equal(h.store.opsAuditLogs[0]?.action, 'task_retry')
  assert.equal(h.store.opsAuditLogs[0]?.source, 'async_tasks')
  assert.equal(h.store.opsAuditLogs[0]?.targetId, 'task-1')
  assert.equal(h.store.opsAuditLogs[0]?.detail?.actorIp, '10.0.0.8')
  assert.equal(h.dirtyKeys.includes('async_tasks'), true)
  assert.equal(h.dirtyKeys.includes('ops_audit_logs'), true)
})

test('ops retry route should short-circuit when admin check fails', () => {
  const h = createHarness({
    store: {
      asyncTasks: [
        {
          id: 'task-2',
          status: 'failed',
          retryCount: 0,
        }
      ],
      securityCenter: { webhookQueue: [] },
      skinSyncTasks: [],
      opsAuditLogs: []
    },
    requireDevAdmin: (_req, res) => {
      res.status(403).json({ ok: false, code: 'forbidden' })
      return false
    }
  })

  const res = h.call({ params: { id: 'task-2' } })
  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.code, 'forbidden')
  assert.equal(h.getSaveCount(), 0)
  assert.equal(h.store.asyncTasks.length, 1)
  assert.equal(h.store.asyncTasks[0]?.status, 'failed')
  assert.equal(h.store.opsAuditLogs.length, 0)
})
