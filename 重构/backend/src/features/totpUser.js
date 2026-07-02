import { authenticator } from 'otplib'
import { config } from '../config.js'

export function generateTotpSecret() {
  return authenticator.generateSecret()
}

export function verifyTotpToken(secret, token) {
  const s = String(secret || '').trim()
  const t = String(token || '').trim()
  if (!s || !t) return false
  return authenticator.verify({ token: t, secret: s })
}

export function totpKeyUri(accountLabel, secret) {
  return authenticator.keyuri(accountLabel, config.totpIssuer || 'StarMC', secret)
}
