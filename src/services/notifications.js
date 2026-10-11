import crypto from 'crypto'
import { markKvDirty } from '../db/storeKvSync.js'

/**
 * 确保 store 上有 userNotifications 对象
 */
export function ensureUserNotificationsStore(store) {
  if (!store.userNotifications || typeof store.userNotifications !== 'object') {
    store.userNotifications = {}
  }
  return store.userNotifications
}

/**
 * 向指定用户推送一条通知（最多保留 300 条）
 */
export function pushUserNotification(store, userId, payload) {
  const uid = String(userId || '').trim()
  if (!uid) return null
  const notifications = ensureUserNotificationsStore(store)
  const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
  const item = {
    id: crypto.randomUUID(),
    userId: uid,
    type: String(payload?.type || 'system'),
    title: String(payload?.title || '系统通知'),
    message: String(payload?.message || ''),
    detail: payload?.detail ?? null,
    createdAt: new Date().toISOString(),
    readAt: null,
  }
  list.unshift(item)
  if (list.length > 300) list.length = 300
  notifications[uid] = list
  markKvDirty('user_notifications')
  return item
}
