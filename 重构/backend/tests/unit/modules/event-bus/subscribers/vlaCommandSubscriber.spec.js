import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../../src/modules/event-bus/index.js'
import { registerVlaCommandSubscriber } from '../../../../../src/modules/event-bus/subscribers/vlaCommandSubscriber.js'

const SAMPLE_COMMANDS = [
  [Events.VLA_COMMAND_KICK_ONLINE, '/api/plugin/authx/admin/kick-online'],
  [Events.VLA_COMMAND_BAN, '/api/plugin/authx/admin/ban'],
  [Events.VLA_COMMAND_DELETE_USER, '/api/plugin/authx/admin/delete-user'],
  [Events.VLA_COMMAND_SKIN_REFRESH, '/api/plugin/authx/admin/skin-refresh'],
  [Events.VLA_COMMAND_LINK_EXTERNAL_USER, '/api/plugin/authx/admin/link-external-user'],
  [Events.VLA_COMMAND_RESET_PASSWORD, '/api/plugin/authx/admin/reset-password'],
  [Events.VLA_COMMAND_BIND_EMAIL, '/api/plugin/authx/admin/bind-email'],
  [Events.VLA_COMMAND_UNBIND_DEVICE, '/api/plugin/authx/admin/unbind-device'],
  // NOTIFY_BIND_EMAIL 与 BIND_EMAIL 共用同一个 admin 端点
  [Events.VLA_COMMAND_NOTIFY_BIND_EMAIL, '/api/plugin/authx/admin/bind-email'],
]

function waitForEvent(bus, eventName) {
  return new Promise((resolve) => {
    bus.once(eventName, resolve)
  })
}

describe('vlaCommandSubscriber', () => {
  let bus
  let calls
  let logs
  let logger
  let pluginFetchJson

  beforeEach(() => {
    logs = { errors: [] }
    logger = {
      error: (...args) => logs.errors.push(args)
    }
    bus = new EventBus(logger)
    calls = []
    pluginFetchJson = async (path, body) => {
      calls.push({ path, body })
      return { status: 200, json: { ok: true } }
    }
    registerVlaCommandSubscriber(bus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })
  })

  it('calls pluginFetchJson for each sample command and replies with ok:true', async () => {
    for (const [event, path] of SAMPLE_COMMANDS) {
      const requestId = `req-${event}`
      const replyPromise = waitForEvent(bus, `vla:command:reply:${requestId}`)
      const completedPromise = waitForEvent(bus, Events.VLA_COMMAND_COMPLETED)

      bus.publish(event, { body: { foo: event }, _replyTo: requestId })
      const [reply, completed] = await Promise.all([replyPromise, completedPromise])

      assert.strictEqual(calls.length, 1)
      assert.strictEqual(calls[0].path, path)
      assert.deepStrictEqual(calls[0].body, { foo: event })
      assert.deepStrictEqual(reply, {
        ok: true,
        result: { status: 200, json: { ok: true } }
      })
      assert.deepStrictEqual(completed, {
        command: event,
        ok: true,
        result: { status: 200, json: { ok: true } }
      })

      calls.length = 0
    }
  })

  it('passes an empty object when body is undefined', async () => {
    const requestId = 'no-body-reply'
    const replyPromise = waitForEvent(bus, `vla:command:reply:${requestId}`)

    bus.publish(Events.VLA_COMMAND_SKIN_REFRESH, { _replyTo: requestId })
    await replyPromise

    assert.strictEqual(calls.length, 1)
    assert.deepStrictEqual(calls[0].body, {})
  })

  it('publishes VLA_COMMAND_FAILED and replies ok:false with result when pluginFetchJson returns >=400', async () => {
    pluginFetchJson = async () => ({ status: 400, json: { message: 'bad request' } })
    const failingBus = new EventBus(logger)
    registerVlaCommandSubscriber(failingBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'err-reply'
    const replyPromise = waitForEvent(failingBus, `vla:command:reply:${requestId}`)
    const failedPromise = waitForEvent(failingBus, Events.VLA_COMMAND_FAILED)

    failingBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, failed] = await Promise.all([replyPromise, failedPromise])

    assert.deepStrictEqual(reply, {
      ok: false,
      result: { status: 400, json: { message: 'bad request' } },
      error: 'bad request'
    })
    assert.deepStrictEqual(failed, {
      command: Events.VLA_COMMAND_BAN,
      ok: false,
      result: { status: 400, json: { message: 'bad request' } },
      error: 'bad request'
    })
    assert.strictEqual(logs.errors.length, 1)
    assert.ok(logs.errors[0][0].includes('bad request'))
  })

  it('publishes VLA_COMMAND_FAILED and replies ok:false when pluginFetchJson returns 200 with json.ok:false', async () => {
    pluginFetchJson = async () => ({ status: 200, json: { ok: false, error: 'invalid' } })
    const failingBus = new EventBus(logger)
    registerVlaCommandSubscriber(failingBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'ok-false-reply'
    const replyPromise = waitForEvent(failingBus, `vla:command:reply:${requestId}`)
    const failedPromise = waitForEvent(failingBus, Events.VLA_COMMAND_FAILED)

    failingBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, failed] = await Promise.all([replyPromise, failedPromise])

    const result = { status: 200, json: { ok: false, error: 'invalid' } }
    assert.deepStrictEqual(reply, {
      ok: false,
      result,
      error: 'invalid'
    })
    assert.deepStrictEqual(failed, {
      command: Events.VLA_COMMAND_BAN,
      ok: false,
      result,
      error: 'invalid'
    })
    assert.strictEqual(logs.errors.length, 1)
    assert.ok(logs.errors[0][0].includes('invalid'))
  })

  it('replies ok:true when pluginFetchJson returns 200 with json.ok: undefined (original compatibility)', async () => {
    pluginFetchJson = async () => ({ status: 200, json: { ok: undefined, data: 'x' } })
    const okBus = new EventBus(logger)
    registerVlaCommandSubscriber(okBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'ok-undefined-reply'
    const replyPromise = waitForEvent(okBus, `vla:command:reply:${requestId}`)
    const completedPromise = waitForEvent(okBus, Events.VLA_COMMAND_COMPLETED)

    okBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, completed] = await Promise.all([replyPromise, completedPromise])

    const result = { status: 200, json: { ok: undefined, data: 'x' } }
    assert.deepStrictEqual(reply, { ok: true, result })
    assert.deepStrictEqual(completed, { command: Events.VLA_COMMAND_BAN, ok: true, result })
  })

  it('replies ok:true when pluginFetchJson returns 200 with json.ok: null', async () => {
    pluginFetchJson = async () => ({ status: 200, json: { ok: null } })
    const okBus = new EventBus(logger)
    registerVlaCommandSubscriber(okBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'ok-null-reply'
    const replyPromise = waitForEvent(okBus, `vla:command:reply:${requestId}`)
    const completedPromise = waitForEvent(okBus, Events.VLA_COMMAND_COMPLETED)

    okBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, completed] = await Promise.all([replyPromise, completedPromise])

    const result = { status: 200, json: { ok: null } }
    assert.deepStrictEqual(reply, { ok: true, result })
    assert.deepStrictEqual(completed, { command: Events.VLA_COMMAND_BAN, ok: true, result })
  })

  it('replies ok:true when pluginFetchJson returns 200 with a truthy non-boolean json.ok', async () => {
    pluginFetchJson = async () => ({ status: 200, json: { ok: 'yes' } })
    const okBus = new EventBus(logger)
    registerVlaCommandSubscriber(okBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'ok-yes-reply'
    const replyPromise = waitForEvent(okBus, `vla:command:reply:${requestId}`)
    const completedPromise = waitForEvent(okBus, Events.VLA_COMMAND_COMPLETED)

    okBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, completed] = await Promise.all([replyPromise, completedPromise])

    const result = { status: 200, json: { ok: 'yes' } }
    assert.deepStrictEqual(reply, { ok: true, result })
    assert.deepStrictEqual(completed, { command: Events.VLA_COMMAND_BAN, ok: true, result })
  })

  it('replies ok:true when pluginFetchJson returns 200 without json', async () => {
    pluginFetchJson = async () => ({ status: 200 })
    const okBus = new EventBus(logger)
    registerVlaCommandSubscriber(okBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'no-json-reply'
    const replyPromise = waitForEvent(okBus, `vla:command:reply:${requestId}`)
    const completedPromise = waitForEvent(okBus, Events.VLA_COMMAND_COMPLETED)

    okBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, completed] = await Promise.all([replyPromise, completedPromise])

    const result = { status: 200 }
    assert.deepStrictEqual(reply, { ok: true, result })
    assert.deepStrictEqual(completed, { command: Events.VLA_COMMAND_BAN, ok: true, result })
  })

  it('publishes VLA_COMMAND_FAILED and replies ok:false when pluginFetchJson returns a non-200 2xx status', async () => {
    pluginFetchJson = async () => ({ status: 204 })
    const failingBus = new EventBus(logger)
    registerVlaCommandSubscriber(failingBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = '204-reply'
    const replyPromise = waitForEvent(failingBus, `vla:command:reply:${requestId}`)
    const failedPromise = waitForEvent(failingBus, Events.VLA_COMMAND_FAILED)

    failingBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, failed] = await Promise.all([replyPromise, failedPromise])

    const result = { status: 204 }
    assert.deepStrictEqual(reply, {
      ok: false,
      result,
      error: 'VLA admin returned 204'
    })
    assert.deepStrictEqual(failed, {
      command: Events.VLA_COMMAND_BAN,
      ok: false,
      result,
      error: 'VLA admin returned 204'
    })
    assert.strictEqual(logs.errors.length, 1)
    assert.ok(logs.errors[0][0].includes('204'))
  })

  it('publishes VLA_COMMAND_FAILED and replies ok:false when pluginFetchJson throws', async () => {
    pluginFetchJson = async () => {
      throw new Error('network down')
    }
    const failingBus = new EventBus(logger)
    registerVlaCommandSubscriber(failingBus, { pluginFetchJson, config: { authxPluginAdapter: 'vla' }, logger })

    const requestId = 'throw-reply'
    const replyPromise = waitForEvent(failingBus, `vla:command:reply:${requestId}`)
    const failedPromise = waitForEvent(failingBus, Events.VLA_COMMAND_FAILED)

    failingBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, failed] = await Promise.all([replyPromise, failedPromise])

    assert.deepStrictEqual(reply, { ok: false, error: 'network down' })
    assert.deepStrictEqual(failed, {
      command: Events.VLA_COMMAND_BAN,
      ok: false,
      error: 'network down'
    })
    assert.strictEqual(logs.errors.length, 1)
    assert.ok(logs.errors[0][0].includes('network down'))
  })

  it('publishes VLA_COMMAND_COMPLETED when there is no _replyTo', async () => {
    const completedPromise = waitForEvent(bus, Events.VLA_COMMAND_COMPLETED)

    bus.publish(Events.VLA_COMMAND_SKIN_REFRESH, { body: { name: 'steve' } })
    const completed = await completedPromise

    assert.deepStrictEqual(completed, {
      command: Events.VLA_COMMAND_SKIN_REFRESH,
      ok: true,
      result: { status: 200, json: { ok: true } }
    })
  })

  it('replies skipped and publishes VLA_COMMAND_COMPLETED when adapter is not vla', async () => {
    const nonVlaBus = new EventBus(logger)
    registerVlaCommandSubscriber(nonVlaBus, {
      pluginFetchJson,
      config: { authxPluginAdapter: 'none' },
      logger,
    })

    const requestId = 'skip-reply'
    const replyPromise = waitForEvent(nonVlaBus, `vla:command:reply:${requestId}`)
    const completedPromise = waitForEvent(nonVlaBus, Events.VLA_COMMAND_COMPLETED)

    nonVlaBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    const [reply, completed] = await Promise.all([replyPromise, completedPromise])

    assert.deepStrictEqual(reply, {
      ok: true,
      result: { ok: false, skipped: true, message: '当前未使用 VLA 适配器，跳过命令' },
    })
    assert.deepStrictEqual(completed, {
      command: Events.VLA_COMMAND_BAN,
      ok: true,
      result: { ok: false, skipped: true, message: '当前未使用 VLA 适配器，跳过命令' },
    })
    assert.strictEqual(calls.length, 0)
  })
})
