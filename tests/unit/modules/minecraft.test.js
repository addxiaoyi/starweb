import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerMinecraftRoutes } from '../../../src/modules/minecraft/routes.js'
import { asyncHandler } from '../../../src/middleware/error.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(overrides = {}) {
  const store = {
    users: [
      { id: 'u-test', email: 'test@example.com', linkedMcUsername: null, linkedMcUuid: null },
    ],
    playerStates: {},
    ...overrides.store,
  }

  const jsonErr = (res, status, message, code = 'error', extra = {}) =>
    res.status(status).json({ ok: false, success: false, message, code, error: code, ...extra })

  const jsonPage = (res, data) => res.json({ ok: true, ...data })

  const pass = (_req, _res, next) => next()
  const requireUser = (req, _res, next) => {
    req.user = req._testUser || { id: 'u-test', email: 'test@example.com', roles: ['user'] }
    next()
  }

  return {
    config: {},
    getStore: () => store,
    scheduleSave: () => {},
    markUserProfileDirty: () => {},
    markPlayerStateDirty: () => {},
    appendSecurityAudit: () => {},
    pushUserNotification: () => {},
    ensureSecurityCenter: (s) => {
      if (!s.securityCenter) s.securityCenter = { auditLogs: [] }
      return s.securityCenter
    },
    ensurePlayerState: (s, userId) => {
      if (!s.playerStates) s.playerStates = {}
      if (!s.playerStates[userId]) {
        s.playerStates[userId] = { assets: {}, applied: {}, mojangSkin: null }
      }
      return s.playerStates[userId]
    },
    jsonErr,
    jsonPage,
    asyncHandler,
    requireUser,
    requireVerifiedEmail: pass,
    normalizeShortText: (txt, max) => String(txt || '').trim().slice(0, max || 180),
    parseTimeMs: (v) => new Date(v).getTime() || 0,
    verifyTotpToken: () => true,
    validateInviteForMcLink: () => ({ ok: true }),
    claimInviteForUser: () => {},
    persistMojangSkinSync: async () => {},
    MC_BINDING_AUDIT_ACTIONS: new Set(['link_minecraft', 'unlink_minecraft']),
    buildMcBindingHistoryItemFromAudit: (row) => row,
    verifyStatusLabel: (s) => s || 'unknown',
    getMcVerifySession: () => ({
      hasSession: false,
      status: 'none',
      failureReason: null,
      conflictCode: null,
      retryCount: 0,
      maxRetries: 3,
      createdAt: null,
      expiresAt: null,
      lastState: null,
    }),
    getMcVerifySessionHistory: () => ({ items: [], total: 0 }),
    createMcVerifySession: () => ({
      ok: true,
      session: {
        id: 'vs-1',
        code: 'ABC123',
        serverId: 'srv-1',
        status: 'pending',
        retries: 0,
        maxRetries: 3,
        expiresAt: Date.now() + 300_000,
      },
      instructions: 'Join the server',
      remainingInitQuota: 2,
    }),
    clearMcVerifySession: () => true,
    vlaLinkExternalUser: async () => ({ ok: true }),
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

describe('minecraft module', () => {
  // ── 路由注册冒烟 ──────────────────────────────────────────
  describe('route registration smoke', () => {
    it('registers all 7 expected routes', () => {
      const app = express()
      registerMinecraftRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)

      const expected = [
        '/api/user/link-minecraft',
        '/api/user/unlink-minecraft',
        '/api/user/minecraft/status',
        '/api/user/minecraft/binding-history',
        '/api/user/minecraft/verify-history',
        '/api/user/minecraft/verify/init',
        '/api/user/minecraft/verify/cancel',
      ]
      for (const p of expected) {
        assert.strictEqual(paths.has(p), true, `should have ${p}`)
      }
    })
  })

  // ── link-minecraft ─────────────────────────────────────────
  describe('POST /api/user/link-minecraft', () => {
    it('links a valid username', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/user/link-minecraft', {
        body: { username: 'Steve' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.linkedMcUsername, 'Steve')
    })

    it('returns 400 for username too short', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/user/link-minecraft', {
        body: { username: 'ab' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'validation_error')
    })

    it('returns 400 for empty username', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/user/link-minecraft', {
        body: { username: '' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.ok, false)
    })

    it('returns error when vlaLinkExternalUser fails', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps({
        deps: {
          vlaLinkExternalUser: async () => ({
            ok: false,
            status: 404,
            json: { error: 'not_found' },
          }),
        },
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/link-minecraft', {
        body: { username: 'Steve' },
      })
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'link_failed')
    })

    it('returns 403 when invite validation fails', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps({
        deps: {
          validateInviteForMcLink: () => ({ ok: false, error: 'invite_required' }),
        },
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/link-minecraft', {
        body: { username: 'Steve' },
      })
      assert.strictEqual(res.status, 403)
      assert.strictEqual(res.body.ok, false)
    })
  })

  // ── unlink-minecraft ───────────────────────────────────────
  describe('POST /api/user/unlink-minecraft', () => {
    it('unlinks a currently linked user', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps({
        store: {
          users: [
            { id: 'u-test', email: 'test@example.com', linkedMcUsername: 'Steve', linkedMcUuid: 'uuid-1' },
          ],
          playerStates: {},
        },
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/unlink-minecraft', {
        body: {},
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
    })

    it('returns 400 when not linked', async () => {
      const app = express()
      app.use(express.json())
      registerMinecraftRoutes(app, createMockDeps({
        store: {
          users: [
            { id: 'u-test', email: 'test@example.com', linkedMcUsername: null },
          ],
          playerStates: {},
        },
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/unlink-minecraft', {
        body: {},
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'not_linked')
    })
  })

  // ── minecraft/status ───────────────────────────────────────
  describe('GET /api/user/minecraft/status', () => {
    it('returns status for a known user', async () => {
      const app = express()
      registerMinecraftRoutes(app, createMockDeps({
        store: {
          users: [
            { id: 'u-test', email: 'test@example.com', linkedMcUsername: 'Steve', linkedMcUuid: 'uuid-1' },
          ],
          playerStates: {},
        },
      }))

      const res = await fakeRequest(app, 'GET', '/api/user/minecraft/status')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.linked, true)
      assert.strictEqual(res.body.mcUsername, 'Steve')
    })

    it('returns 404 for unknown user', async () => {
      const app = express()
      registerMinecraftRoutes(app, createMockDeps({
        store: { users: [], playerStates: {} },
      }))

      const res = await fakeRequest(app, 'GET', '/api/user/minecraft/status')
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.body.ok, false)
    })
  })
})
