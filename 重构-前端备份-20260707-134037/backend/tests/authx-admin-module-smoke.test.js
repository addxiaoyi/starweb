import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeProxyStatus,
  respondPluginJson,
  respondPluginJsonOrText
} from '../src/modules/authxAdmin/service.js'

function createMockRes() {
  return {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    send(payload) {
      this.body = payload
      return this
    }
  }
}

test('authx normalizeProxyStatus smoke', () => {
  assert.equal(normalizeProxyStatus(200), 200)
  assert.equal(normalizeProxyStatus(700), 502)
  assert.equal(normalizeProxyStatus(undefined), 502)
})

test('authx respondPluginJson smoke', () => {
  const res = createMockRes()
  respondPluginJson(res, { status: 201, json: { ok: true } })
  assert.equal(res.statusCode, 201)
  assert.deepEqual(res.body, { ok: true, success: true })
})

test('authx respondPluginJsonOrText smoke', () => {
  const res1 = createMockRes()
  respondPluginJsonOrText(res1, { status: 202, json: { ok: true } })
  assert.equal(res1.statusCode, 202)
  assert.deepEqual(res1.body, { ok: true, success: true })

  const res2 = createMockRes()
  respondPluginJsonOrText(res2, { status: 404, text: 'not found' })
  assert.equal(res2.statusCode, 404)
  assert.equal(res2.body, 'not found')
})
