import { Events } from '../events.js'

const POST_COMMANDS = [
  [Events.VLA_COMMAND_KICK_ONLINE, '/api/plugin/authx/admin/kick-online'],
  [Events.VLA_COMMAND_BAN, '/api/plugin/authx/admin/ban'],
  [Events.VLA_COMMAND_DELETE_USER, '/api/plugin/authx/admin/delete-user'],
  [Events.VLA_COMMAND_SKIN_REFRESH, '/api/plugin/authx/admin/skin-refresh'],
  [Events.VLA_COMMAND_LINK_EXTERNAL_USER, '/api/plugin/authx/admin/link-external-user'],
  [Events.VLA_COMMAND_RESET_PASSWORD, '/api/plugin/authx/admin/reset-password'],
  [Events.VLA_COMMAND_BIND_EMAIL, '/api/plugin/authx/admin/bind-email'],
  [Events.VLA_COMMAND_UNBIND_DEVICE, '/api/plugin/authx/admin/unbind-device'],
  // NOTIFY_BIND_EMAIL 与 BIND_EMAIL 共用同一个 admin 端点，区别由 body.action 或调用方语义决定
  [Events.VLA_COMMAND_NOTIFY_BIND_EMAIL, '/api/plugin/authx/admin/bind-email'],
]

/**
 * 注册 VLA 出站命令订阅器。
 *
 * 订阅所有 VLA_COMMAND_* 事件，将 body 转发到对应的 VLA admin 路径，
 * 并根据执行结果发布 VLA_COMMAND_COMPLETED / VLA_COMMAND_FAILED。
 * 若 payload 包含 _replyTo，还会发布对应的 vla:command:reply:<id> 事件。
 */
export function registerVlaCommandSubscriber(bus, deps) {
  const { pluginFetchJson, config, logger = console } = deps

  const skippedResult = {
    ok: false,
    skipped: true,
    message: '当前未使用 VLA 适配器，跳过命令',
  }

  for (const [event, path] of POST_COMMANDS) {
    bus.subscribe(event, async (payload) => {
      const { body, _replyTo } = payload || {}

      if (config?.authxPluginAdapter !== 'vla') {
        if (_replyTo) {
          bus.publish(`vla:command:reply:${_replyTo}`, { ok: true, result: skippedResult })
        }
        bus.publish(Events.VLA_COMMAND_COMPLETED, {
          command: event,
          ok: true,
          result: skippedResult,
        })
        return
      }

      try {
        const result = await pluginFetchJson(path, body || {})
        if (result.status >= 400) {
          const error = result.json?.message || `VLA admin returned ${result.status}`
          logger.error(`vla-command: ${event} failed: ${error}`, { result })

          if (_replyTo) {
            bus.publish(`vla:command:reply:${_replyTo}`, { ok: false, result, error })
          }
          bus.publish(Events.VLA_COMMAND_FAILED, {
            command: event,
            ok: false,
            result,
            error,
          })
          return
        }

        if (_replyTo) {
          bus.publish(`vla:command:reply:${_replyTo}`, { ok: true, result })
        }
        bus.publish(Events.VLA_COMMAND_COMPLETED, {
          command: event,
          ok: true,
          result,
        })
      } catch (error) {
        logger.error(`vla-command: ${event} failed: ${error.message}`, error)

        if (_replyTo) {
          bus.publish(`vla:command:reply:${_replyTo}`, {
            ok: false,
            error: error.message,
          })
        }
        bus.publish(Events.VLA_COMMAND_FAILED, {
          command: event,
          ok: false,
          error: error.message,
        })
      }
    })
  }
}
