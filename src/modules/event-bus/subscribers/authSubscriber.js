import { Events } from '../events.js'

export function registerAuthSubscriber(eventBus, deps) {
  const {
    appendLoginEvent,
    appendSecurityAudit,
    scheduleSave,
    logger,
  } = deps

  eventBus.subscribe(Events.AUTH_LOGIN_SUCCESS, async (payload) => {
    if (payload?.loginRow) {
      logger?.info?.('[auth-subscriber] login success', payload.loginRow.username)
    } else if (typeof appendLoginEvent === 'function') {
      appendLoginEvent(payload?.store, payload?.event || payload)
    }
    scheduleSave?.()
  })

  eventBus.subscribe(Events.AUTH_LOGIN_FAILED, async (payload) => {
    const row = payload?.loginRow
    if (payload?.store && row?.userId) {
      appendSecurityAudit?.(payload.store, row.userId, 'login_failed', {
        username: row.username,
        method: row.method,
        ip: row.ip,
        failureReason: row.failureReason || row.reason,
        source: payload.source || 'plugin_callback',
      })
    }
    scheduleSave?.()
    logger?.info?.('[auth-subscriber] login failed', row?.username)
  })

  eventBus.subscribe(Events.AUTH_VERIFY_COMPLETED, async (payload) => {
    if (payload?.store && payload?.userId) {
      appendSecurityAudit?.(payload.store, payload.userId, 'verify_success', payload.event || payload.detail || {})
      scheduleSave?.()
    }
  })
}
