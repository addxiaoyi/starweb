import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireAdminAccessOrJson } from '../src/utils/adminAccess.js'

function createRes() {
  return {
    statusCode: 200,
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
}

test('requireAdminAccessOrJson should stop when dev admin guard fails', () => {
  const req = { user: { roles: ['admin'] } }
  const res = createRes()
  const ok = requireAdminAccessOrJson(req, res, {
    roles: ['admin'],
    requireDevAdmin: (_req, innerRes) => {
      innerRes.status(403).json({ ok: false, code: 'forbidden', message: '需要管理员密钥' })
      return false
    }
  })
  assert.equal(ok, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.code, 'forbidden')
})

test('requireAdminAccessOrJson should allow secret-only mode when no session user', () => {
  const req = {}
  const res = createRes()
  const ok = requireAdminAccessOrJson(req, res, {
    roles: ['admin'],
    requireDevAdmin: () => true
  })
  assert.equal(ok, true)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, null)
})

test('requireAdminAccessOrJson should return unified forbidden details for role mismatch', () => {
  const req = { user: { roles: ['moderator'] } }
  const res = createRes()
  const ok = requireAdminAccessOrJson(req, res, {
    roles: ['admin'],
    message: '需要遥测查看权限',
    requiredCapability: 'view_telemetry',
    requireDevAdmin: () => true
  })
  assert.equal(ok, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.code, 'forbidden')
  assert.deepEqual(res.body?.details, {
    requiredRoles: ['admin'],
    actualRoles: ['moderator'],
    requiredCapability: 'view_telemetry'
  })
})

test('requireAdminAccessOrJson should allow when authenticated user has allowed role', () => {
  const req = { user: { roles: ['reviewer'] } }
  const res = createRes()
  const ok = requireAdminAccessOrJson(req, res, {
    roles: ['admin', 'reviewer'],
    requireDevAdmin: () => true
  })
  assert.equal(ok, true)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, null)
})
