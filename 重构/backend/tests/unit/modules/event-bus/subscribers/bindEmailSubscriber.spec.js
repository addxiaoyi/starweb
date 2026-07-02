import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../../src/modules/event-bus/index.js'
import { registerBindEmailSubscriber } from '../../../../../src/modules/event-bus/subscribers/bindEmailSubscriber.js'
import { PluginBindEmailError } from '../../../../../src/modules/plugin-gateway/bindEmailService.js'

function createStore(overrides = {}) {
  return {
    users: [],
    userNotifications: {},
    ...overrides,
  }
}

function makeDeps(overrides = {}) {
  const calls = {
    isValidEmailAddress: [],
    findUserByLinkedMcUsername: [],
    ensureSiteUserForPluginEmail: [],
    markUserProfileDirty: [],
    appendSecurityAudit: [],
    pushUserNotification: [],
    scheduleSave: [],
    vlaLink: [],
    vlaNotify: [],
  }

  const deps = {
    isValidEmailAddress: (email) => {
      calls.isValidEmailAddress.push(email)
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    },
    findUserByLinkedMcUsername: (store, username) => {
      calls.findUserByLinkedMcUsername.push(username)
      return store.users.find(
        (u) => u.linkedMcUsername && u.linkedMcUsername.toLowerCase() === username.toLowerCase()
      ) || null
    },
    ensureSiteUserForPluginEmail: async (store, email) => {
      calls.ensureSiteUserForPluginEmail.push(email)
      const existing = store.users.find((u) => u.email === email)
      if (existing) {
        return { localUser: existing, created: false }
      }
      const newUser = {
        id: `user-${store.users.length + 1}`,
        email,
        linkedMcUsername: null,
        linkedMcUuid: null,
      }
      store.users.push(newUser)
      return { localUser: newUser, created: true }
    },
    markUserProfileDirty: (userId) => calls.markUserProfileDirty.push(userId),
    appendSecurityAudit: (store, userId, action, detail) => {
      calls.appendSecurityAudit.push({ userId, action, detail })
    },
    pushUserNotification: (store, userId, payload) => {
      calls.pushUserNotification.push({ userId, payload })
    },
    scheduleSave: () => calls.scheduleSave.push(null),
    ...overrides,
  }

  return { deps, calls }
}

function waitForEvent(bus, eventName) {
  return new Promise((resolve) => {
    bus.once(eventName, resolve)
  })
}

function publishBindEmail(bus, store, body) {
  bus.publish(Events.PLUGIN_BIND_EMAIL_RECEIVED, { store, body })
}

function installVlaStubs(bus, responses, calls) {
  bus.subscribe(Events.VLA_COMMAND_LINK_EXTERNAL_USER, async (payload) => {
    calls.vlaLink.push(payload.body)
    bus.publish(`vla:command:reply:${payload._replyTo}`, responses.link)
  })
  bus.subscribe(Events.VLA_COMMAND_NOTIFY_BIND_EMAIL, async (payload) => {
    calls.vlaNotify.push(payload.body)
    bus.publish(`vla:command:reply:${payload._replyTo}`, responses.bind)
  })
}

async function captureHandlerError(bus, store, body) {
  const failedPromise = waitForEvent(bus, Events.EVENT_HANDLER_FAILED)
  publishBindEmail(bus, store, body)
  const event = await failedPromise
  return event.error
}

describe('bindEmailSubscriber', () => {
  let bus
  let store
  let deps
  let calls
  let vla

  beforeEach(() => {
    bus = new EventBus()
    store = createStore()
    const made = makeDeps()
    deps = made.deps
    calls = made.calls
    vla = {
      link: { ok: true, result: { status: 200, json: { ok: true } } },
      bind: { ok: true, result: { status: 200, json: { ok: true } } },
    }
    registerBindEmailSubscriber(bus, deps)
    installVlaStubs(bus, vla, calls)
  })

  it('successfully binds an existing user', async () => {
    store.users.push({
      id: 'user-1',
      email: 'test@example.com',
      linkedMcUsername: null,
      linkedMcUuid: null,
    })
    const completedPromise = waitForEvent(bus, Events.USER_BIND_EMAIL_COMPLETED)

    publishBindEmail(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
      external_user_id: 'ext-1',
      uuid: 'uuid-1',
      current_ip: '1.2.3.4',
    })

    const event = await completedPromise

    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.created, false)
    assert.strictEqual(event.email, 'test@example.com')
    assert.strictEqual(event.mcUsername, 'Steve')
    assert.strictEqual(event.mcUuid, 'uuid-1')
    assert.strictEqual(store.users[0].linkedMcUsername, 'Steve')
    assert.strictEqual(store.users[0].linkedMcUuid, 'uuid-1')
    assert.deepStrictEqual(calls.markUserProfileDirty, ['user-1'])
    assert.strictEqual(calls.scheduleSave.length, 1)
    assert.strictEqual(calls.appendSecurityAudit.length, 1)
    assert.strictEqual(calls.appendSecurityAudit[0].action, 'plugin_bind_email')
    assert.deepStrictEqual(calls.appendSecurityAudit[0].detail, {
      email: 'test@example.com',
      mcUsername: 'Steve',
      externalUserId: 'ext-1',
      previousMcUsername: null,
      currentIp: '1.2.3.4',
      source: 'plugin_callback',
    })
    assert.strictEqual(calls.pushUserNotification.length, 1)
    assert.strictEqual(calls.pushUserNotification[0].userId, 'user-1')
    assert.strictEqual(
      calls.pushUserNotification[0].payload.title,
      '已绑定邮箱与游戏角色'
    )
    assert.strictEqual(calls.vlaLink.length, 1)
    assert.deepStrictEqual(calls.vlaLink[0], { username: 'Steve', external_user_id: 'user-1' })
    assert.strictEqual(calls.vlaNotify.length, 1)
    assert.deepStrictEqual(calls.vlaNotify[0], { username: 'Steve', email: 'test@example.com' })
  })

  it('successfully binds and creates a new user', async () => {
    const completedPromise = waitForEvent(bus, Events.USER_BIND_EMAIL_COMPLETED)

    publishBindEmail(bus, store, {
      email: 'new@example.com',
      username: 'Alex',
      external_user_id: 'ext-2',
      ip: '5.6.7.8',
    })

    const event = await completedPromise

    assert.strictEqual(store.users.length, 1)
    assert.strictEqual(store.users[0].id, 'user-1')
    assert.strictEqual(store.users[0].email, 'new@example.com')
    assert.strictEqual(event.created, true)
    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(store.users[0].linkedMcUsername, 'Alex')
    assert.strictEqual(store.users[0].linkedMcUuid, null)
    assert.strictEqual(calls.pushUserNotification[0].payload.title, '已创建皮肤站账号并绑定角色')
    assert.strictEqual(calls.pushUserNotification[0].payload.message, '已为 new@example.com 创建网站账号，并绑定角色 Alex')
  })

  it('throws invalid_email when email validation fails', async () => {
    const error = await captureHandlerError(bus, store, {
      email: 'not-an-email',
      username: 'Steve',
    })

    assert.ok(error instanceof PluginBindEmailError)
    assert.strictEqual(error.code, 'invalid_email')
    assert.strictEqual(error.status, 400)
  })

  it('throws validation_error when username is too short', async () => {
    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'ab',
    })

    assert.strictEqual(error.code, 'validation_error')
    assert.strictEqual(error.status, 400)
  })

  it('throws validation_error when username is too long', async () => {
    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'a'.repeat(17),
    })

    assert.strictEqual(error.code, 'validation_error')
    assert.strictEqual(error.status, 400)
  })

  it('throws mc_already_linked when another user already owns the username', async () => {
    store.users.push({
      id: 'existing-user',
      email: 'other@example.com',
      linkedMcUsername: 'Steve',
      linkedMcUuid: null,
    })

    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
    })

    assert.strictEqual(error.code, 'mc_already_linked')
    assert.strictEqual(error.status, 409)
    assert.deepStrictEqual(error.payload, { linkedUserId: 'existing-user' })
  })

  it('throws email_already_linked when the email user is linked to a different username', async () => {
    store.users.push({
      id: 'user-1',
      email: 'test@example.com',
      linkedMcUsername: 'OldName',
      linkedMcUuid: null,
    })

    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
    })

    assert.strictEqual(error.code, 'email_already_linked')
    assert.strictEqual(error.status, 409)
    assert.deepStrictEqual(error.payload, { linkedMcUsername: 'OldName' })
  })

  it('throws link_failed when VLA link command fails', async () => {
    vla.link = { ok: false, result: { status: 503, json: { error: 'VLA link down' } }, error: 'VLA admin returned 503' }

    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
    })

    assert.strictEqual(error.code, 'link_failed')
    assert.strictEqual(error.status, 503)
    assert.deepStrictEqual(error.payload, { message: 'VLA link down' })
    assert.strictEqual(calls.vlaLink.length, 1)
    assert.strictEqual(calls.vlaNotify.length, 0)
  })

  it('throws bind_email_failed when VLA notify command fails', async () => {
    vla.bind = { ok: false, result: { status: 500, json: { error: 'bind notify failed' } }, error: 'VLA admin returned 500' }

    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
    })

    assert.strictEqual(error.code, 'bind_email_failed')
    assert.strictEqual(error.status, 500)
    assert.deepStrictEqual(error.payload, { message: 'bind notify failed' })
    assert.strictEqual(calls.vlaLink.length, 1)
    assert.strictEqual(calls.vlaNotify.length, 1)
  })

  it('throws link_failed with 502 when VLA link command throws without result', async () => {
    vla.link = { ok: false, error: 'network error' }

    const error = await captureHandlerError(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
    })

    assert.ok(error instanceof PluginBindEmailError)
    assert.strictEqual(error.code, 'link_failed')
    assert.strictEqual(error.status, 502)
    assert.deepStrictEqual(error.payload, { message: 'network error' })
    assert.strictEqual(calls.vlaLink.length, 1)
    assert.strictEqual(calls.vlaNotify.length, 0)
  })

  it('succeeds when the same user re-binds the same username', async () => {
    store.users.push({
      id: 'user-1',
      email: 'test@example.com',
      linkedMcUsername: 'Steve',
      linkedMcUuid: 'uuid-1',
    })
    const completedPromise = waitForEvent(bus, Events.USER_BIND_EMAIL_COMPLETED)

    publishBindEmail(bus, store, {
      email: 'test@example.com',
      username: 'Steve',
      external_user_id: 'ext-1',
      uuid: 'uuid-1',
      current_ip: '1.2.3.4',
    })

    const event = await completedPromise

    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.created, false)
    assert.strictEqual(event.mcUsername, 'Steve')
    assert.strictEqual(event.mcUuid, 'uuid-1')
    assert.strictEqual(calls.vlaLink.length, 1)
    assert.strictEqual(calls.vlaNotify.length, 1)
  })
})
