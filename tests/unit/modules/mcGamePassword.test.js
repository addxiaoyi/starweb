import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerMcGamePasswordRoutes } from '../../../src/modules/mcGamePassword/routes.js'
import { asyncHandler } from '../../../src/middleware/error.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(overrides = {}) {
  const store = {
    users: [],
    mcResetEvents: [],
    ...overrides.store,
  }

  const jsonErrWithRequest = (res, status, message, code, reqId, fields = {}, extra = {}) =>
    res.status(status).json({ ok: false, message, code, error: code, reqId, ...fields })

  const jsonOkWithRequest = (res, body, reqId) =>
    res.json({ ok: true, reqId, ...body })

  const pass = (_req, _res, next) => next()

  let uuidCounter = 0

  return {
    mcGamePasswordRequestLimiter: pass,
    mcGamePasswordConfirmLimiter: pass,
    asyncHandler,
    getStore: () => store,
    config: { authxPluginAdapter: 'vla', maxPasswordLength: 128 },
    crypto: {
      randomUUID: () => `mock-uuid-${++uuidCounter}`,
    },
    jsonErrWithRequest,
    jsonOkWithRequest,
    createMcGamePasswordChallenge: async () => ({ ok: true }),
    confirmMcGamePasswordReset: async () => ({ ok: true }),
    pluginFetchJson: async () => ({ status: 200, json: { ok: true } }),
    pushMcResetEvent: () => {},
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

describe('mcGamePassword module', () => {
  // ── 路由注册冒烟 ──────────────────────────────────────────
  describe('route registration smoke', () => {
    it('registers the 2 mc-game-password routes', () => {
      const app = express()
      registerMcGamePasswordRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)
      assert.strictEqual(
        paths.has('/api/public/mc-game-password/request-code'),
        true,
        'should have /api/public/mc-game-password/request-code'
      )
      assert.strictEqual(
        paths.has('/api/public/mc-game-password/confirm'),
        true,
        'should have /api/public/mc-game-password/confirm'
      )
    })
  })

  // ── request-code success ───────────────────────────────────
  describe('POST /api/public/mc-game-password/request-code', () => {
    it('returns success when challenge is created', async () => {
      const app = express()
      app.use(express.json())
      registerMcGamePasswordRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/public/mc-game-password/request-code', {
        body: { email: 'test@example.com', linkedMcUsername: 'Steve' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(res.body.message)
    })

    it('returns 429 when rate limited', async () => {
      const app = express()
      app.use(express.json())
      registerMcGamePasswordRoutes(app, createMockDeps({
        deps: {
          createMcGamePasswordChallenge: async () => ({
            ok: false,
            error: 'rate_limited',
            retryAfterSec: 60,
          }),
        },
      }))

      const res = await fakeRequest(app, 'POST', '/api/public/mc-game-password/request-code', {
        body: { email: 'test@example.com', linkedMcUsername: 'Steve' },
      })
      assert.strictEqual(res.status, 429)
      assert.strictEqual(res.body.ok, false)
    })
  })

  // ── confirm success ────────────────────────────────────────
  describe('POST /api/public/mc-game-password/confirm', () => {
    it('returns success when password is reset', async () => {
      const app = express()
      app.use(express.json())
      registerMcGamePasswordRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/public/mc-game-password/confirm', {
        body: { mcUsername: 'Steve', code: '123456', newPassword: 'newpass123' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(res.body.message)
    })

    it('returns error when confirm fails with bad_code', async () => {
      const app = express()
      app.use(express.json())
      registerMcGamePasswordRoutes(app, createMockDeps({
        deps: {
          confirmMcGamePasswordReset: async () => ({
            ok: false,
            error: 'bad_code',
            status: 400,
          }),
        },
      }))

      const res = await fakeRequest(app, 'POST', '/api/public/mc-game-password/confirm', {
        body: { mcUsername: 'Steve', code: 'wrong', newPassword: 'newpass123' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.ok, false)
    })
  })
})
