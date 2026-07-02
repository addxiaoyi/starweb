import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { handlePluginCallback } from '../../../../src/modules/plugin-gateway/callbackService.js'

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
    appendSecurityAudit: [],
    appendSecurityAlert: [],
    pushUserNotification: [],
    findUserByExternalUserId: [],
    computeLoginRisk: [],
    ensureSecurityCenter: [],
  }

  const deps = {
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
    appendSecurityAudit: (store, userId, action, detail) => {
      calls.appendSecurityAudit.push({ userId, action, detail })
    },
    appendSecurityAlert: (store, userId, level, title, payload) => {
      calls.appendSecurityAlert.push({ userId, level, title, payload })
    },
    pushUserNotification: (store, userId, payload) => {
      calls.pushUserNotification.push({ userId, payload })
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

describe('plugin-gateway callbackService', () => {
  describe('handlePluginCallback', () => {
    let store
    let user

    beforeEach(() => {
      user = createUser()
      store = createStore({ users: [user] })
    })

    it('records the authx event and returns its id', async () => {
      const { deps } = makeDeps()
      const result = handlePluginCallback(store, { event: 'unknown' }, { vlaInbound: false, deps })

      assert.strictEqual(store.authxEvents.length, 1)
      assert.strictEqual(store.authxEvents[0].event, 'unknown')
      assert.strictEqual(result.record.event, 'unknown')
      assert.strictEqual(result.record.adapter, 'authx')
      assert.ok(result.record.id)
      assert.ok(result.record.receivedAt)
    })

    it('prefers meta.remoteAddress over body.remoteAddress', async () => {
      const { deps } = makeDeps()
      const body = { event: 'unknown', remoteAddress: '1.2.3.4' }
      const result = handlePluginCallback(store, body, {
        vlaInbound: false,
        remoteAddress: '5.6.7.8',
        deps,
      })

      assert.strictEqual(result.record.remoteAddress, '5.6.7.8')
      assert.strictEqual(store.authxEvents[0].remoteAddress, '5.6.7.8')
    })

    it('verify_premium success completes verification and notifies the user', async () => {
      const { deps, calls } = makeDeps()
      const body = {
        event: 'verify_premium',
        username: 'Steve',
        mojang_uuid: 'mojang-uuid-123',
        verified: true,
      }

      const result = handlePluginCallback(store, body, { vlaInbound: true, deps })

      assert.strictEqual(result.record.event, 'verify_premium')
      assert.strictEqual(result.record.adapter, 'vla')
      assert.strictEqual(calls.completeMcVerifySession.length, 1)
      assert.deepStrictEqual(calls.completeMcVerifySession[0], { userId: 'user-1', mojangUuid: 'mojang-uuid-123', options: { mcUsername: 'steve' } })
      assert.strictEqual(store.users[0].linkedMcUuid, 'mojang-uuid-123')
      assert.deepStrictEqual(calls.markUserProfileDirty, ['user-1'])
      assert.strictEqual(calls.appendSecurityAudit.filter((x) => x.action === 'verify_success').length, 1)
      const successAudit = calls.appendSecurityAudit.find((x) => x.action === 'verify_success')
      assert.strictEqual(successAudit.detail.mcUsername, 'steve')
      assert.strictEqual(successAudit.detail.mojangUuid, 'mojang-uuid-123')
      assert.strictEqual(successAudit.detail.source, 'plugin_callback')
      assert.strictEqual(calls.pushUserNotification.length, 1)
      assert.strictEqual(calls.pushUserNotification[0].payload.type, 'verify_success')
    })

    it('verify_premium fails when mojang uuid is missing', async () => {
      const { deps, calls } = makeDeps()
      const body = {
        event: 'verify_premium',
        username: 'Steve',
        verified: true,
      }

      const result = handlePluginCallback(store, body, { vlaInbound: false, deps })

      assert.strictEqual(result.record.event, 'verify_premium')
      assert.strictEqual(calls.failMcVerifySession.length, 1)
      assert.strictEqual(calls.failMcVerifySession[0].detail.conflictCode, 'callback_missing_mojang_uuid')
      assert.strictEqual(calls.appendSecurityAudit.filter((x) => x.action === 'verify_failed').length, 1)
      const failAudit = calls.appendSecurityAudit.find((x) => x.action === 'verify_failed')
      assert.strictEqual(failAudit.detail.reason, 'missing_mojang_uuid')
      assert.strictEqual(calls.pushUserNotification.length, 0)
      assert.strictEqual(calls.completeMcVerifySession.length, 0)
    })

    it('verify_premium fails when verified is false', async () => {
      const { deps, calls } = makeDeps()
      const body = {
        event: 'verify_premium',
        username: 'Steve',
        mojang_uuid: 'mojang-uuid-123',
        verified: false,
      }

      handlePluginCallback(store, body, { vlaInbound: false, deps })

      assert.strictEqual(calls.failMcVerifySession.length, 1)
      assert.strictEqual(calls.failMcVerifySession[0].detail.conflictCode, 'callback_not_verified')
      const failAudit = calls.appendSecurityAudit.find((x) => x.action === 'verify_failed')
      assert.strictEqual(failAudit.detail.reason, 'not_verified')
      assert.strictEqual(calls.completeMcVerifySession.length, 0)
    })

    it('login_success writes a login event and audit log', async () => {
      const { deps, calls } = makeDeps()
      const body = {
        event: 'login_success',
        username: 'Steve',
        external_user_id: 'user-1',
        method: 'microsoft',
        ip: '8.8.8.8',
      }

      const result = handlePluginCallback(store, body, { vlaInbound: false, deps })

      assert.strictEqual(result.record.event, 'login_success')
      assert.strictEqual(calls.appendLoginEvent.length, 1)
      assert.deepStrictEqual(calls.appendLoginEvent[0].payload, body)
      assert.strictEqual(calls.appendSecurityAudit.filter((x) => x.action === 'login_success').length, 1)
      const loginAudit = calls.appendSecurityAudit.find((x) => x.action === 'login_success')
      assert.strictEqual(loginAudit.userId, 'user-1')
      assert.strictEqual(loginAudit.detail.username, 'Steve')
      assert.strictEqual(loginAudit.detail.source, 'plugin_callback')
    })


    it('security_alert appends a security alert', async () => {
      const { deps, calls } = makeDeps()
      const body = {
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
      }

      const result = handlePluginCallback(store, body, { vlaInbound: false, deps })

      assert.strictEqual(result.record.event, 'security_alert')
      assert.strictEqual(calls.appendSecurityAlert.length, 1)
      const alert = calls.appendSecurityAlert[0]
      assert.strictEqual(alert.userId, 'user-1')
      assert.strictEqual(alert.level, 'low')
      assert.strictEqual(alert.title, '登录安全告警：impossible_travel')
      assert.strictEqual(alert.payload.username, 'Steve')
      assert.strictEqual(alert.payload.type, 'impossible_travel')
      assert.strictEqual(alert.payload.ip, '8.8.8.8')
      assert.strictEqual(alert.payload.fingerprint, 'fp-1')
      assert.strictEqual(alert.payload.asn, 'AS15169')
      assert.strictEqual(alert.payload.location, 'US')
      assert.strictEqual(alert.payload.isp, 'Google')
      assert.strictEqual(alert.payload.riskScore, 85)
      assert.strictEqual(alert.payload.riskLevel, 'high')
      assert.strictEqual(alert.payload.deviceProfile, 'new_device')
      assert.strictEqual(alert.payload.externalUserId, 'user-1')
      assert.strictEqual(alert.payload.source, 'plugin_callback')
    })

    it('verify_failed fails the MC verify session and audits', async () => {
      const { deps, calls } = makeDeps()
      const body = {
        event: 'verify_failed',
        username: 'Steve',
        reason: 'premium_expired',
      }

      const result = handlePluginCallback(store, body, { vlaInbound: false, deps })

      assert.strictEqual(result.record.event, 'verify_failed')
      assert.strictEqual(calls.failMcVerifySession.length, 1)
      assert.strictEqual(calls.failMcVerifySession[0].userId, 'user-1')
      assert.strictEqual(calls.failMcVerifySession[0].reason, 'premium_expired')
      assert.strictEqual(calls.failMcVerifySession[0].detail.conflictCode, 'plugin_verify_failed')
      assert.strictEqual(calls.appendSecurityAudit.filter((x) => x.action === 'verify_failed').length, 1)
      const audit = calls.appendSecurityAudit.find((x) => x.action === 'verify_failed')
      assert.strictEqual(audit.detail.mcUsername, 'steve')
      assert.strictEqual(audit.detail.reason, 'premium_expired')
      assert.strictEqual(audit.detail.source, 'plugin_callback')
      assert.strictEqual(audit.detail.conflictCode, 'plugin_verify_failed')
      assert.strictEqual(calls.pushUserNotification.length, 1)
      assert.strictEqual(calls.pushUserNotification[0].payload.type, 'verify_failed')
    })

    it('unknown event returns the record without business side effects', async () => {
      const { deps, calls } = makeDeps()
      const body = { event: 'custom_event', username: 'Steve' }

      const result = handlePluginCallback(store, body, { vlaInbound: false, deps })

      assert.strictEqual(result.record.event, 'custom_event')
      assert.strictEqual(calls.failMcVerifySession.length, 0)
      assert.strictEqual(calls.completeMcVerifySession.length, 0)
      assert.strictEqual(calls.appendLoginEvent.length, 0)
      assert.strictEqual(calls.appendSecurityAudit.length, 0)
      assert.strictEqual(calls.appendSecurityAlert.length, 0)
      assert.strictEqual(calls.pushUserNotification.length, 0)
      assert.strictEqual(calls.markUserProfileDirty.length, 0)
    })
  })
})
