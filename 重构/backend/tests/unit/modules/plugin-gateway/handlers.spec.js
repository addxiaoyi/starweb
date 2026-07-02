import assert from 'node:assert'
import crypto from 'node:crypto'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { config } from '../../../../src/config.js'
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

function createDeps(overrides = {}) {
  return {
    config: { isProd: config.isProd },
    jsonErr: createMockJsonErr(),
    getStore: () => ({ users: [], authxEvents: [] }),
    callbackDeps: {
      markKvDirty: () => {},
      scheduleSave: () => {},
      markUserProfileDirty: () => {},
      failMcVerifySession: () => ({ ok: false, code: 'no_session' }),
      completeMcVerifySession: () => ({ ok: false, code: 'no_session' }),
      appendLoginEvent: () => ({
        userId: 'user-1',
        username: 'Steve',
        uuid: 'uuid',
        method: 'microsoft',
        ip: '1.1.1.1',
        location: 'CN',
        asn: 'ASN',
        riskScore: 0,
        riskLevel: 'low',
        deviceProfile: 'trusted_device',
        externalUserId: null,
      }),
      appendSecurityAudit: () => {},
      appendSecurityAlert: () => {},
      pushUserNotification: () => {},
      findUserByExternalUserId: () => null,
      computeLoginRisk: () => ({ riskScore: 0, riskLevel: 'low', deviceProfile: 'trusted_device' }),
      ensureSecurityCenter: (store) => store.securityCenter,
    },
    bindEmailDeps: {
      isValidEmailAddress: (email) => /^[^\s@]+@[^\s@]+$/.test(email),
      findUserByLinkedMcUsername: () => null,
      ensureSiteUserForPluginEmail: async (store, email) => ({
        localUser: { id: 'user-1', email, linkedMcUsername: null, linkedMcUuid: null },
        created: true,
      }),
      vlaLinkExternalUser: async () => ({ ok: true, skipped: false }),
      vlaAdminBindEmail: async () => ({ ok: true, skipped: false }),
      markUserProfileDirty: () => {},
      appendSecurityAudit: () => {},
      pushUserNotification: () => {},
      scheduleSave: () => {},
    },
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

    it('returns record id on success', async () => {
      const handlers = createPluginGatewayHandlers(createDeps())
      const res = createMockRes()
      const body = '{"event":"login_success","username":"Steve"}'
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.callback(
        {
          headers: { 'x-vla-signature': signature },
          body,
        },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.ok, true)
      assert.ok(res.jsonBody.id)
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

    it('returns user binding result on success', async () => {
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
        { headers: { 'x-vla-signature': signature }, body },
        res
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.ok, true)
      assert.strictEqual(res.jsonBody.created, true)
      assert.strictEqual(res.jsonBody.userId, 'user-1')
      assert.strictEqual(res.jsonBody.email, 'test@example.com')
      assert.strictEqual(res.jsonBody.linkedMcUsername, 'Steve')
      assert.strictEqual(res.jsonBody.linkedMcUuid, 'uuid-1')
      assert.strictEqual(res.jsonBody.externalUserId, 'user-1')
    })

    it('maps PluginBindEmailError to the configured status and message', async () => {
      const deps = createDeps({
        bindEmailDeps: {
          ...createDeps().bindEmailDeps,
          isValidEmailAddress: () => false,
        },
      })
      const handlers = createPluginGatewayHandlers(deps)
      const res = createMockRes()
      const body = JSON.stringify({ email: 'bad', username: 'Steve' })
      const signature = signVlaPayload(body, 'vla-webhook-secret')
      await handlers.bindEmail(
        { headers: { 'x-vla-signature': signature }, body },
        res
      )
      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.code, 'invalid_email')
      assert.strictEqual(res.jsonBody.message, '邮箱格式不正确')
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
  })
})
