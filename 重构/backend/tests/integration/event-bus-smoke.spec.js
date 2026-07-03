import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventBus } from '../../src/modules/event-bus/index.js'
import { Events } from '../../src/modules/event-bus/events.js'
import { registerVlaCommandSubscriber } from '../../src/modules/event-bus/subscribers/vlaCommandSubscriber.js'
import { registerAuthSubscriber } from '../../src/modules/event-bus/subscribers/authSubscriber.js'
import { registerBindEmailSubscriber } from '../../src/modules/event-bus/subscribers/bindEmailSubscriber.js'
import { registerSkinRefreshSubscriber } from '../../src/modules/event-bus/subscribers/skinRefreshSubscriber.js'
import { registerSecuritySubscriber } from '../../src/modules/event-bus/subscribers/securitySubscriber.js'

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
    scheduleSave: 0,
    markKvDirty: 0,
    markUserProfileDirty: 0,
  }
}

function createDependencies(calls) {
  return {
    appendLoginEvent(store, body) {
      const row = {
        userId: 'anonymous',
        username: String(body?.username || ''),
        method: String(body?.method || 'unknown'),
        ip: String(body?.current_ip || body?.ip || ''),
        uuid: String(body?.uuid || '').trim() || null,
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

function setupEventBus() {
  const logger = createMockLogger()
  const bus = new EventBus(logger)
  const config = { authxPluginAdapter: 'authx' }
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

test('PLUGIN_CALLBACK_RECEIVED login_success emits AUTH_LOGIN_SUCCESS and writes security audit', async () => {
  const { bus, calls } = setupEventBus()
  const store = createMockStore()
  const received = waitForEvent(bus, Events.AUTH_LOGIN_SUCCESS)

  bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
    store,
    body: {
      event: 'login_success',
      username: 'Steve',
      method: 'premium',
      current_ip: '1.2.3.4',
    },
    meta: {},
  })

  const payload = await received
  assert.ok(payload, 'AUTH_LOGIN_SUCCESS should be published')
  assert.equal(payload.loginRow.username, 'Steve')
  assert.ok(calls.appendSecurityAudit.some((x) => x.action === 'login_success'))
})

test('PLUGIN_BIND_EMAIL_RECEIVED triggers VLA link/bind commands and completion', async () => {
  const { bus, calls } = setupEventBus()
  const store = createMockStore()
  const completed = waitForEvent(bus, Events.USER_BIND_EMAIL_COMPLETED)
  const commands = []
  bus.subscribe(Events.VLA_COMMAND_COMPLETED, (payload) => {
    commands.push(payload?.command)
  })

  bus.publish(Events.PLUGIN_BIND_EMAIL_RECEIVED, {
    store,
    body: {
      username: 'Steve',
      email: 'steve@example.com',
      external_user_id: 'ex1',
    },
    meta: {},
  })

  const result = await completed
  assert.ok(commands.includes(Events.VLA_COMMAND_LINK_EXTERNAL_USER))
  assert.ok(commands.includes(Events.VLA_COMMAND_NOTIFY_BIND_EMAIL))
  assert.equal(result.email, 'steve@example.com')
  assert.equal(result.mcUsername, 'Steve')
  assert.ok(calls.appendSecurityAudit.some((x) => x.action === 'plugin_bind_email'))
})

test('PLUGIN_SKIN_REFRESH_RECEIVED forwards to VLA_COMMAND_SKIN_REFRESH', async () => {
  const { bus } = setupEventBus()
  const store = createMockStore()
  const skinRefresh = waitForEvent(bus, Events.VLA_COMMAND_SKIN_REFRESH)
  const completed = waitForEvent(bus, Events.VLA_COMMAND_COMPLETED)
  const commands = []
  bus.subscribe(Events.VLA_COMMAND_COMPLETED, (payload) => {
    commands.push(payload?.command)
  })

  bus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, {
    store,
    body: { username: 'Steve' },
    meta: {},
  })

  const forwarded = await skinRefresh
  await completed
  assert.deepEqual(forwarded.body, { username: 'Steve' })
  assert.ok(commands.includes(Events.VLA_COMMAND_SKIN_REFRESH))
})
