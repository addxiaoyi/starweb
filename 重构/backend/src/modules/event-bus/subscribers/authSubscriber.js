import crypto from 'crypto'
import { Events } from '../events.js'

function buildCallbackRecord(store, body, meta) {
  const event = String(body.event || '').trim()
  const vlaInbound = Boolean(meta?.vlaInbound)
  const receivedAt = String(meta?.receivedAt || new Date().toISOString())

  return {
    id: crypto.randomUUID(),
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
    appendLoginEvent,
    ensureSecurityCenter,
    computeLoginRisk,
    findUserByExternalUserId,
    failMcVerifySession,
    completeMcVerifySession,
    markUserProfileDirty,
    markKvDirty,
    scheduleSave,
  } = deps

  bus.subscribe(Events.PLUGIN_CALLBACK_RECEIVED, async (payload) => {
    const { store, body, meta } = payload || {}
    const event = String(body?.event || '').trim()

    const record = buildCallbackRecord(store, body, meta)

    if (!Array.isArray(store.authxEvents)) store.authxEvents = []
    store.authxEvents.unshift(record)
    if (store.authxEvents.length > 5000) {
      store.authxEvents.length = 5000
    }

    markKvDirty('authx_events')
    scheduleSave()

    // ── verify_premium ─────────────────────────────────────────────────────
    if (event === 'verify_premium') {
      const mcUsername = String(body.username || '').trim().toLowerCase()
      const mojangUuid = String(body.mojang_uuid || body.uuid || '').trim() || null
      const verified = body.verified === true || body.verified === 'true'

      if (mcUsername && (!verified || !mojangUuid)) {
        const u = store.users.find(
          (x) => x.linkedMcUsername && x.linkedMcUsername.toLowerCase() === mcUsername
        )
        if (u) {
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
        }
      } else if (mcUsername) {
        const u = store.users.find(
          (x) => x.linkedMcUsername && x.linkedMcUsername.toLowerCase() === mcUsername
        )
        if (u) {
          const completeResult = completeMcVerifySession(u.id, mojangUuid, { mcUsername })
          if (completeResult.ok) {
            if (mojangUuid) {
              u.linkedMcUuid = mojangUuid
              markUserProfileDirty(u.id)
            }
            const auditDetail = {
              mcUsername,
              mojangUuid,
              source: 'plugin_callback',
              sessionId: completeResult.session?.id || null,
              retryCount: Number(completeResult.session?.retries || 0),
              maxRetries: Number(completeResult.session?.maxRetries || 0),
            }
            console.info(`[starmc-api] 正版验证完成：${mcUsername} (uuid=${mojangUuid})，用户=${u.id}`)
            bus.publish(Events.AUTH_VERIFY_COMPLETED, {
              store,
              userId: u.id,
              auditDetail,
            })
          } else {
            const auditDetail = {
              mcUsername,
              source: 'plugin_callback',
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
      }
    }

    // ── verify_failed / verify_premium_failed ──────────────────────────────
    if (event === 'verify_failed' || event === 'verify_premium_failed') {
      const mcUsername = String(body.username || '').trim().toLowerCase()
      const reason = String(body.reason || body.error || 'verify_failed').trim().toLowerCase()
      if (mcUsername) {
        const u = store.users.find(
          (x) => x.linkedMcUsername && x.linkedMcUsername.toLowerCase() === mcUsername
        )
        if (u) {
          const failResult = failMcVerifySession(u.id, reason || 'verify_failed', {
            mcUsername,
            conflictCode: 'plugin_verify_failed',
          })
          if (failResult.ok) {
            const auditDetail = {
              mcUsername,
              reason: reason || 'verify_failed',
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
              reason: reason || 'verify_failed',
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
      }
    }

    // ── login_success ──────────────────────────────────────────────────────
    if (event === 'login_success') {
      const loginRow = appendLoginEvent(store, body)
      bus.publish(Events.AUTH_LOGIN_SUCCESS, {
        store,
        loginRow,
        source: 'plugin_callback',
      })
    }

    // ── security_alert ─────────────────────────────────────────────────────
    if (event === 'security_alert') {
      const externalUserId = String(body.external_user_id || '').trim()
      const linkedUser = externalUserId ? findUserByExternalUserId(store, externalUserId) : null
      const fallbackUser = !linkedUser && body.username
        ? store.users.find((user) => String(user?.linkedMcUsername || '').trim().toLowerCase() === String(body.username || '').trim().toLowerCase())
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
        riskScore: Number(body.risk_score || computed.riskScore) || computed.riskScore,
        riskLevel: String(body.risk_level || '').trim().toLowerCase() || computed.riskLevel,
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
  })
}

export { buildCallbackRecord }
