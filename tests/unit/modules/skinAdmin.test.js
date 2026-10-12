import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import crypto from 'node:crypto'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerSkinAdminRoutes } from '../../../src/modules/skinAdmin/index.js'
import { asyncHandler } from '../../../src/middleware/error.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(storeOverrides = {}) {
  const store = {
    reports: [],
    users: [],
    ...storeOverrides,
  }

  const jsonOk = (res, body = {}) => res.json({ ok: true, success: true, ...body })
  const jsonErr = (res, status, message, code = 'error') =>
    res.status(status).json({ ok: false, success: false, message, code, error: code })

  const pass = (_req, _res, next) => next()
  const requireUser = (req, _res, next) => {
    req.user = req._testUser || { id: 'admin-1', email: 'admin@example.com', roles: ['admin'] }
    next()
  }
  const requireAdmin = (req, _res, next) => {
    req.user = req._testUser || { id: 'admin-1', email: 'admin@example.com', roles: ['admin'] }
    next()
  }

  return {
    config: {},
    store,
    getStore: () => store,
    scheduleSave: () => {},
    jsonOk,
    jsonErr,
    asyncHandler,
    requireUser,
    requireAdmin,
    crypto,
  }
}

function fakeRequest(app, method, path, { body, query, user } = {}) {
  return new Promise((resolve) => {
    const url = new URL(`http://localhost${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    }

    const req = {
      method: method.toUpperCase(),
      url: url.pathname + url.search,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      params: {},
      headers: {},
      body: body || {},
      get: (h) => req.headers[h.toLowerCase()] || '',
    }

    if (user) req._testUser = user

    let _status = 200
    const res = {
      statusCode: 200,
      _headers: {},
      status(code) { _status = code; res.statusCode = code; return res },
      json(data) { resolve({ status: _status, body: data }) },
      send(data) { resolve({ status: _status, body: data }) },
      setHeader(k, v) { res._headers[k] = v; return res },
      getHeader(k) { return res._headers[k] },
      set(k, v) { res._headers[k] = v; return res },
      end() { resolve({ status: _status, body: null }) },
      headersSent: false,
    }

    app(req, res, (err) => {
      if (err) {
        resolve({ status: err.status || 500, body: { error: err.message } })
      } else {
        resolve({ status: 404, body: { error: 'no route matched' } })
      }
    })
  })
}

// ── tests ────────────────────────────────────────────────────

describe('skinAdmin module', () => {
  describe('route registration', () => {
    it('registers admin report routes', () => {
      const app = express()
      registerSkinAdminRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)
      assert.strictEqual(paths.has('/api/admin/reports'), true)
      assert.strictEqual(paths.has('/api/admin/reports/:id'), true)
      assert.strictEqual(paths.has('/api/admin/skins/reports/:id'), true)
    })
  })

  describe('GET /api/admin/reports', () => {
    it('returns list of reports', async () => {
      const reports = [
        { id: 'r1', status: 'open', reason: 'Inappropriate skin' },
        { id: 'r2', status: 'resolved', reason: 'Offensive name' },
        { id: 'r3', status: 'open', reason: 'Copyright' },
      ]
      const app = express()
      registerSkinAdminRoutes(app, createMockDeps({ reports }))

      const res = await fakeRequest(app, 'GET', '/api/admin/reports')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.items.length, 3)
      assert.strictEqual(res.body.total, 3)
    })

    it('filters by status query parameter', async () => {
      const reports = [
        { id: 'r1', status: 'open', reason: 'A' },
        { id: 'r2', status: 'resolved', reason: 'B' },
        { id: 'r3', status: 'open', reason: 'C' },
      ]
      const app = express()
      registerSkinAdminRoutes(app, createMockDeps({ reports }))

      const res = await fakeRequest(app, 'GET', '/api/admin/reports', { query: { status: 'open' } })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.items.length, 2)
      assert.strictEqual(res.body.total, 2)
    })
  })

  describe('PATCH /api/admin/reports/:id', () => {
    it('updates report status', async () => {
      const reports = [
        { id: 'r1', status: 'open', reason: 'Bad skin' },
      ]
      const app = express()
      app.use(express.json())
      registerSkinAdminRoutes(app, createMockDeps({ reports }))

      const res = await fakeRequest(app, 'PATCH', '/api/admin/reports/r1', {
        body: { status: 'resolved', resolution: 'Skin removed', note: 'Confirmed violation' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.status, 'resolved')
      assert.strictEqual(res.body.resolution, 'Skin removed')
      assert.strictEqual(res.body.adminNote, 'Confirmed violation')
      assert.ok(res.body.reviewedAt, 'should have reviewedAt timestamp')
    })

    it('returns 404 for non-existent report', async () => {
      const app = express()
      app.use(express.json())
      registerSkinAdminRoutes(app, createMockDeps({ reports: [] }))

      const res = await fakeRequest(app, 'PATCH', '/api/admin/reports/nonexistent', {
        body: { status: 'resolved' },
      })
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'not_found')
    })

    it('rejects invalid status value', async () => {
      const reports = [{ id: 'r1', status: 'open' }]
      const app = express()
      app.use(express.json())
      registerSkinAdminRoutes(app, createMockDeps({ reports }))

      const res = await fakeRequest(app, 'PATCH', '/api/admin/reports/r1', {
        body: { status: 'invalid_status' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'validation_error')
    })
  })
})
