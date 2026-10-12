import assert from 'node:assert'
import { test } from 'node:test'
import express from 'express'
import crypto from 'node:crypto'
import { collectExpressPaths } from './helpers/collect-express-paths.js'
import { registerSkinRoutes, registerPublicSkinProfileRoutes } from '../src/modules/skin/routes.js'
import { registerSecurityRoutes } from '../src/modules/security/routes.js'
import { registerAuthxAdminRoutes } from '../src/modules/authxAdmin/routes.js'
import { registerPluginGatewayRoutes } from '../src/modules/plugin-gateway/index.js'
import { registerSkinRefreshRoutes } from '../src/modules/plugin-gateway/skinRefresh.js'
import { registerCapeRoutes } from '../src/modules/cape/routes.js'
import { registerQqRoutes } from '../src/modules/qq/routes.js'
import { registerMapHealthRoutes } from '../src/modules/ops/mapHealth.js'
import { asyncHandler } from '../src/middleware/error.js'

function createMockDeps() {
  const store = {
    catalog: [],
    submissions: [],
    users: [],
    securityCenter: { alerts: [], auditLogs: [], loginEvents: [] },
    library: { version: 1 },
  }

  const jsonOk = (res, body = {}) => res.json({ ok: true, success: true, ...body })
  const jsonErr = (res, status, message, code = 'error') =>
    res.status(status).json({ ok: false, success: false, message, code, error: code })
  const jsonPage = (res, items, total, pg, extra = {}) =>
    res.json({ ok: true, success: true, items, total, page: pg.page, pageSize: pg.pageSize, ...extra })

  const pass = (_req, _res, next) => next()
  const requireUser = (req, _res, next) => {
    req.user = { id: 'u-test', email: 'test@example.com', roles: ['user'] }
    next()
  }
  const requireDevAdmin = () => true
  const requireReviewerOrAdmin = pass
  const requireVerifiedEmail = pass
  const requireAdmin = pass
  const adminPluginGetLimiter = pass

  return {
    config: {
      authxPluginAdapter: 'vla',
      reviewEntryEnabled: true,
      mojangSkinSyncEnabled: true,
      skinBridgePublicProfile: true,
    },
    store,
    getStore: () => store,
    scheduleSave: () => {},
    markSubmissionDirty: () => {},
    markKvDirty: () => {},
    ensureSecurityCenter: (s) => {
      if (!s.securityCenter) s.securityCenter = { alerts: [], auditLogs: [], loginEvents: [] }
      return s.securityCenter
    },
    jsonOk,
    jsonErr,
    jsonPage,
    asyncHandler,
    requireUser,
    requireDevAdmin,
    requireReviewerOrAdmin,
    requireVerifiedEmail,
    requireAdmin,
    adminPluginGetLimiter,
    crypto,
    pluginFetchHealth: async () => ({ reachable: true, status: 200, parsed: { ok: true } }),
    pluginFetchJson: async () => ({ status: 200, json: { ok: true } }),
    isPluginWebhookAuthConfigured: () => true,
    circuitBreakerStatus: { isOpen: false },
    pluginFetchCounters: {},
    authxWebhookCallbackLimiter: pass,
    eventBus: { publish: () => {} },
    sessionCore: {},
    handleAuthxWebhook: () => ({ status: 200, json: { ok: true } }),
    handleBindEmail: () => ({ status: 200, json: { ok: true } }),
  }
}

test('skin module registers expected public and review routes', () => {
  const app = express()
  registerSkinRoutes(app, createMockDeps())
  const paths = collectExpressPaths(app)

  assert.equal(paths.has('/api/skins/catalog'), true)
  assert.equal(paths.has('/api/skins/library/sync-status'), true)
  assert.equal(paths.has('/api/skins/library/stream'), true)
  assert.equal(paths.has('/api/skins/player/submissions'), true)
  assert.equal(paths.has('/api/skins/submissions/stats'), true)
  assert.equal(paths.has('/api/skins/submissions/batch/:action(approve|reject)'), true)
  assert.equal(paths.has('/api/skin/apply'), true)
})

test('public skin profile route is registered separately', () => {
  const app = express()
  const deps = createMockDeps()
  deps.findUserByLinkedMcUsername = () => null
  registerPublicSkinProfileRoutes(app, deps)
  const paths = collectExpressPaths(app)
  assert.equal(paths.has('/api/public/skin-profile/:mcSegment'), true)
})

test('security module registers center and alert routes', () => {
  const app = express()
  registerSecurityRoutes(app, createMockDeps())
  const paths = collectExpressPaths(app)

  assert.equal(paths.has('/api/security/center'), true)
  assert.equal(paths.has('/api/security/alerts/read-all'), true)
  assert.equal(paths.has('/api/security/alerts/:id/read'), true)
  assert.equal(paths.has('/api/user/security-center'), true)
  assert.equal(paths.has('/api/security/analytics/summary'), true)
  assert.equal(paths.has('/api/security/analytics/trend'), true)
  assert.equal(paths.has('/api/security/analytics/top-sources'), true)
})

test('authx admin module registers plugin ops routes', () => {
  const app = express()
  registerAuthxAdminRoutes(app, createMockDeps())
  const paths = collectExpressPaths(app)

  assert.equal(paths.has('/api/admin/authx/plugin-health'), true)
  assert.equal(paths.has('/api/admin/authx/bridge-status'), true)
  assert.equal(paths.has('/api/admin/authx/circuit-breaker'), true)
  assert.equal(paths.has('/api/admin/authx/circuit-breaker/toggle'), true)
})

test('plugin gateway registers callback and refresh routes', () => {
  const app = express()
  const deps = createMockDeps()
  registerPluginGatewayRoutes(app, deps)
  registerSkinRefreshRoutes(app, deps)
  const paths = collectExpressPaths(app)

  assert.equal(paths.has('/api/v1/plugin/callback'), true)
  assert.equal(paths.has('/api/v1/plugin/bind-email'), true)
  assert.equal(paths.has('/api/plugin/authx/callback'), true)
  assert.equal(paths.has('/plugin/skin/refresh'), true)
})

test('auxiliary modules register placeholder routes', () => {
  const app = express()
  const deps = createMockDeps()
  registerCapeRoutes(app, deps)
  registerQqRoutes(app, deps)
  registerMapHealthRoutes(app, deps)
  const paths = collectExpressPaths(app)

  assert.equal(paths.has('/api/cape/search'), true)
  assert.equal(paths.has('/api/qq/guild-info'), true)
  assert.equal(paths.has('/api/ops/map-health'), true)
})
