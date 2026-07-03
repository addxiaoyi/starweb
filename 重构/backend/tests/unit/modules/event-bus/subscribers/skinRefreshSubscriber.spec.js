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

  beforeEach(() => {
    logs = { debug: [] }
    logger = {
      debug: (...args) => logs.debug.push(args),
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
})
