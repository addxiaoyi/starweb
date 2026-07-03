import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../src/modules/event-bus/index.js'
import { registerSkinRefreshRoutes } from '../../../../src/modules/plugin-gateway/skinRefresh.js'

function createRes() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

function createReq(overrides = {}) {
  return {
    headers: {},
    body: {},
    ...overrides,
  }
}

describe('skinRefresh route', () => {
  let app
  let eventBus
  let publishedEvents

  beforeEach(() => {
    app = {
      routes: [],
      post(path, ...handlers) {
        this.routes.push({ method: 'POST', path, handler: handlers[handlers.length - 1] })
      },
    }
    eventBus = new EventBus({ error: () => {} })
    publishedEvents = []
    const originalPublish = eventBus.publish.bind(eventBus)
    eventBus.publish = (event, payload) => {
      publishedEvents.push({ event, payload })
      return originalPublish(event, payload)
    }
  })

  it('returns ok:true, queued:true and publishes PLUGIN_SKIN_REFRESH_RECEIVED', async () => {
    registerSkinRefreshRoutes(app, {
      config: { pluginRefreshSecret: 'secret' },
      jsonErr: () => {},
      eventBus,
    })

    const req = createReq({
      headers: { 'x-skin-bridge-secret': 'secret' },
      body: { username: 'Steve' },
    })
    const res = createRes()

    await app.routes[0].handler(req, res)

    assert.deepStrictEqual(res.body, { ok: true, queued: true })
    assert.strictEqual(publishedEvents.length, 1)
    assert.strictEqual(publishedEvents[0].event, Events.PLUGIN_SKIN_REFRESH_RECEIVED)
    assert.deepStrictEqual(publishedEvents[0].payload, { body: { username: 'Steve' } })
  })

  it('rejects unauthorized requests without publishing', async () => {
    registerSkinRefreshRoutes(app, {
      config: { pluginRefreshSecret: 'secret' },
      jsonErr: (res, code, message, errCode) => {
        res.status(code).json({ error: message, code: errCode })
      },
      eventBus,
    })

    const req = createReq({
      headers: { 'x-skin-bridge-secret': 'wrong' },
      body: { username: 'Steve' },
    })
    const res = createRes()

    await app.routes[0].handler(req, res)

    assert.strictEqual(res.statusCode, 401)
    assert.deepStrictEqual(res.body, { error: '未授权', code: 'unauthorized' })
    assert.strictEqual(publishedEvents.length, 0)
  })

  it('rejects misconfigured production requests without publishing', async () => {
    registerSkinRefreshRoutes(app, {
      config: { isProd: true, pluginRefreshSecret: '' },
      jsonErr: (res, code, message, errCode) => {
        res.status(code).json({ error: message, code: errCode })
      },
      eventBus,
    })

    const req = createReq({ body: { username: 'Steve' } })
    const res = createRes()

    await app.routes[0].handler(req, res)

    assert.strictEqual(res.statusCode, 503)
    assert.deepStrictEqual(res.body, { error: '生产环境必须配置 PLUGIN_REFRESH_SECRET', code: 'misconfigured' })
    assert.strictEqual(publishedEvents.length, 0)
  })

  it('defaults body to empty object when req.body is missing', async () => {
    registerSkinRefreshRoutes(app, {
      config: {},
      jsonErr: () => {},
      eventBus,
    })

    const req = createReq({ body: undefined })
    const res = createRes()

    await app.routes[0].handler(req, res)

    assert.deepStrictEqual(res.body, { ok: true, queued: true })
    assert.strictEqual(publishedEvents.length, 1)
    assert.deepStrictEqual(publishedEvents[0].payload, { body: {} })
  })
})
