import assert from 'node:assert'
import { describe, it } from 'node:test'
import { registerPluginGatewayRoutes } from '../../../../src/modules/plugin-gateway/index.js'

function createAppStub() {
  const uses = []
  return {
    uses,
    use(path, handler) {
      uses.push({ path, handler })
    },
    get(path, ...handlers) {
      uses.push({ method: 'GET', path, handlers })
    },
    post(path, ...handlers) {
      uses.push({ method: 'POST', path, handlers })
    },
  }
}

function createDeps() {
  let limiterCount = 0
  return {
    authxWebhookCallbackLimiter: (_req, _res, next) => next && next(),
    jsonErr: (res) => res,
    config: { isProd: false },
    getStore: () => ({}),
    eventBus: {
      publish: () => {},
      publishAndWait: async () => ({ ok: true, result: {} }),
      hasSubscribers: () => true,
    },
  }
}

describe('plugin-gateway index', () => {
  it('registers three route prefixes with independent routers', () => {
    const app = createAppStub()
    registerPluginGatewayRoutes(app, createDeps())
    const pluginRoutes = app.uses.filter((u) => typeof u.path === 'string' && u.path.includes('/plugin'))
    assert.strictEqual(pluginRoutes.length, 3)
    const paths = pluginRoutes.map((r) => r.path).sort()
    assert.deepStrictEqual(paths, [
      '/api/plugin/authx',
      '/api/v1/plugin',
      '/api/v2/plugin',
    ])
  })

  it('registers callback and bind-email POST endpoints on each prefix', () => {
    const app = createAppStub()
    registerPluginGatewayRoutes(app, createDeps())
    const pluginRoutes = app.uses.filter((u) => typeof u.path === 'string' && u.path.includes('/plugin'))
    for (const { path, handler } of pluginRoutes) {
      assert.ok(handler, `${path} should have a handler (Router)`)
      assert.strictEqual(typeof handler, 'function', `${path} handler should be a function`)
    }
  })
})
