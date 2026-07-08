import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../../src/modules/event-bus/index.js'
import { registerSkinRefreshSubscriber } from '../../../../../src/modules/event-bus/subscribers/skinRefreshSubscriber.js'

function waitForEvent(bus, eventName) {
  return new Promise((resolve) => {
    bus.once(eventName, resolve)
  })
}

describe('skinRefreshSubscriber', () => {
  let bus
  let logs
  let logger

  function waitForNoEvent(bus, eventName, timeoutMs = 50) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), timeoutMs)
      bus.once(eventName, () => {
        clearTimeout(timer)
        resolve('emitted')
      })
    })
  }

  beforeEach(() => {
    logs = { debug: [], warn: [], error: [] }
    logger = {
      debug: (...args) => logs.debug.push(args),
      warn: (...args) => logs.warn.push(args),
      error: (...args) => logs.error.push(args),
    }
    bus = new EventBus(logger)
  })

  it('publishes VLA_COMMAND_SKIN_REFRESH when PLUGIN_SKIN_REFRESH_RECEIVED is received', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const promise = waitForEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: { username: 'Steve' } })
    const event = await promise

    assert.deepStrictEqual(event, { body: { username: 'Steve' } })
  })

  it('defaults body to empty object when missing', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const promise = waitForEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, {})
    const event = await promise

    assert.deepStrictEqual(event, { body: {} })
  })

  it('defaults body to empty object when null', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const promise = waitForEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: null })
    const event = await promise

    assert.deepStrictEqual(event, { body: {} })
  })

  it('falls back to console when logger is not provided', async () => {
    registerSkinRefreshSubscriber(bus, {})
    const promise = waitForEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: { username: 'Alex' } })
    const event = await promise

    assert.deepStrictEqual(event, { body: { username: 'Alex' } })
  })

  it('warns and does not publish when payload is null', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const result = waitForNoEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, null)

    assert.strictEqual(await result, 'timeout')
    assert.strictEqual(logs.warn.length, 1)
    assert.ok(logs.warn[0][0].includes('invalid payload shape'))
  })

  it('does not publish when payload is an array', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const result = waitForNoEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, [])

    assert.strictEqual(await result, 'timeout')
    assert.strictEqual(logs.warn.length, 1)
  })

  it('does not publish when payload is a string', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const result = waitForNoEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, 'invalid')

    assert.strictEqual(await result, 'timeout')
    assert.strictEqual(logs.warn.length, 1)
  })

  it('does not publish when payload.body is an array', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const result = waitForNoEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: [] })

    assert.strictEqual(await result, 'timeout')
    assert.strictEqual(logs.warn.length, 1)
    assert.ok(logs.warn[0][0].includes('invalid body shape'))
  })

  it('does not publish when payload.body is a string', async () => {
    registerSkinRefreshSubscriber(bus, { logger })
    const result = waitForNoEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)

    bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: 'invalid' })

    assert.strictEqual(await result, 'timeout')
    assert.strictEqual(logs.warn.length, 1)
    assert.ok(logs.warn[0][0].includes('invalid body shape'))
  })
})
