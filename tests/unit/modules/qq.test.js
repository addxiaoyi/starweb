import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerQqRoutes } from '../../../src/modules/qq/routes.js'
import { asyncHandler } from '../../../src/middleware/error.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(storeOverrides = {}, configOverrides = {}) {
  const store = {
    users: [],
    qqGuild: {},
    ...storeOverrides,
  }

  const jsonOk = (res, body = {}) => res.json({ ok: true, success: true, ...body })
  const jsonErr = (res, status, message, code = 'error') =>
    res.status(status).json({ ok: false, success: false, message, code, error: code })

  const pass = (_req, _res, next) => next()
  const requireUser = (req, _res, next) => {
    req.user = req._testUser || { id: 'u-test', email: 'test@example.com', roles: ['user'] }
    next()
  }

  return {
    config: { ...configOverrides },
    store,
    getStore: () => store,
    scheduleSave: () => {},
    jsonOk,
    jsonErr,
    asyncHandler,
    requireUser,
  }
}

function fakeRequest(app, method, path, { body, query, params, user } = {}) {
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
      params: params || {},
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

describe('qq module', () => {
  describe('route registration', () => {
    it('registers expected QQ routes', () => {
      const app = express()
      registerQqRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)
      assert.strictEqual(paths.has('/api/qq/guild-info'), true)
      assert.strictEqual(paths.has('/api/qq/verify'), true)
      assert.strictEqual(paths.has('/api/qq/profiles/:qq'), true)
    })
  })

  describe('GET /api/qq/guild-info', () => {
    it('returns configured:false when QQ bot is not configured', async () => {
      const app = express()
      registerQqRoutes(app, createMockDeps({}, {})) // no qqBotToken
      // Ensure QQ_BOT_TOKEN is not set in env for this test
      const saved = process.env.QQ_BOT_TOKEN
      delete process.env.QQ_BOT_TOKEN

      try {
        const res = await fakeRequest(app, 'GET', '/api/qq/guild-info')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.body.configured, false)
        assert.strictEqual(res.body.guild, null)
      } finally {
        if (saved !== undefined) process.env.QQ_BOT_TOKEN = saved
      }
    })

    it('returns guild info when configured', async () => {
      const app = express()
      registerQqRoutes(app, createMockDeps(
        { qqGuild: { guildId: 'g-123', guildName: 'Test Guild', memberCount: 42 } },
        { qqBotToken: 'fake-token' },
      ))

      const res = await fakeRequest(app, 'GET', '/api/qq/guild-info')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.configured, true)
      assert.strictEqual(res.body.guild.id, 'g-123')
      assert.strictEqual(res.body.guild.name, 'Test Guild')
    })
  })

  describe('POST /api/qq/verify', () => {
    it('rejects invalid QQ number format', async () => {
      const app = express()
      app.use(express.json())
      registerQqRoutes(app, createMockDeps(
        { users: [{ id: 'u-test', email: 'test@example.com' }] },
        { qqBotToken: 'token' },
      ))

      // Too short
      let res = await fakeRequest(app, 'POST', '/api/qq/verify', { body: { qqNumber: '123' } })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'validation_error')

      // Non-numeric
      res = await fakeRequest(app, 'POST', '/api/qq/verify', { body: { qqNumber: 'abc12345' } })
      assert.strictEqual(res.status, 400)
    })

    it('binds QQ number successfully', async () => {
      const app = express()
      app.use(express.json())
      registerQqRoutes(app, createMockDeps(
        { users: [{ id: 'u-test', email: 'test@example.com' }] },
        { qqBotToken: 'token' },
      ))

      const res = await fakeRequest(app, 'POST', '/api/qq/verify', { body: { qqNumber: '123456789' } })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.qqNumber, '123456789')
      assert.strictEqual(res.body.verified, false)
    })

    it('returns 409 when QQ number is already bound to another user', async () => {
      const app = express()
      app.use(express.json())
      registerQqRoutes(app, createMockDeps(
        {
          users: [
            { id: 'u-other', email: 'other@example.com', qqNumber: '123456789' },
            { id: 'u-test', email: 'test@example.com' },
          ],
        },
        { qqBotToken: 'token' },
      ))

      const res = await fakeRequest(app, 'POST', '/api/qq/verify', { body: { qqNumber: '123456789' } })
      assert.strictEqual(res.status, 409)
      assert.strictEqual(res.body.code, 'qq_already_bound')
    })
  })

  describe('GET /api/qq/profiles/:qq', () => {
    it('returns profile when user found by QQ number', async () => {
      const app = express()
      registerQqRoutes(app, createMockDeps({
        users: [{ id: 'u-1', username: 'alice', qqNumber: '987654321', qqVerified: true }],
      }))

      const res = await fakeRequest(app, 'GET', '/api/qq/profiles/987654321')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.found, true)
      assert.strictEqual(res.body.profile.userId, 'u-1')
      assert.strictEqual(res.body.profile.username, 'alice')
    })

    it('returns found:false when no user matches', async () => {
      const app = express()
      registerQqRoutes(app, createMockDeps({ users: [] }))

      const res = await fakeRequest(app, 'GET', '/api/qq/profiles/111111111')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.found, false)
    })
  })
})
