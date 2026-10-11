import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  filterReviewAuditLogs,
  summarizeSubmissionStats,
} from '../../../../src/modules/skin/service.js'

describe('skin review service helpers', () => {
  it('summarizeSubmissionStats counts by status', () => {
    const store = {
      submissions: [
        { status: 'pending', submittedAt: '2026-07-01T10:00:00.000Z' },
        { status: 'pending', submittedAt: '2026-07-02T10:00:00.000Z' },
        { status: 'approved', submittedAt: '2026-06-30T10:00:00.000Z' },
        { status: 'rejected', submittedAt: '2026-06-29T10:00:00.000Z' },
      ],
    }
    const stats = summarizeSubmissionStats(store)
    assert.strictEqual(stats.total, 4)
    assert.strictEqual(stats.pending, 2)
    assert.strictEqual(stats.approved, 1)
    assert.strictEqual(stats.rejected, 1)
    assert.strictEqual(stats.latestSubmittedAt, '2026-07-02T10:00:00.000Z')
  })

  it('filterReviewAuditLogs applies action and keyword filters', () => {
    const store = {
      reviewAuditLogs: [
        { id: '1', action: 'approve', operator: 'alice', submissionId: 's1', title: 'Skin A' },
        { id: '2', action: 'reject', operator: 'bob', submissionId: 's2', title: 'Skin B' },
      ],
    }
    const rows = filterReviewAuditLogs(store, { action: 'approve', q: 'skin a' })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].id, '1')
  })
})
