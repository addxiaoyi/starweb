import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../../src/modules/event-bus/index.js'
import { registerVlaCommandSubscriber } from '../../../../../src/modules/event-bus/subscribers/vlaCommandSubscriber.js'

const POST_COMMANDS = [
  [Events.VLA_COMMAND_KICK_ONLINE, '/api/plugin/authx/admin/kick-online'],
  [Events.VLA_COMMAND_BAN, '/api/plugin/authx/admin/ban'],
  [Events.VLA_COMMAND_DELETE_USER, '/api/plugin/authx/admin/delete-user'],
  [Events.VLA_COMMAND_SKIN_REFRESH, '/api/plugin/authx/admin/skin-refresh'],
  [Events.VLA_COMMAND_LINK_EXTERNAL_USER, '/api/plugin/authx/admin/link-external-user'],
  [Events.VLA_COMMAND_RESET_PASSWORD, '/api/plugin/authx/admin/reset-password'],
  [Events.VLA_COMMAND_BIND_EMAIL, '/api/plugin/authx/admin/bind-email'],
  [Events.VLA_COMMAND_UNBIND_DEVICE, '/api/plugin/authx/admin/unbind-device'],
  [Events.VLA_COMMAND_NOTIFY_BIND_EMAIL, '/api/plugin/authx/admin/bind-email'],
]

describe('vlaCommandSubscriber', () => {
  let bus
  let calls
  let logs
  let logger
  let pluginFetchJson
  let pluginFetchGet

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
    pluginFetchGet = async () => ({ status: 200, json: {} })
    registerVlaCommandSubscriber(bus, { pluginFetchJson, pluginFetchGet, logger })
  })

  it('calls pluginFetchJson for each POST command and replies with ok:true', async () => {
    for (const [event, path] of POST_COMMANDS) {
      const requestId = `req-${event}`
      let reply
      bus.once(`vla:command:reply:${requestId}`, (payload) => {
        reply = payload
      })
      let completed
      bus.once(Events.VLA_COMMAND_COMPLETED, (payload) => {
        completed = payload
      })

      bus.publish(event, { body: { foo: event }, _replyTo: requestId })
      await new Promise((resolve) => setTimeout(resolve, 10))

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

  it('publishes VLA_COMMAND_FAILED and replies ok:false when pluginFetchJson throws', async () => {
    pluginFetchJson = async () => {
      throw new Error('network down')
    }
    const failingBus = new EventBus(logger)
    registerVlaCommandSubscriber(failingBus, { pluginFetchJson, pluginFetchGet, logger })

    const requestId = 'err-reply'
    let reply
    failingBus.once(`vla:command:reply:${requestId}`, (payload) => {
      reply = payload
    })
    let failed
    failingBus.once(Events.VLA_COMMAND_FAILED, (payload) => {
      failed = payload
    })

    failingBus.publish(Events.VLA_COMMAND_BAN, { body: { username: 'x' }, _replyTo: requestId })
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.deepStrictEqual(reply, { ok: false, error: 'network down' })
    assert.deepStrictEqual(failed, {
      command: Events.VLA_COMMAND_BAN,
      error: 'network down'
    })
    assert.strictEqual(logs.errors.length, 1)
    assert.ok(logs.errors[0][0].includes('network down'))
  })

  it('publishes VLA_COMMAND_COMPLETED when there is no _replyTo', async () => {
    let completed
    bus.once(Events.VLA_COMMAND_COMPLETED, (payload) => {
      completed = payload
    })

    bus.publish(Events.VLA_COMMAND_SKIN_REFRESH, { body: { name: 'steve' } })
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.deepStrictEqual(completed, {
      command: Events.VLA_COMMAND_SKIN_REFRESH,
      ok: true,
      result: { status: 200, json: { ok: true } }
    })
  })
})
