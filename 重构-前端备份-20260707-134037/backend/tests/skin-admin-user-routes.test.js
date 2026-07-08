import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerSkinAdminRoutes } from '../src/modules/skinAdmin/index.js'

function createAppStub() {
  const routes = []
  return {
    routes,
    get(path, ...handlers) {
      routes.push({ method: 'GET', path, handlers })
    },
    post(path, ...handlers) {
      routes.push({ method: 'POST', path, handlers })
    },
    put(path, ...handlers) {
      routes.push({ method: 'PUT', path, handlers })
    },
    patch(path, ...handlers) {
      routes.push({ method: 'PATCH', path, handlers })
    },
    delete(path, ...handlers) {
      routes.push({ method: 'DELETE', path, handlers })
    }
  }
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = Number(code)
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

function jsonErr(res, status, message, code = 'error', details) {
  return res.status(status).json({
    ok: false,
    message,
    code,
    details: details ?? null
  })
}

function createHarness(seedUsers = []) {
  const app = createAppStub()
  const store = {
    users: seedUsers.map((item) => ({ ...item })),
    catalog: [],
    userAdminAuditLogs: []
  }
  let uuidSeq = 0
  let saveCount = 0
  const dirtyUserIds = []
  const dirtyKvKeys = []

  registerSkinAdminRoutes(app, {
    getStore: () => store,
    scheduleSave: () => { saveCount += 1 },
    markKvDirty: (key) => dirtyKvKeys.push(String(key)),
    markUserProfileDirty: (id) => dirtyUserIds.push(String(id)),
    requireAdmin: (_req, _res, next) => next && next(),
    jsonErr,
    jsonPage: (res, payload) => res.json(payload),
    asyncHandler: (fn) => fn,
    crypto: { randomUUID: () => `uuid-${++uuidSeq}` }
  })

  function resolveHandler(method, path) {
    const found = app.routes.find((route) => route.method === method && route.path === path)
    assert.ok(found, `missing route ${method} ${path}`)
    assert.ok(found.handlers.length > 0, `no handlers for route ${method} ${path}`)
    return found.handlers[found.handlers.length - 1]
  }

  async function callRoute(method, path, req = {}) {
    const handler = resolveHandler(method, path)
    const res = createRes()
    const request = {
      params: {},
      query: {},
      body: {},
      user: { id: 'admin-1', username: 'admin' },
      ...req
    }
    const ret = handler(request, res)
    if (ret && typeof ret.then === 'function') await ret
    return res
  }

  return {
    store,
    dirtyUserIds,
    dirtyKvKeys,
    getSaveCount: () => saveCount,
    callRoute
  }
}

test('admin users list supports keyword/status/role filters and pagination', async () => {
  const h = createHarness([
    { id: 'u1', username: 'Alice', email: 'alice@example.com', roles: ['admin'], isBanned: false, emailVerified: true },
    { id: 'u2', username: 'Bob', email: 'bob@example.com', roles: ['reviewer'], isBanned: true, emailVerified: false },
    { id: 'u3', username: 'Carol', email: 'carol@example.com', roles: ['moderator'], isBanned: false, emailVerified: true }
  ])

  const filtered = await h.callRoute('GET', '/api/admin/users', {
    query: { keyword: 'bob', status: 'banned', role: 'reviewer', page: '1', pageSize: '10' }
  })
  assert.equal(filtered.statusCode, 200)
  assert.equal(filtered.body.total, 1)
  assert.equal(filtered.body.items.length, 1)
  assert.equal(filtered.body.items[0].id, 'u2')

  const paged = await h.callRoute('GET', '/api/admin/users', {
    query: { page: '2', pageSize: '1' }
  })
  assert.equal(paged.statusCode, 200)
  assert.equal(paged.body.total, 3)
  assert.equal(paged.body.items.length, 1)
  assert.equal(paged.body.items[0].id, 'u2')
})

test('admin users and audit list should support legacy offset/limit pagination', async () => {
  const h = createHarness([
    { id: 'u1', username: 'Alice', email: 'alice@example.com', roles: ['admin'], isBanned: false, emailVerified: true },
    { id: 'u2', username: 'Bob', email: 'bob@example.com', roles: ['reviewer'], isBanned: false, emailVerified: true },
    { id: 'u3', username: 'Carol', email: 'carol@example.com', roles: ['moderator'], isBanned: false, emailVerified: true }
  ])

  const usersPage = await h.callRoute('GET', '/api/admin/users', {
    query: { offset: '1', limit: '1' }
  })
  assert.equal(usersPage.statusCode, 200)
  assert.equal(usersPage.body.total, 3)
  assert.equal(usersPage.body.page, 2)
  assert.equal(usersPage.body.pageSize, 1)
  assert.equal(usersPage.body.items.length, 1)
  assert.equal(usersPage.body.items[0].id, 'u2')

  await h.callRoute('PATCH', '/api/admin/users/:id', {
    params: { id: 'u1' },
    body: { note: 'edit-first' }
  })
  await h.callRoute('POST', '/api/admin/users/:id/ban', {
    params: { id: 'u1' },
    body: { reason: 'ban-for-offset-limit' }
  })

  const auditPage = await h.callRoute('GET', '/api/admin/users/:id/audit', {
    params: { id: 'u1' },
    query: { offset: '1', limit: '1' }
  })
  assert.equal(auditPage.statusCode, 200)
  assert.equal(auditPage.body.total, 2)
  assert.equal(auditPage.body.page, 2)
  assert.equal(auditPage.body.pageSize, 1)
  assert.equal(auditPage.body.items.length, 1)
  assert.equal(auditPage.body.items[0].action, 'user_edit')
})

test('admin skins list should support legacy offset/limit pagination', async () => {
  const h = createHarness([
    { id: 'admin-1', username: 'Admin', email: 'admin@example.com', roles: ['admin'], isBanned: false, emailVerified: true }
  ])
  h.store.catalog = [
    { id: 's1', title: 'A', skinTextureUrl: 'https://cdn.example.com/a.png', model: 'default', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' },
    { id: 's2', title: 'B', skinTextureUrl: 'https://cdn.example.com/b.png', model: 'default', createdAt: '2026-04-02T00:00:00.000Z', updatedAt: '2026-04-02T00:00:00.000Z' },
    { id: 's3', title: 'C', skinTextureUrl: 'https://cdn.example.com/c.png', model: 'default', createdAt: '2026-04-03T00:00:00.000Z', updatedAt: '2026-04-03T00:00:00.000Z' }
  ]

  const res = await h.callRoute('GET', '/api/admin/skins', {
    query: { offset: '1', limit: '1' }
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.total, 3)
  assert.equal(res.body.page, 2)
  assert.equal(res.body.pageSize, 1)
  assert.equal(res.body.items.length, 1)
  assert.equal(res.body.items[0].id, 's2')
})

test('admin user edit validates conflict and marks user profile dirty on success', async () => {
  const h = createHarness([
    { id: 'u1', username: 'Alice', email: 'alice@example.com', roles: ['admin'], isBanned: false, emailVerified: true },
    { id: 'u2', username: 'Bob', email: 'bob@example.com', roles: ['reviewer'], isBanned: false, emailVerified: true }
  ])

  const conflict = await h.callRoute('PATCH', '/api/admin/users/:id', {
    params: { id: 'u1' },
    body: { username: 'Bob' }
  })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.body.code, 'username_exists')
  assert.equal(h.dirtyUserIds.length, 0)
  assert.equal(h.getSaveCount(), 0)

  const ok = await h.callRoute('PATCH', '/api/admin/users/:id', {
    params: { id: 'u1' },
    body: {
      username: 'AliceNew',
      email: 'alice.new@example.com',
      emailVerified: false,
      note: 'updated by test'
    }
  })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.ok, true)
  assert.equal(ok.body.user.username, 'AliceNew')
  assert.equal(ok.body.user.emailVerified, false)
  assert.deepEqual(h.dirtyUserIds, ['u1'])
  assert.equal(h.getSaveCount(), 1)
})

test('admin user role update sanitizes roles and marks profile dirty', async () => {
  const h = createHarness([
    { id: 'u1', username: 'Alice', email: 'alice@example.com', roles: ['moderator'], isBanned: false, emailVerified: true }
  ])

  const res = await h.callRoute('PUT', '/api/admin/users/:id/roles', {
    params: { id: 'u1' },
    body: { roles: ['admin', 'ADMIN', 'reviewer', 'invalid'] }
  })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.roles, ['admin', 'reviewer'])
  assert.deepEqual(h.store.users[0].roles, ['admin', 'reviewer'])
  assert.deepEqual(h.dirtyUserIds, ['u1'])
  assert.equal(h.getSaveCount(), 1)
})

test('ban and unban flow updates state and marks profile dirty for each mutation', async () => {
  const h = createHarness([
    { id: 'u1', username: 'Alice', email: 'alice@example.com', roles: ['reviewer'], isBanned: false, emailVerified: true }
  ])

  const banRes = await h.callRoute('POST', '/api/admin/users/:id/ban', {
    params: { id: 'u1' },
    body: { reason: 'abuse', durationHours: 2 }
  })
  assert.equal(banRes.statusCode, 200)
  assert.equal(banRes.body.user.isBanned, true)
  assert.equal(h.store.users[0].banReason, 'abuse')
  assert.equal(typeof h.store.users[0].bannedUntil, 'string')

  const unbanRes = await h.callRoute('POST', '/api/admin/users/:id/unban', {
    params: { id: 'u1' }
  })
  assert.equal(unbanRes.statusCode, 200)
  assert.equal(unbanRes.body.user.isBanned, false)
  assert.equal(h.store.users[0].banReason, '')
  assert.deepEqual(h.dirtyUserIds, ['u1', 'u1'])
  assert.equal(h.getSaveCount(), 2)
})

test('delete user forbids self-delete and marks deleted user dirty when successful', async () => {
  const h = createHarness([
    { id: 'admin-1', username: 'Admin', email: 'admin@example.com', roles: ['admin'], isBanned: false, emailVerified: true },
    { id: 'u2', username: 'Bob', email: 'bob@example.com', roles: ['reviewer'], isBanned: false, emailVerified: true }
  ])

  const selfDel = await h.callRoute('DELETE', '/api/admin/users/:id', {
    params: { id: 'admin-1' },
    user: { id: 'admin-1', username: 'Admin' }
  })
  assert.equal(selfDel.statusCode, 400)
  assert.equal(selfDel.body.code, 'cannot_delete_self')
  assert.equal(h.store.users.length, 2)
  assert.equal(h.dirtyUserIds.length, 0)

  const ok = await h.callRoute('DELETE', '/api/admin/users/:id', {
    params: { id: 'u2' },
    user: { id: 'admin-1', username: 'Admin' }
  })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.ok, true)
  assert.equal(ok.body.id, 'u2')
  assert.equal(h.store.users.length, 1)
  assert.deepEqual(h.dirtyUserIds, ['u2'])
  assert.equal(h.getSaveCount(), 1)
})

test('admin user audit endpoint returns paged audit rows', async () => {
  const h = createHarness([
    { id: 'u1', username: 'Alice', email: 'alice@example.com', roles: ['admin'], isBanned: false, emailVerified: true }
  ])

  await h.callRoute('PATCH', '/api/admin/users/:id', {
    params: { id: 'u1' },
    body: { note: 'first edit' }
  })
  await h.callRoute('POST', '/api/admin/users/:id/ban', {
    params: { id: 'u1' },
    body: { reason: 'ban for test' }
  })

  const page1 = await h.callRoute('GET', '/api/admin/users/:id/audit', {
    params: { id: 'u1' },
    query: { page: '1', pageSize: '1' }
  })
  assert.equal(page1.statusCode, 200)
  assert.equal(page1.body.total, 2)
  assert.equal(page1.body.items.length, 1)
  assert.equal(page1.body.items[0].action, 'user_ban')

  const page2 = await h.callRoute('GET', '/api/admin/users/:id/audit', {
    params: { id: 'u1' },
    query: { page: '2', pageSize: '1' }
  })
  assert.equal(page2.statusCode, 200)
  assert.equal(page2.body.total, 2)
  assert.equal(page2.body.items.length, 1)
  assert.equal(page2.body.items[0].action, 'user_edit')
})
