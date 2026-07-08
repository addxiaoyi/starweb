import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmVerifyCodeLogin } from '../src/features/verifyCodeLogin.js'

function createStore() {
  return {
    verifyCodeChallenges: [],
    verifyCodeLocks: {}
  }
}

test('confirmVerifyCodeLogin should return retryAfterSec when account is locked', async () => {
  const store = createStore()
  const email = 'locked@example.com'
  const lockKey = email.toLowerCase()
  const now = Date.now()
  store.verifyCodeLocks[lockKey] = {
    fails: [now - 1000, now - 500],
    bannedUntil: now + 60_000
  }

  let loginCalled = false
  const result = await confirmVerifyCodeLogin(
    store,
    {
      id: '',
      email,
      code: '123456',
      password: '',
      mode: 'login'
    },
    {
      onLogin: async () => {
        loginCalled = true
        return { userId: 'u-1', email }
      }
    }
  )

  assert.equal(result.ok, false)
  assert.equal(result.error, 'account_locked')
  assert.equal(result.attemptsLeft, 0)
  assert.equal(typeof result.retryAfterSec, 'number')
  assert.equal(result.retryAfterSec > 0, true)
  assert.equal(loginCalled, false)
})

test('confirmVerifyCodeLogin should return bad_code and attemptsLeft for invalid code format', async () => {
  const store = createStore()
  const result = await confirmVerifyCodeLogin(
    store,
    {
      id: '',
      email: 'format@example.com',
      code: 'abc123',
      password: '',
      mode: 'login'
    },
    {}
  )

  assert.equal(result.ok, false)
  assert.equal(result.error, 'bad_code')
  assert.equal(result.attemptsLeft, 5)
  assert.equal(result.retryAfterSec, undefined)
})
