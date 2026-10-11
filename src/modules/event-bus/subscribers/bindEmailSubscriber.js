import { Events } from '../events.js'

export function registerBindEmailSubscriber(eventBus, deps) {
  const { appendSecurityAudit, pushUserNotification, scheduleSave } = deps
  eventBus.subscribe(Events.USER_BIND_EMAIL_COMPLETED, async (payload) => {
    if (payload?.store && payload?.userId) {
      appendSecurityAudit?.(payload.store, payload.userId, 'bind_email', payload.detail || {})
      pushUserNotification?.(payload.store, payload.userId, {
        type: 'bind_email',
        title: '邮箱绑定完成',
        message: '游戏账号邮箱绑定已同步',
      })
      scheduleSave?.()
    }
  })
}
