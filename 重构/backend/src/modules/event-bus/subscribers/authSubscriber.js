import { randomUUID } from 'node:crypto'
import { Events } from '../events.js'

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function findUserByLinkedMcUsername(store, mcUsername) {
  const needle = String(mcUsername || '').trim().toLowerCase()
  if (!needle) return null
  return store.users.find(
    (x) => x.linkedMcUsername && x.linkedMcUsername.toLowerCase() === needle
  ) || null
}

function buildCallbackRecord(store, body, meta) {
  const event = String(body.event || '').trim()
  const vlaInbound = Boolean(meta?.vlaInbound)
  const receivedAt = String(meta?.receivedAt || new Date().toISOString())

  return {
    id: randomUUID(),
    event,
    username: String(body.username || '').trim(),
    uuid: String(body.uuid || '').trim(),
    remoteAddress: String(meta?.remoteAddress || body?.remoteAddress || '').trim(),
    authMethod: String(body.method || body.authMethod || '').trim(),
    deviceFingerprint: String(body.fingerprint || body.deviceFingerprint || '').trim(),
    reason: String(body.reason || '').trim(),
    externalUserId: String(body.external_user_id || '').trim(),
    webhookSource: String(body.source || '').trim(),
    tsMs:
      body.ts_ms != null && Number.isFinite(Number(body.ts_ms)) ? Number(body.ts_ms) : null,
    adapter: vlaInbound ? 'vla' : 'authx',
    receivedAt,
  }
}

async function handleVerifyPremium(bus, deps, store, body) {
  const {
    failMcVerifySession,
    completeMcVerifySession,
    markUserProfileDirty,
    logger,
  } = deps

  const mcUsername = String(body.username || '').trim().toLowerCase()
  const mojangUuid = String(body.mojang_uuid || body.uuid || '').trim() || null
  const verified = body.verified === true || body.verified === 'true'

  if (!mcUsername) return

  const u = findUserByLinkedMcUsername(store, mcUsername)
  if (!u) return

  if (!verified || !mojangUuid) {
    const conflictCode = verified ? 'callback_missing_mojang_uuid' : 'callback_not_verified'
    const failResult = failMcVerifySession(u.id, 'verification_failed', {
      mcUsername,
      conflictCode,
    })
    const auditDetail = {
      mcUsername,
      source: 'plugin_callback',
      reason: verified ? 'missing_mojang_uuid' : 'not_verified',
      conflictCode: failResult?.session?.conflictCode || failResult?.code || conflictCode,
      event: 'verify_premium',
    }
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: u.id,
      auditDetail,
    })
    return
  }

  const completeResult = completeMcVerifySession(u.id, mojangUuid, { mcUsername })
  if (completeResult.ok) {
    u.linkedMcUuid = mojangUuid
    markUserProfileDirty(u.id)
    const auditDetail = {
      mcUsername,
      mojangUuid,
      source: 'plugin_callback',
      sessionId: completeResult.session?.id || null,
      retryCount: Number(completeResult.session?.retries || 0),
      maxRetries: Number(completeResult.session?.maxRetries || 0),
    }
    logger.info(`[starmc-api] 正版验证完成：${mcUsername} (uuid=${mojangUuid})，用户=${u.id}`)
    bus.publish(Events.AUTH_VERIFY_COMPLETED, {
      store,
      userId: u.id,
      auditDetail,
    })
  } else {
    const auditDetail = {
      mcUsername,
      source: 'plugin_callback',
      reason: 'verify_callback_conflict',
      conflictCode: completeResult?.code || 'unknown',
      event: 'verify_premium',
    }
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: u.id,
      auditDetail,
    })
  }
}

async function handleVerifyFailed(bus, deps, store, body) {
  const { failMcVerifySession } = deps
  const mcUsername = String(body.username || '').trim().toLowerCase()
  const reason = String(body.reason || body.error || 'verify_failed').trim().toLowerCase()

  if (!mcUsername) return

  const u = findUserByLinkedMcUsername(store, mcUsername)
  if (!u) return

  const failResult = failMcVerifySession(u.id, reason, {
    mcUsername,
    conflictCode: 'plugin_verify_failed',
  })
  if (failResult.ok) {
    const auditDetail = {
      mcUsername,
      reason,
      source: 'plugin_callback',
      sessionId: failResult.session?.id || null,
      retryCount: Number(failResult.session?.retries || 0),
      maxRetries: Number(failResult.session?.maxRetries || 0),
      conflictCode: failResult.session?.conflictCode || 'plugin_verify_failed',
    }
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: u.id,
      auditDetail,
    })
  } else {
    const auditDetail = {
      mcUsername,
      reason,
      source: 'plugin_callback',
      conflictCode: failResult?.code || 'unknown',
      event: 'verify_failed',
    }
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: u.id,
      auditDetail,
    })
  }
}

async function handleLoginSuccess(bus, deps, store, body) {
  const { appendLoginEvent } = deps
  const loginRow = appendLoginEvent(store, body)
  bus.publish(Events.AUTH_LOGIN_SUCCESS, {
    store,
    loginRow,
    source: 'plugin_callback',
  })
}

async function handleSecurityAlert(bus, deps, store, body) {
  const { findUserByExternalUserId, ensureSecurityCenter, computeLoginRisk } = deps
  const externalUserId = String(body.external_user_id || '').trim()
  const linkedUser = externalUserId ? findUserByExternalUserId(store, externalUserId) : null
  const fallbackUser = !linkedUser && body.username
    ? findUserByLinkedMcUsername(store, body.username)
    : null
  const targetUser = linkedUser || fallbackUser
  const targetUserId = targetUser?.id || externalUserId || 'anonymous'
  const computed = computeLoginRisk(ensureSecurityCenter(store), targetUserId, {
    fingerprint: body.fingerprint,
    ip: body.current_ip || body.ip,
    location: body.location,
    asn: body.asn,
  })
  const alertPayload = {
    username: String(body.username || '').trim() || null,
    type: String(body.type || '').trim() || 'unknown',
    ip: String(body.current_ip || body.ip || '').trim() || null,
    fingerprint: String(body.fingerprint || '').trim() || null,
    asn: String(body.asn || '').trim() || null,
    location: String(body.location || '').trim() || null,
    isp: String(body.isp || '').trim() || null,
    riskScore: body.risk_score != null ? Number(body.risk_score) : computed.riskScore,
    riskLevel: computed.riskLevel,
    deviceProfile: String(body.device_profile || '').trim() || computed.deviceProfile,
    externalUserId: externalUserId || null,
    source: 'plugin_callback',
  }
  bus.publish(Events.SECURITY_ALERT_RAISED, {
    store,
    targetUserId,
    alertPayload,
  })
}

/**
 * 注册 Auth 回调订阅器。
 *
 * 订阅 PLUGIN_CALLBACK_RECEIVED，将原始回调记录到 store.authxEvents，
 * 并根据 event 类型分发正版验证、登录、安全告警等业务逻辑，
 * 完成后发布对应的领域事件。
 *
 * @param {EventBus} bus
 * @param {object} deps
 */
export function registerAuthSubscriber(bus, deps) {
  const {
    markKvDirty,
    scheduleSave,
    logger = console,
  } = deps

  bus.subscribe(Events.PLUGIN_CALLBACK_RECEIVED, async (payload) => {
    if (!isPlainObject(payload)) {
      logger.warn('[auth-subscriber] invalid payload shape, expected plain object', { payload })
      return
    }

    const { store, body, meta } = payload
    if (!store) {
      logger.warn('[auth-subscriber] invalid payload: store is required', { payload })
      return
    }
    if (!isPlainObject(body)) {
      logger.warn('[auth-subscriber] invalid body shape, expected plain object', { body })
      return
    }

    const event = String(body.event || '').trim()
    if (!event) {
      logger.warn('[auth-subscriber] invalid body: event must be a non-empty string', { body })
      return
    }

    const record = buildCallbackRecord(store, body, meta)

    if (!Array.isArray(store.authxEvents)) store.authxEvents = []
    store.authxEvents.unshift(record)
    if (store.authxEvents.length > 5000) {
      store.authxEvents.length = 5000
    }

    markKvDirty('authx_events')
    scheduleSave()

    if (event === 'verify_premium') {
      await handleVerifyPremium(bus, deps, store, body)
    }

    if (event === 'verify_failed' || event === 'verify_premium_failed') {
      await handleVerifyFailed(bus, deps, store, body)
    }

    if (event === 'login_success') {
      await handleLoginSuccess(bus, deps, store, body)
    }

    if (event === 'security_alert') {
      await handleSecurityAlert(bus, deps, store, body)
    }
  })
}

export { buildCallbackRecord }
