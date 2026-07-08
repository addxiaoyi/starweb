import { config } from '../config.js'
import { markKvDirty } from '../db/storeKvSync.js'
import { jsonError } from '../utils/response.js'

export function validateInviteForMcLink(store, userId, codeRaw) {
  if (!config.inviteCodesRequiredForMcLink) return { ok: true }
  const code = String(codeRaw || '').trim()
  if (!code) return { ok: false, error: 'invite_required' }
  const list = config.inviteCodesList || []
  if (!list.includes(code)) return { ok: false, error: 'bad_invite' }
  const claims = store.inviteCodeClaims || {}
  const owner = claims[code]
  if (owner && owner !== userId) return { ok: false, error: 'invite_used' }
  return { ok: true, code }
}

export function claimInviteForUser(store, userId, code) {
  if (!config.inviteCodesRequiredForMcLink) return
  const c = String(code || '').trim()
  if (!c) return
  if (!store.inviteCodeClaims) store.inviteCodeClaims = {}
  store.inviteCodeClaims[c] = userId
  markKvDirty('invite_code_claims')
}

const DEFAULT_GEO_PREFIXES = [
  '/api/user/link-minecraft',
  '/api/user/unlink-minecraft',
  '/api/user/totp',
  '/api/user/data-export',
  '/api/skins/player',
  '/api/skin/upload',
  '/api/skin/upload-cape',
  '/api/skin/apply',
  '/api/public/mc-game-password'
]

function pathMatchesGeoPolicy(path) {
  const custom = config.geoBlockPathPrefixes || []
  const prefixes = custom.length > 0 ? custom : DEFAULT_GEO_PREFIXES
  return prefixes.some((p) => path.startsWith(p))
}

export function geoBlockMiddleware() {
  return (req, res, next) => {
    const blocked = config.geoBlockedCountries || []
    if (!blocked.length) return next()
    const methods = ['POST', 'PUT', 'PATCH', 'DELETE']
    if (!methods.includes(req.method)) return next()
    const path = req.path || ''
    if (path.startsWith('/health') || path === '/api/health') return next()
    if (path === '/api/plugin/authx/callback') return next()
    if (!pathMatchesGeoPolicy(path)) return next()
    const c = String(
      req.headers['cf-ipcountry'] || req.headers['x-country-code'] || ''
    ).toUpperCase()
    if (c && blocked.includes(c)) {
      return jsonError(res, 403, '当前地区不允许此操作', 'geo_blocked')
    }
    next()
  }
}
