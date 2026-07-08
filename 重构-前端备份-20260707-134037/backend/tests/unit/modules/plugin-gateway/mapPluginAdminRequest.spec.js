import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mapPluginAdminRequest } from '../../../../src/modules/plugin-gateway/mapPluginAdminRequest.js'

function vlaConfig(overrides = {}) {
  return { authxPluginAdapter: 'vla', authxVlaApiKey: 'key-123', ...overrides }
}

function nonVlaConfig() {
  return { authxPluginAdapter: 'authx', authxVlaApiKey: '' }
}

describe('mapPluginAdminRequest', () => {
  it('maps /admin/reset-password to /v1/admin/password with renamed field', () => {
    const r = mapPluginAdminRequest('/api/plugin/authx/admin/reset-password', { username: 'Steve', newPassword: 'abc' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/admin/password')
    assert.deepStrictEqual(r.body, { username: 'Steve', password: 'abc' })
    assert.deepStrictEqual(r.extraHeaders['X-API-Key'], 'key-123')
  })

  it('maps /admin/skin-refresh to /v1/skin/refresh', () => {
    const r = mapPluginAdminRequest('/admin/skin-refresh', { username: 'Alex' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/skin/refresh')
    assert.deepStrictEqual(r.body, { username: 'Alex' })
  })

  it('maps /admin/ban passthrough', () => {
    const r = mapPluginAdminRequest('/admin/ban', { name: 'x' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/admin/ban')
  })

  it('maps /admin/kick-online passthrough', () => {
    const r = mapPluginAdminRequest('/admin/kick-online', { name: 'x' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/admin/kick-online')
  })

  it('maps /admin/delete-user passthrough', () => {
    const r = mapPluginAdminRequest('/admin/delete-user', { name: 'x' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/admin/delete-user')
  })

  it('maps /admin/link-external-user to /v1/link/external-user', () => {
    const r = mapPluginAdminRequest('/admin/link-external-user', { username: 'Steve', external_user_id: 'u1' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/link/external-user')
    assert.deepStrictEqual(r.body, { username: 'Steve', external_user_id: 'u1' })
  })

  it('maps /admin/unbind-device with device field renamed to fingerprint', () => {
    const r = mapPluginAdminRequest('/admin/unbind-device', { username: 'Steve', device: 'dev-1' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/admin/unbind-device')
    assert.deepStrictEqual(r.body, { username: 'Steve', fingerprint: 'dev-1' })
  })

  it('coerces null device to empty string for unbind-device', () => {
    const r = mapPluginAdminRequest('/admin/unbind-device', { username: 'Steve', device: null }, vlaConfig())
    assert.strictEqual(r.body.fingerprint, '')
  })

  it('maps /admin/bind-email passthrough', () => {
    const r = mapPluginAdminRequest('/admin/bind-email', { username: 'Steve', email: 'a@b.com' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/admin/bind-email')
  })

  it('handles /internal/v1/link/external-user', () => {
    const r = mapPluginAdminRequest('/internal/v1/link/external-user', { username: 'Steve', external_user_id: 'u1' }, vlaConfig())
    assert.strictEqual(r.path, '/v1/link/external-user')
    assert.deepStrictEqual(r.body, { username: 'Steve', external_user_id: 'u1' })
  })

  it('passes through unknown paths as-is', () => {
    const r = mapPluginAdminRequest('/v1/custom/endpoint', { foo: 1 }, vlaConfig())
    assert.strictEqual(r.path, '/v1/custom/endpoint')
    assert.deepStrictEqual(r.body, { foo: 1 })
  })

  it('returns body as-is and no api key for non-VLA adapter', () => {
    const r = mapPluginAdminRequest('/admin/ban', { name: 'x' }, nonVlaConfig())
    assert.strictEqual(r.path, '/admin/ban')
    assert.deepStrictEqual(r.body, { name: 'x' })
    assert.strictEqual(r.extraHeaders['X-API-Key'], undefined)
  })

  it('calls warnFn for non-VLA adapter', () => {
    let warned = false
    mapPluginAdminRequest('/admin/ban', {}, nonVlaConfig(), () => { warned = true })
    assert.strictEqual(warned, true)
  })

  it('defaults body to empty object when undefined', () => {
    const r = mapPluginAdminRequest('/admin/ban', undefined, vlaConfig())
    assert.deepStrictEqual(r.body, {})
  })
})
