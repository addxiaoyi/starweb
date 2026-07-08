import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { registerSkinRoutes } from '../src/modules/skin/index.js'
import { registerAuthxAdminRoutes } from '../src/modules/authxAdmin/index.js'
import { jsonOk, jsonPage } from '../src/utils/response.js'

function createAppStub() {
  const routes = []
  return {
    routes,
    get(routePath, ...handlers) {
      routes.push({ method: 'GET', path: routePath, handlers })
    },
    post(routePath, ...handlers) {
      routes.push({ method: 'POST', path: routePath, handlers })
    },
    put(routePath, ...handlers) {
      routes.push({ method: 'PUT', path: routePath, handlers })
    },
    patch(routePath, ...handlers) {
      routes.push({ method: 'PATCH', path: routePath, handlers })
    },
    delete(routePath, ...handlers) {
      routes.push({ method: 'DELETE', path: routePath, handlers })
    }
  }
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
    status(code) {
      this.statusCode = Number(code)
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    send(payload) {
      this.body = payload
      return this
    },
    end(payload) {
      this.ended = true
      if (payload !== undefined) this.body = payload
      return this
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value
      return this
    },
    type(value) {
      this.headers['content-type'] = String(value)
      return this
    }
  }
}

function resolveRoute(app, method, routePath) {
  const found = app.routes.find((route) => route.method === method && route.path === routePath)
  assert.ok(found, `missing route ${method} ${routePath}`)
  assert.ok(found.handlers.length > 0, `no handlers for route ${method} ${routePath}`)
  return found.handlers[found.handlers.length - 1]
}

async function callRoute(app, method, routePath, req = {}) {
  const handler = resolveRoute(app, method, routePath)
  const res = createRes()
  const request = {
    params: {},
    query: {},
    body: {},
    headers: {},
    user: { id: 'u1', username: 'tester', uuid: 'uuid-1', linkedMcUsername: '' },
    ...req
  }
  const ret = handler(request, res)
  if (ret && typeof ret.then === 'function') await ret
  return res
}

function createSkinDeps(store) {
  return {
    config: { reviewEntryEnabled: true, mojangSkinSyncEnabled: false },
    jsonErr: (res, status, message, code = 'error', details) =>
      res.status(status).json({
        ok: false,
        success: false,
        message,
        code,
        error: code,
        ...(details === undefined ? {} : { details })
      }),
    jsonOk,
    jsonPage,
    getStore: () => store,
    scheduleSave: () => {},
    requireUser: (_req, _res, next) => next && next(),
    requireVerifiedEmail: (_req, _res, next) => next && next(),
    requireReviewerOrAdmin: (_req, _res, next) => next && next(),
    requireModerator: (_req, _res, next) => next && next(),
    upload: {
      single: () => (_req, _res, next) => next && next(),
      array: () => (_req, _res, next) => next && next()
    },
    UPLOAD_DIR: 'uploads',
    path,
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
    catalogItemById: (id) => (store.catalog || []).find((item) => String(item?.id || '') === String(id)),
    mojangSkinSyncLimiter: (_req, _res, next) => next && next(),
    markKvDirty: () => {},
    asyncHandler: (fn) => fn,
    crypto
  }
}

test('skin detail route should return unified ok/success envelope with real stats fields', async () => {
  const store = {
    catalogSyncedAt: '2026-04-27T00:00:00.000Z',
    catalog: [
      {
        id: 'skin-main',
        title: '主皮肤',
        desc: 'main',
        tag: 'pvp',
        skinTextureUrl: 'https://cdn.example.com/main.png',
        cover: 'https://cdn.example.com/main-cover.png',
        model: 'default',
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-27T01:00:00.000Z'
      },
      {
        id: 'skin-related',
        title: '相关皮肤',
        desc: 'related',
        tag: 'pvp',
        skinTextureUrl: 'https://cdn.example.com/related.png',
        cover: 'https://cdn.example.com/related-cover.png',
        model: 'default',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-27T02:00:00.000Z'
      }
    ],
    userFavorites: {
      userA: [{ skinId: 'skin-main' }],
      userB: [{ skinId: 'skin-main' }]
    },
    skinMetrics: {
      'skin-main': {
        views: 12,
        downloads: 4,
        likes: 9,
        favorites: 0,
        updatedAt: '2026-04-27T02:30:00.000Z'
      }
    },
    skinComments: {
      'skin-main': [
        { id: 'c1', status: 'active' },
        { id: 'c2', status: 'deleted' }
      ]
    }
  }

  const app = createAppStub()
  registerSkinRoutes(app, createSkinDeps(store))

  const res = await callRoute(app, 'GET', '/api/skins/:id', {
    params: { id: 'skin-main' },
    query: { relatedLimit: '6' }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.success, true)
  assert.equal(res.body.item.id, 'skin-main')
  assert.equal(res.body.item.stats.favoriteCount, 2)
  assert.equal(res.body.item.stats.downloadCount, 4)
  assert.equal(res.body.item.stats.viewCount, 12)
  assert.equal(res.body.item.stats.likeCount, 9)
  assert.equal(res.body.item.stats.commentCount, 1)
  assert.equal(Array.isArray(res.body.related), true)
  assert.equal(res.body.related.length >= 1, true)
})

test('skin catalog route should return unified pagination envelope and keep sync metadata', async () => {
  const store = {
    catalogSyncedAt: '2026-04-27T00:00:00.000Z',
    catalog: [
      {
        id: 's1',
        title: 'Alpha',
        desc: 'A',
        tag: 'pvp',
        skinTextureUrl: 'https://cdn.example.com/a.png',
        model: 'default',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z'
      },
      {
        id: 's2',
        title: 'Beta',
        desc: 'B',
        tag: 'city',
        skinTextureUrl: 'https://cdn.example.com/b.png',
        model: 'slim',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-27T01:00:00.000Z'
      },
      {
        id: 'offline-only',
        title: 'Offline',
        desc: 'no skin texture',
        tag: 'misc',
        skinTextureUrl: '',
        model: 'default',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z'
      }
    ],
    userFavorites: {}
  }

  const app = createAppStub()
  registerSkinRoutes(app, createSkinDeps(store))

  const res = await callRoute(app, 'GET', '/api/skins/catalog', {
    query: {
      page: '1',
      pageSize: '2',
      since: '2026-04-19T00:00:00.000Z'
    },
    headers: {}
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.success, true)
  assert.equal(Array.isArray(res.body.items), true)
  assert.equal(res.body.total, 2)
  assert.equal(res.body.page, 1)
  assert.equal(res.body.pageSize, 2)
  assert.equal(res.body.pagination.totalPages, 1)
  assert.equal(res.body.pagination.hasMore, false)
  assert.equal(typeof res.body.sync.version, 'string')
  assert.equal(typeof res.body.sync.changedCount, 'number')
  assert.equal(res.body.changedSince.count >= 1, true)
  assert.equal(Array.isArray(res.body.changedSince.items), true)
  assert.equal(typeof res.headers.etag, 'string')
  assert.equal(typeof res.headers['x-catalog-version'], 'string')
  assert.equal(typeof res.headers['last-modified'], 'string')
})

test('authx plugin-health should return unified error envelope on probe failure', async () => {
  const app = createAppStub()
  registerAuthxAdminRoutes(app, {
    requireDevAdmin: () => true,
    pluginFetchHealth: async () => ({ reachable: false, status: 503, parsed: null }),
    pluginFetchJson: async () => ({ status: 200, json: { ok: true } }),
    pluginFetchGet: async () => ({ status: 200, json: { ok: true }, text: 'ok' }),
    config: { authxPluginAdapter: 'vla' },
    adminPluginGetLimiter: (_req, _res, next) => next && next(),
    jsonErr: (res, status, message, code = 'error') =>
      res.status(status).json({ ok: false, success: false, message, code, error: code }),
    jsonOk
  })

  const res = await callRoute(app, 'GET', '/api/admin/authx/plugin-health')
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.success, false)
  assert.equal(res.body.code, 'plugin_health_failed')
  assert.equal(res.body.error, 'plugin_health_failed')
  assert.deepEqual(res.body.details, {
    reachable: false,
    status: 503
  })
  assert.equal(res.body.plugin.reachable, false)
})

test('authx plugin-health should return unified ok/success on probe success', async () => {
  const app = createAppStub()
  registerAuthxAdminRoutes(app, {
    requireDevAdmin: () => true,
    pluginFetchHealth: async () => ({ reachable: true, status: 204, parsed: { database_ok: true } }),
    pluginFetchJson: async () => ({ status: 200, json: { ok: true } }),
    pluginFetchGet: async () => ({ status: 200, json: { ok: true }, text: 'ok' }),
    config: { authxPluginAdapter: 'vla' },
    adminPluginGetLimiter: (_req, _res, next) => next && next(),
    jsonErr: (res, status, message, code = 'error') =>
      res.status(status).json({ ok: false, success: false, message, code, error: code }),
    jsonOk
  })

  const res = await callRoute(app, 'GET', '/api/admin/authx/plugin-health')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.success, true)
  assert.equal(res.body.plugin.reachable, true)
  assert.equal(res.body.plugin.status, 204)
})
