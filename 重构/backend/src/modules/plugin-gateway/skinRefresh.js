function resolveSkinBridgeSecret(req) {
  const h1 = (req.headers['x-skin-bridge-secret'] || '').trim()
  if (h1) return h1
  return (req.headers['x-skinbridge-secret'] || '').trim()
}

function verifySkinRefreshSecret(req, config, jsonErr, res) {
  if (config.isProd && !config.pluginRefreshSecret) {
    jsonErr(res, 503, '生产环境必须配置 PLUGIN_REFRESH_SECRET', 'misconfigured')
    return false
  }
  if (config.pluginRefreshSecret) {
    const h = resolveSkinBridgeSecret(req)
    if (h !== config.pluginRefreshSecret) {
      jsonErr(res, 401, '未授权', 'unauthorized')
      return false
    }
  }
  return true
}

/**
 * 读取请求体中待刷新的玩家名；兼容 { username } 与 { name } 两种字段。
 */
function extractRefreshUsername(body) {
  if (!body || typeof body !== 'object') return ''
  return String(body.username || body.name || '').trim()
}

/**
 * POST /plugin/skin/refresh
 *
 * 供皮肤站/插件桥通知后端刷新指定玩家皮肤。
 * 生产环境必须配置 PLUGIN_REFRESH_SECRET，并通过 X-Skin-Bridge-Secret 校验。
 * 若配置了 pluginFetchJson 且使用 VLA 适配器，则将请求转发到插件的 /v1/skin/refresh；
 * 否则返回本地兼容桩响应（开发环境或插件不可达时）。
 */
export function registerSkinRefreshRoutes(app, deps) {
  const { config, jsonErr, pluginFetchJson } = deps

  app.post('/plugin/skin/refresh', async (req, res) => {
    if (!verifySkinRefreshSecret(req, config, jsonErr, res)) return

    const body = req.body || {}
    const username = extractRefreshUsername(body)

    if (typeof pluginFetchJson === 'function' && config.authxPluginBase) {
      try {
        const forwardBody = { ...body }
        if (username) forwardBody.username = username
        const result = await pluginFetchJson('/api/plugin/authx/admin/skin-refresh', forwardBody)
        return res.status(result.status || 200).json(result.json || { ok: true })
      } catch (err) {
        console.warn('[plugin-gateway] 转发 skin/refresh 失败:', err && err.message ? err.message : err)
        return jsonErr(res, 502, '插件刷新接口不可用', 'plugin_unreachable')
      }
    }

    res.json({
      ok: true,
      received: body,
      message: '本地插件桩：已记录刷新请求（API 兼容入口）'
    })
  })
}
