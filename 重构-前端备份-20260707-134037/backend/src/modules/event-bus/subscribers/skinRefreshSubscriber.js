import { Events } from '../events.js'
import { isPlainObject } from '../utils.js'

/**
 * 注册皮肤刷新事件订阅器。
 *
 * 订阅 PLUGIN_SKIN_REFRESH_RECEIVED，将请求体转发为 VLA 皮肤刷新命令。
 *
 * @param {EventBus} bus
 * @param {object} deps
 * @param {object} [deps.logger]
 */
export function registerSkinRefreshSubscriber(bus, deps) {
  const { logger = console } = deps

  bus.subscribe(Events.PLUGIN_SKIN_REFRESH_RECEIVED, async (payload) => {
    if (!isPlainObject(payload)) {
      logger.warn?.('[skin-refresh-subscriber] invalid payload shape, expected object', { payload })
      return
    }

    const body = payload.body
    if (body !== undefined && body !== null && !isPlainObject(body)) {
      logger.warn?.('[skin-refresh-subscriber] invalid body shape, expected object', { body })
      return
    }

    logger.debug('[skin-refresh-subscriber] forwarding skin refresh to VLA command', { body })
    bus.publish(Events.VLA_COMMAND_SKIN_REFRESH, { body: body || {} })
  })
}
