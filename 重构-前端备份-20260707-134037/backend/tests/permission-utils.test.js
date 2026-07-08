import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  roleSetOf,
  hasRole,
  requireRolesOrJson
} from '../src/utils/permission.js'

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

test('roleSetOf should normalize and dedupe role values', () => {
  const roles = roleSetOf({
    role: 'Reviewer',
    roles: ['admin', ' reviewer ', 'ADMIN', '']
  })
  assert.deepEqual([...roles].sort(), ['admin', 'reviewer'])
  assert.equal(hasRole({ roles: ['MoDeRaToR'] }, 'moderator'), true)
  assert.equal(hasRole({ roles: ['reviewer'] }, 'admin'), false)
})

test('requireRolesOrJson should return unified forbidden payload with details', () => {
  const req = { user: { roles: ['reviewer'] } }
  const res = createRes()
  const ok = requireRolesOrJson(req, res, {
    roles: ['admin'],
    message: '仅管理员可执行该操作',
    requiredCapability: 'manage_admin',
  })
  assert.equal(ok, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.code, 'forbidden')
  assert.equal(res.body?.message, '仅管理员可执行该操作')
  assert.deepEqual(res.body?.details, {
    requiredRoles: ['admin'],
    actualRoles: ['reviewer'],
    requiredCapability: 'manage_admin',
  })
})

test('requireRolesOrJson should allow when user has any required role', () => {
  const req = { user: { roles: ['moderator'] } }
  const res = createRes()
  const ok = requireRolesOrJson(req, res, { roles: ['reviewer', 'moderator'] })
  assert.equal(ok, true)
  assert.equal(res.body, null)
  assert.equal(res.statusCode, 200)
})
