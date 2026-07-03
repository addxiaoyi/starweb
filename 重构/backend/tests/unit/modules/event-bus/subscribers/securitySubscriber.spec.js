import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { EventBus, Events } from '../../../../../src/modules/event-bus/index.js'
import { registerSecuritySubscriber } from '../../../../../src/modules/event-bus/subscribers/securitySubscriber.js'

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

function makeDeps(overrides = {}) {
  const calls = {
    appendSecurityAudit: [],
    appendSecurityAlert: [],
    pushUserNotification: [],
  }

  const deps = {
    appendSecurityAudit: (store, userId, action, detail) => {
      calls.appendSecurityAudit.push({ store, userId, action, detail })
    },
    appendSecurityAlert: (store, userId, level, title, payload) => {
      calls.appendSecurityAlert.push({ store, userId, level, title, payload })
    },
    pushUserNotification: (store, userId, payload) => {
      calls.pushUserNotification.push({ store, userId, payload })
    },
    ...overrides,
  }

  return { deps, calls }
}

function waitForImmediate() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('securitySubscriber', () => {
  let bus
  let store
  let deps
  let calls

  beforeEach(() => {
    bus = new EventBus()
    store = createStore()
    const made = makeDeps()
    deps = made.deps
    calls = made.calls
    registerSecuritySubscriber(bus, deps)
  })

  it('subscribes to AUTH_LOGIN_SUCCESS and appends security audit', async () => {
    bus.publish(Events.AUTH_LOGIN_SUCCESS, {
      store,
      loginRow: {
        userId: 'user-1',
        username: 'Steve',
        uuid: 'uuid-1',
        method: 'microsoft',
        ip: '8.8.8.8',
        location: 'US',
        asn: 'AS15169',
        riskScore: 10,
        riskLevel: 'low',
        deviceProfile: 'trusted_device',
        externalUserId: 'ext-1',
      },
    })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 1)
    assert.deepStrictEqual(calls.appendSecurityAudit[0], {
      store,
      userId: 'user-1',
      action: 'login_success',
      detail: {
        username: 'Steve',
        uuid: 'uuid-1',
        method: 'microsoft',
        ip: '8.8.8.8',
        location: 'US',
        asn: 'AS15169',
        riskScore: 10,
        riskLevel: 'low',
        deviceProfile: 'trusted_device',
        externalUserId: 'ext-1',
        source: 'plugin_callback',
      },
    })
  })

  it('subscribes to AUTH_VERIFY_COMPLETED and appends audit + pushes notification', async () => {
    bus.publish(Events.AUTH_VERIFY_COMPLETED, {
      store,
      userId: 'user-1',
      auditDetail: {
        mcUsername: 'steve',
        mojangUuid: 'mojang-uuid-123',
        source: 'plugin_callback',
        sessionId: 'session-ok',
        retryCount: 0,
        maxRetries: 3,
      },
    })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 1)
    assert.deepStrictEqual(calls.appendSecurityAudit[0], {
      store,
      userId: 'user-1',
      action: 'verify_success',
      detail: {
        mcUsername: 'steve',
        mojangUuid: 'mojang-uuid-123',
        source: 'plugin_callback',
        sessionId: 'session-ok',
        retryCount: 0,
        maxRetries: 3,
      },
    })
    assert.strictEqual(calls.pushUserNotification.length, 1)
    assert.deepStrictEqual(calls.pushUserNotification[0], {
      store,
      userId: 'user-1',
      payload: {
        type: 'verify_success',
        title: '正版验证成功',
        message: '角色 steve 已通过正版验证',
        detail: {
          mcUsername: 'steve',
          mojangUuid: 'mojang-uuid-123',
          source: 'plugin_callback',
        },
      },
    })
  })

  it('subscribes to AUTH_VERIFY_FAILED and appends audit + pushes notification', async () => {
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: 'user-1',
      auditDetail: {
        mcUsername: 'steve',
        reason: 'premium_expired',
        source: 'plugin_callback',
        sessionId: 'session-fail',
        retryCount: 1,
        maxRetries: 3,
        conflictCode: 'plugin_verify_failed',
      },
    })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 1)
    assert.deepStrictEqual(calls.appendSecurityAudit[0], {
      store,
      userId: 'user-1',
      action: 'verify_failed',
      detail: {
        mcUsername: 'steve',
        reason: 'premium_expired',
        source: 'plugin_callback',
        sessionId: 'session-fail',
        retryCount: 1,
        maxRetries: 3,
        conflictCode: 'plugin_verify_failed',
      },
    })
    assert.strictEqual(calls.pushUserNotification.length, 1)
    assert.deepStrictEqual(calls.pushUserNotification[0], {
      store,
      userId: 'user-1',
      payload: {
        type: 'verify_failed',
        title: '正版验证失败',
        message: '角色 steve 验证失败：premium_expired',
        detail: {
          mcUsername: 'steve',
          reason: 'premium_expired',
          source: 'plugin_callback',
        },
      },
    })
  })

  it('falls back to default reason when AUTH_VERIFY_FAILED auditDetail.reason is missing', async () => {
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: 'user-1',
      auditDetail: {
        mcUsername: 'steve',
        source: 'plugin_callback',
      },
    })

    await waitForImmediate()

    assert.strictEqual(calls.pushUserNotification.length, 1)
    assert.strictEqual(
      calls.pushUserNotification[0].payload.message,
      '角色 steve 验证失败：verify_failed'
    )
    assert.strictEqual(calls.pushUserNotification[0].payload.detail.reason, undefined)
  })

  it('subscribes to SECURITY_ALERT_RAISED and appends security alert', async () => {
    const alertPayload = {
      username: 'Steve',
      type: 'impossible_travel',
      ip: '8.8.8.8',
      fingerprint: 'fp-1',
      asn: 'AS15169',
      location: 'US',
      isp: 'Google',
      riskScore: 85,
      riskLevel: 'high',
      deviceProfile: 'new_device',
      externalUserId: 'ext-1',
      source: 'plugin_callback',
    }

    bus.publish(Events.SECURITY_ALERT_RAISED, {
      store,
      targetUserId: 'user-1',
      alertPayload,
    })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAlert.length, 1)
    assert.deepStrictEqual(calls.appendSecurityAlert[0], {
      store,
      userId: 'user-1',
      level: 'high',
      title: '登录安全告警：impossible_travel',
      payload: alertPayload,
    })
  })

  it('subscribes to USER_BIND_EMAIL_COMPLETED and appends plugin_bind_email audit', async () => {
    bus.publish(Events.USER_BIND_EMAIL_COMPLETED, {
      store,
      userId: 'user-1',
      email: 'test@example.com',
      mcUsername: 'Steve',
      mcUuid: 'uuid-1',
      created: true,
    })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 1)
    assert.deepStrictEqual(calls.appendSecurityAudit[0], {
      store,
      userId: 'user-1',
      action: 'plugin_bind_email',
      detail: {
        email: 'test@example.com',
        mcUsername: 'Steve',
        mcUuid: 'uuid-1',
        created: true,
        source: 'plugin_callback',
      },
    })
  })

  it('falls back to 未知角色 when verify_success auditDetail.mcUsername is missing', async () => {
    bus.publish(Events.AUTH_VERIFY_COMPLETED, {
      store,
      userId: 'user-1',
      auditDetail: {
        mojangUuid: 'mojang-uuid-123',
        source: 'plugin_callback',
      },
    })

    await waitForImmediate()

    assert.strictEqual(calls.pushUserNotification.length, 1)
    assert.strictEqual(
      calls.pushUserNotification[0].payload.message,
      '角色 未知角色 已通过正版验证'
    )
  })

  it('falls back to 未知角色 when verify_failed auditDetail.mcUsername is missing', async () => {
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: 'user-1',
      auditDetail: {
        reason: 'premium_expired',
        source: 'plugin_callback',
      },
    })

    await waitForImmediate()

    assert.strictEqual(calls.pushUserNotification.length, 1)
    assert.strictEqual(
      calls.pushUserNotification[0].payload.message,
      '角色 未知角色 验证失败：premium_expired'
    )
  })

  it('ignores AUTH_LOGIN_SUCCESS when loginRow is missing', async () => {
    bus.publish(Events.AUTH_LOGIN_SUCCESS, { store })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 0)
  })

  it('ignores AUTH_VERIFY_COMPLETED when auditDetail is missing', async () => {
    bus.publish(Events.AUTH_VERIFY_COMPLETED, { store, userId: 'user-1' })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 0)
    assert.strictEqual(calls.pushUserNotification.length, 0)
  })

  it('ignores AUTH_VERIFY_FAILED when auditDetail is missing', async () => {
    bus.publish(Events.AUTH_VERIFY_FAILED, { store, userId: 'user-1' })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 0)
    assert.strictEqual(calls.pushUserNotification.length, 0)
  })

  it('ignores SECURITY_ALERT_RAISED when alertPayload is missing', async () => {
    bus.publish(Events.SECURITY_ALERT_RAISED, { store, targetUserId: 'user-1' })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAlert.length, 0)
  })

  it('ignores USER_BIND_EMAIL_COMPLETED when userId is missing', async () => {
    bus.publish(Events.USER_BIND_EMAIL_COMPLETED, {
      store,
      email: 'test@example.com',
      mcUsername: 'Steve',
      mcUuid: 'uuid-1',
      created: true,
    })

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 0)
  })

  it('handles null payload gracefully', async () => {
    bus.publish(Events.AUTH_LOGIN_SUCCESS, null)
    bus.publish(Events.AUTH_VERIFY_COMPLETED, null)
    bus.publish(Events.AUTH_VERIFY_FAILED, null)
    bus.publish(Events.SECURITY_ALERT_RAISED, null)
    bus.publish(Events.USER_BIND_EMAIL_COMPLETED, null)

    await waitForImmediate()

    assert.strictEqual(calls.appendSecurityAudit.length, 0)
    assert.strictEqual(calls.appendSecurityAlert.length, 0)
    assert.strictEqual(calls.pushUserNotification.length, 0)
  })

  it('does not publish any events', async () => {
    const publishedEvents = []
    const originalPublish = bus.publish.bind(bus)
    bus.publish = (event, payload) => {
      publishedEvents.push({ event, payload })
      return originalPublish(event, payload)
    }

    bus.publish(Events.AUTH_LOGIN_SUCCESS, {
      store,
      loginRow: { userId: 'user-1', username: 'Steve', method: 'microsoft' },
    })
    bus.publish(Events.AUTH_VERIFY_COMPLETED, {
      store,
      userId: 'user-1',
      auditDetail: { mcUsername: 'steve', mojangUuid: 'uuid' },
    })
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: 'user-1',
      auditDetail: { mcUsername: 'steve', reason: 'failed' },
    })
    bus.publish(Events.SECURITY_ALERT_RAISED, {
      store,
      targetUserId: 'user-1',
      alertPayload: { type: 'unknown', riskLevel: 'low' },
    })
    bus.publish(Events.USER_BIND_EMAIL_COMPLETED, {
      store,
      userId: 'user-1',
      email: 'a@b.com',
      mcUsername: 'steve',
      created: false,
    })

    await waitForImmediate()

    const handlerFailedEvents = publishedEvents.filter(
      (e) => e.event === Events.EVENT_HANDLER_FAILED
    )
    assert.strictEqual(handlerFailedEvents.length, 0)
    const forwarded = publishedEvents.filter((e) => e.event !== Events.EVENT_HANDLER_FAILED)
    assert.strictEqual(forwarded.length, 5)
    const emittedBySubscriber = forwarded.filter((e) => !Object.values(Events).includes(e.event))
    assert.strictEqual(emittedBySubscriber.length, 0)
  })
})
