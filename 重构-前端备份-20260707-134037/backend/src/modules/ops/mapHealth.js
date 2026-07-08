/**
 * GET /map-health/:server
 * 探测地图服务健康状态。
 */

const DEFAULT_ORIGINS = {
  survival: 'http://127.0.0.1:41644',
  nationWar: 'http://127.0.0.1:49299',
  modSurvival: 'http://127.0.0.1:43219'
}

function buildMapOrigins(config = {}) {
  return {
    survival: String(config.mapSurvivalOrigin || process.env.STARMC_MAP_SURVIVAL_ORIGIN || DEFAULT_ORIGINS.survival).trim(),
    nationWar: String(config.mapNationWarOrigin || process.env.STARMC_MAP_NATION_WAR_ORIGIN || DEFAULT_ORIGINS.nationWar).trim(),
    modSurvival: String(config.mapModSurvivalOrigin || process.env.STARMC_MAP_MOD_SURVIVAL_ORIGIN || DEFAULT_ORIGINS.modSurvival).trim()
  }
}

function trimOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '')
}

export function registerMapHealthRoutes(app, deps = {}) {
  const jsonErr = deps.jsonErr || ((res, status, message) => res.status(status).json({ ok: false, error: message }))
  const origins = buildMapOrigins(deps.config)

  app.get('/map-health/:server', async (req, res, next) => {
    try {
      const server = String(req.params.server || '').trim()
      if (!Object.hasOwn(origins, server)) {
        return jsonErr(res, 404, 'unknown_map')
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3500)
      const target = trimOrigin(origins[server])

      try {
        const response = await fetch(target, {
          cache: 'no-store',
          redirect: 'follow',
          signal: controller.signal
        })
        return res.json({ ok: response.ok, status: response.status })
      } catch (error) {
        return res.json({
          ok: false,
          error: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable'
        })
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      next(error)
    }
  })
}
