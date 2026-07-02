import assert from 'node:assert'
import { describe, it } from 'node:test'
import { signAuthxWebhookPayload } from '../src/authxWebhook.js'

describe('authx signature over raw bytes', () => {
  it('whitespace in JSON changes HMAC (must verify raw body, not re-stringify)', () => {
    const secret = 'shared'
    const ts = '1700000000'
    const a = '{"event":"login_success"}'
    const b = '{"event": "login_success"}'
    assert.notStrictEqual(
      signAuthxWebhookPayload(secret, ts, a),
      signAuthxWebhookPayload(secret, ts, b)
    )
  })
})
