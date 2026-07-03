import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventBus } from '../../src/modules/event-bus/index.js'
import { Events } from '../../src/modules/event-bus/events.js'
import { registerVlaCommandSubscriber } from '../../src/modules/event-bus/subscribers/vlaCommandSubscriber.js'
import { registerAuthSubscriber } from '../../src/modules/event-bus/subscribers/authSubscriber.js'
import { registerBindEmailSubscriber } from '../../src/modules/event-bus/subscribers/bindEmailSubscriber.js'
import { registerSkinRefreshSubscriber } from '../../src/modules/event-bus/subscribers/skinRefreshSubscriber.js'
import { registerSecuritySubscriber } from '../../src/modules/event-bus/subscribers/securitySubscriber.js'
import { PluginBindEmailError } from '../../src/modules/plugin-gateway/bindEmailService.js'

function createMockStore() {
  return { users: [] }
}

function createMockLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
  }
}

function createTrackedCalls() {
  return {
    appendSecurityAudit: [],
    appendLoginEvent: [],
    pushUserNotification: [],
    isValidEmailAddress: [],
    scheduleSave: 0,
    markKvDirty: 0,
    markUserProfileDirty: 0,
  }
}

function createDependencies(calls) {
  return {
    appendLoginEvent(store, body) {
      const row = {
        userId: 'u123',
        username: String(body?.username || ''),
        uuid: 'abc',
      }
      calls.appendLoginEvent.push({ store, body, row })
      return row
    },
    appendSecurityAudit(store, userId, action, detail) {
      calls.appendSecurityAudit.push({ store, userId, action, detail })
    },
    appendSecurityAlert() {},
    pushUserNotification(store, userId, notification) {
      calls.pushUserNotification.push({ store, userId, notification })
    },
    scheduleSave() {
      calls.scheduleSave += 1
    },
    markKvDirty() {
      calls.markKvDirty += 1
    },
    markUserProfileDirty() {
      calls.markUserProfileDirty += 1
    },
    failMcVerifySession() {
      return { ok: false }
    },
    completeMcVerifySession() {
      return { ok: false }
    },
    findUserByExternalUserId() {
      return null
    },
    computeLoginRisk() {
      return { riskScore: 0, riskLevel: 'low', deviceProfile: 'unknown_device' }
    },
    ensureSecurityCenter(store) {
      if (!store.securityCenter || typeof store.securityCenter !== 'object') {
        store.securityCenter = {
          loginEvents: [],
          alerts: [],
          auditLogs: [],
          trustedDevices: {},
          sessions: {},
          rules: {},
        }
      }
      return store.securityCenter
    },
    isValidEmailAddress(email) {
      calls.isValidEmailAddress.push(email)
      return /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/.test(String(email || ''))
    },
    findUserByLinkedMcUsername() {
      return null
    },
    async ensureSiteUserForPluginEmail(_store, _email) {
      return {
        localUser: {
          id: 'u1',
          linkedMcUsername: null,
          linkedMcUuid: null,
        },
        created: true,
      }
    },
  }
}

function setupEventBus(configOverrides = {}) {
  const logger = createMockLogger()
  const bus = new EventBus(logger)
  const config = { authxPluginAdapter: 'authx', ...configOverrides }
  const pluginFetchJson = async () => ({ status: 200, json: { ok: true } })
  const calls = createTrackedCalls()
  const deps = createDependencies(calls)

  registerVlaCommandSubscriber(bus, { pluginFetchJson, config, logger })
  registerAuthSubscriber(bus, { ...deps, logger })
  registerBindEmailSubscriber(bus, deps)
  registerSkinRefreshSubscriber(bus, { logger })
  registerSecuritySubscriber(bus, deps)

  return { bus, calls, deps }
}

function waitForEvent(bus, event) {
  return new Promise((resolve) => {
    bus.once(event, resolve)
  })
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('PLUGIN_CALLBACK_RECEIVED login_success emits AUTH_LOGIN_SUCCESS and writes security audit', async () => {
  const { bus, calls } = setupEventBus()
  const store = createMockStore()
  const received = waitForEvent(bus, Events.AUTH_LOGIN_SUCCESS)
  const body = {
    event: 'login_success',
    username: 'Steve',
    method: 'premium',
    current_ip: '1.2.3.4',
  }

  bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, { store, body })

  const payload = await received
  assert.ok(payload, 'AUTH_LOGIN_SUCCESS should be published')
  assert.deepEqual(payload.loginRow, { userId: 'u123', username: 'Steve', uuid: 'abc' })
  assert.equal(calls.appendLoginEvent.length, 1)
  assert.equal(calls.appendLoginEvent[0].store, store)
  assert.equal(calls.appendLoginEvent[0].body, body)
  assert.equal(calls.appendSecurityAudit.length, 1)
  assert.equal(calls.appendSecurityAudit[0].store, store)
  assert.equal(calls.appendSecurityAudit[0].userId, 'u123')
  assert.equal(calls.appendSecurityAudit[0].action, 'login_success')
  assert.equal(calls.appendSecurityAudit[0].detail.username, 'Steve')
  assert.equal(calls.appendSecurityAudit[0].detail.uuid, 'abc')
})

test('PLUGIN_BIND_EMAIL_RECEIVED triggers VLA link/bind commands and completion', async () => {
  const { bus, calls } = setupEventBus()
  const store = createMockStore()
  const completed = waitForEvent(bus, Events.USER_BIND_EMAIL_COMPLETED)
  const commands = []
  bus.subscribe(Events.VLA_COMMAND_COMPLETED, (payload) => {
    commands.push(payload?.command)
  })
  const body = {
    username: 'Steve',
    email: 'steve@example.com',
    external_user_id: 'ex1',
  }

  bus.publish(Events.PLUGIN_BIND_EMAIL_RECEIVED, { store, body })

  const result = await completed
  assert.equal(commands.filter((c) => c === Events.VLA_COMMAND_LINK_EXTERNAL_USER).length, 1)
  assert.equal(commands.filter((c) => c === Events.VLA_COMMAND_NOTIFY_BIND_EMAIL).length, 1)
  assert.equal(result.email, 'steve@example.com')
  assert.equal(result.mcUsername, 'Steve')
  assert.equal(calls.isValidEmailAddress.length, 1)
  assert.equal(calls.isValidEmailAddress[0], 'steve@example.com')
  assert.ok(
    calls.appendSecurityAudit.some((x) => x.action === 'plugin_bind_email'),
    'security audit for plugin_bind_email should be recorded'
  )
})

test('PLUGIN_SKIN_REFRESH_RECEIVED forwards to VLA_COMMAND_SKIN_REFRESH', async () => {
  const { bus } = setupEventBus()
  const skinRefresh = waitForEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)
  const completed = waitForEvent(bus, Events.VLA_COMMAND_COMPLETED)
  const commands = []
  bus.subscribe(Events.VLA_COMMAND_COMPLETED, (payload) => {
    commands.push(payload?.command)
  })

  bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: { username: 'Steve' } })

  const forwarded = await skinRefresh
  await completed
  assert.deepEqual(forwarded.body, { username: 'Steve' })
  assert.equal(commands.filter((c) => c === Events.VLA_COMMAND_SKIN_REFRESH).length, 1)
})

test('PLUGIN_CALLBACK_RECEIVED with null payload does not publish domain events or crash', async () => {
  const { bus } = setupEventBus()
  let fired = false
  bus.subscribe(Events.AUTH_LOGIN_SUCCESS, () => {
    fired = true
  })
  bus.subscribe(Events.AUTH_VERIFY_COMPLETED, () => {
    fired = true
  })
  bus.subscribe(Events.SECURITY_ALERT_RAISED, () => {
    fired = true
  })

  bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, null)

  await waitMs(50)
  assert.equal(fired, false)
})

test('PLUGIN_BIND_EMAIL_RECEIVED with invalid email emits PluginBindEmailError via EVENT_HANDLER_FAILED', async () => {
  const { bus } = setupEventBus()
  const store = createMockStore()
  const failed = waitForEvent(bus, Events.EVENT_HANDLER_FAILED)

  bus.publish(Events.PLUGIN_BIND_EMAIL_RECEIVED, {
    store,
    body: { username: 'Steve', email: 'not-an-email' },
  })

  const payload = await failed
  assert.ok(payload.error instanceof PluginBindEmailError)
  assert.equal(payload.error.code, 'invalid_email')
})

test('VLA command is skipped when authxPluginAdapter is not vla', async () => {
  const { bus } = setupEventBus({ authxPluginAdapter: 'authx' })
  const result = await bus.publishAndWait(Events.VLA_COMMAND_SKIN_REFRESH, {
    body: { username: 'Steve' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.result.skipped, true)
})
