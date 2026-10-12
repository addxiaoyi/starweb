import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerCapeRoutes } from '../../../src/modules/cape/routes.js'
import { asyncHandler } from '../../../src/middleware/error.js'

const VALID_TEXTURE_URL = `https://textures.minecraft.net/texture/${'a'.repeat(64)}`

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(storeOverrides = {}) {
  const store = {
    catalog: [],
    users: [],
    playerStates: {},
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
    config: {},
    store,
    getStore: () => store,
    scheduleSave: () => {},
    markPlayerStateDirty: () => {},
    ensurePlayerState: (s, userId) => {
      if (!s.playerStates) s.playerStates = {}
      if (!s.playerStates[userId]) {
        s.playerStates[userId] = { assets: {}, applied: {} }
      }
      return s.playerStates[userId]
    },
    jsonOk,
    jsonErr,
    asyncHandler,
    requireUser,
    getOfficialCapes: () => new Map(),
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

    // Let express route the request
    app(req, res, (err) => {
      if (err) {
        // If an error handler would handle it, simulate it
        resolve({ status: err.status || 500, body: { error: err.message } })
      } else {
        // No route matched
        resolve({ status: 404, body: { error: 'no route matched' } })
      }
    })
  })
}

// ── tests ────────────────────────────────────────────────────

describe('cape module', () => {
  // ── 路由注册冒烟 ──────────────────────────────────────────
  describe('route registration smoke', () => {
    it('registers /api/cape/search and /api/cape/apply', () => {
      const app = express()
      registerCapeRoutes(app, createMockDeps())
      const paths = collectExpressPaths(app)
      assert.strictEqual(paths.has('/api/cape/search'), true, 'should have /api/cape/search')
      assert.strictEqual(paths.has('/api/cape/apply'), true, 'should have /api/cape/apply')
    })
  })

  // ── 搜索返回分页结果 ──────────────────────────────────────
  describe('GET /api/cape/search', () => {
    it('returns paginated results from catalog', async () => {
      const catalog = []
      for (let i = 1; i <= 25; i++) {
        catalog.push({ id: `cape-${i}`, name: `Cape ${i}`, type: 'cape', author: 'Artist', source: 'mojang-textures', textureUrl: VALID_TEXTURE_URL })
      }
      // Add a non-cape item that should be excluded
      catalog.push({ id: 'skin-1', name: 'A Skin', type: 'skin' })

      const app = express()
      registerCapeRoutes(app, createMockDeps({ catalog }))

      const res = await fakeRequest(app, 'GET', '/api/cape/search', { query: { page: '1', pageSize: '10' } })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.items.length, 10, 'page 1 should have 10 items')
      assert.strictEqual(res.body.total, 25, 'total should be 25 (exclude non-cape)')
      assert.strictEqual(res.body.page, 1)
      assert.strictEqual(res.body.pageSize, 10)
    })

    it('filters by keyword', async () => {
      const catalog = [
        { id: 'c1', name: 'Star Cape', type: 'cape', author: 'Alice', description: 'shiny', source: 'mojang-textures', textureUrl: VALID_TEXTURE_URL },
        { id: 'c2', name: 'Moon Cloak', type: 'cape', author: 'Bob', description: 'dark', source: 'mojang-textures', textureUrl: VALID_TEXTURE_URL },
        { id: 'c3', name: 'Sun Wrap', type: 'cape', author: 'Star Builder', description: 'warm', source: 'mojang-textures', textureUrl: VALID_TEXTURE_URL },
      ]

      const app = express()
      registerCapeRoutes(app, createMockDeps({ catalog }))

      const res = await fakeRequest(app, 'GET', '/api/cape/search', { query: { q: 'star' } })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.total, 2, 'should match "Star Cape" and author "Star Builder"')
      const ids = res.body.items.map((i) => i.id)
      assert.ok(ids.includes('c1'))
      assert.ok(ids.includes('c3'))
    })

    it('returns empty when no match', async () => {
      const catalog = [
        { id: 'c1', name: 'Star Cape', type: 'cape', source: 'mojang-textures', textureUrl: VALID_TEXTURE_URL },
      ]
      const app = express()
      registerCapeRoutes(app, createMockDeps({ catalog }))

      const res = await fakeRequest(app, 'GET', '/api/cape/search', { query: { q: 'zzz_no_match' } })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.total, 0)
      assert.strictEqual(res.body.items.length, 0)
    })
  })

  // ── 装备/卸下披风 ──────────────────────────────────────────
  describe('POST /api/cape/apply', () => {
    it('equips a cape from catalog', async () => {
      const catalog = [
        { id: 'cape-001', name: 'Golden Cape', type: 'cape', source: 'mojang-textures', textureUrl: VALID_TEXTURE_URL },
      ]
      const app = express()
      app.use(express.json())
      registerCapeRoutes(app, createMockDeps({ catalog }))

      const res = await fakeRequest(app, 'POST', '/api/cape/apply', {
        body: { capeId: 'cape-001', action: 'equip' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.action, 'equipped')
      assert.strictEqual(res.body.source, 'catalog')
    })

    it('equips a cape from owned assets', async () => {
      const playerStates = {
        'u-test': {
          assets: { cape_my_cape: { id: 'my_cape', url: 'http://example.com/cape.png' } },
          applied: {},
        },
      }
      const app = express()
      app.use(express.json())
      const deps = createMockDeps({ catalog: [], playerStates })
      // Override ensurePlayerState to return the pre-existing state
      deps.ensurePlayerState = (s, userId) => s.playerStates[userId]
      registerCapeRoutes(app, deps)

      const res = await fakeRequest(app, 'POST', '/api/cape/apply', {
        body: { capeId: 'my_cape', action: 'equip' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.source, 'owned')
    })

    it('returns 404 for non-existent cape', async () => {
      const app = express()
      app.use(express.json())
      registerCapeRoutes(app, createMockDeps({ catalog: [] }))

      const res = await fakeRequest(app, 'POST', '/api/cape/apply', {
        body: { capeId: 'nonexistent', action: 'equip' },
      })
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.body.ok, false)
      assert.strictEqual(res.body.code, 'cape_not_found')
    })

    it('unequips a cape', async () => {
      const app = express()
      app.use(express.json())
      registerCapeRoutes(app, createMockDeps())

      const res = await fakeRequest(app, 'POST', '/api/cape/apply', {
        body: { action: 'unequip' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(res.body.action, 'unequipped')
    })
  })
})
