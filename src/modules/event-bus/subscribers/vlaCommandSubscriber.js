import { Events } from '../events.js'

const ALLOWED_COMMAND_PATHS = new Set(['/v1/admin/bridge/ping'])

export function registerVlaCommandSubscriber(eventBus, deps) {
  const { pluginFetchJson, logger } = deps
  eventBus.subscribe(Events.VLA_COMMAND_GENERIC, async (payload) => {
    if (!payload?.path) return
    if (!ALLOWED_COMMAND_PATHS.has(payload.path)) {
      payload.respond?.({ status: 400, json: { ok: false, error: 'unsupported_command' } })
      return
    }
    const result = await pluginFetchJson(payload.path, payload.body || {})
    payload.respond?.(result)
    logger?.info?.('[vla-command] done', payload.path, result?.status)
  })
}
