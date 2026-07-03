import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../../src/modules/event-bus/index.js'
import { registerAuthSubscriber, buildCallbackRecord } from '../../../../../src/modules/event-bus/subscribers/authSubscriber.js'

function createStore(overrides = {}) {
  return {
    users: [],
    authxEvents: [],
    securityCenter: {
      sessions: {},
      alerts: [],
      loginEvents: [],
      auditLogs: [],
      webhookQueue: [],
      trustedDevices: {},
      geoCache: {},
      rules: {},
    },
    userNotifications: {},
    ...overrides,
  }
}

function createUser(options = {}) {
  return {
    id: 'user-1',
    linkedMcUsername: 'Steve',
    linkedMcUuid: null,
    ...options,
  }
}

function makeDeps(overrides = {}) {
  const calls = {
    markKvDirty: [],
    scheduleSave: [],
    markUserProfileDirty: [],
    failMcVerifySession: [],
    completeMcVerifySession: [],
    appendLoginEvent: [],
    findUserByExternalUserId: [],
    computeLoginRisk: [],
    ensureSecurityCenter: [],
    loggerWarn: [],
    loggerInfo: [],
  }

  const deps = {
    logger: {
      warn: (msg, extra) => { calls.loggerWarn.push({ msg, extra }) },
      info: (msg, extra) => { calls.loggerInfo.push({ msg, extra }) },
    },
    markKvDirty: (key) => { calls.markKvDirty.push(key) },
    scheduleSave: () => { calls.scheduleSave.push(null) },
    markUserProfileDirty: (userId) => { calls.markUserProfileDirty.push(userId) },
    failMcVerifySession: (userId, reason, detail) => {
      calls.failMcVerifySession.push({ userId, reason, detail })
      return { ok: true, code: 'failed', session: { id: 'session-fail', retries: 1, maxRetries: 3, conflictCode: detail?.conflictCode || 'plugin_verify_failed' } }
    },
    completeMcVerifySession: (userId, mojangUuid, options) => {
      calls.completeMcVerifySession.push({ userId, mojangUuid, options })
      return { ok: true, code: 'succeeded', session: { id: 'session-ok', retries: 0, maxRetries: 3 } }
    },
    appendLoginEvent: (store, payload) => {
      calls.appendLoginEvent.push({ payload })
      return {
        userId: 'user-1',
        username: payload.username || 'Steve',
        uuid: payload.uuid || 'uuid',
        method: payload.method || 'microsoft',
        ip: payload.ip || '1.1.1.1',
        location: payload.location || 'CN',
        asn: payload.asn || 'ASN',
        riskScore: 0,
        riskLevel: 'low',
        deviceProfile: 'trusted_device',
        externalUserId: payload.external_user_id || null,
      }
    },
    findUserByExternalUserId: (store, externalUserId) => {
      calls.findUserByExternalUserId.push(externalUserId)
      return store.users.find((u) => u.id === externalUserId) || null
    },
    computeLoginRisk: (sc, userId, payload) => {
      calls.computeLoginRisk.push({ userId, payload })
      return { riskScore: 0, riskLevel: 'low', deviceProfile: 'trusted_device' }
    },
    ensureSecurityCenter: (store) => {
      calls.ensureSecurityCenter.push(null)
      return store.securityCenter
    },
    ...overrides,
  }

  return { deps, calls }
}

function waitForEvent(bus, eventName) {
  return new Promise((resolve) => {
    bus.once(eventName, resolve)
  })
}

function publishCallback(bus, store, body, meta = {}) {
  bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, { store, body, meta })
}

describe('authSubscriber', () => {
  let bus
  let store
  let user
  let deps
  let calls

  beforeEach(() => {
    bus = new EventBus()
    user = createUser()
    store = createStore({ users: [user] })
    const made = makeDeps()
    deps = made.deps
    calls = made.calls
    registerAuthSubscriber(bus, deps)
  })

  it('builds callback record preserving fields', () => {
    const record = buildCallbackRecord(store, {
      event: 'login_success',
      username: 'Steve',
      uuid: 'uuid-1',
      remoteAddress: '1.2.3.4',
      method: 'microsoft',
      fingerprint: 'fp-1',
      reason: 'ok',
      external_user_id: 'user-1',
      source: 'authx',
      ts_ms: 1234567890,
    }, {
      vlaInbound: true,
      remoteAddress: '5.6.7.8',
      receivedAt: '2026-01-01T00:00:00.000Z',
    })

    assert.strictEqual(record.event, 'login_success')
    assert.strictEqual(record.username, 'Steve')
    assert.strictEqual(record.uuid, 'uuid-1')
    assert.strictEqual(record.remoteAddress, '5.6.7.8')
    assert.strictEqual(record.authMethod, 'microsoft')
    assert.strictEqual(record.deviceFingerprint, 'fp-1')
    assert.strictEqual(record.reason, 'ok')
    assert.strictEqual(record.externalUserId, 'user-1')
    assert.strictEqual(record.webhookSource, 'authx')
    assert.strictEqual(record.tsMs, 1234567890)
    assert.strictEqual(record.adapter, 'vla')
    assert.strictEqual(record.receivedAt, '2026-01-01T00:00:00.000Z')
    assert.ok(record.id)
  })

  it('records the callback into store.authxEvents for any event', async () => {
    const completedPromise = waitForEvent(bus, Events.AUTH_VERIFY_COMPLETED)

    publishCallback(bus, store, {
      event: 'verify_premium',
      username: 'Steve',
      mojang_uuid: 'mojang-uuid-123',
      verified: true,
    })

    await completedPromise

    assert.strictEqual(store.authxEvents.length, 1)
    assert.strictEqual(store.authxEvents[0].event, 'verify_premium')
    assert.strictEqual(store.authxEvents[0].username, 'Steve')
    assert.strictEqual(calls.markKvDirty[0], 'authx_events')
    assert.strictEqual(calls.scheduleSave.length, 1)
  })

  it('truncates authxEvents to 5000 records', () => {
    store.authxEvents = Array.from({ length: 5000 }, (_, i) => ({ id: `old-${i}` }))

    publishCallback(bus, store, { event: 'unknown', username: 'Steve' })

    assert.strictEqual(store.authxEvents.length, 5000)
    assert.strictEqual(store.authxEvents[0].event, 'unknown')
    assert.strictEqual(store.authxEvents[store.authxEvents.length - 1].id, 'old-4998')
  })

  it('verify_premium calls completeMcVerifySession and publishes AUTH_VERIFY_COMPLETED', async () => {
    const completedPromise = waitForEvent(bus, Events.AUTH_VERIFY_COMPLETED)

    publishCallback(bus, store, {
      event: 'verify_premium',
      username: 'Steve',
      mojang_uuid: 'mojang-uuid-123',
      verified: true,
    })

    const event = await completedPromise

    assert.strictEqual(calls.completeMcVerifySession.length, 1)
    assert.deepStrictEqual(calls.completeMcVerifySession[0], {
      userId: 'user-1',
      mojangUuid: 'mojang-uuid-123',
      options: { mcUsername: 'steve' },
    })
    assert.strictEqual(store.users[0].linkedMcUuid, 'mojang-uuid-123')
    assert.deepStrictEqual(calls.markUserProfileDirty, ['user-1'])
    assert.strictEqual(event.store, store)
    assert.strictEqual(event.userId, 'user-1')
    assert.deepStrictEqual(event.auditDetail, {
      mcUsername: 'steve',
      mojangUuid: 'mojang-uuid-123',
      source: 'plugin_callback',
      sessionId: 'session-ok',
      retryCount: 0,
      maxRetries: 3,
    })
  })

  it('verify_premium missing uuid publishes AUTH_VERIFY_FAILED', async () => {
    const failedPromise = waitForEvent(bus, Events.AUTH_VERIFY_FAILED)

    publishCallback(bus, store, {
      event: 'verify_premium',
      username: 'Steve',
      verified: true,
    })

    const event = await failedPromise

    assert.strictEqual(calls.failMcVerifySession.length, 1)
    assert.strictEqual(calls.failMcVerifySession[0].detail.conflictCode, 'callback_missing_mojang_uuid')
    assert.strictEqual(event.store, store)
    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.auditDetail.mcUsername, 'steve')
    assert.strictEqual(event.auditDetail.reason, 'missing_mojang_uuid')
    assert.strictEqual(event.auditDetail.conflictCode, 'callback_missing_mojang_uuid')
  })

  it('verify_failed calls failMcVerifySession and publishes AUTH_VERIFY_FAILED', async () => {
    const failedPromise = waitForEvent(bus, Events.AUTH_VERIFY_FAILED)

    publishCallback(bus, store, {
      event: 'verify_failed',
      username: 'Steve',
      reason: 'premium_expired',
    })

    const event = await failedPromise

    assert.strictEqual(calls.failMcVerifySession.length, 1)
    assert.deepStrictEqual(calls.failMcVerifySession[0], {
      userId: 'user-1',
      reason: 'premium_expired',
      detail: { mcUsername: 'steve', conflictCode: 'plugin_verify_failed' },
    })
    assert.strictEqual(event.store, store)
    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.auditDetail.mcUsername, 'steve')
    assert.strictEqual(event.auditDetail.reason, 'premium_expired')
  })

  it('verify_premium_failed is handled like verify_failed', async () => {
    const failedPromise = waitForEvent(bus, Events.AUTH_VERIFY_FAILED)

    publishCallback(bus, store, {
      event: 'verify_premium_failed',
      username: 'Steve',
      error: 'server_error',
    })

    const event = await failedPromise

    assert.strictEqual(calls.failMcVerifySession.length, 1)
    assert.strictEqual(calls.failMcVerifySession[0].reason, 'server_error')
    assert.strictEqual(event.auditDetail.mcUsername, 'steve')
    assert.strictEqual(event.auditDetail.reason, 'server_error')
  })

  it('verify_failed with failMcVerifySession ok=false sets action verify_callback_conflict', async () => {
    const localCalls = { failMcVerifySession: [] }
    const localDeps = makeDeps({
      failMcVerifySession: (userId, reason, detail) => {
        localCalls.failMcVerifySession.push({ userId, reason, detail })
        return { ok: false, code: 'session_already_failed', session: null }
      },
    }).deps

    bus = new EventBus()
    registerAuthSubscriber(bus, localDeps)
    store = createStore({ users: [createUser()] })

    const failedPromise = waitForEvent(bus, Events.AUTH_VERIFY_FAILED)

    publishCallback(bus, store, {
      event: 'verify_failed',
      username: 'Steve',
      reason: 'premium_expired',
    })

    const event = await failedPromise

    assert.strictEqual(localCalls.failMcVerifySession.length, 1)
    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.auditDetail.mcUsername, 'steve')
    assert.strictEqual(event.auditDetail.reason, 'premium_expired')
    assert.strictEqual(event.auditDetail.conflictCode, 'session_already_failed')
    assert.strictEqual(event.auditDetail.action, 'verify_callback_conflict')
  })

  it('login_success calls appendLoginEvent and publishes AUTH_LOGIN_SUCCESS', async () => {
    const successPromise = waitForEvent(bus, Events.AUTH_LOGIN_SUCCESS)

    publishCallback(bus, store, {
      event: 'login_success',
      username: 'Steve',
      external_user_id: 'user-1',
      method: 'microsoft',
      ip: '8.8.8.8',
    })

    const event = await successPromise

    assert.strictEqual(calls.appendLoginEvent.length, 1)
    assert.deepStrictEqual(calls.appendLoginEvent[0].payload, {
      event: 'login_success',
      username: 'Steve',
      external_user_id: 'user-1',
      method: 'microsoft',
      ip: '8.8.8.8',
    })
    assert.strictEqual(event.store, store)
    assert.deepStrictEqual(event.loginRow, {
      userId: 'user-1',
      username: 'Steve',
      uuid: 'uuid',
      method: 'microsoft',
      ip: '8.8.8.8',
      location: 'CN',
      asn: 'ASN',
      riskScore: 0,
      riskLevel: 'low',
      deviceProfile: 'trusted_device',
      externalUserId: 'user-1',
    })
    assert.strictEqual(event.source, 'plugin_callback')
  })

  it('security_alert appends alert and publishes SECURITY_ALERT_RAISED', async () => {
    const alertPromise = waitForEvent(bus, Events.SECURITY_ALERT_RAISED)

    publishCallback(bus, store, {
      event: 'security_alert',
      username: 'Steve',
      external_user_id: 'user-1',
      type: 'impossible_travel',
      current_ip: '8.8.8.8',
      fingerprint: 'fp-1',
      asn: 'AS15169',
      location: 'US',
      isp: 'Google',
      risk_score: 85,
      risk_level: 'high',
      device_profile: 'new_device',
    })

    const event = await alertPromise

    assert.strictEqual(event.store, store)
    assert.strictEqual(event.targetUserId, 'user-1')
    assert.strictEqual(event.alertPayload.username, 'Steve')
    assert.strictEqual(event.alertPayload.type, 'impossible_travel')
    assert.strictEqual(event.alertPayload.riskScore, 85)
    assert.strictEqual(event.alertPayload.riskLevel, 'high')
    assert.strictEqual(event.alertPayload.deviceProfile, 'new_device')
  })

  it('verify_premium with verified=false triggers failMcVerifySession and publishes AUTH_VERIFY_FAILED', async () => {
    const failedPromise = waitForEvent(bus, Events.AUTH_VERIFY_FAILED)

    publishCallback(bus, store, {
      event: 'verify_premium',
      username: 'Steve',
      verified: false,
    })

    const event = await failedPromise

    assert.strictEqual(calls.failMcVerifySession.length, 1)
    assert.strictEqual(calls.failMcVerifySession[0].detail.conflictCode, 'callback_not_verified')
    assert.strictEqual(event.store, store)
    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.auditDetail.mcUsername, 'steve')
    assert.strictEqual(event.auditDetail.reason, 'not_verified')
    assert.strictEqual(event.auditDetail.conflictCode, 'callback_not_verified')
  })

  it('completeMcVerifySession returning ok=false publishes AUTH_VERIFY_FAILED without reason', async () => {
    const localCalls = { completeMcVerifySession: [] }
    const localDeps = makeDeps({
      completeMcVerifySession: (userId, mojangUuid, options) => {
        localCalls.completeMcVerifySession.push({ userId, mojangUuid, options })
        return { ok: false, code: 'session_not_found' }
      },
    }).deps

    bus = new EventBus()
    registerAuthSubscriber(bus, localDeps)
    store = createStore({ users: [createUser()] })

    const failedPromise = waitForEvent(bus, Events.AUTH_VERIFY_FAILED)

    publishCallback(bus, store, {
      event: 'verify_premium',
      username: 'Steve',
      mojang_uuid: 'mojang-uuid-123',
      verified: true,
    })

    const event = await failedPromise

    assert.strictEqual(localCalls.completeMcVerifySession.length, 1)
    assert.strictEqual(event.store, store)
    assert.strictEqual(event.userId, 'user-1')
    assert.strictEqual(event.auditDetail.mcUsername, 'steve')
    assert.strictEqual(event.auditDetail.conflictCode, 'session_not_found')
    assert.strictEqual(event.auditDetail.reason, 'verify_callback_conflict')
    assert.strictEqual(event.auditDetail.action, 'verify_callback_conflict')
  })

  it('unknown event records callback but does not call any deps except record keeping and scheduleSave', async () => {
    publishCallback(bus, store, { event: 'unknown', username: 'Steve' })

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(store.authxEvents.length, 1)
    assert.strictEqual(store.authxEvents[0].event, 'unknown')
    assert.strictEqual(calls.markKvDirty.length, 1)
    assert.strictEqual(calls.markKvDirty[0], 'authx_events')
    assert.strictEqual(calls.scheduleSave.length, 1)
    assert.strictEqual(calls.failMcVerifySession.length, 0)
    assert.strictEqual(calls.completeMcVerifySession.length, 0)
    assert.strictEqual(calls.appendLoginEvent.length, 0)
    assert.strictEqual(calls.findUserByExternalUserId.length, 0)
    assert.strictEqual(calls.computeLoginRisk.length, 0)
    assert.strictEqual(calls.ensureSecurityCenter.length, 0)
    assert.strictEqual(calls.markUserProfileDirty.length, 0)
  })

  it('mcUsername that does not match any user records callback but does not call user-specific deps', async () => {
    store = createStore({ users: [] })

    publishCallback(bus, store, {
      event: 'verify_premium',
      username: 'NotSteve',
      mojang_uuid: 'mojang-uuid-123',
      verified: true,
    })

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(store.authxEvents.length, 1)
    assert.strictEqual(store.authxEvents[0].username, 'NotSteve')
    assert.strictEqual(calls.markKvDirty[0], 'authx_events')
    assert.strictEqual(calls.scheduleSave.length, 1)
    assert.strictEqual(calls.completeMcVerifySession.length, 0)
    assert.strictEqual(calls.failMcVerifySession.length, 0)
    assert.strictEqual(calls.markUserProfileDirty.length, 0)
  })

  it('warns and returns early when payload is null', async () => {
    bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, null)

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(calls.loggerWarn.length, 1)
    assert.strictEqual(store.authxEvents.length, 0)
    assert.strictEqual(calls.scheduleSave.length, 0)
    assert.strictEqual(calls.markKvDirty.length, 0)
  })

  it('warns and returns early when payload.store is missing', async () => {
    bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
      body: { event: 'login_success', username: 'Steve' },
    })

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(calls.loggerWarn.length, 1)
    assert.strictEqual(store.authxEvents.length, 0)
    assert.strictEqual(calls.scheduleSave.length, 0)
    assert.strictEqual(calls.appendLoginEvent.length, 0)
  })

  it('warns and returns early when payload.body is not a plain object', async () => {
    bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
      store,
      body: 'not-an-object',
    })

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(calls.loggerWarn.length, 1)
    assert.strictEqual(store.authxEvents.length, 0)
    assert.strictEqual(calls.scheduleSave.length, 0)
  })

  it('warns and returns early when body.event is empty', async () => {
    bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
      store,
      body: { username: 'Steve' },
    })

    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(calls.loggerWarn.length, 1)
    assert.strictEqual(store.authxEvents.length, 0)
    assert.strictEqual(calls.scheduleSave.length, 0)
  })
})
