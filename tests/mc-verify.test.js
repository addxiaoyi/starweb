import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  createMcVerifySession,
  getMcVerifySession,
  clearMcVerifySession,
  getMcVerifySessionHistory,
} from '../src/features/mcVerify.js'
import { getStore, loadStore } from '../src/persist.js'

describe('mcVerify session API', () => {
  it('createMcVerifySession returns ok envelope with session', () => {
    loadStore()
    const store = getStore()
    store.mcVerifySessions = []
    store.mcVerifyMeta = {}

    const result = createMcVerifySession('u1', 'Steve')
    assert.equal(result.ok, true)
    assert.equal(typeof result.session?.code, 'string')
    assert.equal(result.session?.code.length, 6)

    const view = getMcVerifySession('u1')
    assert.equal(view.hasSession, true)
    assert.equal(view.code, result.session.code)
    assert.equal(view.mcUsername, 'steve')
  })

  it('createMcVerifySession conflicts without force', () => {
    const first = createMcVerifySession('u2', 'Alex')
    assert.equal(first.ok, true)
    const second = createMcVerifySession('u2', 'Alex')
    assert.equal(second.ok, false)
    assert.equal(second.error, 'session_conflict')
  })

  it('clearMcVerifySession cancels active session', () => {
    createMcVerifySession('u3', 'Notch')
    const cancelled = clearMcVerifySession('u3', 'user_cancelled')
    assert.equal(cancelled, true)
    const view = getMcVerifySession('u3')
    assert.equal(view.hasSession, false)
    assert.equal(view.lastState?.status, 'cancelled')
  })

  it('getMcVerifySessionHistory paginates', () => {
    createMcVerifySession('u4', 'Herobrine')
    clearMcVerifySession('u4', 'done')
    const history = getMcVerifySessionHistory('u4', { page: 1, pageSize: 10 })
    assert.ok(history.total >= 1)
    assert.ok(Array.isArray(history.items))
  })
})
