import { Events } from '../events.js'

export function registerSecuritySubscriber(eventBus, deps) {
  const { appendSecurityAlert, appendSecurityAudit, scheduleSave } = deps
  eventBus.subscribe(Events.SECURITY_ALERT_RAISED, async (payload) => {
    if (payload?.store && payload?.alert) {
      appendSecurityAlert?.(payload.store, payload.alert)
      scheduleSave?.()
    }
  })
  eventBus.subscribe(Events.AUTH_VERIFY_FAILED, async (payload) => {
    if (payload?.store && payload?.userId) {
      appendSecurityAudit?.(payload.store, payload.userId, 'verify_failed', payload.detail || {})
      scheduleSave?.()
    }
  })
}
