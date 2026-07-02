import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRetryDeadLetterHandler } from '../src/modules/ops/deadLetterRetryRoute.js'

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
    deadLetterQueue: [],
    securityCenter: { webhookQueue: [] },
    asyncTasks: [],
    opsAuditLogs: []
  }
  const dirtyKeys = []
  let saveCount = 0
  let idSeq = 0

  const handler = createRetryDeadLetterHandler({
    requireDevAdmin: typeof requireDevAdmin === 'function'
      ? requireDevAdmin
      : () => true,
    jsonErr,
    getStore: () => state,
    scheduleSave: () => { saveCount += 1 },
    markKvDirty: (key) => dirtyKeys.push(String(key)),
    appendAsyncTask: (storeRef, payload) => {
      if (!Array.isArray(storeRef.asyncTasks)) storeRef.asyncTasks = []
      storeRef.asyncTasks.unshift({
        id: `task-${storeRef.asyncTasks.length + 1}`,
        ...payload
      })
    },
    createId: () => `audit-${++idSeq}`,
    now: () => '2026-04-27T14:30:00.000Z',
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

test('dead-letter retry route should return validation_error when id is missing', () => {
  const h = createHarness()
  const res = h.call({ params: { id: '' } })
  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.code, 'validation_error')
  assert.equal(h.getSaveCount(), 0)
})

test('dead-letter retry route should return not_found when record does not exist', () => {
  const h = createHarness()
  const res = h.call({ params: { id: 'dead-missing' } })
  assert.equal(res.statusCode, 404)
  assert.equal(res.body?.code, 'not_found')
  assert.equal(h.getSaveCount(), 0)
})

test('dead-letter retry route should replay webhook task and append audit', () => {
  const h = createHarness({
    store: {
      deadLetterQueue: [
        {
          id: 'dead-1',
          type: 'security_webhook',
          sourceId: 'webhook-1'
        }
      ],
      securityCenter: {
        webhookQueue: [
          {
            id: 'webhook-1',
            status: 'failed',
            lastError: 'timeout'
          }
        ]
      },
      asyncTasks: [],
      opsAuditLogs: []
    }
  })

  const res = h.call({
    params: { id: 'dead-1' },
    user: { id: 'admin-2', username: 'root' },
    ip: '10.0.0.2'
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(res.body?.replayed, true)
  assert.equal(res.body?.item?.retryResult, 'replayed')
  assert.equal(h.store.securityCenter.webhookQueue[0]?.status, 'pending')
  assert.equal(h.store.securityCenter.webhookQueue[0]?.lastError, '')
  assert.equal(h.store.securityCenter.webhookQueue[0]?.nextRetryAt, '2026-04-27T14:30:00.000Z')
  assert.equal(h.store.asyncTasks.length, 1)
  assert.equal(h.store.asyncTasks[0]?.type, 'dead_letter_retry')
  assert.equal(h.store.asyncTasks[0]?.status, 'completed')
  assert.equal(h.store.opsAuditLogs.length, 1)
  assert.equal(h.store.opsAuditLogs[0]?.action, 'dead_letter_retry')
  assert.equal(h.store.opsAuditLogs[0]?.targetId, 'dead-1')
  assert.equal(h.store.opsAuditLogs[0]?.detail?.replayed, true)
  assert.equal(h.getSaveCount(), 1)
  assert.equal(h.dirtyKeys.includes('security_center_state'), true)
  assert.equal(h.dirtyKeys.includes('dead_letter_queue'), true)
  assert.equal(h.dirtyKeys.includes('ops_audit_logs'), true)
})

test('dead-letter retry route should mark no_target when source task missing', () => {
  const h = createHarness({
    store: {
      deadLetterQueue: [
        {
          id: 'dead-2',
          type: 'security_webhook',
          sourceId: 'missing-webhook'
        }
      ],
      securityCenter: {
        webhookQueue: []
      },
      asyncTasks: [],
      opsAuditLogs: []
    }
  })

  const res = h.call({
    params: { id: 'dead-2' },
    ip: '10.0.0.3'
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(res.body?.replayed, false)
  assert.equal(res.body?.item?.retryResult, 'no_target')
  assert.equal(h.store.asyncTasks.length, 1)
  assert.equal(h.store.asyncTasks[0]?.status, 'failed')
  assert.equal(h.store.opsAuditLogs.length, 1)
  assert.equal(h.store.opsAuditLogs[0]?.detail?.replayed, false)
  assert.equal(h.store.opsAuditLogs[0]?.detail?.retryResult, 'no_target')
  assert.equal(h.getSaveCount(), 1)
  assert.equal(h.dirtyKeys.includes('dead_letter_queue'), true)
  assert.equal(h.dirtyKeys.includes('ops_audit_logs'), true)
})
