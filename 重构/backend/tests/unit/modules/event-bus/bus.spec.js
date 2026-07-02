import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../src/modules/event-bus/index.js'

describe('event-bus', () => {
  let bus
  let logs

  beforeEach(() => {
    logs = { errors: [] }
    const logger = {
      error: (...args) => logs.errors.push(args)
    }
    bus = new EventBus(logger)
  })

  describe('subscribe and publish', () => {
    it('delivers events to subscribers', () => {
      const received = []
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, (payload) => received.push(payload))
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 1 })
      assert.deepStrictEqual(received, [{ userId: 1 }])
    })

    it('delivers events to multiple subscribers', () => {
      const first = []
      const second = []
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, (payload) => first.push(payload))
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, (payload) => second.push(payload))
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 2 })
      assert.deepStrictEqual(first, [{ userId: 2 }])
      assert.deepStrictEqual(second, [{ userId: 2 }])
    })

    it('does not let one subscriber error affect another subscriber', () => {
      const received = []
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, () => {
        throw new Error('boom')
      })
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, (payload) => received.push(payload))
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 3 })
      assert.deepStrictEqual(received, [{ userId: 3 }])
      assert.strictEqual(logs.errors.length, 1)
      assert.ok(logs.errors[0][0].includes('boom'))
    })

    it('publishes internal failure event when a handler errors', () => {
      const failures = []
      bus.subscribe(Events.EVENT_HANDLER_FAILED, (payload) => failures.push(payload))
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, () => {
        throw new Error('handler failure')
      })
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 4 })
      assert.strictEqual(failures.length, 1)
      assert.strictEqual(failures[0].event, Events.AUTH_LOGIN_SUCCESS)
      assert.ok(failures[0].error.message.includes('handler failure'))
    })

    it('supports async handlers', async () => {
      const received = []
      bus.subscribe(Events.AUTH_LOGIN_SUCCESS, async (payload) => {
        await Promise.resolve()
        received.push(payload)
      })
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 5 })
      await new Promise((resolve) => setTimeout(resolve, 10))
      assert.deepStrictEqual(received, [{ userId: 5 }])
    })
  })

  describe('once', () => {
    it('only triggers the handler once', () => {
      const received = []
      bus.once(Events.AUTH_LOGIN_SUCCESS, (payload) => received.push(payload))
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 6 })
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { userId: 7 })
      assert.deepStrictEqual(received, [{ userId: 6 }])
    })
  })

  describe('publishAndWait', () => {
    it('resolves with the reply payload', async () => {
      bus.subscribe(Events.VLA_COMMAND_SKIN_REFRESH, (payload) => {
        bus.publish(`vla:command:reply:${payload._replyTo}`, { ok: true })
      })
      const result = await bus.publishAndWait(Events.VLA_COMMAND_SKIN_REFRESH, { playerId: 'p1' })
      assert.deepStrictEqual(result, { ok: true })
    })

    it('rejects when no reply is received within timeout', async () => {
      await assert.rejects(
        async () => bus.publishAndWait(Events.VLA_COMMAND_BAN, { playerId: 'p2' }, { timeoutMs: 50 }),
        (err) => {
          assert.ok(err instanceof Error)
          assert.ok(err.message.includes('event-bus: no reply'))
          assert.ok(err.message.includes(Events.VLA_COMMAND_BAN))
          assert.ok(err.message.includes('50ms'))
          return true
        }
      )
    })

    it('attaches _replyTo to the published payload', async () => {
      let captured
      bus.subscribe(Events.VLA_COMMAND_KICK_ONLINE, (payload) => {
        captured = payload
        bus.publish(`vla:command:reply:${payload._replyTo}`, { kicked: true })
      })
      await bus.publishAndWait(Events.VLA_COMMAND_KICK_ONLINE, { playerId: 'p3' })
      assert.strictEqual(typeof captured._replyTo, 'string')
      assert.strictEqual(captured._replyTo.length > 0, true)
      assert.strictEqual(captured.playerId, 'p3')
    })
  })
})
