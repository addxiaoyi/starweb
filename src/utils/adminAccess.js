import { requireRolesOrJson } from './permission.js'

export function requireAdminAccessOrJson(req, res, options = {}) {
  return requireRolesOrJson(req, res, {
    ...options,
    roles: options.roles || ['admin'],
    jsonError: options.jsonError,
  })
}
