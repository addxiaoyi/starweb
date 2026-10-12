import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerVerifyCodeRoutes } from '../../../src/modules/auth/verifyCodeRoutes.js'
import { asyncHandler } from '../../../src/middleware/error.js'
import { canUseVerifyCodeDevFallback } from '../../../src/features/verifyCodeLogin.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(overrides = {}) {
  const store = {
    users: [],
    ...overrides.store,
  }

  const jsonErr = (res, status, message, code = 'error') =>
    res.status(status).json({ ok: false, success: false, message, code, error: code })

  const jsonErrWithRequest = (res, status, message, code, reqId, fields = {}, _extra = {}) =>
    res.status(status).json({ ok: false, message, code, error: code, reqId, ...fields })

  const jsonOkWithRequest = (res, body, reqId) =>
    res.json({ ok: true, reqId, ...body })

  const pass = (_req, _res, next) => next()

  let uuidCounter = 0

  return {
    verifyCodeSendLimiter: pass,
    asyncHandler,
    getStore: () => store,
    crypto: {
      randomUUID: () => `mock-uuid-${++uuidCounter}`,
    },
    jsonErr,
    jsonErrWithRequest,
    jsonOkWithRequest,
    sendVerifyCode: async () => ({ ok: true, email: 'test@example.com', id: 'challenge-1' }),
    confirmVerifyCodeLogin: async () => ({
      ok: true,
      user: { id: 'u-1', email: 'test@example.com' },
    }),
    isSuperTokensReady: () => true,
    supertokens: {},
    Session: {},
    ...overrides.deps,
  }
}

/**
 * Fire a fake GET/POST request through the express app and return { status, body }.
 */
function fakeRequest(app, method, path, { body, query, user, headers } = {}) {
  return new Promise((resolve, _reject) => {
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
      headers: { 'content-type': 'application/json', ...headers },
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

describe('verifyCode module', () => {
  it('never allows local verification fallback in production', () => {
    assert.strictEqual(canUseVerifyCodeDevFallback(true, '用户不存在，请先注册'), false)
    assert.strictEqual(canUseVerifyCodeDevFallback(true, 'SuperTokens 未初始化'), false)
    assert.strictEqual(canUseVerifyCodeDevFallback(false, 'SuperTokens 未初始化'), true)
  })

  // ── 路由注册冒烟 ──────────────────────────────────────────
  describe('route registration smoke', () => {
    it('registers the 2 verify-code routes', () => {
      const app = express()
      registerVerifyCodeRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)
      assert.strictEqual(paths.has('/api/auth/verify-code/send'), true, 'should have /api/auth/verify-code/send')
      assert.strictEqual(paths.has('/api/auth/verify-code/confirm'), true, 'should have /api/auth/verify-code/confirm')
    })
  })

  // ── send: missing email ────────────────────────────────────
  describe('POST /api/auth/verify-code/send', () => {
    it('returns 400 when email is missing', async () => {
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/auth/verify-code/send', {
        body: {},
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'missing_email')
    })

    it('returns success when email is provided', async () => {
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/auth/verify-code/send', {
        body: { email: 'test@example.com' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(res.body.message)
    })
  })

  // ── confirm: content-type check ────────────────────────────
  describe('POST /api/auth/verify-code/confirm', () => {
    it('returns 415 when content-type is not application/json', async () => {
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/auth/verify-code/confirm', {
        body: { email: 'test@example.com', code: '123456' },
        headers: { 'content-type': 'text/plain' },
      })
      assert.strictEqual(res.status, 415)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'unsupported_media_type')
    })

    it('returns 400 when email or code is missing', async () => {
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/auth/verify-code/confirm', {
        body: { email: 'test@example.com' },
        headers: { 'content-type': 'application/json' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'missing_params')
    })

    it('returns success when email and code are provided', async () => {
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/auth/verify-code/confirm', {
        body: { email: 'test@example.com', code: '123456' },
        headers: { 'content-type': 'application/json' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })

    it('creates legacy sessions with the SuperTokens v20 signature', async () => {
      const recipeUserId = { getAsString: () => 'recipe-user-1' }
      let sessionArgs
      const deps = createMockDeps({
        deps: {
          supertokens: {
            listUsersByAccountInfo: async () => [{
              id: 'primary-user-1',
              loginMethods: [{ recipeId: 'emailpassword', recipeUserId }],
            }],
          },
          Session: {
            createNewSession: async (...args) => {
              sessionArgs = args
            },
          },
          confirmVerifyCodeLogin: async (_store, _body, hooks) => ({
            ok: true,
            user: await hooks.onLogin('test@example.com'),
          }),
        },
      })
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, deps)

      const response = await fakeRequest(app, 'POST', '/api/auth/verify-code/confirm', {
        body: { email: 'test@example.com', code: '123456' },
      })

      assert.strictEqual(response.status, 200)
      assert.strictEqual(sessionArgs[0].url, '/api/auth/verify-code/confirm')
      assert.strictEqual(sessionArgs[1].statusCode, 200)
      assert.strictEqual(sessionArgs[2], 'public')
      assert.strictEqual(sessionArgs[3], recipeUserId)
    })

    it('creates registered-user sessions from the returned recipe user id', async () => {
      const recipeUserId = { getAsString: () => 'registered-recipe-user-1' }
      let sessionArgs
      const deps = createMockDeps({
        deps: {
          EmailPassword: {
            signUp: async () => ({
              status: 'OK',
              user: { id: 'registered-primary-user-1' },
              recipeUserId,
            }),
          },
          Session: {
            createNewSession: async (...args) => {
              sessionArgs = args
            },
          },
          confirmVerifyCodeLogin: async (_store, _body, hooks) => ({
            ok: true,
            user: await hooks.onRegister('new@example.com', 'test-password', 'new_player'),
          }),
        },
      })
      const app = express()
      app.use(express.json())
      registerVerifyCodeRoutes(app, deps)

      const response = await fakeRequest(app, 'POST', '/api/auth/verify-code/confirm', {
        body: {
          email: 'new@example.com',
          code: '123456',
          mode: 'register',
          username: 'new_player',
          password: 'test-password',
        },
      })

      assert.strictEqual(response.status, 200)
      assert.strictEqual(sessionArgs[0].url, '/api/auth/verify-code/confirm')
      assert.strictEqual(sessionArgs[1].statusCode, 200)
      assert.strictEqual(sessionArgs[2], 'public')
      assert.strictEqual(sessionArgs[3], recipeUserId)
    })
  })
})
