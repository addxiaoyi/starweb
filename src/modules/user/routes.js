import crypto from 'node:crypto'
import { createAvatarUpload } from '../../upload.js'
import { removeManagedAvatar, saveAvatar } from './avatar.js'
import { applyUserProfilePatch } from './profile.js'

const CHECK_IN_REWARD = 1
const TICKET_CATEGORIES = new Set(['account', 'game', 'skin', 'payment', 'other'])
export function registerUserRoutes(app, deps) {
  const {
    requireUser,
    getStore,
    jsonErr,
    jsonOk,
    scheduleSave,
    markUserProfileDirty,
    publicUser,
    buildUserCenterSummary,
    buildPermissionMatrix,
    ensureUserNotificationsStore,
    resolvePaginationQuery,
    jsonPage,
    avatarUpload,
    uploadsDir,
  } = deps
  const avatarFileUpload = avatarUpload || createAvatarUpload()

  app.get('/api/user/me', requireUser, (req, res) => {
    const u = req.user
    if (u) {
      markUserProfileDirty(u.id)
      scheduleSave()
    }
    const user = { ...publicUser(u), accountSetupRequired: req.accountSetupRequired === true }
    jsonOk(res, { ...user, user })
  })

  // ── PATCH /api/user/me — 更新用户资料 ──────────────────────
  app.patch('/api/user/me', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar')) {
      return jsonErr(res, 400, '请通过图片上传更新头像', 'validation_error', { field: 'avatar' })
    }

    const result = applyUserProfilePatch(store, u, req.body)
    if (!result.ok) return jsonErr(res, result.status, result.message, result.code, result.details)

    markUserProfileDirty(u.id)
    scheduleSave()
    jsonOk(res, { user: publicUser(u), changes: result.changes })
  })

  app.post('/api/user/avatar', requireUser, avatarFileUpload.single('file'), async (req, res) => {
    const store = getStore()
    const user = store.users.find((row) => row.id === req.user.id)
    if (!user) return jsonErr(res, 404, '用户不存在', 'not_found')
    if (!req.file) return jsonErr(res, 400, '请选择头像图片', 'validation_error', { field: 'file' })

    const previousAvatar = user.avatar
    const avatar = await saveAvatar(req.file, uploadsDir)
    if (!avatar) {
      return jsonErr(res, 400, '头像必须是 PNG、JPEG、WebP 或 GIF 图片', 'validation_error', { field: 'file' })
    }

    user.avatar = avatar
    await removeManagedAvatar(previousAvatar, uploadsDir)
    markUserProfileDirty(user.id)
    scheduleSave()
    return jsonOk(res, { user: publicUser(user), avatar })
  })

  app.delete('/api/user/avatar', requireUser, async (req, res) => {
    const store = getStore()
    const user = store.users.find((row) => row.id === req.user.id)
    if (!user) return jsonErr(res, 404, '用户不存在', 'not_found')

    const previousAvatar = user.avatar
    delete user.avatar
    await removeManagedAvatar(previousAvatar, uploadsDir)
    markUserProfileDirty(user.id)
    scheduleSave()
    return jsonOk(res, { user: { ...publicUser(user), avatar: null } })
  })

  app.post('/api/user/checkin', requireUser, (req, res) => {
    const store = getStore()
    const user = store.users.find((row) => row.id === req.user.id)
    if (!user) return jsonErr(res, 404, '用户不存在', 'not_found')

    const today = new Date().toISOString().slice(0, 10)
    const last = user.lastCheckIn ? new Date(user.lastCheckIn) : null
    const lastDay = last && Number.isFinite(last.getTime()) ? last.toISOString().slice(0, 10) : null
    if (lastDay === today) {
      return jsonErr(res, 409, '今天已经签到过了', 'already_checked_in')
    }

    user.balance = Math.round((Number(user.balance || 0) + CHECK_IN_REWARD) * 10) / 10
    user.lastCheckIn = new Date().toISOString()
    if (!Array.isArray(store.checkInLogs)) store.checkInLogs = []
    store.checkInLogs.unshift({ id: crypto.randomUUID(), userId: user.id, reward: CHECK_IN_REWARD, createdAt: user.lastCheckIn })
    markUserProfileDirty(user.id)
    scheduleSave()
    jsonOk(res, { reward: CHECK_IN_REWARD, balance: user.balance, message: `签到成功，获得 ${CHECK_IN_REWARD.toFixed(1)} SC` })
  })

  app.get('/api/user/tickets', requireUser, (req, res) => {
    const store = getStore()
    const items = (Array.isArray(store.supportTickets) ? store.supportTickets : [])
      .filter((ticket) => ticket.userId === req.user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    jsonOk(res, { items })
  })

  app.post('/api/user/tickets', requireUser, (req, res) => {
    const subject = String(req.body?.subject || '').trim()
    const category = String(req.body?.category || 'other').trim().toLowerCase()
    const message = String(req.body?.message || '').trim()
    if (subject.length < 2 || subject.length > 80) {
      return jsonErr(res, 400, '工单主题需为 2-80 个字符', 'validation_error', { field: 'subject' })
    }
    if (!TICKET_CATEGORIES.has(category)) {
      return jsonErr(res, 400, '工单分类无效', 'validation_error', { field: 'category' })
    }
    if (message.length < 10 || message.length > 4000) {
      return jsonErr(res, 400, '问题描述需为 10-4000 个字符', 'validation_error', { field: 'message' })
    }

    const store = getStore()
    if (!Array.isArray(store.supportTickets)) store.supportTickets = []
    const ticket = {
      id: crypto.randomUUID(), userId: req.user.id, subject, category, message,
      status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    store.supportTickets.unshift(ticket)
    scheduleSave()
    jsonOk(res, { ticket })
  })

  // ── GET /api/user/notifications — 获取用户通知列表（分页） ──
  app.get('/api/user/notifications', requireUser, (req, res) => {
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const list = Array.isArray(notifications[req.user.id]) ? notifications[req.user.id] : []
    const pg = resolvePaginationQuery(req.query, { defaultPageSize: 20, maxPageSize: 100 })
    const slice = list.slice(pg.offset, pg.offset + pg.pageSize)
    jsonPage(res, slice, list.length, pg)
  })

  // ── POST /api/user/notifications/:id/read — 标记通知已读 ──
  app.post('/api/user/notifications/:id/read', requireUser, (req, res) => {
    const nid = String(req.params.id || '').trim()
    if (!nid) return jsonErr(res, 400, '缺少通知 ID', 'validation_error')

    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const list = Array.isArray(notifications[req.user.id]) ? notifications[req.user.id] : []
    const item = list.find((n) => String(n.id) === nid)
    if (!item) return jsonErr(res, 404, '通知不存在', 'not_found')
    if (!item.readAt) {
      item.readAt = new Date().toISOString()
      scheduleSave()
    }
    jsonOk(res, { notification: item })
  })

  // ── GET /api/user/notifications/unread-count — 未读通知数 ──
  app.get('/api/user/notifications/unread-count', requireUser, (req, res) => {
    const store = getStore()
    const notifications = ensureUserNotificationsStore(store)
    const list = Array.isArray(notifications[req.user.id]) ? notifications[req.user.id] : []
    const count = list.filter((n) => !n.readAt).length
    jsonOk(res, { count })
  })

  app.get('/api/user/center/summary', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    const summary = buildUserCenterSummary(store, u)
    jsonOk(res, {
      user: publicUser(u),
      ...summary,
    })
  })

  app.get('/api/user/permissions', requireUser, (req, res) => {
    res.json({
      ok: true,
      ...buildPermissionMatrix(req.user)
    })
  })
}
