import assert from 'node:assert'
import crypto from 'node:crypto'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { config } from '../../../../src/config.js'
import { signAuthxWebhookPayload } from '../../../../src/authxWebhook.js'
import {
  detectInboundAdapter,
  isPluginWebhookAuthConfigured,
  verifyPluginInboundWebhook,
  parsePluginPayload
} from '../../../../src/modules/plugin-gateway/adapter.js'

function vlaSign(secret, rawPayload) {
  return crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex')
}

describe('plugin-gateway adapter', () => {
  let originalVlaSecrets
  let originalAuthxSecret

  beforeEach(() => {
    originalVlaSecrets = config.authxVlaWebhookSecrets.slice()
    originalAuthxSecret = config.authxCallbackSecret
  })

  afterEach(() => {
    config.authxVlaWebhookSecrets = originalVlaSecrets
    config.authxCallbackSecret = originalAuthxSecret
  })

  describe('detectInboundAdapter', () => {
    it('returns vla when X-VLA-Signature header is present', () => {
      assert.strictEqual(detectInboundAdapter({ headers: { 'x-vla-signature': 'abc' } }), 'vla')
    })

    it('returns authx when X-AuthX-Signature header is present without config', () => {
      config.authxCallbackSecret = ''
      assert.strictEqual(
        detectInboundAdapter({ headers: { 'x-authx-signature': 'sig' } }),
        'authx'
      )
    })

    it('returns authx when AuthX secret is configured', () => {
      config.authxCallbackSecret = 'configured-secret'
      assert.strictEqual(detectInboundAdapter({ headers: {} }), 'authx')
    })

    it('returns null when no adapter headers or config are present', () => {
      config.authxCallbackSecret = ''
      assert.strictEqual(detectInboundAdapter({ headers: {} }), null)
    })

    it('prefers vla over authx when both headers are present', () => {
      assert.strictEqual(
        detectInboundAdapter({
          headers: { 'x-vla-signature': 'vla-sig', 'x-authx-signature': 'authx-sig' }
        }),
        'vla'
      )
    })
  })

  describe('isPluginWebhookAuthConfigured', () => {
    it('returns true when VLA webhook secrets are present', () => {
      config.authxVlaWebhookSecrets = ['secret-one']
      config.authxCallbackSecret = ''
      assert.strictEqual(isPluginWebhookAuthConfigured(), true)
    })

    it('returns true when AuthX callback secret is present', () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = 'authx-secret'
      assert.strictEqual(isPluginWebhookAuthConfigured(), true)
    })

    it('returns false when neither VLA nor AuthX secrets are configured', () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = ''
      assert.strictEqual(isPluginWebhookAuthConfigured(), false)
    })
  })

  describe('verifyPluginInboundWebhook', () => {
    it('accepts a valid VLA hex signature', () => {
      const secret = 'vla-webhook-secret'
      const payload = '{"event":"login"}'
      config.authxVlaWebhookSecrets = [secret]
      config.authxCallbackSecret = ''
      const req = { headers: { 'x-vla-signature': vlaSign(secret, payload) } }
      assert.strictEqual(verifyPluginInboundWebhook(req, payload), true)
    })

    it('accepts a valid VLA signature matching any of multiple secrets', () => {
      const secret = 'matching-secret'
      const payload = '{"event":"login"}'
      config.authxVlaWebhookSecrets = ['other-secret', secret]
      config.authxCallbackSecret = ''
      const req = { headers: { 'x-vla-signature': vlaSign(secret, payload) } }
      assert.strictEqual(verifyPluginInboundWebhook(req, payload), true)
    })

    it('rejects an invalid VLA signature', () => {
      config.authxVlaWebhookSecrets = ['vla-webhook-secret']
      config.authxCallbackSecret = ''
      const req = { headers: { 'x-vla-signature': 'deadbeef' } }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), false)
    })

    it('rejects VLA request when no VLA secrets are configured', () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = ''
      const req = { headers: { 'x-vla-signature': 'abc' } }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), false)
    })

    it('accepts a valid AuthX signature at current time', () => {
      const secret = 'authx-callback-secret'
      const ts = String(Math.floor(Date.now() / 1000))
      const payload = '{"event":"login_success"}'
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = secret
      const sig = signAuthxWebhookPayload(secret, ts, payload)
      const req = { headers: { 'x-authx-timestamp': ts, 'x-authx-signature': sig } }
      assert.strictEqual(verifyPluginInboundWebhook(req, payload), true)
    })

    it('rejects an invalid AuthX signature', () => {
      const secret = 'authx-callback-secret'
      const ts = '1700000000'
      const payload = '{"event":"login_success"}'
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = secret
      const req = {
        headers: {
          'x-authx-timestamp': ts,
          'x-authx-signature': 'invalid-signature'
        }
      }
      assert.strictEqual(verifyPluginInboundWebhook(req, payload), false)
    })

    it('rejects an AuthX signature with skewed timestamp', () => {
      const secret = 'authx-callback-secret'
      const ts = '1700000000'
      const payload = '{"event":"login_success"}'
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = secret
      const sig = signAuthxWebhookPayload(secret, ts, payload)
      const req = { headers: { 'x-authx-timestamp': ts, 'x-authx-signature': sig } }
      assert.strictEqual(verifyPluginInboundWebhook(req, payload), false)
    })

    it('skips AuthX verification when secret is empty', () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = ''
      const req = {
        headers: {
          'x-authx-timestamp': '1700000000',
          'x-authx-signature': 'anything'
        }
      }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), true)
    })

    it('returns true when no keys are configured and no adapter is detected', () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = ''
      const req = { headers: {} }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), true)
    })

    it('returns false when VLA keys are configured but request has no VLA header', () => {
      config.authxVlaWebhookSecrets = ['vla-webhook-secret']
      config.authxCallbackSecret = ''
      const req = { headers: {} }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), false)
    })

    it('returns false when AuthX secret is configured but request has no AuthX signature', () => {
      config.authxVlaWebhookSecrets = []
      config.authxCallbackSecret = 'authx-callback-secret'
      const req = { headers: {} }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), false)
    })

    it('returns false when no adapter is detected', () => {
      config.authxVlaWebhookSecrets = ['vla-webhook-secret']
      config.authxCallbackSecret = 'authx-callback-secret'
      const req = { headers: {} }
      assert.strictEqual(verifyPluginInboundWebhook(req, '{}'), false)
    })
  })

  describe('parsePluginPayload', () => {
    it('parses a valid JSON object', () => {
      assert.deepStrictEqual(parsePluginPayload('{"event":"login"}'), { ok: true, body: { event: 'login' } })
    })

    it('returns ok false for an empty string', () => {
      assert.deepStrictEqual(parsePluginPayload(''), { ok: false })
    })

    it('returns ok false for a whitespace-only string', () => {
      assert.deepStrictEqual(parsePluginPayload('   \n\t  '), { ok: false })
    })

    it('returns ok false for invalid JSON', () => {
      assert.deepStrictEqual(parsePluginPayload('{not json}'), { ok: false })
    })
  })
})
