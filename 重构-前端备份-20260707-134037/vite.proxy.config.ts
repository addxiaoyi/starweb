import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProxyOptions } from 'vite'

/** 仅转发 `/api` 与 `/api/...`；避免 `/api-info` 等前端路由被误代理 */
export function bypassNonApiPaths(req: IncomingMessage & { url?: string }): string | undefined {
  const p = req.url?.split('?')[0] ?? ''
  if (p.startsWith('/api') && p !== '/api' && !p.startsWith('/api/')) {
    return '/index.html'
  }
}

function envOrigin(name: string, fallback: string): string {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : fallback
}

function makeOfflineProxy(handlerName: string): ProxyOptions {
  return {
    target: 'http://127.0.0.1:1',
    changeOrigin: true,
    configure(proxy) {
      proxy.on('error', (_err, _req, res) => {
        const serverRes = res as ServerResponse | undefined
        if (serverRes && !serverRes.headersSent) {
          serverRes.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
        }
        serverRes?.end(
          JSON.stringify({ ok: false, error: 'proxy_unavailable', proxy: handlerName })
        )
      })
    },
  }
}

function wsTargetFromHttpDashboard(dashboardHttpUrl: string): string {
  try {
    const u = new URL(
      dashboardHttpUrl.startsWith('http') ? dashboardHttpUrl : `http://${dashboardHttpUrl}`
    )
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}`
  } catch {
    return 'ws://127.0.0.1:35417'
  }
}

/**
 * 开发/预览共用代理。目标地址均可通过环境变量覆盖（便于换机部署）。
 * - VITE_LOCAL_API_TARGET / VITE_LOCAL_PLUGIN_TARGET
 * - VITE_PROXY_DASHBOARD_ORIGIN
 * - VITE_PROXY_MAP_SURVIVAL_ORIGIN / VITE_PROXY_MAP_NATION_WAR_ORIGIN / VITE_PROXY_MAP_MOD_SURVIVAL_ORIGIN
 */
export function createStarMcDevProxy(): Record<string, ProxyOptions> {
  const localApi = envOrigin('VITE_LOCAL_API_TARGET', 'http://127.0.0.1:8787')
  const localPlugin = envOrigin('VITE_LOCAL_PLUGIN_TARGET', localApi)
  const dashboard = envOrigin('VITE_PROXY_DASHBOARD_ORIGIN', 'http://127.0.0.1:35417')
  const mapSurvival = envOrigin('VITE_PROXY_MAP_SURVIVAL_ORIGIN', 'http://127.0.0.1:41644')
  const mapNationWar = envOrigin('VITE_PROXY_MAP_NATION_WAR_ORIGIN', 'http://127.0.0.1:49299')
  const mapModSurvival = envOrigin('VITE_PROXY_MAP_MOD_SURVIVAL_ORIGIN', 'http://127.0.0.1:43219')
  const wsDashboard = wsTargetFromHttpDashboard(dashboard)
  const dashboardProxy =
    dashboard === 'http://127.0.0.1:35417'
      ? makeOfflineProxy('dashboard')
      : { target: dashboard, changeOrigin: true }
  const mapSurvivalProxy =
    mapSurvival === 'http://127.0.0.1:41644'
      ? makeOfflineProxy('map/survival')
      : {
          target: mapSurvival,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/proxy\/map\/survival/, ''),
        }
  const mapNationWarProxy =
    mapNationWar === 'http://127.0.0.1:49299'
      ? makeOfflineProxy('map/nationWar')
      : {
          target: mapNationWar,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/proxy\/map\/nationWar/, ''),
        }
  const mapModSurvivalProxy =
    mapModSurvival === 'http://127.0.0.1:43219'
      ? makeOfflineProxy('map/modSurvival')
      : {
          target: mapModSurvival,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/proxy\/map\/modSurvival/, ''),
        }

  return {
    '/bilibili-api': {
      target: 'https://api.live.bilibili.com',
      changeOrigin: true,
      rewrite: path => path.replace(/^\/bilibili-api/, ''),
      headers: { Referer: 'https://live.bilibili.com/' },
    },
    '/proxy/dashboard': {
      ...dashboardProxy,
      rewrite:
        dashboard === 'http://127.0.0.1:35417'
          ? undefined
          : path => path.replace(/^\/proxy\/dashboard/, ''),
    },
    '/api': {
      target: localApi,
      changeOrigin: true,
      bypass: bypassNonApiPaths,
    },
    /** SuperTokens 认证 API（与 backend AUTH_API_BASE_PATH 默认 /auth 一致） */
    '/auth': {
      target: 'http://127.0.0.1:8787',
      changeOrigin: true,
    },
    '/uploads': {
      target: localApi,
      changeOrigin: true,
    },
    '/healthz': {
      target: localApi,
      changeOrigin: true,
    },
    '/plugin': {
      target: localPlugin,
      changeOrigin: true,
    },
    '/ws': {
      target: wsDashboard,
      changeOrigin: true,
      ws: true,
    },
    '/proxy/map/survival': mapSurvivalProxy,
    '/proxy/map/nationWar': mapNationWarProxy,
    '/proxy/map/modSurvival': mapModSurvivalProxy,
  }
}
