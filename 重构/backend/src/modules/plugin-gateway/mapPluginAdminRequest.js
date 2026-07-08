/**
 * 将站点统一 Admin 契约映射到各插件实现（AuthX / VLA）。
 *
 * @param {string} apiPath
 * @param {object} body
 * @param {object} config
 * @param {Function} [warnFn] - 非 VLA 适配器时调用
 * @returns {{ path: string, body: object, extraHeaders: object }}
 */
export function mapPluginAdminRequest(apiPath, body, config, warnFn) {
  const isVla = config.authxPluginAdapter === 'vla'
  if (!isVla) {
    warnFn?.()
    return { path: apiPath, body: body || {}, extraHeaders: {} }
  }
  const extraHeaders = {}
  if (config.authxVlaApiKey) {
    extraHeaders['X-API-Key'] = config.authxVlaApiKey
  }
  if (apiPath.endsWith('/admin/reset-password')) {
    const { username, newPassword } = body || {}
    return {
      path: '/v1/admin/password',
      body: { username, password: newPassword },
      extraHeaders,
    }
  }
  if (apiPath.endsWith('/admin/bind-email')) {
    return { path: '/v1/admin/bind-email', body: body || {}, extraHeaders }
  }
  if (apiPath.endsWith('/admin/unbind-device')) {
    const { username, device } = body || {}
    return {
      path: '/v1/admin/unbind-device',
      body: { username, fingerprint: device == null ? '' : String(device) },
      extraHeaders,
    }
  }
  if (apiPath === '/internal/v1/link/external-user') {
    const { username, external_user_id: ext } = body || {}
    return {
      path: '/v1/link/external-user',
      body: { username, external_user_id: ext },
      extraHeaders,
    }
  }
  if (apiPath.endsWith('/admin/kick-online')) {
    return { path: '/v1/admin/kick-online', body: body || {}, extraHeaders }
  }
  if (apiPath.endsWith('/admin/ban')) {
    return { path: '/v1/admin/ban', body: body || {}, extraHeaders }
  }
  if (apiPath.endsWith('/admin/delete-user')) {
    return { path: '/v1/admin/delete-user', body: body || {}, extraHeaders }
  }
  if (apiPath.endsWith('/admin/skin-refresh')) {
    return { path: '/v1/skin/refresh', body: body || {}, extraHeaders }
  }
  if (apiPath.endsWith('/admin/link-external-user')) {
    const { username, external_user_id: ext } = body || {}
    return {
      path: '/v1/link/external-user',
      body: { username, external_user_id: ext },
      extraHeaders,
    }
  }
  return { path: apiPath, body: body || {}, extraHeaders }
}
