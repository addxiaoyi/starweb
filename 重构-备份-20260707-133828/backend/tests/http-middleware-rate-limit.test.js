import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRateLimitBody, buildRateLimitDetails } from '../src/middleware/http.js'

test('buildRateLimitDetails should include retryAfterSec and metadata', () => {
  const nowMs = Date.UTC(2026, 3, 27, 8, 0, 0)
  const req = {
    rateLimit: {
      limit: 30,
      remaining: 0,
      resetTime: new Date(nowMs + 15_000)
    }
  }
  const details = buildRateLimitDetails(req, { windowMs: 60_000, nowMs })
  assert.deepEqual(details, {
    retryAfterSec: 15,
    limit: 30,
    remaining: 0,
    windowSec: 60
  })
})

test('buildRateLimitDetails should keep compact output when fields missing', () => {
  const details = buildRateLimitDetails({}, { windowMs: 120_000, nowMs: 1_000 })
  assert.deepEqual(details, {
    windowSec: 120
  })
})

test('buildRateLimitBody should return unified too_many_requests shape', () => {
  const nowMs = Date.UTC(2026, 3, 27, 8, 0, 0)
  const req = {
    rateLimit: {
      limit: 8,
      remaining: 0,
      resetTime: new Date(nowMs + 4_000)
    }
  }
  const body = buildRateLimitBody(req, {
    message: '同步过于频繁，请稍后再试',
    windowMs: 60_000,
    nowMs
  })
  assert.deepEqual(body, {
    ok: false,
    success: false,
    message: '同步过于频繁，请稍后再试',
    code: 'too_many_requests',
    error: 'too_many_requests',
    details: {
      retryAfterSec: 4,
      limit: 8,
      remaining: 0,
      windowSec: 60
    }
  })
})
