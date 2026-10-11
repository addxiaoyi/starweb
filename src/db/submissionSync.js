/** @type {Set<string>} */
const dirty = new Set()

export function markSubmissionDirty(id) {
  const key = String(id || '').trim()
  if (key) dirty.add(key)
}

export async function hydrateSubmissionsFromPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool) return
  const r = await pool.query('SELECT submission_id, payload FROM starmc_submission')
  if (!Array.isArray(store.submissions)) store.submissions = []
  const byId = new Map(store.submissions.map((s) => [String(s.id), s]))
  for (const row of r.rows) {
    const id = String(row.submission_id || '').trim()
    if (!id || !row.payload) continue
    byId.set(id, row.payload)
  }
  store.submissions = [...byId.values()]
}

export async function flushSubmissionsToPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool || dirty.size === 0) return
  const ids = [...dirty]
  dirty.clear()
  for (const submissionId of ids) {
    const sub = store.submissions?.find((s) => String(s.id) === submissionId)
    if (!sub) continue
    await pool.query(
      `INSERT INTO starmc_submission(submission_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (submission_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [submissionId, JSON.stringify(sub)]
    )
  }
}
