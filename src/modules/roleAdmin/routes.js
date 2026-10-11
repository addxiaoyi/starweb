import { replaceUserRoles } from '../../auth/roleManagement.js'
import { createAvatarUpload } from '../../upload.js'
import { banUser, unbanUser } from '../../auth/userStatus.js'
import { removeManagedAvatar, saveAvatar } from '../user/avatar.js'
import { applyUserProfilePatch } from '../user/profile.js'

const ROLE_ERROR = {
  user_not_found: { status: 404, message: '目标用户不存在' },
  self_role_change_forbidden: { status: 403, message: '不能修改自己的角色' },
  last_admin_protected: { status: 409, message: '不能移除最后一名管理员' },
  invalid_role: { status: 400, message: '角色列表无效' },
  superadmin_required: { status: 403, message: '仅超级管理员可以变更超级管理员权限' },
  confirmation_required: { status: 400, message: '请输入目标用户 ID 完成二次确认' },
  last_superadmin_protected: { status: 409, message: '不能移除最后一名超级管理员' },
  ban_reason_required: { status: 400, message: '请填写至少 3 个字符的封禁原因' },
  ban_reason_too_long: { status: 400, message: '封禁原因不能超过 500 个字符' },
}

function roleUser(user) {
  return {
    id: user.id,
    username: user.username,
    roles: user.roles,
    banned: user.banned === true || Boolean(user.bannedAt),
    bannedAt: user.bannedAt || null,
    banReason: user.banReason || null,
    bannedBy: user.bannedBy || null,
  }
}

export function registerRoleAdminRoutes(app, deps) {
  const {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    markUserProfileDirty,
    scheduleSave,
    appendSecurityAudit,
    createCredentialUser,
    ensureLocalUser,
    deleteCredentialUser,
    publicUser,
    asyncHandler,
    avatarUpload,
    uploadsDir,
    sessionCore,
  } = deps
  const avatarFileUpload = avatarUpload || createAvatarUpload()

  app.post('/api/admin/users', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonErr(res, 400, '请输入有效邮箱', 'invalid_email')
    }
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
      return jsonErr(res, 400, '用户名仅支持 3-32 位字母、数字和下划线', 'invalid_username')
    }
    if (password.length < 8) return jsonErr(res, 400, '初始密码至少 8 位', 'invalid_password')

    const store = getStore()
    const duplicate = store.users.some((user) =>
      String(user.email || '').trim().toLowerCase() === email
      || String(user.username || '').trim().toLowerCase() === username.toLowerCase())
    if (duplicate) return jsonErr(res, 409, '邮箱或用户名已存在', 'user_exists')

    const created = await createCredentialUser(email, password)
    if (created?.status !== 'OK' || !created.user) {
      const code = created?.status === 'EMAIL_ALREADY_EXISTS_ERROR' ? 'user_exists' : 'credential_create_failed'
      return jsonErr(res, code === 'user_exists' ? 409 : 502, code === 'user_exists' ? '邮箱已存在' : '登录账户创建失败', code)
    }
    const user = ensureLocalUser(created.user, { username })
    user.emailVerified = false
    markUserProfileDirty(user.id)
    appendSecurityAudit(store, req.user.id, 'user_created', { targetUserId: user.id, username, email })
    scheduleSave()
    return res.status(201).json({ ok: true, user: roleUser(user) })
  }))

  app.delete('/api/admin/users/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')
    if (String(req.body?.confirmation || '').trim() !== targetUserId) {
      return jsonErr(res, 400, '请输入目标用户 ID 完成二次确认', 'confirmation_required')
    }
    if (targetUserId === req.user.id) return jsonErr(res, 403, '不能删除自己的账户', 'self_delete_forbidden')

    const store = getStore()
    const index = store.users.findIndex((user) => user.id === targetUserId)
    if (index < 0) return jsonErr(res, 404, '目标用户不存在', 'user_not_found')
    const target = store.users[index]
    const targetRoles = Array.isArray(target.roles) ? target.roles : []
    const isTargetAdmin = targetRoles.some((role) => role === 'admin' || role === 'superadmin')
    const adminCount = store.users.filter((user) =>
      Array.isArray(user.roles) && user.roles.some((role) => role === 'admin' || role === 'superadmin')).length
    if (isTargetAdmin && adminCount <= 1) {
      return jsonErr(res, 409, '不能删除最后一名管理员', 'last_admin_protected')
    }
    if (targetRoles.includes('superadmin') && !Array.isArray(req.user.roles)) {
      return jsonErr(res, 403, '仅超级管理员可以删除超级管理员', 'superadmin_required')
    }
    if (targetRoles.includes('superadmin') && !req.user.roles.includes('superadmin')) {
      return jsonErr(res, 403, '仅超级管理员可以删除超级管理员', 'superadmin_required')
    }

    if (target.supertokensUserId) await deleteCredentialUser(target.supertokensUserId)
    store.users.splice(index, 1)
    appendSecurityAudit(store, req.user.id, 'user_deleted', {
      targetUserId,
      username: target.username,
      email: target.email,
    })
    scheduleSave()
    return jsonOk(res, { deletedUserId: targetUserId })
  }))

  app.post('/api/admin/users/:id/ban', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')
    if (String(req.body?.confirmation || '').trim() !== targetUserId) {
      return jsonErr(res, 400, '请输入目标用户 ID 完成二次确认', 'confirmation_required')
    }
    if (targetUserId === req.user.id) return jsonErr(res, 403, '不能封禁自己的账户', 'self_ban_forbidden')

    const store = getStore()
    const target = store.users.find((user) => user.id === targetUserId)
    if (!target) return jsonErr(res, 404, '目标用户不存在', 'user_not_found')
    const targetRoles = Array.isArray(target.roles) ? target.roles : []
    const operatorRoles = Array.isArray(req.user.roles) ? req.user.roles : []
    const targetIsElevated = targetRoles.includes('admin') || targetRoles.includes('superadmin')
    if (targetIsElevated && !operatorRoles.includes('superadmin')) {
      return jsonErr(res, 403, '仅超级管理员可以封禁管理员', 'admin_target_requires_superadmin')
    }

    const update = banUser(target, {
      reason: req.body?.reason,
      operatorId: req.user.id,
    })
    if (!update.ok) {
      const failure = ROLE_ERROR[update.code] || { status: 400, message: '封禁操作失败' }
      return jsonErr(res, failure.status, failure.message, update.code)
    }

    const handles = sessionCore && typeof sessionCore.getAllSessionHandlesForUser === 'function'
      ? await sessionCore.getAllSessionHandlesForUser(target.supertokensUserId || target.id)
      : []
    const activeHandles = Array.isArray(handles) ? handles.filter(Boolean) : []
    if (activeHandles.length && typeof sessionCore.revokeMultipleSessions === 'function') {
      await sessionCore.revokeMultipleSessions(activeHandles)
    }
    markUserProfileDirty(targetUserId)
    appendSecurityAudit(store, req.user.id, 'user_banned', {
      targetUserId,
      reason: target.banReason,
      revokedSessions: activeHandles.length,
    })
    scheduleSave()
    return jsonOk(res, { user: roleUser(target), revokedSessions: activeHandles.length })
  }))

  app.delete('/api/admin/users/:id/ban', requireUser, requireAdmin, (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')
    if (String(req.body?.confirmation || '').trim() !== targetUserId) {
      return jsonErr(res, 400, '请输入目标用户 ID 完成二次确认', 'confirmation_required')
    }
    if (targetUserId === req.user.id) return jsonErr(res, 403, '不能解除自己的账户封禁', 'self_unban_forbidden')

    const store = getStore()
    const target = store.users.find((user) => user.id === targetUserId)
    if (!target) return jsonErr(res, 404, '目标用户不存在', 'user_not_found')
    const targetRoles = Array.isArray(target.roles) ? target.roles : []
    const operatorRoles = Array.isArray(req.user.roles) ? req.user.roles : []
    const targetIsElevated = targetRoles.includes('admin') || targetRoles.includes('superadmin')
    if (targetIsElevated && !operatorRoles.includes('superadmin')) {
      return jsonErr(res, 403, '仅超级管理员可以解除管理员封禁', 'admin_target_requires_superadmin')
    }

    unbanUser(target)
    markUserProfileDirty(targetUserId)
    appendSecurityAudit(store, req.user.id, 'user_unbanned', { targetUserId })
    scheduleSave()
    return jsonOk(res, { user: roleUser(target) })
  })

  app.patch('/api/admin/users/:id/roles', requireUser, requireAdmin, (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')

    const store = getStore()
    const target = store.users.find((user) => user.id === targetUserId)
    const previousRoles = Array.isArray(target?.roles) ? [...target.roles] : ['user']
    const update = replaceUserRoles(store, req.user, targetUserId, req.body?.roles, {
      confirmation: req.body?.confirmation,
    })
    if (!update.ok) {
      const failure = ROLE_ERROR[update.code] || { status: 400, message: '角色更新失败' }
      return jsonErr(res, failure.status, failure.message, update.code)
    }

    markUserProfileDirty(targetUserId)
    appendSecurityAudit(store, req.user.id, 'user_roles_updated', {
      targetUserId,
      previousRoles,
      roles: update.roles,
    })
    scheduleSave()
    return jsonOk(res, { user: roleUser(target) })
  })

  app.patch('/api/admin/users/:id/profile', requireUser, requireAdmin, (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')

    const store = getStore()
    const target = store.users.find((user) => String(user.id) === targetUserId)
    if (!target) return jsonErr(res, 404, '目标用户不存在', 'user_not_found')
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar')) {
      return jsonErr(res, 400, '请通过图片上传更新头像', 'validation_error', { field: 'avatar' })
    }
    const result = applyUserProfilePatch(store, target, {
      displayName: req.body?.displayName,
      bio: req.body?.bio,
    }, { allowUsername: false })
    if (!result.ok) return jsonErr(res, result.status, result.message, result.code, result.details)

    markUserProfileDirty(targetUserId)
    appendSecurityAudit(store, req.user.id, 'user_profile_updated', {
      targetUserId,
      changes: result.changes,
    })
    scheduleSave()
    return jsonOk(res, { user: publicUser ? publicUser(target) : { ...roleUser(target), ...result.changes } })
  })

  app.post('/api/admin/users/:id/avatar', requireUser, requireAdmin, avatarFileUpload.single('file'), asyncHandler(async (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')

    const store = getStore()
    const target = store.users.find((user) => String(user.id) === targetUserId)
    if (!target) return jsonErr(res, 404, '目标用户不存在', 'user_not_found')
    if (!req.file) return jsonErr(res, 400, '请选择头像图片', 'validation_error', { field: 'file' })

    const previousAvatar = target.avatar
    const avatar = await saveAvatar(req.file, uploadsDir)
    if (!avatar) {
      return jsonErr(res, 400, '头像必须是 PNG、JPEG、WebP 或 GIF 图片', 'validation_error', { field: 'file' })
    }

    target.avatar = avatar
    await removeManagedAvatar(previousAvatar, uploadsDir)
    markUserProfileDirty(targetUserId)
    appendSecurityAudit(store, req.user.id, 'user_avatar_updated', { targetUserId })
    scheduleSave()
    return jsonOk(res, { user: publicUser ? publicUser(target) : { ...roleUser(target), avatar } })
  }))

  app.delete('/api/admin/users/:id/avatar', requireUser, requireAdmin, asyncHandler(async (req, res) => {
    const targetUserId = String(req.params.id || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少用户 ID', 'validation_error')

    const store = getStore()
    const target = store.users.find((user) => String(user.id) === targetUserId)
    if (!target) return jsonErr(res, 404, '目标用户不存在', 'user_not_found')

    const previousAvatar = target.avatar
    delete target.avatar
    await removeManagedAvatar(previousAvatar, uploadsDir)
    markUserProfileDirty(targetUserId)
    appendSecurityAudit(store, req.user.id, 'user_avatar_reset', { targetUserId })
    scheduleSave()
    return jsonOk(res, { user: { ...(publicUser ? publicUser(target) : roleUser(target)), avatar: null } })
  }))
}
