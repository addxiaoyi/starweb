import assert from 'node:assert'
import crypto from 'node:crypto'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { config } from '../../../../src/config.js'
import { Events } from '../../../../src/modules/event-bus/events.js'
import { createPluginGatewayHandlers } from '../../../../src/modules/plugin-gateway/handlers.js'

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonBody: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    json(body) {
      this.jsonBody = body
      return this
    },
  }
  return res
}

function createMockJsonErr() {
  return (res, status, message, code, details) => {
    res.statusCode = status
    res.jsonBody = { ok: false, message, code, details }
    return res
  }
}

function signVlaPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

function signAuthxPayload(payload, secret) {
  const tsSec = String(Math.floor(Date.now() / 1000))
  const data = `${tsSec}.${payload}`
  const signature = crypto.createHmac('sha256', secret).update(data, 'utf8').digest('base64url')
  return { tsSec, signature }
}

function createMockEventBus() {
  const published = []
  return {
    published,
    publish: (event, payload) => {
      published.push({ event, payload })
    },
  }
}

function createDeps(overrides = {}) {
  const eventBus = createMockEventBus()
  return {
    config: {
      isProd: config.isProd,
      authxVlaWebhookSecrets: config.authxVlaWebhookSecrets,
      authxCallbackSecret: config.authxCallbackSecret,
    },
    jsonErr: createMockJsonErr(),
    getStore: () => ({ users: [], authxEvents: [] }),
    eventBus,
    ...overrides,
  }
}

describe('plugin-gateway handlers', () => {
  let originalVlaSecrets
  let originalAuthxSecret
  let originalIsProd

  beforeEach(() => {
    originalVlaSecrets = config.authxVlaWebhookSecrets.slice()
    originalAuthxSecret = config.authxCallbackSecret
    originalIsProd = config.isProd
    config.authxVlaWebhookSecrets = ['vla-webhook-secret']
    config.authxCallbackSecret = ''
  })

  afterEach(() => {
    config.authxVlaWebhookSecrets = originalVlaSecrets
    config.authxCallbackSecret = originalAuthxSecret
    config.isProd = originalIsProd
  })

  describe('callback', () => {
    it('returns 503 when webhook auth is not configured in production', async () => {
      config.isProd = true
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = ''
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      await handlers.callback({ headers: {}, body: '' }, res)
      assert.strictEqual(res.statusCode, 503)
      assert.strictEqual(res.jsonBody.code, 'misconfigured')
    })

    it('returns 401 when signature is invalid', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      await handlers.callback({ headers: { 'x-vla-signature': 'bad' }, body: '{}' }, res)
      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.jsonBody.code, 'unauthorized')
    })

    it('returns 400 when payload is invalid JSON', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = '{not json}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        { headers: { 'x-vla-signature': signature }, body },
        res
      )
      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.code, 'validation_error')
    })

    it('returns 400 when event is missing', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = '{}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        { headers: { 'x-vla-signature': signature }, body },
        res
      )
      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.code, 'validation_error')
    })

    it('publishes PLUGIN_CALLBACK_RECEIVED and returns ok on success', async () => {
      const deps = createDeps()
      const handlers = createPluginGatewayHandlers(deps)
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        {
          headers: { 'x-vla-signature': signature, 'x-forwarded-for': '10.0.0.1' },
          body,
          socket: { remoteAddress: '127.0.0.1' },
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody, { ok: true })
      assert.strictEqual(deps.eventBus.published.length, 1)
      const published = deps.eventBus.published[0]
      assert.strictEqual(published.event, Events.PLUGIN_CALLBACK_RECEIVED)
      assert.deepStrictEqual(published.payload.body, { event: 'login_success', username: 'Steve' })
      assert.deepStrictEqual(published.payload.store, deps.getStore())
      assert.strictEqual(published.payload.meta.vlaInbound, true)
      assert.strictEqual(published.payload.meta.remoteAddress, '10.0.0.1')
      assert.ok(typeof published.payload.meta.receivedAt === 'string')
    })

    it('publishes PLUGIN_CALLBACK_RECEIVED with vlaInbound false for authx adapter', async () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = 'authx-callback-secret'
      const deps = createDeps()
      const handlers = createPluginGatewayHandlers(deps)
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const { tsSec, signature } = signAuthxPayload(body, 'authx-callback-secret')
      await handlers.callback(
        {
          headers: {
            'x-authx-signature': signature,
            'x-authx-timestamp': tsSec,
          },
          body,
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody, { ok: true })
      assert.strictEqual(deps.eventBus.published.length, 1)
      const published = deps.eventBus.published[0]
      assert.strictEqual(published.event, Events.PLUGIN_CALLBACK_RECEIVED)
      assert.strictEqual(published.payload.meta.vlaInbound, false)
    })

    it('falls back remoteAddress to req.socket.remoteAddress', async () => {
      const deps = createDeps()
      const handlers = createPluginGatewayHandlers(deps)
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        {
          headers: { 'x-vla-signature': signature },
          body,
          socket: { remoteAddress: '192.168.1.1' },
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(deps.eventBus.published[0].payload.meta.remoteAddress, '192.168.1.1')
    })

    it('accepts a Buffer body', async () => {
      const deps = createDeps()
      const handlers = createPluginGatewayHandlers(deps)
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        {
          headers: { 'x-vla-signature': signature },
          body: Buffer.from(body, 'utf8'),
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody, { ok: true })
      assert.deepStrictEqual(deps.eventBus.published[0].payload.body, { event: 'login_success', username: 'Steve' })
    })

    it('sets Sunset and Deprecation headers for legacy /api/plugin/authx/callback success', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        {
          baseUrl: '/api/plugin/authx',
          headers: { 'x-vla-signature': signature },
          body,
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.headers['Sunset'], 'Thu, 31 Dec 2026 00:00:00 GMT')
      assert.strictEqual(res.headers['Deprecation'], 'true')
    })

    it('sets Sunset and Deprecation headers for legacy /api/plugin/authx/callback errors', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      await handlers.callback(
        { baseUrl: '/api/plugin/authx', headers: { 'x-vla-signature': 'bad' }, body: '{}' },
        res
      )
      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.headers['Sunset'], 'Thu, 31 Dec 2026 00:00:00 GMT')
      assert.strictEqual(res.headers['Deprecation'], 'true')
    })

    it('does not set Sunset or Deprecation headers for /api/v1/plugin/callback success', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        {
          baseUrl: '/api/v1/plugin',
          headers: { 'x-vla-signature': signature },
          body,
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.headers['Sunset'], undefined)
      assert.strictEqual(res.headers['Deprecation'], undefined)
    })
  })

  describe('bindEmail', () => {
    it('returns 503 when webhook auth is not configured in production', async () => {
      config.isProd = true
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = ''
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      await handlers.bindEmail({ headers: {}, body: '' }, res)
      assert.strictEqual(res.statusCode, 503)
      assert.strictEqual(res.jsonBody.code, 'misconfigured')
    })

    it('returns 401 when signature is invalid', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      await handlers.bindEmail({ headers: { 'x-vla-signature': 'bad' }, body: '{}' }, res)
      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.jsonBody.code, 'unauthorized')
    })

    it('returns 400 when payload is invalid JSON', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = '{not json}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.bindEmail(
        { headers: { 'x-vla-signature': signature }, body },
        res
      )
      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.code, 'validation_error')
    })

    it('publishes PLUGIN_BIND_EMAIL_RECEIVED and returns queued on success', async () => {
      const deps = createDeps()
      const handlers = createPluginGatewayHandlers(deps)
      const res = createMockRes()
      const body = JSON.stringify({
        email: 'test@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
      })
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.bindEmail(
        { headers: { 'x-vla-signature': signature }, body },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody, { ok: true, queued: true })
      assert.strictEqual(deps.eventBus.published.length, 1)
      const published = deps.eventBus.published[0]
      assert.strictEqual(published.event, Events.PLUGIN_BIND_EMAIL_RECEIVED)
      assert.deepStrictEqual(published.payload.body, {
        email: 'test@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
      })
      assert.deepStrictEqual(published.payload.store, deps.getStore())
      assert.ok(typeof published.payload.meta.receivedAt === 'string')
    })

    it('sets Sunset and Deprecation headers for legacy /api/plugin/authx/bind-email success', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = JSON.stringify({
        email: 'test@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
      })
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.bindEmail(
        {
          baseUrl: '/api/plugin/authx',
          headers: { 'x-vla-signature': signature },
          body,
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.headers['Sunset'], 'Thu, 31 Dec 2026 00:00:00 GMT')
      assert.strictEqual(res.headers['Deprecation'], 'true')
    })

    it('sets Sunset and Deprecation headers for legacy /api/plugin/authx/bind-email errors', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      await handlers.bindEmail(
        { baseUrl: '/api/plugin/authx', headers: { 'x-vla-signature': 'bad' }, body: '{}' },
        res
      )
      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.headers['Sunset'], 'Thu, 31 Dec 2026 00:00:00 GMT')
      assert.strictEqual(res.headers['Deprecation'], 'true')
    })

    it('does not set Sunset or Deprecation headers for /api/v1/plugin/bind-email', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = JSON.stringify({
        email: 'test@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
      })
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.bindEmail(
        {
          baseUrl: '/api/v1/plugin',
          headers: { 'x-vla-signature': signature },
          body,
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.headers['Sunset'], undefined)
      assert.strictEqual(res.headers['Deprecation'], undefined)
    })
  })
})
