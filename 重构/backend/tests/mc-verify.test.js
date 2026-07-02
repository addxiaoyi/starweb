import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starmc-mcverify-'))
process.env.DATA_DIR = dataDir
process.env.NODE_ENV = 'test'
process.env.STORE_BACKUP_ENABLED = '0'

const {
  createMcVerifySession,
  getMcVerifySession,
  getMcVerifySessionHistory,
  clearMcVerifySession,
  failMcVerifySession,
  completeMcVerifySession,
} = await import('../src/features/mcVerify.js')
const { getStore, flushSaveSync } = await import('../src/persist.js')

function resetStore() {
  const store = getStore()
  store.users = []
  delete store._mcVerifySessions
  delete store._mcVerifySessionHistory
  delete store._mcVerifyInitRate
  return store
}

function seedUser(userId) {
  const store = getStore()
  store.users.push({
    id: userId,
    username: `u_${userId}`,
    linkedMcUuid: null,
    verifiedMojang: false,
    roles: [],
  })
  return store
}

beforeEach(() => {
  flushSaveSync()
  resetStore()
})

afterEach(() => {
  flushSaveSync()
})

after(() => {
  flushSaveSync()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('createMcVerifySession should enforce retry chain max limit', () => {
  const userId = 'retry-user'
  seedUser(userId)

  const first = createMcVerifySession(userId, 'StarPlayer', { maxRetries: 2 })
  assert.equal(first.ok, true)
  assert.equal(first.session?.retries, 1)
  const fail1 = failMcVerifySession(userId, 'verification_failed', {
    mcUsername: 'starplayer',
    conflictCode: 'callback_verification_failed',
  })
  assert.equal(fail1.ok, true)
  assert.equal(fail1.code, 'failed')

  const second = createMcVerifySession(userId, 'StarPlayer', { maxRetries: 2 })
  assert.equal(second.ok, true)
  assert.equal(second.session?.retries, 2)
  const fail2 = failMcVerifySession(userId, 'verification_failed', {
    mcUsername: 'starplayer',
    conflictCode: 'callback_verification_failed',
  })
  assert.equal(fail2.ok, true)
  assert.equal(fail2.code, 'failed')

  const blocked = createMcVerifySession(userId, 'StarPlayer', { maxRetries: 2 })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error, 'max_retries_exceeded')
  assert.equal(blocked.retryCount, 2)
  assert.equal(blocked.maxRetries, 2)
  assert.ok(Number(blocked.retryAfterSeconds) > 0)
})

test('force init should supersede active session and keep conflict metadata in history', () => {
  const userId = 'force-user'
  seedUser(userId)

  const first = createMcVerifySession(userId, 'StarPlayer')
  assert.equal(first.ok, true)

  const conflict = createMcVerifySession(userId, 'StarPlayer')
  assert.equal(conflict.ok, false)
  assert.equal(conflict.error, 'session_conflict')
  assert.equal(conflict.session?.id, first.session?.id)

  const forced = createMcVerifySession(userId, 'StarPlayer', { force: true })
  assert.equal(forced.ok, true)
  assert.notEqual(forced.session?.id, first.session?.id)

  const state = getMcVerifySession(userId)
  assert.equal(state.hasSession, true)
  assert.equal(state.status, 'pending')
  assert.equal(state.lastState?.status, 'cancelled')
  assert.equal(state.lastState?.failureReason, 'superseded_by_new_session')
  assert.equal(state.lastState?.conflictCode, 'session_replaced')
})

test('callback transition should return explicit conflict codes', () => {
  const userId = 'callback-user'
  seedUser(userId)

  const noSession = completeMcVerifySession(userId, 'uuid-1', { mcUsername: 'alice' })
  assert.equal(noSession.ok, false)
  assert.equal(noSession.code, 'no_active_session')

  const init = createMcVerifySession(userId, 'alice')
  assert.equal(init.ok, true)

  const missingUuid = completeMcVerifySession(userId, '', { mcUsername: 'alice' })
  assert.equal(missingUuid.ok, false)
  assert.equal(missingUuid.code, 'missing_mojang_uuid')
  assert.equal(getMcVerifySession(userId).hasSession, true)

  const completeMismatch = completeMcVerifySession(userId, 'uuid-1', { mcUsername: 'bob' })
  assert.equal(completeMismatch.ok, false)
  assert.equal(completeMismatch.code, 'session_username_mismatch')
  assert.equal(completeMismatch.session?.mcUsername, 'alice')

  const failMismatch = failMcVerifySession(userId, 'verification_failed', { mcUsername: 'bob' })
  assert.equal(failMismatch.ok, false)
  assert.equal(failMismatch.code, 'session_username_mismatch')

  const failOk = failMcVerifySession(userId, 'verification_failed', {
    mcUsername: 'alice',
    conflictCode: 'callback_username_mismatch',
  })
  assert.equal(failOk.ok, true)
  assert.equal(failOk.code, 'failed')

  const state = getMcVerifySession(userId)
  assert.equal(state.hasSession, false)
  assert.equal(state.status, 'failed')
  assert.equal(state.conflictCode, 'callback_username_mismatch')
})

test('getMcVerifySessionHistory should support pagination and status filter', () => {
  const userId = 'history-user'
  seedUser(userId)

  const first = createMcVerifySession(userId, 'alice')
  assert.equal(first.ok, true)
  const fail = failMcVerifySession(userId, 'verification_failed', { mcUsername: 'alice' })
  assert.equal(fail.ok, true)

  const second = createMcVerifySession(userId, 'alice')
  assert.equal(second.ok, true)
  const cancelled = clearMcVerifySession(userId, 'user_cancelled')
  assert.equal(cancelled, true)

  const third = createMcVerifySession(userId, 'alice')
  assert.equal(third.ok, true)
  const success = completeMcVerifySession(userId, 'uuid-3', { mcUsername: 'alice' })
  assert.equal(success.ok, true)

  const page1 = getMcVerifySessionHistory(userId, { page: 1, pageSize: 2 })
  assert.equal(page1.total, 3)
  assert.equal(page1.page, 1)
  assert.equal(page1.pageSize, 2)
  assert.equal(page1.items.length, 2)

  const page2 = getMcVerifySessionHistory(userId, { page: 2, pageSize: 2 })
  assert.equal(page2.total, 3)
  assert.equal(page2.items.length, 1)

  const failedOnly = getMcVerifySessionHistory(userId, {
    page: 1,
    pageSize: 10,
    status: 'failed',
  })
  assert.equal(failedOnly.total, 1)
  assert.equal(failedOnly.items[0]?.status, 'failed')
  assert.equal(failedOnly.items[0]?.failureReason, 'verification_failed')
})
