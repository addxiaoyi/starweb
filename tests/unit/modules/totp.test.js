import assert from 'node:assert'
import { describe, it } from 'node:test'
import express from 'express'
import { collectExpressPaths } from '../../helpers/collect-express-paths.js'
import { registerTotpRoutes } from '../../../src/modules/totp/routes.js'
import { asyncHandler } from '../../../src/middleware/error.js'

// ── helpers ──────────────────────────────────────────────────

function createMockDeps(storeOverrides = {}) {
  const store = {
    users: [],
    ...storeOverrides,
  }

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
    markUserProfileDirty: () => {},
    appendSecurityAudit: () => {},
    pushUserNotification: () => {},
    generateTotpSecret: () => 'JBSWY3DPEHPK3PXP', // fixed test secret
    totpKeyUri: (label, secret) => `otpauth://totp/StarMC:${label}?secret=${secret}&issuer=StarMC`,
    verifyTotpToken: (secret, code) => code === '123456', // accept '123456' as valid
    makeRecoveryCodes: () => ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF', 'GGGG-HHHH'],
    jsonErr,
    asyncHandler,
    requireUser,
  }
}

function fakeRequest(app, method, path, { body, query, user } = {}) {
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

describe('totp module', () => {
  describe('route registration', () => {
    it('registers TOTP routes', () => {
      const app = express()
      registerTotpRoutes(app, createMockDeps({ users: [{ id: 'u-test' }] }))
      const paths = collectExpressPaths(app)
      assert.strictEqual(paths.has('/api/user/totp/setup'), true)
      assert.strictEqual(paths.has('/api/user/totp/enable'), true)
      assert.strictEqual(paths.has('/api/user/totp/disable'), true)
      assert.strictEqual(paths.has('/api/user/totp/recovery-codes/rotate'), true)
    })
  })

  describe('POST /api/user/totp/setup', () => {
    it('generates a secret for user without TOTP', async () => {
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({
        users: [{ id: 'u-test', email: 'test@example.com', totpEnabled: false }],
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/setup')
      assert.strictEqual(res.status, 200)
      assert.ok(res.body.secret, 'should return a secret')
      assert.ok(res.body.otpauthUrl, 'should return an otpauth URL')
      assert.ok(res.body.otpauthUrl.includes('otpauth://totp/'), 'URL should be otpauth format')
    })

    it('rejects setup when TOTP is already enabled', async () => {
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({
        users: [{ id: 'u-test', email: 'test@example.com', totpEnabled: true, totpSecret: 'EXISTING' }],
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/setup')
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'already_enabled')
    })
  })

  describe('POST /api/user/totp/enable', () => {
    it('enables TOTP with correct verification code', async () => {
      const users = [{ id: 'u-test', email: 'test@example.com', totpPendingSecret: 'JBSWY3DPEHPK3PXP' }]
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({ users }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/enable', {
        body: { code: '123456' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.ok(Array.isArray(res.body.recoveryCodes), 'should return recovery codes')
      assert.ok(res.body.recoveryCodes.length > 0, 'should have at least one recovery code')

      // Verify user state was updated
      assert.strictEqual(users[0].totpEnabled, true)
      assert.strictEqual(users[0].totpPendingSecret, null)
    })

    it('rejects enable with wrong code', async () => {
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({
        users: [{ id: 'u-test', totpPendingSecret: 'JBSWY3DPEHPK3PXP' }],
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/enable', {
        body: { code: '000000' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'bad_code')
    })

    it('rejects enable without pending secret', async () => {
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({
        users: [{ id: 'u-test' }],
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/enable', {
        body: { code: '123456' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'no_pending')
    })
  })

  describe('POST /api/user/totp/disable', () => {
    it('disables TOTP with correct code', async () => {
      const users = [{
        id: 'u-test',
        totpEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP',
        recoveryCodes: ['AAAA-BBBB'],
        recoveryCodesCount: 1,
      }]
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({ users }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/disable', {
        body: { code: '123456' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(users[0].totpEnabled, false)
      assert.strictEqual(users[0].totpSecret, null)
    })

    it('disables TOTP with recovery code when OTP code is wrong', async () => {
      const users = [{
        id: 'u-test',
        totpEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP',
        recoveryCodes: ['AAAA-BBBB', 'CCCC-DDDD'],
        recoveryCodesCount: 2,
      }]
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({ users }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/disable', {
        body: { code: '000000', recoveryCode: 'AAAA-BBBB' },
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.ok, true)
      assert.strictEqual(users[0].totpEnabled, false)
      // Recovery code should be consumed
      assert.ok(!users[0].recoveryCodes.includes('AAAA-BBBB'), 'used recovery code should be removed')
    })

    it('rejects disable with wrong code and no recovery code', async () => {
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({
        users: [{
          id: 'u-test',
          totpEnabled: true,
          totpSecret: 'JBSWY3DPEHPK3PXP',
          recoveryCodes: ['AAAA-BBBB'],
        }],
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/disable', {
        body: { code: '000000' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'bad_code')
    })

    it('rejects disable when TOTP is not enabled', async () => {
      const app = express()
      app.use(express.json())
      registerTotpRoutes(app, createMockDeps({
        users: [{ id: 'u-test', totpEnabled: false }],
      }))

      const res = await fakeRequest(app, 'POST', '/api/user/totp/disable', {
        body: { code: '123456' },
      })
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.body.code, 'not_enabled')
    })
  })
})
