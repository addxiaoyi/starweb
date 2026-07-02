import crypto from 'crypto'

/**
 * 处理插件 AuthX 回调的业务逻辑。
 *
 * 不依赖 Express 的 req/res，只操作 store 并返回副作用描述，
 * 实际副作用通过 deps 传入的函数执行，以保持与原有实现一致。
 *
 * @param {object} store
 * @param {object} body 解析后的 JSON payload
 * @param {object} meta
 * @param {boolean} meta.vlaInbound
 * @param {string} meta.remoteAddress 真实请求 IP，优先级高于 body.remoteAddress
 * @param {string} meta.receivedAt
 * @param {object} meta.deps 由 server.js 注入的副作用函数集合
 * @returns {{ record: object, sideEffects: object[] }}
 */
export function handlePluginCallback(store, body, meta) {
  const deps = meta?.deps || {}
  const event = String(body.event || '').trim()
  const vlaInbound = Boolean(meta?.vlaInbound)
  const receivedAt = String(meta?.receivedAt || new Date().toISOString())

  const record = {
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

  if (!Array.isArray(store.authxEvents)) store.authxEvents = []
  store.authxEvents.unshift(record)
  if (store.authxEvents.length > 5000) {
    store.authxEvents.length = 5000
  }

  const sideEffects = []

  deps.markKvDirty('authx_events')
  sideEffects.push({ type: 'mark_kv_dirty', key: 'authx_events' })

  // ── verify_premium ───────────────────────────────────────────────────────
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
        const failResult = deps.failMcVerifySession(u.id, 'verification_failed', {
          mcUsername,
          conflictCode,
        })
        const auditDetail = {
          mcUsername,
          source: 'plugin_callback',
          reason: verified ? 'missing_mojang_uuid' : 'not_verified',
          conflictCode: failResult?.session?.conflictCode || failResult?.code || 'callback_not_verified',
          event: 'verify_premium',
        }
        deps.appendSecurityAudit(store, u.id, 'verify_failed', auditDetail)
        sideEffects.push({ type: 'audit', userId: u.id, action: 'verify_failed', detail: auditDetail })
      }
    } else if (mcUsername) {
      const u = store.users.find(
        (x) => x.linkedMcUsername && x.linkedMcUsername.toLowerCase() === mcUsername
      )
      if (u) {
        const completeResult = deps.completeMcVerifySession(u.id, mojangUuid, { mcUsername })
        if (completeResult.ok) {
          if (mojangUuid) {
            u.linkedMcUuid = mojangUuid
            deps.markUserProfileDirty(u.id)
            sideEffects.push({ type: 'mark_profile_dirty', userId: u.id })
          }
          const auditDetail = {
            mcUsername,
            mojangUuid,
            source: 'plugin_callback',
            sessionId: completeResult.session?.id || null,
            retryCount: Number(completeResult.session?.retries || 0),
            maxRetries: Number(completeResult.session?.maxRetries || 0),
          }
          deps.appendSecurityAudit(store, u.id, 'verify_success', auditDetail)
          sideEffects.push({ type: 'audit', userId: u.id, action: 'verify_success', detail: auditDetail })
          const notificationPayload = {
            type: 'verify_success',
            title: '正版验证成功',
            message: `角色 ${mcUsername} 已通过正版验证`,
            detail: {
              mcUsername,
              mojangUuid,
              source: 'plugin_callback',
            },
          }
          deps.pushUserNotification(store, u.id, notificationPayload)
          sideEffects.push({ type: 'notification', userId: u.id, payload: notificationPayload })
          deps.scheduleSave()
          console.info(`[starmc-api] 正版验证完成：${mcUsername} (uuid=${mojangUuid})，用户=${u.id}`)
          sideEffects.push({ type: 'save' })
        } else {
          const auditDetail = {
            mcUsername,
            source: 'plugin_callback',
            conflictCode: completeResult?.code || 'unknown',
            event: 'verify_premium',
          }
          deps.appendSecurityAudit(store, u.id, 'verify_callback_conflict', auditDetail)
          sideEffects.push({ type: 'audit', userId: u.id, action: 'verify_callback_conflict', detail: auditDetail })
        }
      }
    }
  }

  // ── verify_failed / verify_premium_failed ────────────────────────────────
  if (event === 'verify_failed' || event === 'verify_premium_failed') {
    const mcUsername = String(body.username || '').trim().toLowerCase()
    const reason = String(body.reason || body.error || 'verify_failed').trim().toLowerCase()
    if (mcUsername) {
      const u = store.users.find(
        (x) => x.linkedMcUsername && x.linkedMcUsername.toLowerCase() === mcUsername
      )
      if (u) {
        const failResult = deps.failMcVerifySession(u.id, reason || 'verify_failed', {
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
          deps.appendSecurityAudit(store, u.id, 'verify_failed', auditDetail)
          sideEffects.push({ type: 'audit', userId: u.id, action: 'verify_failed', detail: auditDetail })
          const notificationPayload = {
            type: 'verify_failed',
            title: '正版验证失败',
            message: `角色 ${mcUsername} 验证失败：${reason || 'verify_failed'}`,
            detail: {
              mcUsername,
              reason: reason || 'verify_failed',
              source: 'plugin_callback',
            },
          }
          deps.pushUserNotification(store, u.id, notificationPayload)
          sideEffects.push({ type: 'notification', userId: u.id, payload: notificationPayload })
        } else {
          const auditDetail = {
            mcUsername,
            reason: reason || 'verify_failed',
            source: 'plugin_callback',
            conflictCode: failResult?.code || 'unknown',
            event: 'verify_failed',
          }
          deps.appendSecurityAudit(store, u.id, 'verify_callback_conflict', auditDetail)
          sideEffects.push({ type: 'audit', userId: u.id, action: 'verify_callback_conflict', detail: auditDetail })
        }
      }
    }
  }

  // ── login_success ────────────────────────────────────────────────────────
  if (event === 'login_success') {
    const loginRow = deps.appendLoginEvent(store, body)
    const auditDetail = {
      username: loginRow.username,
      uuid: loginRow.uuid,
      method: loginRow.method,
      ip: loginRow.ip,
      location: loginRow.location,
      asn: loginRow.asn,
      riskScore: loginRow.riskScore,
      riskLevel: loginRow.riskLevel,
      deviceProfile: loginRow.deviceProfile,
      externalUserId: loginRow.externalUserId,
      source: 'plugin_callback',
    }
    deps.appendSecurityAudit(store, loginRow.userId, 'login_success', auditDetail)
    sideEffects.push({ type: 'audit', userId: loginRow.userId, action: 'login_success', detail: auditDetail })
  }

  // ── security_alert ───────────────────────────────────────────────────────
  if (event === 'security_alert') {
    const externalUserId = String(body.external_user_id || '').trim()
    const linkedUser = externalUserId ? deps.findUserByExternalUserId(store, externalUserId) : null
    const fallbackUser = !linkedUser && body.username
      ? store.users.find((user) => String(user?.linkedMcUsername || '').trim().toLowerCase() === String(body.username || '').trim().toLowerCase())
      : null
    const targetUser = linkedUser || fallbackUser
    const targetUserId = targetUser?.id || externalUserId || 'anonymous'
    const computed = deps.computeLoginRisk(deps.ensureSecurityCenter(store), targetUserId, {
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
    deps.appendSecurityAlert(store, targetUserId, computed.riskLevel, `登录安全告警：${String(body.type || 'unknown')}`, alertPayload)
    sideEffects.push({ type: 'security_alert', userId: targetUserId, level: computed.riskLevel, title: `登录安全告警：${String(body.type || 'unknown')}`, payload: alertPayload })
  }

  deps.scheduleSave()
  sideEffects.push({ type: 'save' })

  return { record, sideEffects }
}
