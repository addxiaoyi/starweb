import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidSiteUsername, makeUniqueSiteUsername } from '../src/validation/siteUsername.js'

test('rejects pure ASCII letters/digits/symbols', () => {
  assert.equal(isValidSiteUsername('player1').ok, false)
  assert.equal(isValidSiteUsername('abc_def').ok, false)
  assert.equal(isValidSiteUsername('User123').ok, false)
})

test('accepts email-shaped username', () => {
  assert.equal(isValidSiteUsername('a@b.co').ok, true)
  assert.equal(isValidSiteUsername('u+tag@example.com').ok, true)
})

test('accepts name with Han script', () => {
  assert.equal(isValidSiteUsername('张三').ok, true)
  assert.equal(isValidSiteUsername('玩家Abc').ok, true)
})

test('makeUniqueSiteUsername disambiguates', () => {
  const store = {
    users: [{ username: 'a@b.com' }, { username: '张三' }]
  }
  assert.equal(makeUniqueSiteUsername(store, 'a@b.com'), 'a_1@b.com')
  assert.equal(makeUniqueSiteUsername(store, '李四'), '李四')
  assert.equal(makeUniqueSiteUsername(store, '张三'), '张三_1')
})
