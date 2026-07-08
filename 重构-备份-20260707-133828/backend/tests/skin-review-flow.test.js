import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { registerSkinRoutes } from '../src/modules/skin/index.js'

function createAppStub() {
  const routes = new Map()
  const mount = (method, path, handlers) => {
    routes.set(`${method} ${path}`, handlers)
  }
  return {
    routes,
    get(path, ...handlers) {
      mount('GET', path, handlers)
    },
    post(path, ...handlers) {
      mount('POST', path, handlers)
    },
    put(path, ...handlers) {
      mount('PUT', path, handlers)
    },
    patch(path, ...handlers) {
      mount('PATCH', path, handlers)
    },
    delete(path, ...handlers) {
      mount('DELETE', path, handlers)
    }
  }
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    finished: false,
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value
      return this
    },
    json(payload) {
      this.body = payload
      this.finished = true
      return this
    },
    send(payload) {
      this.body = payload
      this.finished = true
      return this
    },
    end() {
      this.finished = true
      return this
    }
  }
}

async function runHandlers(handlers, req, res) {
  for (const handler of handlers) {
    if (res.finished) break
    if (handler.length >= 3) {
      await new Promise((resolve, reject) => {
        let settled = false
        const next = (err) => {
          if (settled) return
          settled = true
          if (err) reject(err)
          else resolve()
        }
        try {
          const out = handler(req, res, next)
          if (out && typeof out.then === 'function') {
            out.then(() => {
              if (settled) return
              settled = true
              resolve()
            }).catch((err) => {
              if (settled) return
              settled = true
              reject(err)
            })
          } else if (res.finished && !settled) {
            settled = true
            resolve()
          }
        } catch (err) {
          if (settled) return
          settled = true
          reject(err)
        }
      })
      continue
    }
    await handler(req, res)
  }
}

async function runRoute(app, method, path, req) {
  const handlers = app.routes.get(`${String(method).toUpperCase()} ${path}`)
  assert.ok(Array.isArray(handlers) && handlers.length > 0, `route not found: ${method} ${path}`)
  const res = createRes()
  const request = {
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...req
  }
  await runHandlers(handlers, request, res)
  return res
}

function createStore(overrides = {}) {
  return {
    users: [],
    catalog: [],
    submissions: [],
    reviewAuditLogs: [],
    userNotifications: {},
    ...overrides
  }
}

function createDeps(store) {
  let seq = 0
  return {
    config: { reviewEntryEnabled: true, mojangSkinSyncEnabled: false },
    jsonErr: (res, status, message, code = 'error', details) => {
      return res.status(status).json({
        ok: false,
        success: false,
        code,
        error: code,
        message,
        ...(details !== undefined ? { details } : {})
      })
    },
    jsonPage: (res, payload) => res.status(200).json({ ok: true, success: true, ...payload }),
    getStore: () => store,
    scheduleSave: () => {},
    requireUser: (_req, _res, next) => next(),
    requireVerifiedEmail: (_req, _res, next) => next(),
    requireReviewerOrAdmin: (_req, _res, next) => next(),
    requireModerator: (_req, _res, next) => next(),
    upload: {
      single: () => (_req, _res, next) => next(),
      array: () => (_req, _res, next) => next()
    },
    UPLOAD_DIR: 'uploads',
    path: { relative: () => 'demo.png', isAbsolute: () => false },
    ensurePlayerState: () => ({
      applied: { skinAssetId: 0, capeAssetId: 0, slot: 'default', version: 1 },
      recentSelections: [],
      assets: {},
      nextAssetId: 1
    }),
    isUserEmailVerified: () => true,
    resolveSkinStationPreview: () => null,
    persistMojangSkinSync: async () => ({ ok: false, error: 'disabled' }),
    triggerVlaSkinRefreshIfConfigured: () => {},
    markSubmissionDirty: () => {},
    markPlayerStateDirty: () => {},
    catalogItemById: () => null,
    mojangSkinSyncLimiter: (_req, _res, next) => next(),
    markKvDirty: () => {},
    asyncHandler: (fn) => fn,
    crypto: {
      randomUUID: () => `rid-${++seq}`,
      createHash: (algorithm) => crypto.createHash(algorithm),
    }
  }
}

function mountSkinRoutes(store) {
  const app = createAppStub()
  registerSkinRoutes(app, createDeps(store))
  return app
}

test('review route should validate expectedVersion format', async () => {
  const store = createStore({
    submissions: [
      {
        id: 'sub-1',
        userId: 'u-1',
        submitterUsername: 'alice',
        status: 'pending',
        reviewVersion: 1,
        submittedAt: '2026-01-01T00:00:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'POST', '/api/skins/submissions/:id/:action(approve|reject)', {
    params: { id: 'sub-1', action: 'approve' },
    body: { note: '', expectedVersion: 'oops' },
    user: { id: 'reviewer-1', username: 'rv', roles: ['reviewer'] }
  })

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.code, 'validation_error')
  assert.equal(res.body?.details?.field, 'expectedVersion')
})

test('review route should return version_conflict details', async () => {
  const store = createStore({
    submissions: [
      {
        id: 'sub-2',
        userId: 'u-1',
        submitterUsername: 'alice',
        status: 'pending',
        reviewVersion: 3,
        submittedAt: '2026-01-01T00:00:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'POST', '/api/skins/submissions/:id/:action(approve|reject)', {
    params: { id: 'sub-2', action: 'reject' },
    body: { note: '不通过', expectedVersion: 2 },
    user: { id: 'reviewer-1', username: 'rv', roles: ['reviewer'] }
  })

  assert.equal(res.statusCode, 409)
  assert.equal(res.body?.code, 'version_conflict')
  assert.equal(res.body?.details?.submissionId, 'sub-2')
  assert.equal(res.body?.details?.expectedVersion, 2)
  assert.equal(res.body?.details?.actualVersion, 3)
})

test('review route should reject transition when submission already reviewed', async () => {
  const store = createStore({
    submissions: [
      {
        id: 'sub-3',
        userId: 'u-1',
        submitterUsername: 'alice',
        status: 'approved',
        reviewVersion: 4,
        submittedAt: '2026-01-01T00:00:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'POST', '/api/skins/submissions/:id/:action(approve|reject)', {
    params: { id: 'sub-3', action: 'approve' },
    body: { note: '', expectedVersion: 4 },
    user: { id: 'reviewer-1', username: 'rv', roles: ['reviewer'] }
  })

  assert.equal(res.statusCode, 409)
  assert.equal(res.body?.code, 'already_reviewed')
  assert.equal(res.body?.details?.currentStatus, 'approved')
  assert.equal(res.body?.details?.requiredStatus, 'pending')
  assert.equal(res.body?.details?.requestedAction, 'approve')
})

test('reopen route should return notify snapshot and transition payload', async () => {
  const store = createStore({
    catalog: [
      { id: 'sub_sub-4', title: 'legacy', skinTextureUrl: '/uploads/skin.png' }
    ],
    submissions: [
      {
        id: 'sub-4',
        userId: 'author-1',
        submitterUsername: 'alice',
        title: 'my-skin.png',
        fileName: 'my-skin.png',
        status: 'approved',
        reviewVersion: 2,
        reviewNote: 'ok',
        reviewerId: 'reviewer-old',
        reviewerName: 'old reviewer',
        submittedAt: '2026-01-01T00:00:00.000Z',
        localPath: 'my-skin.png',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'POST', '/api/skins/submissions/:id/reopen', {
    params: { id: 'sub-4' },
    body: { note: '进入重审', expectedVersion: 2 },
    user: { id: 'reviewer-2', username: 'new reviewer', roles: ['reviewer'] }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.status, 'pending')
  assert.equal(res.body?.transition?.from, 'approved')
  assert.equal(res.body?.transition?.to, 'pending')
  assert.equal(res.body?.notify?.queued, true)
  assert.ok(String(res.body?.notify?.notificationId || '').length > 0)
  assert.equal(store.catalog.some((item) => String(item?.id || '') === 'sub_sub-4'), false)
  assert.equal(store.submissions[0].reviewHistory[0].action, 'reopen')
  assert.equal(store.submissions[0].reviewHistory[0].statusBefore, 'approved')
  assert.equal(store.submissions[0].reviewHistory[0].statusAfter, 'pending')
  assert.equal(store.submissions[0].reviewHistory[0].operatorId, 'reviewer-2')
  assert.equal(store.submissions[0].reviewHistory[0].note, '进入重审')
})

test('submission detail should return unified forbidden details for non-owner users', async () => {
  const store = createStore({
    submissions: [
      {
        id: 'sub-5',
        userId: 'author-2',
        submitterUsername: 'alice',
        status: 'pending',
        reviewVersion: 0,
        submittedAt: '2026-01-01T00:00:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/submissions/:id', {
    params: { id: 'sub-5' },
    user: { id: 'visitor-1', username: 'visitor', roles: [] }
  })

  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.code, 'forbidden')
  assert.deepEqual(res.body?.details?.requiredRoles, ['moderator', 'reviewer', 'admin'])
  assert.deepEqual(res.body?.details?.actualRoles, [])
  assert.equal(res.body?.details?.requiredCapability, 'review_submissions')
})

test('audit logs endpoint should support filtering and pagination', async () => {
  const store = createStore({
    reviewAuditLogs: [
      {
        id: 'log-1',
        submissionId: 'sub-a',
        title: 'A',
        action: 'approve',
        operator: 'rvA',
        note: 'ok',
        statusBefore: 'pending',
        statusAfter: 'approved',
        time: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'log-2',
        submissionId: 'sub-b',
        title: 'B',
        action: 'reject',
        operator: 'rvB',
        note: 'no',
        statusBefore: 'pending',
        statusAfter: 'rejected',
        time: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'log-3',
        submissionId: 'sub-c',
        title: 'C',
        action: 'reopen',
        operator: 'rvA',
        note: 'again',
        statusBefore: 'rejected',
        statusAfter: 'pending',
        time: '2026-01-01T00:00:00.000Z',
      },
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/submissions/audit-logs', {
    query: { action: 'reject', page: '1', pageSize: '10' },
    user: { id: 'reviewer-1', username: 'rv', roles: ['reviewer'] }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(Array.isArray(res.body?.items), true)
  assert.equal(res.body?.total, 1)
  assert.equal(res.body?.items?.[0]?.id, 'log-2')
  assert.equal(res.body?.items?.[0]?.action, 'reject')
})

test('audit logs export endpoint should return csv payload', async () => {
  const store = createStore({
    reviewAuditLogs: [
      {
        id: 'log-4',
        submissionId: 'sub-d',
        title: 'D',
        action: 'approve',
        operator: 'rvA',
        note: 'pass',
        statusBefore: 'pending',
        statusAfter: 'approved',
        time: '2026-01-04T00:00:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/submissions/audit-logs/export', {
    query: { limit: '100' },
    user: { id: 'reviewer-1', username: 'rv', roles: ['reviewer'] }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(typeof res.body, 'string')
  assert.equal(String(res.headers['content-type'] || '').includes('text/csv'), true)
  assert.equal(String(res.body).includes('submissionId'), true)
  assert.equal(String(res.body).includes('sub-d'), true)
})

test('report stats endpoint should return aggregated totals and reason distribution', async () => {
  const now = Date.now()
  const iso = (offsetMs) => new Date(now - offsetMs).toISOString()
  const store = createStore({
    skinReports: [
      {
        id: 'r1',
        skinId: 's1',
        reason: 'copyright',
        status: 'pending',
        createdAt: iso(2 * 60 * 60 * 1000),
      },
      {
        id: 'r2',
        skinId: 's2',
        reason: 'nsfw',
        status: 'reviewed',
        createdAt: iso(26 * 60 * 60 * 1000),
      },
      {
        id: 'r3',
        skinId: 's3',
        reason: 'spam',
        status: 'dismissed',
        createdAt: iso(3 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'r4',
        skinId: 's4',
        reason: 'unknown',
        status: 'pending',
        createdAt: iso(10 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'r5',
        skinId: 's5',
        reason: 'other',
        status: 'archived',
        createdAt: iso(30 * 60 * 1000),
      },
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/admin/skins/reports/stats', {
    user: { id: 'moderator-1', username: 'mod', roles: ['moderator'] }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(res.body?.stats?.total, 5)
  assert.equal(res.body?.stats?.pending, 2)
  assert.equal(res.body?.stats?.reviewed, 1)
  assert.equal(res.body?.stats?.dismissed, 1)
  assert.equal(res.body?.stats?.other, 1)
  assert.equal(res.body?.stats?.recent24h, 2)
  assert.equal(res.body?.stats?.recent7d, 4)
  assert.equal(res.body?.stats?.byReason?.copyright, 1)
  assert.equal(res.body?.stats?.byReason?.nsfw, 1)
  assert.equal(res.body?.stats?.byReason?.spam, 1)
  assert.equal(res.body?.stats?.byReason?.other, 2)
})

test('report status endpoint should return owner-visible snapshot fields', async () => {
  const store = createStore({
    skinReports: [
      {
        id: 'report-1',
        skinId: 'skin-101',
        reporterUuid: 'uuid-owner',
        status: 'pending',
        statusText: '已提交，等待审核',
        createdAt: '2026-01-02T08:00:00.000Z',
        updatedAt: '2026-01-02T08:05:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/report/:id/status', {
    params: { id: 'report-1' },
    user: { id: 'user-1', uuid: 'uuid-owner', username: 'owner', roles: [] }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(res.body?.report?.id, 'report-1')
  assert.equal(res.body?.report?.skinId, 'skin-101')
  assert.equal(res.body?.report?.status, 'pending')
  assert.equal(res.body?.report?.statusText, '已提交，等待审核')
  assert.equal(res.body?.report?.updatedAt, '2026-01-02T08:05:00.000Z')
})

test('report status endpoint should reject non-owner without moderation roles', async () => {
  const store = createStore({
    skinReports: [
      {
        id: 'report-2',
        skinId: 'skin-202',
        reporterUuid: 'uuid-owner',
        status: 'reviewed',
        statusText: '举报已处理',
        createdAt: '2026-01-03T08:00:00.000Z',
        updatedAt: '2026-01-03T08:05:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/report/:id/status', {
    params: { id: 'report-2' },
    user: { id: 'user-2', uuid: 'uuid-other', username: 'visitor', roles: [] }
  })

  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.code, 'forbidden')
  assert.equal(res.body?.details?.requiredCapability, 'moderate_reports')
  assert.deepEqual(res.body?.details?.requiredRoles, ['moderator', 'reviewer', 'admin'])
})

test('notifications types endpoint should aggregate unread and total counts', async () => {
  const store = createStore({
    userNotifications: {
      'user-1': [
        {
          id: 'n1',
          type: 'submission_review',
          title: '投稿审核通过',
          createdAt: '2026-01-01T00:00:00.000Z',
          readAt: null,
        },
        {
          id: 'n2',
          type: 'submission_review',
          title: '投稿审核驳回',
          createdAt: '2026-01-02T00:00:00.000Z',
          readAt: '2026-01-03T00:00:00.000Z',
        },
        {
          id: 'n3',
          type: 'security_alert',
          title: '安全告警',
          createdAt: '2026-01-03T00:00:00.000Z',
          readAt: null,
        },
      ]
    }
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/user/notifications/types', {
    query: { includeKnown: 'false' },
    user: { id: 'user-1', username: 'u1', roles: [] }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(res.body?.total, 3)
  assert.equal(res.body?.unread, 2)
  assert.equal(Array.isArray(res.body?.items), true)
  const reviewRow = res.body?.items?.find((row) => row.type === 'submission_review')
  assert.equal(reviewRow?.total, 2)
  assert.equal(reviewRow?.unread, 1)
  const securityRow = res.body?.items?.find((row) => row.type === 'security_alert')
  assert.equal(securityRow?.total, 1)
  assert.equal(securityRow?.unread, 1)
})

test('player dashboard should include derived security indicators', async () => {
  const now = new Date().toISOString()
  const store = createStore({
    userFavorites: {
      'user-1': [{ id: 'fav-1', skinId: 'skin-1', skinName: 'A', createdAt: now }]
    },
    submissions: [
      {
        id: 'sub-10',
        userId: 'user-1',
        submitterUsername: 'user-1',
        status: 'pending',
        submittedAt: now,
        fileName: 'skin.png',
      }
    ],
    securityCenter: {
      sessions: {
        s1: { id: 's1', userId: 'user-1', active: true, ip: '1.1.1.1' },
        s2: { id: 's2', userId: 'user-1', active: true, ip: '2.2.2.2' },
        s3: { id: 's3', userId: 'user-1', active: true, ip: '3.3.3.3' },
      },
      alerts: [{ id: 'a1', userId: 'user-1', level: 'high', at: now }],
      auditLogs: [{ id: 'au-1', userId: 'user-1', action: 'link_minecraft', at: now }],
    }
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/player/dashboard', {
    user: { id: 'user-1', username: 'user-1', totpEnabled: false, linkedMcUsername: '', linkedMcUuid: '' }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.security?.recentBindingChanges, 1)
  assert.equal(res.body?.security?.recentSecurityAlerts, 1)
  assert.equal(res.body?.security?.triggeredSecurityAlert, true)
  assert.equal(res.body?.security?.hasAbnormalSessions, true)
  assert.equal(res.body?.security?.level, 'risk')
})

test('library sync status should expose version and realtime stream metadata', async () => {
  const store = createStore({
    catalog: [
      {
        id: 'skin-1',
        title: 'A',
        skinTextureUrl: '/uploads/a.png',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }
    ],
    catalogSyncedAt: '2026-01-03T00:00:00.000Z',
    skinSyncTasks: [
      {
        id: 'sync-1',
        type: 'catalog_sync',
        status: 'completed',
        finishedAt: '2026-01-03T00:00:00.000Z',
      }
    ]
  })
  const app = mountSkinRoutes(store)

  const res = await runRoute(app, 'GET', '/api/skins/library/sync-status', {
    query: {}
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.ok, true)
  assert.equal(typeof res.body?.sync?.version, 'string')
  assert.equal(String(res.body?.sync?.etag || '').startsWith('"catalog-'), true)
  assert.equal(typeof res.body?.sync?.lastModified, 'string')
  assert.equal(res.body?.realtime?.enabled, true)
  assert.equal(res.body?.realtime?.streamPath, '/api/skins/library/stream')
})
