import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSubmissionItem, appendReviewAuditLog } from '../src/modules/skin/service.js'

test('skin normalizeSubmissionItem smoke', () => {
  const normalized = normalizeSubmissionItem({
    id: 1,
    fileName: 'skin.png',
    userId: 'u1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    status: 'pending'
  })
  assert.equal(normalized.id, '1')
  assert.equal(normalized.title, 'skin.png')
  assert.equal(normalized.submitter, 'u1')
  assert.equal(normalized.status, 'pending')
})

test('skin appendReviewAuditLog smoke', () => {
  const store = { reviewAuditLogs: [] }
  const dirty = []
  const fakeCrypto = { randomUUID: () => 'rid-1' }

  appendReviewAuditLog(store, (k) => dirty.push(k), fakeCrypto, {
    submissionId: 'sub-1',
    action: 'approve',
    time: '2026-01-01T00:00:00.000Z'
  })

  assert.equal(store.reviewAuditLogs.length, 1)
  assert.equal(store.reviewAuditLogs[0].id, 'rid-1')
  assert.equal(dirty[0], 'review_audit_logs')
})
