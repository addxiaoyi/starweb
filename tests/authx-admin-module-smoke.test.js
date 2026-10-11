import assert from 'node:assert'
import { test } from 'node:test'
import {
  normalizeProxyStatus,
  respondPluginJson,
  respondPluginJsonOrText,
  sanitizePluginHealthProbe,
} from '../src/modules/authxAdmin/service.js'

test('authx sanitizePluginHealthProbe keeps parsed subset only', () => {
  const safe = sanitizePluginHealthProbe({
    reachable: true,
    status: 200,
    path: '/v1/health',
    parsed: {
      ok: true,
      version: '1.2.3',
      database_ok: true,
      secret_token: 'must-not-leak',
    },
  })
  assert.deepEqual(safe.parsed, {
    ok: true,
    version: '1.2.3',
    database_ok: true,
  })
  assert.equal('secret_token' in (safe.parsed || {}), false)
})

test('normalizeProxyStatus clamps invalid HTTP status', () => {
  assert.equal(normalizeProxyStatus(200), 200)
  assert.equal(normalizeProxyStatus(0), 502)
  assert.equal(normalizeProxyStatus(999), 502)
})

test('respondPluginJson normalizes ok/success flags', () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  respondPluginJson(res, { status: 201, json: { version: '1.0.0' } })
  assert.equal(res.statusCode, 201)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.success, true)
  assert.equal(res.body.version, '1.0.0')
})

test('respondPluginJsonOrText falls back to text body', () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    send(text) {
      this.body = text
      return this
    },
    json() {
      throw new Error('json should not be called')
    },
  }
  respondPluginJsonOrText(res, { status: 502, text: 'upstream error' })
  assert.equal(res.statusCode, 502)
  assert.equal(res.body, 'upstream error')
})
