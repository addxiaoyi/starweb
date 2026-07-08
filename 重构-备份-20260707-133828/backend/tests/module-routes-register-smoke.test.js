import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerSecurityRoutes } from '../src/modules/security/index.js'
import { registerSkinRoutes, registerSkinTextureRoute } from '../src/modules/skin/index.js'
import { registerAuthxAdminRoutes } from '../src/modules/authxAdmin/index.js'
import { registerCapeRoutes } from '../src/modules/cape/routes.js'
import { registerQqRoutes } from '../src/modules/qq/routes.js'
import { registerMapHealthRoutes } from '../src/modules/ops/mapHealth.js'
import { registerPublicSkinProfileRoutes } from '../src/modules/skin/index.js'
import { registerSkinRefreshRoutes } from '../src/modules/plugin-gateway/skinRefresh.js'

function createAppStub() {
  const routes = []
  return {
    routes,
    get(path, ...handlers) {
      routes.push({ method: 'GET', path, handlersCount: handlers.length })
    },
    post(path, ...handlers) {
      routes.push({ method: 'POST', path, handlersCount: handlers.length })
    },
    put(path, ...handlers) {
      routes.push({ method: 'PUT', path, handlersCount: handlers.length })
    },
    patch(path, ...handlers) {
      routes.push({ method: 'PATCH', path, handlersCount: handlers.length })
    },
    delete(path, ...handlers) {
      routes.push({ method: 'DELETE', path, handlersCount: handlers.length })
    }
  }
}

function createSecurityDeps() {
  return {
    requireUser: (_req, _res, next) => next && next(),
    requireAdmin: () => true,
    getStore: () => ({
      users: [],
      catalog: [],
      submissions: [],
      reviewAuditLogs: [],
      securityCenter: {
        rules: {},
        alerts: [],
        auditLogs: [],
        sessions: {},
        webhookQueue: [],
        geoCache: {}
      }
    }),
    ensureSecurityCenter: (store) => store.securityCenter,
    appendSecurityAudit: () => {},
    scheduleSave: () => {},
    jsonErr: () => ({}),
    deriveRiskFromEvents: () => ({ level: 'low', score: 0, suspicious: false, unknownIp: false }),
    requiresStepUpForHighRisk: () => false,
    verifyStepUp: () => true,
    crypto: { randomUUID: () => 'uuid' },
    asyncHandler: (fn) => fn,
    config: { authxPluginAdapter: 'none' },
    pluginFetchGet: async () => ({ json: {} }),
    resolveGeoForIp: async () => '未知地区',
    appendSecurityAlert: () => {}
  }
}

function createSkinDeps() {
  return {
    config: { reviewEntryEnabled: true, mojangSkinSyncEnabled: false },
    jsonErr: () => ({}),
    getStore: () => ({ users: [], catalog: [], submissions: [], reviewAuditLogs: [] }),
    scheduleSave: () => {},
    requireUser: (_req, _res, next) => next && next(),
    requireVerifiedEmail: (_req, _res, next) => next && next(),
    requireReviewerOrAdmin: (_req, _res, next) => next && next(),
    upload: {
      single: () => (_req, _res, next) => next && next(),
      array: () => (_req, _res, next) => next && next()
    },
    UPLOAD_DIR: 'uploads',
    path: { relative: () => 'x.png', isAbsolute: () => false },
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
    catalogItemById: () => ({ id: '1', title: 'x' }),
    mojangSkinSyncLimiter: (_req, _res, next) => next && next(),
    markKvDirty: () => {},
    asyncHandler: (fn) => fn,
    crypto: { randomUUID: () => 'uuid' }
  }
}

function createAuthxAdminDeps() {
  return {
    requireDevAdmin: () => true,
    pluginFetchHealth: async () => ({ reachable: true, status: 200 }),
    pluginFetchJson: async () => ({ status: 200, json: { ok: true } }),
    pluginFetchGet: async () => ({ status: 200, json: { ok: true }, text: 'ok' }),
    config: { authxPluginAdapter: 'vla' },
    adminPluginGetLimiter: (_req, _res, next) => next && next(),
    jsonErr: () => ({})
  }
}

test('registerSecurityRoutes should mount core routes', () => {
  const app = createAppStub()
  registerSecurityRoutes(app, createSecurityDeps())
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/security/center'), true)
  assert.equal(paths.has('/api/security/analytics/summary'), true)
  assert.equal(paths.has('/api/security/session/revoke-all'), true)
  assert.equal(paths.has('/api/security/admin/rules'), true)
})

test('registerSkinRoutes should mount core routes', () => {
  const app = createAppStub()
  registerSkinRoutes(app, createSkinDeps())
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/skins/catalog'), true)
  assert.equal(paths.has('/api/skins/player/dashboard'), true)
  assert.equal(paths.has('/api/skins/player/submissions'), true)
  assert.equal(paths.has('/api/skin/apply'), true)
})

test('registerAuthxAdminRoutes should mount core routes', () => {
  const app = createAppStub()
  registerAuthxAdminRoutes(app, createAuthxAdminDeps())
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/admin/authx/plugin-health'), true)
  assert.equal(paths.has('/api/admin/authx/plugin-metrics'), true)
  assert.equal(paths.has('/api/admin/authx/ban-check'), true)
  assert.equal(paths.has('/api/admin/authx/link-external-user'), true)
})

test('registerSkinTextureRoute should mount /api/skins/texture', () => {
  const app = createAppStub()
  registerSkinTextureRoute(app, {})
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/skins/texture'), true)
})

test('registerCapeRoutes should mount /api/cape/search', () => {
  const app = createAppStub()
  registerCapeRoutes(app, {})
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/cape/search'), true)
})

test('registerQqRoutes should mount /api/qq/profiles', () => {
  const app = createAppStub()
  registerQqRoutes(app, {})
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/qq/profiles'), true)
})

test('registerMapHealthRoutes should mount /map-health/:server', () => {
  const app = createAppStub()
  registerMapHealthRoutes(app, { config: {} })
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/map-health/:server'), true)
})

test('registerPublicSkinProfileRoutes should mount /api/public/skin-profile/:mcSegment', () => {
  const app = createAppStub()
  registerPublicSkinProfileRoutes(app, {
    config: {},
    jsonErr: () => ({}),
    getStore: () => ({ users: [], catalog: [] }),
    asyncHandler: (fn) => fn,
    skinProfilePublicLimiter: (_req, _res, next) => next && next(),
    findUserByLinkedMcUsername: () => null,
    ensurePlayerState: () => ({
      applied: { skinAssetId: 0, capeAssetId: 0, slot: 'default', version: 1 },
      assets: {},
      mojangSkin: {}
    })
  })
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/api/public/skin-profile/:mcSegment'), true)
})

test('registerSkinRefreshRoutes should mount /plugin/skin/refresh', () => {
  const app = createAppStub()
  registerSkinRefreshRoutes(app, {
    config: {},
    jsonErr: () => ({})
  })
  const paths = new Set(app.routes.map((r) => r.path))
  assert.equal(paths.has('/plugin/skin/refresh'), true)
})
