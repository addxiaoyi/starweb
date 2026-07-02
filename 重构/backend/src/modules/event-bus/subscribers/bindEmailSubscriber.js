import { Events } from '../events.js'
import { PluginBindEmailError } from '../../plugin-gateway/bindEmailService.js'

/**
 * 注册插件邮箱绑定事件订阅器。
 *
 * 订阅 PLUGIN_BIND_EMAIL_RECEIVED，将业务处理完成后通过事件总线
 * 发布 VLA 命令并等待结果，最终发布 USER_BIND_EMAIL_COMPLETED。
 *
 * @param {EventBus} bus
 * @param {object} deps
 */
export function registerBindEmailSubscriber(bus, deps) {
  const {
    isValidEmailAddress,
    findUserByLinkedMcUsername,
    ensureSiteUserForPluginEmail,
    markUserProfileDirty,
    appendSecurityAudit,
    pushUserNotification,
    scheduleSave,
  } = deps

  bus.subscribe(Events.PLUGIN_BIND_EMAIL_RECEIVED, async (payload) => {
    const { store, body } = payload || {}

    const email = String(body?.email || '').trim().toLowerCase()
    const mcUsername = String(body?.username || '').trim()
    const externalUserId = String(body?.external_user_id || '').trim()
    const mcUuid = String(body?.uuid || '').trim() || null
    const currentIp = String(body?.current_ip || body?.ip || '').trim() || null

    if (!isValidEmailAddress(email)) {
      throw new PluginBindEmailError('invalid_email', 400)
    }
    if (!mcUsername || mcUsername.length < 3 || mcUsername.length > 16) {
      throw new PluginBindEmailError('validation_error', 400)
    }

    const existingByMc = findUserByLinkedMcUsername(store, mcUsername)
    const { localUser, created } = await ensureSiteUserForPluginEmail(store, email)

    if (existingByMc && String(existingByMc.id || '') !== String(localUser.id || '')) {
      throw new PluginBindEmailError('mc_already_linked', 409, { linkedUserId: existingByMc.id })
    }

    const prevLinked = String(localUser.linkedMcUsername || '').trim()
    if (prevLinked && prevLinked.toLowerCase() !== mcUsername.toLowerCase()) {
      throw new PluginBindEmailError('email_already_linked', 409, { linkedMcUsername: prevLinked })
    }

    const linkResult = await bus.publishAndWait(Events.VLA_COMMAND_LINK_EXTERNAL_USER, {
      body: { username: mcUsername, external_user_id: localUser.id },
    })
    if (!linkResult.result?.skipped && !linkResult.ok) {
      const status = linkResult.result?.status >= 400 && linkResult.result?.status < 600
        ? linkResult.result.status
        : 502
      throw new PluginBindEmailError('link_failed', status, {
        message: linkResult.result?.json?.error || linkResult.error || '绑定失败',
      })
    }

    const bindResult = await bus.publishAndWait(Events.VLA_COMMAND_NOTIFY_BIND_EMAIL, {
      body: { username: mcUsername, email },
    })
    if (!bindResult.result?.skipped && !bindResult.ok) {
      const status = bindResult.result?.status >= 400 && bindResult.result?.status < 600
        ? bindResult.result.status
        : 502
      throw new PluginBindEmailError('bind_email_failed', status, {
        message: bindResult.result?.json?.error || bindResult.error || '插件邮箱同步失败',
      })
    }

    localUser.linkedMcUsername = mcUsername
    localUser.linkedMcUuid = mcUuid || localUser.linkedMcUuid || null
    markUserProfileDirty(localUser.id)

    appendSecurityAudit(store, localUser.id, 'plugin_bind_email', {
      email,
      mcUsername,
      externalUserId: externalUserId || null,
      previousMcUsername: prevLinked || null,
      currentIp,
      source: 'plugin_callback',
    })

    pushUserNotification(store, localUser.id, {
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

    scheduleSave()

    bus.publish(Events.USER_BIND_EMAIL_COMPLETED, {
      store,
      userId: localUser.id,
      email,
      mcUsername,
      mcUuid: localUser.linkedMcUuid,
      created,
    })
  })
}
