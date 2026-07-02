/** 插件邮箱绑定业务错误 */
export class PluginBindEmailError extends Error {
  constructor(code, status = 400, payload = {}) {
    super(code)
    this.code = code
    this.status = status
    this.payload = payload
  }
}

/**
 * 处理插件 AuthX bind-email 回调。
 *
 * 所有副作用通过 `deps` 注入，便于单元测试与路由层保持薄。
 *
 * @param {object} store
 * @param {object} body 解析后的 JSON payload
 * @param {object} deps
 * @param {Function} deps.isValidEmailAddress
 * @param {Function} deps.findUserByLinkedMcUsername
 * @param {Function} deps.ensureSiteUserForPluginEmail
 * @param {Function} deps.vlaLinkExternalUser
 * @param {Function} deps.vlaAdminBindEmail
 * @param {Function} deps.markUserProfileDirty
 * @param {Function} deps.appendSecurityAudit
 * @param {Function} deps.pushUserNotification
 * @param {Function} deps.scheduleSave
 * @returns {Promise<{ ok: true, created: boolean, userId: string, email: string, linkedMcUsername: string, linkedMcUuid: string | null, externalUserId: string }>}
 */
export async function handlePluginBindEmail(store, body, deps) {
  const email = String(body.email || '').trim().toLowerCase()
  const mcUsername = String(body.username || '').trim()
  const externalUserId = String(body.external_user_id || '').trim()
  const mcUuid = String(body.uuid || '').trim() || null
  const currentIp = String(body.current_ip || body.ip || '').trim() || null

  if (!deps.isValidEmailAddress(email)) {
    throw new PluginBindEmailError('invalid_email', 400)
  }
  if (!mcUsername || mcUsername.length < 3 || mcUsername.length > 16) {
    throw new PluginBindEmailError('validation_error', 400)
  }

  const existingByMc = deps.findUserByLinkedMcUsername(store, mcUsername)
  const { localUser, created } = await deps.ensureSiteUserForPluginEmail(store, email)

  if (existingByMc && String(existingByMc.id || '') !== String(localUser.id || '')) {
    throw new PluginBindEmailError('mc_already_linked', 409, { linkedUserId: existingByMc.id })
  }

  const prevLinked = String(localUser.linkedMcUsername || '').trim()
  if (prevLinked && prevLinked.toLowerCase() !== mcUsername.toLowerCase()) {
    throw new PluginBindEmailError('email_already_linked', 409, { linkedMcUsername: prevLinked })
  }

  const linkResult = await deps.vlaLinkExternalUser(mcUsername, localUser.id)
  if (!linkResult.skipped && !linkResult.ok) {
    const status = linkResult.status >= 400 && linkResult.status < 600 ? linkResult.status : 502
    throw new PluginBindEmailError('link_failed', status, {
      message: linkResult.json?.error || '绑定失败',
    })
  }

  const bindEmailResult = await deps.vlaAdminBindEmail(mcUsername, email)
  if (!bindEmailResult.skipped && !bindEmailResult.ok) {
    const status = bindEmailResult.status >= 400 && bindEmailResult.status < 600 ? bindEmailResult.status : 502
    throw new PluginBindEmailError('bind_email_failed', status, {
      message: bindEmailResult.json?.error || '插件邮箱同步失败',
    })
  }

  localUser.linkedMcUsername = mcUsername
  localUser.linkedMcUuid = mcUuid || localUser.linkedMcUuid || null
  deps.markUserProfileDirty(localUser.id)

  deps.appendSecurityAudit(store, localUser.id, 'plugin_bind_email', {
    email,
    mcUsername,
    externalUserId: externalUserId || null,
    previousMcUsername: prevLinked || null,
    currentIp,
    source: 'plugin_callback',
  })

  deps.pushUserNotification(store, localUser.id, {
    type: 'binding_changed',
    title: created ? '已创建皮肤站账号并绑定角色' : '已绑定邮箱与游戏角色',
    message: created
      ? `已为 ${email} 创建网站账号，并绑定角色 ${mcUsername}`
      : `邮箱 ${email} 已与角色 ${mcUsername} 绑定`,
    detail: {
      email,
      mcUsername,
      created,
      currentIp,
      action: 'plugin_bind_email',
    },
  })

  deps.scheduleSave()

  return {
    ok: true,
    created,
    userId: localUser.id,
    email,
    linkedMcUsername: mcUsername,
    linkedMcUuid: localUser.linkedMcUuid || null,
    externalUserId: localUser.id,
  }
}
