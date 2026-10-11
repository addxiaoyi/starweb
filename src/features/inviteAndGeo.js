import { config } from '../config.js'

export function validateInviteForMcLink(store, userId, inviteCode) {
  if (!config.inviteCodesRequiredForMcLink) return { ok: true }
  const code = String(inviteCode || '').trim()
  if (!code) return { ok: false, error: 'invite_required' }
  const allowed = config.inviteCodes || []
  if (!allowed.includes(code)) return { ok: false, error: 'bad_invite' }
  if (!store.usedInviteCodes) store.usedInviteCodes = {}
  const usedBy = store.usedInviteCodes[code]
  if (usedBy && usedBy !== userId) return { ok: false, error: 'invite_used' }
  return { ok: true, code }
}

export function claimInviteForUser(store, userId, inviteCode) {
  const code = String(inviteCode || '').trim()
  if (!code) return
  if (!store.usedInviteCodes) store.usedInviteCodes = {}
  store.usedInviteCodes[code] = userId
}

export function geoBlockMiddleware() {
  return (req, res, next) => {
    const blocked = config.geoBlockedCountries || []
    if (!blocked.length) return next()
    const country = String(req.headers['cf-ipcountry'] || req.headers['x-country-code'] || '')
      .trim()
      .toUpperCase()
    if (country && blocked.includes(country)) {
      return res.status(403).json({
        ok: false,
        success: false,
        message: '该地区暂不可用',
        code: 'geo_blocked',
        error: 'geo_blocked',
      })
    }
    next()
  }
}
