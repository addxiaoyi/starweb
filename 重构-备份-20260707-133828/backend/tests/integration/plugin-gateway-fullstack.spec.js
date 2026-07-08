import assert from 'node:assert'
import { describe, it, before, after } from 'node:test'
import crypto from 'node:crypto'
import express from 'express'
import { EventBus, Events } from '../../src/modules/event-bus/index.js'
import { registerPluginGatewayRoutes } from '../../src/modules/plugin-gateway/index.js'

function signVlaPayload(secret, rawPayload) {
  return crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex')
}

function createDeps() {
  const bus = new EventBus()
  const received = []
  bus.subscribe(Events.PLUGIN_CALLBACK_RECEIVED, (payload) => {
    received.push(payload)
  })
  return {
    bus,
    received,
    authxWebhookCallbackLimiter: (_req, _res, next) => next?.(),
    jsonErr: (res, status, message, code) => {
      res.status(status).json({ ok: false, message, code })
      return res
    },
    config: {
      isProd: false,
      authxVlaWebhookSecrets: ['test-webhook-secret'],
      authxCallbackSecret: '',
    },
    getStore: () => ({ users: [] }),
    eventBus: bus,
  }
}

describe('plugin-gateway full-stack integration', () => {
  let app
  let deps
  let server

  before(() => {
    deps = createDeps()
    app = express()
    app.use(express.raw({ type: 'application/json', limit: '64kb' }))
    registerPluginGatewayRoutes(app, deps)
    server = app.listen(0)
  })

  after(() => {
    server?.close()
  })

  it('receives a valid VLA-signed callback through HTTP POST /api/v1/plugin/callback', async () => {
    const payload = JSON.stringify({ event: 'login_success', username: 'Steve' })
    const sig = signVlaPayload('test-webhook-secret', payload)

    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/plugin/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VLA-Signature': sig,
      },
      body: payload,
    })

    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.strictEqual(body.ok, true)

    assert.strictEqual(deps.received.length, 1)
    const evt = deps.received[0]
    assert.strictEqual(evt.body.event, 'login_success')
    assert.strictEqual(evt.body.username, 'Steve')
    assert.ok(evt.meta.vlaInbound)
    assert.ok(typeof evt.meta.receivedAt === 'string')
  })

  it('rejects callback with invalid VLA signature', async () => {
    const payload = JSON.stringify({ event: 'test' })
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/plugin/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VLA-Signature': 'invalid',
      },
      body: payload,
    })

    assert.strictEqual(res.status, 401)
    const body = await res.json()
    assert.strictEqual(body.code, 'unauthorized')
  })

  it('rejects callback with malformed JSON', async () => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/plugin/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VLA-Signature': signVlaPayload('test-webhook-secret', 'not-json'),
      },
      body: 'not-json',
    })

    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.code, 'validation_error')
  })

  it('delivers callback on /api/v2/plugin/callback and /api/plugin/authx/callback', async () => {
    for (const path of ['/api/v2/plugin/callback', '/api/plugin/authx/callback']) {
      const payload = JSON.stringify({ event: 'verify_premium', username: 'Alex' })
      const sig = signVlaPayload('test-webhook-secret', payload)

      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VLA-Signature': sig,
        },
        body: payload,
      })

      assert.strictEqual(res.status, 200)
    }
  })

  it('registers three separate prefixes', async () => {
    for (const path of ['/api/v1/plugin/callback', '/api/v2/plugin/callback', '/api/plugin/authx/callback']) {
      const payload = JSON.stringify({ event: 'login_success', username: 'test' })
      const sig = signVlaPayload('test-webhook-secret', payload)
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VLA-Signature': sig },
        body: payload,
      })
      assert.strictEqual(res.status, 200)
    }
  })
})
