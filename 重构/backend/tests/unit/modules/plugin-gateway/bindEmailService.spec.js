import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import { handlePluginBindEmail, PluginBindEmailError } from '../../../../src/modules/plugin-gateway/bindEmailService.js'

function createStore(overrides = {}) {
  return {
    users: [],
    userNotifications: {},
    securityCenter: {
      sessions: {},
      alerts: [],
      auditLogs: [],
    },
    ...overrides,
  }
}

function createUser(options = {}) {
  return {
    id: 'user-1',
    email: 'steve@example.com',
    linkedMcUsername: null,
    linkedMcUuid: null,
    ...options,
  }
}

function makeDeps(overrides = {}) {
  const calls = {
    isValidEmailAddress: [],
    findUserByLinkedMcUsername: [],
    ensureSiteUserForPluginEmail: [],
    vlaLinkExternalUser: [],
    vlaAdminBindEmail: [],
    markUserProfileDirty: [],
    appendSecurityAudit: [],
    pushUserNotification: [],
    scheduleSave: [],
  }

  const deps = {
    isValidEmailAddress: (email) => {
      calls.isValidEmailAddress.push(email)
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))
    },
    findUserByLinkedMcUsername: (store, mcName) => {
      calls.findUserByLinkedMcUsername.push({ store, mcName })
      return null
    },
    ensureSiteUserForPluginEmail: async (store, email) => {
      calls.ensureSiteUserForPluginEmail.push({ store, email })
      const user = createUser({ email })
      return { localUser: user, stUser: { id: user.id }, created: true }
    },
    vlaLinkExternalUser: async (mcUsername, externalUserId) => {
      calls.vlaLinkExternalUser.push({ mcUsername, externalUserId })
      return { ok: true, status: 200, json: { ok: true } }
    },
    vlaAdminBindEmail: async (mcUsername, email) => {
      calls.vlaAdminBindEmail.push({ mcUsername, email })
      return { ok: true, status: 200, json: { ok: true } }
    },
    markUserProfileDirty: (userId) => {
      calls.markUserProfileDirty.push(userId)
    },
    appendSecurityAudit: (store, userId, action, detail) => {
      calls.appendSecurityAudit.push({ store, userId, action, detail })
    },
    pushUserNotification: (store, userId, payload) => {
      calls.pushUserNotification.push({ store, userId, payload })
    },
    scheduleSave: () => {
      calls.scheduleSave.push(null)
    },
    ...overrides,
  }

  return { deps, calls }
}

describe('plugin-gateway bindEmailService', () => {
  describe('handlePluginBindEmail', () => {
    let store

    beforeEach(() => {
      store = createStore()
    })

    it('rejects invalid email format', async () => {
      const { deps } = makeDeps({
        isValidEmailAddress: () => false,
      })

      await assert.rejects(
        () => handlePluginBindEmail(store, { email: 'bad-email', username: 'Steve' }, deps),
        (err) => err instanceof PluginBindEmailError && err.code === 'invalid_email' && err.status === 400
      )
    })

    it('rejects invalid minecraft username length', async () => {
      const { deps } = makeDeps()

      await assert.rejects(
        () => handlePluginBindEmail(store, { email: 'steve@example.com', username: 'ab' }, deps),
        (err) => err instanceof PluginBindEmailError && err.code === 'validation_error' && err.status === 400
      )
    })

    it('creates a new user and binds the email', async () => {
      const { deps, calls } = makeDeps()
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
        current_ip: '127.0.0.1',
      }

      const result = await handlePluginBindEmail(store, body, deps)

      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.created, true)
      assert.strictEqual(result.userId, 'user-1')
      assert.strictEqual(result.email, 'steve@example.com')
      assert.strictEqual(result.linkedMcUsername, 'Steve')
      assert.strictEqual(result.linkedMcUuid, 'uuid-1')
      assert.strictEqual(result.externalUserId, 'user-1')
      assert.strictEqual(calls.vlaLinkExternalUser.length, 1)
      assert.strictEqual(calls.vlaAdminBindEmail.length, 1)
      assert.deepStrictEqual(calls.markUserProfileDirty, ['user-1'])
      assert.strictEqual(calls.scheduleSave.length, 1)
      assert.strictEqual(calls.appendSecurityAudit.length, 1)
      const audit = calls.appendSecurityAudit[0]
      assert.strictEqual(audit.action, 'plugin_bind_email')
      assert.strictEqual(audit.detail.email, 'steve@example.com')
      assert.strictEqual(audit.detail.mcUsername, 'Steve')
      assert.strictEqual(audit.detail.externalUserId, 'ext-1')
      assert.strictEqual(audit.detail.previousMcUsername, null)
      assert.strictEqual(audit.detail.currentIp, '127.0.0.1')
      assert.strictEqual(audit.detail.source, 'plugin_callback')
      assert.strictEqual(calls.pushUserNotification.length, 1)
      assert.strictEqual(calls.pushUserNotification[0].payload.type, 'binding_changed')
      assert.strictEqual(calls.pushUserNotification[0].payload.title, '已创建皮肤站账号并绑定角色')
    })

    it('binds to an existing user when email already has an account', async () => {
      const existingUser = createUser({ id: 'user-existing', linkedMcUsername: null })
      const { deps, calls } = makeDeps({
        ensureSiteUserForPluginEmail: async (store, email) => {
          calls.ensureSiteUserForPluginEmail.push({ store, email })
          return { localUser: existingUser, stUser: { id: existingUser.id }, created: false }
        },
      })
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
      }

      const result = await handlePluginBindEmail(store, body, deps)

      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.created, false)
      assert.strictEqual(result.userId, 'user-existing')
      assert.strictEqual(existingUser.linkedMcUsername, 'Steve')
      assert.strictEqual(calls.pushUserNotification[0].payload.title, '已绑定邮箱与游戏角色')
    })

    it('rejects when the minecraft username is already linked to another account', async () => {
      const otherUser = createUser({ id: 'user-other', linkedMcUsername: 'Steve' })
      const { deps, calls } = makeDeps({
        findUserByLinkedMcUsername: (store, mcName) => {
          calls.findUserByLinkedMcUsername.push({ store, mcName })
          if (mcName === 'Steve') return otherUser
          return null
        },
        ensureSiteUserForPluginEmail: async (store, email) => {
          calls.ensureSiteUserForPluginEmail.push({ store, email })
          return { localUser: createUser({ id: 'user-1' }), stUser: { id: 'user-1' }, created: true }
        },
      })
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
      }

      await assert.rejects(
        () => handlePluginBindEmail(store, body, deps),
        (err) =>
          err instanceof PluginBindEmailError &&
          err.code === 'mc_already_linked' &&
          err.status === 409 &&
          err.payload.linkedUserId === 'user-other'
      )
      assert.strictEqual(calls.vlaLinkExternalUser.length, 0)
      assert.strictEqual(calls.vlaAdminBindEmail.length, 0)
    })

    it('rejects when the email is already linked to another minecraft username', async () => {
      const existingUser = createUser({ id: 'user-1', linkedMcUsername: 'OldUser' })
      const { deps, calls } = makeDeps({
        ensureSiteUserForPluginEmail: async (store, email) => {
          calls.ensureSiteUserForPluginEmail.push({ store, email })
          return { localUser: existingUser, stUser: { id: existingUser.id }, created: false }
        },
      })
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
      }

      await assert.rejects(
        () => handlePluginBindEmail(store, body, deps),
        (err) =>
          err instanceof PluginBindEmailError &&
          err.code === 'email_already_linked' &&
          err.status === 409 &&
          err.payload.linkedMcUsername === 'OldUser'
      )
      assert.strictEqual(calls.vlaLinkExternalUser.length, 0)
    })

    it('rejects when VLA link external user fails', async () => {
      const { deps, calls } = makeDeps({
        vlaLinkExternalUser: async (mcUsername, externalUserId) => {
          calls.vlaLinkExternalUser.push({ mcUsername, externalUserId })
          return { ok: false, status: 500, json: { error: 'link service down' } }
        },
      })
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
      }

      await assert.rejects(
        () => handlePluginBindEmail(store, body, deps),
        (err) =>
          err instanceof PluginBindEmailError &&
          err.code === 'link_failed' &&
          err.status === 500 &&
          err.payload.message === 'link service down'
      )
      assert.strictEqual(calls.vlaAdminBindEmail.length, 0)
      assert.strictEqual(calls.scheduleSave.length, 0)
    })

    it('rejects when VLA admin bind email fails', async () => {
      const { deps, calls } = makeDeps({
        vlaAdminBindEmail: async (mcUsername, email) => {
          calls.vlaAdminBindEmail.push({ mcUsername, email })
          return { ok: false, status: 400, json: { error: 'email already used in plugin' } }
        },
      })
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
      }

      await assert.rejects(
        () => handlePluginBindEmail(store, body, deps),
        (err) =>
          err instanceof PluginBindEmailError &&
          err.code === 'bind_email_failed' &&
          err.status === 400 &&
          err.payload.message === 'email already used in plugin'
      )
      assert.strictEqual(calls.scheduleSave.length, 0)
    })

    it('succeeds when VLA calls are skipped', async () => {
      const { deps } = makeDeps()
      deps.vlaLinkExternalUser = async () => ({ skipped: true, ok: false })
      deps.vlaAdminBindEmail = async () => ({ skipped: true, ok: false })
      const store = createStore()
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
        current_ip: '1.2.3.4',
      }

      const result = await handlePluginBindEmail(store, body, deps)

      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.linkedMcUsername, 'Steve')
    })

    it('allows re-binding the same minecraft username to the same user', async () => {
      const store = createStore()
      const existingUser = { id: 'user-1', email: 'steve@example.com', linkedMcUsername: 'Steve' }
      const { deps } = makeDeps()
      deps.findUserByLinkedMcUsername = () => existingUser
      deps.ensureSiteUserForPluginEmail = async () => ({ localUser: existingUser, created: false })
      const body = {
        email: 'steve@example.com',
        username: 'Steve',
        external_user_id: 'ext-1',
        uuid: 'uuid-1',
        current_ip: '1.2.3.4',
      }

      const result = await handlePluginBindEmail(store, body, deps)

      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.userId, 'user-1')
    })
  })
})
