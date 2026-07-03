import assert from 'node:assert'
import { describe, it } from 'node:test'
import { registerAuthxAdminRoutes } from '../../../../src/modules/authxAdmin/routes.js'
import { Events } from '../../../../src/modules/event-bus/events.js'

function createMockRes() {
  return {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code
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
    type(contentType) {
      this.headers['content-type'] = contentType
      return this
    },
  }
}

function createAppStub() {
  const routes = []
  return {
    routes,
    get(path, ...handlers) {
      routes.push({ method: 'GET', path, handlers })
    },
    post(path, ...handlers) {
      routes.push({ method: 'POST', path, handlers })
    },
  }
}

function findRoute(app, method, path) {
  const route = app.routes.find((r) => r.method === method && r.path === path)
  if (!route) {
    throw new Error(`Route not found: ${method} ${path}`)
  }
  return route
}

function getHandler(app, method, path) {
  const route = findRoute(app, method, path)
  return route.handlers.at(-1)
}

function createMockEventBus(reply = { ok: true, result: { status: 200, json: { ok: true, source: 'eventBus' } } }) {
  const calls = []
  return {
    calls,
    async publishAndWait(event, payload) {
      calls.push({ event, payload })
      return reply
    },
  }
}

function createDeps(overrides = {}) {
  return {
    requireDevAdmin: () => true,
    pluginFetchHealth: async () => ({ reachable: true, status: 200 }),
    pluginFetchJson: async () => {
      throw new Error('pluginFetchJson should not be called for POST routes')
    },
    pluginFetchGet: async () => ({ status: 200, json: { ok: true }, text: 'ok' }),
    config: { authxPluginAdapter: 'vla' },
    adminPluginGetLimiter: (_req, _res, next) => next && next(),
    jsonErr: (res, status, message, code, details) => {
      res.status(status).json({ ok: false, message, code, details })
      return res
    },
    jsonOk: (res, payload = {}, status = 200) => {
      res.status(status).json({ ok: true, success: true, ...payload })
      return res
    },
    eventBus: createMockEventBus(),
    ...overrides,
  }
}

describe('authxAdmin routes', () => {
  describe('GET /api/admin/authx/plugin-health', () => {
    it('returns health via direct pluginFetchHealth and does not use eventBus', async () => {
      const app = createAppStub()
      const deps = createDeps()
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      await getHandler(app, 'GET', '/api/admin/authx/plugin-health')({}, res)

      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, {
        ok: true,
        success: true,
        plugin: { reachable: true, status: 200 },
      })
      assert.strictEqual(deps.eventBus.calls.length, 0)
    })
  })

  describe('GET /api/admin/authx/ban-check', () => {
    it('checks ban via pluginFetchGet and does not use eventBus', async () => {
      const app = createAppStub()
      const getCalls = []
      const deps = createDeps({
        pluginFetchGet: async (path, query) => {
          getCalls.push({ path, query })
          return { status: 200, json: { banned: false } }
        },
      })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      await getHandler(app, 'GET', '/api/admin/authx/ban-check')({ query: { name: 'Steve' } }, res)

      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, banned: false })
      assert.deepStrictEqual(getCalls, [{ path: '/v1/ban', query: { name: 'Steve' } }])
      assert.strictEqual(deps.eventBus.calls.length, 0)
    })
  })

  describe('POST /api/admin/authx/reset-password', () => {
    it('publishes VLA_COMMAND_RESET_PASSWORD and returns plugin result', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 201, json: { ok: true, message: 'password reset' } },
      })
      const app = createAppStub()
      const deps = createDeps({ eventBus })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', newPassword: 'secret123' } }
      await getHandler(app, 'POST', '/api/admin/authx/reset-password')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_RESET_PASSWORD)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', newPassword: 'secret123' })
      assert.strictEqual(res.statusCode, 201)
      assert.deepStrictEqual(res.body, { ok: true, success: true, message: 'password reset' })
    })
  })

  describe('POST /api/admin/authx/bind-email', () => {
    it('publishes VLA_COMMAND_BIND_EMAIL with extracted body', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, linked: true } },
      })
      const app = createAppStub()
      const deps = createDeps({ eventBus })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', email: 'steve@example.com' } }
      await getHandler(app, 'POST', '/api/admin/authx/bind-email')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_BIND_EMAIL)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', email: 'steve@example.com' })
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, linked: true })
    })
  })

  describe('POST /api/admin/authx/unbind-device', () => {
    it('publishes VLA_COMMAND_UNBIND_DEVICE with extracted body', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, unbound: true } },
      })
      const app = createAppStub()
      const deps = createDeps({ eventBus })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', device: 'pc-1' } }
      await getHandler(app, 'POST', '/api/admin/authx/unbind-device')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_UNBIND_DEVICE)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', device: 'pc-1' })
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, unbound: true })
    })
  })

  describe('POST /api/admin/authx/kick-online', () => {
    it('publishes VLA_COMMAND_KICK_ONLINE with full request body', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, kicked: 1 } },
      })
      const app = createAppStub()
      const deps = createDeps({ eventBus })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', reason: 'afk' } }
      await getHandler(app, 'POST', '/api/admin/authx/kick-online')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_KICK_ONLINE)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', reason: 'afk' })
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, kicked: 1 })
    })
  })

  describe('POST /api/admin/authx/ban', () => {
    it('publishes VLA_COMMAND_BAN with full request body', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, banned: true } },
      })
      const app = createAppStub()
      const deps = createDeps({ eventBus })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', duration: '1d', reason: 'cheating' } }
      await getHandler(app, 'POST', '/api/admin/authx/ban')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_BAN)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', duration: '1d', reason: 'cheating' })
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, banned: true })
    })
  })

  describe('POST /api/admin/authx/delete-user', () => {
    it('publishes VLA_COMMAND_DELETE_USER with full request body and does not call pluginFetchJson', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, deleted: true } },
      })
      const pluginFetchJsonCalls = []
      const app = createAppStub()
      const deps = createDeps({
        eventBus,
        pluginFetchJson: async (...args) => {
          pluginFetchJsonCalls.push(args)
          throw new Error('pluginFetchJson should not be called for POST routes')
        },
      })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve' } }
      await getHandler(app, 'POST', '/api/admin/authx/delete-user')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_DELETE_USER)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve' })
      assert.strictEqual(pluginFetchJsonCalls.length, 0)
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, deleted: true })
    })
  })

  describe('POST /api/admin/authx/skin-refresh', () => {
    it('publishes VLA_COMMAND_SKIN_REFRESH with full request body and does not call pluginFetchJson', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, refreshed: true } },
      })
      const pluginFetchJsonCalls = []
      const app = createAppStub()
      const deps = createDeps({
        eventBus,
        pluginFetchJson: async (...args) => {
          pluginFetchJsonCalls.push(args)
          throw new Error('pluginFetchJson should not be called for POST routes')
        },
      })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', uuid: 'abc-123' } }
      await getHandler(app, 'POST', '/api/admin/authx/skin-refresh')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_SKIN_REFRESH)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', uuid: 'abc-123' })
      assert.strictEqual(pluginFetchJsonCalls.length, 0)
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, refreshed: true })
    })
  })

  describe('POST /api/admin/authx/link-external-user', () => {
    it('publishes VLA_COMMAND_LINK_EXTERNAL_USER with full request body and does not call pluginFetchJson', async () => {
      const eventBus = createMockEventBus({
        ok: true,
        result: { status: 200, json: { ok: true, linked: true } },
      })
      const pluginFetchJsonCalls = []
      const app = createAppStub()
      const deps = createDeps({
        eventBus,
        pluginFetchJson: async (...args) => {
          pluginFetchJsonCalls.push(args)
          throw new Error('pluginFetchJson should not be called for POST routes')
        },
      })
      registerAuthxAdminRoutes(app, deps)

      const res = createMockRes()
      const req = { body: { username: 'Steve', externalId: 'ext-123' } }
      await getHandler(app, 'POST', '/api/admin/authx/link-external-user')(req, res)

      assert.strictEqual(eventBus.calls.length, 1)
      const call = eventBus.calls[0]
      assert.strictEqual(call.event, Events.VLA_COMMAND_LINK_EXTERNAL_USER)
      assert.deepStrictEqual(call.payload.body, { username: 'Steve', externalId: 'ext-123' })
      assert.strictEqual(pluginFetchJsonCalls.length, 0)
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.body, { ok: true, success: true, linked: true })
    })
  })
})
