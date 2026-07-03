import { Events } from '../events.js'

/**
 * 注册安全审计/告警/通知订阅器。
 *
 * 订阅各类领域事件，将安全审计、告警和用户通知写入 store，
 * 本身不发布新的事件。
 *
 * @param {EventBus} bus
 * @param {object} deps
 * @param {Function} deps.appendSecurityAudit
 * @param {Function} deps.appendSecurityAlert
 * @param {Function} deps.pushUserNotification
 */
export function registerSecuritySubscriber(bus, deps) {
  const { appendSecurityAudit, appendSecurityAlert, pushUserNotification } = deps

  bus.subscribe(Events.AUTH_LOGIN_SUCCESS, (payload) => {
    const { store, loginRow } = payload || {}
    appendSecurityAudit(store, loginRow.userId, 'login_success', {
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
    })
  })

  bus.subscribe(Events.AUTH_VERIFY_COMPLETED, (payload) => {
    const { store, userId, auditDetail } = payload || {}
    appendSecurityAudit(store, userId, 'verify_success', auditDetail)
    pushUserNotification(store, userId, {
      type: 'verify_success',
      title: '正版验证成功',
      message: `角色 ${auditDetail.mcUsername} 已通过正版验证`,
      detail: {
        mcUsername: auditDetail.mcUsername,
        mojangUuid: auditDetail.mojangUuid,
        source: 'plugin_callback',
      },
    })
  })

  bus.subscribe(Events.AUTH_VERIFY_FAILED, (payload) => {
    const { store, userId, auditDetail } = payload || {}
    appendSecurityAudit(store, userId, 'verify_failed', auditDetail)
    pushUserNotification(store, userId, {
      type: 'verify_failed',
      title: '正版验证失败',
      message: `角色 ${auditDetail.mcUsername} 验证失败：${auditDetail.reason || 'verify_failed'}`,
      detail: {
        mcUsername: auditDetail.mcUsername,
        reason: auditDetail.reason,
        source: 'plugin_callback',
      },
    })
  })

  bus.subscribe(Events.SECURITY_ALERT_RAISED, (payload) => {
    const { store, targetUserId, alertPayload } = payload || {}
    appendSecurityAlert(
      store,
      targetUserId,
      alertPayload.riskLevel,
      `登录安全告警：${alertPayload.type || 'unknown'}`,
      alertPayload
    )
  })

  bus.subscribe(Events.USER_BIND_EMAIL_COMPLETED, (payload) => {
    const { store, userId, email, mcUsername, created } = payload || {}
    appendSecurityAudit(store, userId, 'plugin_bind_email', {
      email,
      mcUsername,
      created,
      source: 'plugin_callback',
    })
  })
}
