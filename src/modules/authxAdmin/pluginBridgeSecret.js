import crypto from 'node:crypto'

const PREFIX = 'starx-bridge-v1'
const AAD = Buffer.from('starmc-plugin-bridge-api-key:v1', 'utf8')

function masterKey(secret) {
  const value = String(secret || '').trim()
  if (Buffer.byteLength(value, 'utf8') < 32) {
    const error = new Error('PLUGIN_BRIDGE_SECRET_KEY must contain at least 32 UTF-8 bytes')
    error.code = 'plugin_bridge_secret_key_missing'
    throw error
  }
  return crypto.createHash('sha256').update(value, 'utf8').digest()
}

export function isPluginBridgeSecretKeyReady(secret) {
  return Buffer.byteLength(String(secret || '').trim(), 'utf8') >= 32
}

export function encryptPluginBridgeApiKey(apiKey, secret, options = {}) {
  const value = String(apiKey || '').trim()
  if (!value || Buffer.byteLength(value, 'utf8') > 4096) {
    const error = new Error('Plugin API key must contain between 1 and 4096 UTF-8 bytes')
    error.code = 'invalid_plugin_api_key'
    throw error
  }
  const randomBytes = options.randomBytes || crypto.randomBytes
  const iv = randomBytes(12)
  if (!Buffer.isBuffer(iv) || iv.length !== 12) {
    throw new Error('Plugin bridge IV generator must return 12 bytes')
  }
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(secret), iv)
  cipher.setAAD(AAD)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join('.')
}

export function decryptPluginBridgeApiKey(encoded, secret) {
  const parts = String(encoded || '').trim().split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    const error = new Error('Unsupported encrypted plugin API key format')
    error.code = 'plugin_bridge_secret_invalid'
    throw error
  }
  try {
    const iv = Buffer.from(parts[1], 'base64url')
    const encrypted = Buffer.from(parts[2], 'base64url')
    const tag = Buffer.from(parts[3], 'base64url')
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length < 1 || encrypted.length > 4096) {
      throw new Error('invalid encrypted payload dimensions')
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(secret), iv)
    decipher.setAAD(AAD)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8').trim()
    if (!plaintext) throw new Error('decrypted plugin API key is blank')
    return plaintext
  } catch (cause) {
    if (cause?.code === 'plugin_bridge_secret_key_missing') throw cause
    const error = new Error('Encrypted plugin API key could not be authenticated')
    error.code = 'plugin_bridge_secret_invalid'
    throw error
  }
}

export function maskPluginApiKey(apiKey) {
  const value = String(apiKey || '').trim()
  if (!value) return null
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}
