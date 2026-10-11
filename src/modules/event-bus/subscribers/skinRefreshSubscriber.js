import { Events } from '../events.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function registerSkinRefreshSubscriber(eventBus, deps) {
  const { pluginFetchJson, logger } = deps
  eventBus.subscribe(Events.PLUGIN_SKIN_REFRESH_RECEIVED, async (payload) => {
    const body = payload?.body && typeof payload.body === 'object' ? payload.body : {}
    const username = String(body.username || '').trim()
    const playerUuid = String(body.player_uuid || body.playerUuid || '').trim()
    const selectionVersion = Number(body.selection_version || body.selectionVersion || 0)
    if (username.length > 16 || (playerUuid && !UUID_PATTERN.test(playerUuid))) {
      throw new Error('skin_refresh_payload_invalid')
    }
    if (!username && !playerUuid) throw new Error('skin_refresh_identity_missing')
    const result = await pluginFetchJson('/v1/admin/skin-refresh', {
      username: username || undefined,
      player_uuid: playerUuid || undefined,
      selection_version: Number.isSafeInteger(selectionVersion) && selectionVersion > 0
        ? selectionVersion : undefined,
      reason: 'skin_changed',
    })
    if (!result?.json?.ok && !result?.json?.success) {
      throw new Error(`skin_refresh_dispatch_failed:${result?.status || 502}`)
    }
    logger?.info?.('[skin-refresh-subscriber] dispatched', playerUuid || username)
  })
}
