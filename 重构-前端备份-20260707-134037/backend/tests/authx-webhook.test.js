import assert from 'node:assert'
import { describe, it } from 'node:test'
import { signAuthxWebhookPayload, verifyAuthxWebhookPayload } from '../src/authxWebhook.js'

describe('authxWebhook', () => {
  it('sign matches Java WebhookSignature reference vector', () => {
    const secret = 'test-secret'
    const ts = '1700000000'
    const payload = '{"event":"login_success"}'
    assert.strictEqual(
      signAuthxWebhookPayload(secret, ts, payload),
      'e4k-jbK9furAxQff5BgXvM1gWI92U0jKmpH9si8CBfQ'
    )
  })

  it('verify accepts valid signature at fixed time', () => {
    const secret = 's'
    const ts = '1700000000'
    const payload = '{}'
    const sig = signAuthxWebhookPayload(secret, ts, payload)
    assert.strictEqual(
      verifyAuthxWebhookPayload(secret, ts, sig, payload, 1700000000),
      true
    )
  })

  it('verify rejects skewed timestamp', () => {
    const secret = 's'
    const ts = '1700000000'
    const sig = signAuthxWebhookPayload(secret, ts, '{}')
    assert.strictEqual(
      verifyAuthxWebhookPayload(secret, ts, sig, '{}', 1700001000, 300),
      false
    )
  })

  it('verify skips when secret empty', () => {
    assert.strictEqual(verifyAuthxWebhookPayload('', '1', '', '{}', 1), true)
  })
})
