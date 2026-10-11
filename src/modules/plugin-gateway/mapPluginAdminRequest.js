const POST_ROUTE_ALIASES = new Map([
  ['/api/plugin/authx/admin/skin-refresh', '/v1/admin/skin-refresh'],
  ['/api/plugin/authx/admin/reset-password', '/v1/admin/reset-password'],
  ['/internal/v1/link/external-user', '/v1/admin/link-external-user'],
])

const GET_ROUTE_ALIASES = new Map([
  ['/v1/server/status', '/v1/network/status'],
])

function normalizePath(value) {
  const path = String(value || '').trim()
  return path.startsWith('/') ? path : `/${path}`
}

export function resolvePluginApiBase(config = {}) {
  return String(config.starxNetworkApiBase || config.authxPluginBase || '')
    .trim()
    .replace(/\/+$/, '')
}

export function resolvePluginApiKey(config = {}) {
  return String(config.starxNetworkApiKey || config.authxVlaApiKey || '').trim()
}

export function mapPluginAdminRequest(apiPath, body, config, warnDeprecated) {
  const requestedPath = normalizePath(apiPath)
  const path = POST_ROUTE_ALIASES.get(requestedPath) || requestedPath
  let mappedBody = body && typeof body === 'object' ? { ...body } : {}

  if (requestedPath === '/api/plugin/authx/admin/skin-refresh') {
    mappedBody = {
      username: mappedBody.username,
      player_uuid: mappedBody.player_uuid ?? mappedBody.playerUuid ?? '',
      selection_version: mappedBody.selection_version ?? mappedBody.selectionVersion ?? 0,
      reason: mappedBody.reason || 'skin_changed',
    }
  }

  if (requestedPath === '/internal/v1/link/external-user') {
    mappedBody = {
      username: mappedBody.username,
      externalUserId: mappedBody.externalUserId ?? mappedBody.external_user_id ?? '',
      playerUuid: mappedBody.playerUuid ?? mappedBody.player_uuid ?? '',
      verified: mappedBody.verified === true,
    }
  }

  if (config.authxPluginAdapter !== 'vla' && warnDeprecated) warnDeprecated()
  const apiKey = resolvePluginApiKey(config)
  return {
    path,
    body: mappedBody,
    extraHeaders: apiKey ? { 'X-API-Key': apiKey } : {},
  }
}

export function mapPluginGetRequest(pathSuffix, queryObj) {
  const requestedPath = normalizePath(pathSuffix)
  return {
    path: GET_ROUTE_ALIASES.get(requestedPath) || requestedPath,
    query: queryObj && typeof queryObj === 'object' ? { ...queryObj } : undefined,
  }
}
