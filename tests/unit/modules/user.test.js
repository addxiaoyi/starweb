import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerUserRoutes } from '../../../src/modules/user/routes.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(overrides = {}) {
  const store = {
    users: [
      { id: 'u-test', email: 'test@example.com', nickname: 'TestUser', roles: ['user'] },
    ],
    ...overrides.store,
  }

  const jsonOk = (res, body = {}) => res.json({ ok: true, success: true, ...body })
  const jsonErr = (res, status, message, code = 'error') =>
    res.status(status).json({ ok: false, success: false, message, code, error: code })

  const requireUser = (req, _res, next) => {
    req.user = req._testUser || store.users[0] || { id: 'u-test', email: 'test@example.com', roles: ['user'] }
    next()
  }

  return {
    requireUser,
    getStore: () => store,
    jsonOk,
    jsonErr,
    scheduleSave: () => {},
    markUserProfileDirty: () => {},
    publicUser: (u) => {
      if (!u) return null
      return { id: u.id, email: u.email, nickname: u.nickname, roles: u.roles }
    },
    buildUserCenterSummary: () => ({
      linkedMcUsername: null,
      stats: { loginCount: 1 },
    }),
    buildPermissionMatrix: (u) => ({
      permissions: ['read', 'write'],
      roles: u?.roles || [],
    }),
    ...overrides.deps,
  }
}

/**
 * Fire a fake GET/POST request through the express app and return { status, body }.
 */
function fakeRequest(app, method, path, { body, query, user } = {}) {
  return new Promise((resolve, reject) => {
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
      headers: { 'content-type': 'application/json' },
      body: body || {},
      ip: '127.0.0.1',
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

describe('user module', () => {
  // ── 路由注册冒烟 ──────────────────────────────────────────
  describe('route registration smoke', () => {
    it('registers 3 user routes', () => {
      const app = express()
      registerUserRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)
      assert.strictEqual(paths.has('/api/user/me'), true, 'should have /api/user/me')
      assert.strictEqual(paths.has('/api/user/center/summary'), true, 'should have /api/user/center/summary')
      assert.strictEqual(paths.has('/api/user/permissions'), true, 'should have /api/user/permissions')
    })
  })

  // ── GET /api/user/me ───────────────────────────────────────
  describe('GET /api/user/me', () => {
    it('returns the current user', async () => {
      const app = express()
      registerUserRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'GET', '/api/user/me')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(res.body.user)
      assert.strictEqual(res.body.user.id, 'u-test')
      assert.strictEqual(res.body.user.email, 'test@example.com')
    })
  })

  // ── GET /api/user/center/summary ───────────────────────────
  describe('GET /api/user/center/summary', () => {
    it('returns summary for a known user', async () => {
      const app = express()
      registerUserRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'GET', '/api/user/center/summary')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(res.body.user)
    })

    it('returns 404 for unknown user', async () => {
      const app = express()
      registerUserRoutes(app, createMockDeps({
        store: { users: [] },
        deps: {
          requireUser: (req, _res, next) => {
            req.user = { id: 'unknown-user', email: 'x@x.com', roles: [] }
            next()
          },
        },
      }))

      const res = await fakeRequest(app, 'GET', '/api/user/center/summary')
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'not_found')
    })
  })

  // ── GET /api/user/permissions ──────────────────────────────
  describe('GET /api/user/permissions', () => {
    it('returns permissions for the user', async () => {
      const app = express()
      registerUserRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'GET', '/api/user/permissions')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(Array.isArray(res.body.permissions))
    })
  })
})
