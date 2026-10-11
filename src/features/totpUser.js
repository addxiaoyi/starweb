import crypto from 'node:crypto'
import { TOTP, Secret } from 'otpauth'

export function generateTotpSecret() {
  return new Secret({ size: 20 }).base32
}

export function verifyTotpToken(secret, code) {
  const token = String(code || '').trim()
  if (!token) return false
  const totp = new TOTP({ secret: Secret.fromBase32(String(secret || '').trim()), digits: 6, period: 30 })
  const delta = totp.validate({ token, window: 1 })
  return delta != null
}

export function totpKeyUri(label, secret) {
  const totp = new TOTP({
    issuer: 'StarMC',
    label: String(label || 'user'),
    secret: Secret.fromBase32(String(secret || '').trim()),
    digits: 6,
    period: 30,
  })
  return totp.toString()
}

export function makeRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(4).toString('hex').toUpperCase())
}
