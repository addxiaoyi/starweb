import { getPool } from './pool.js'

const dirtySubmissionIds = new Set()
let syncing = false

export function markSubmissionDirty(submissionId) {
  if (submissionId == null || submissionId === '') return
  dirtySubmissionIds.add(String(submissionId))
}

function normalizePayload(p) {
  if (p == null) return {}
  if (typeof p === 'string') {
    try {
      return JSON.parse(p)
    } catch {
      return {}
    }
  }
  if (typeof p === 'object') return JSON.parse(JSON.stringify(p))
  return {}
}

function submittedAtFromPayload(sub) {
  const raw = sub && sub.submittedAt != null ? String(sub.submittedAt).trim() : ''
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * @param {Record<string, unknown>} store
 */
export async function hydrateSubmissionsFromPg(store) {
  const pool = getPool()
  if (!pool || !Array.isArray(store.submissions)) return
  const r = await pool.query(
    'SELECT id, payload FROM site_submission ORDER BY submitted_at ASC NULLS LAST, id ASC'
  )
  for (const row of r.rows) {
    const id = String(row.id || '')
    if (!id) continue
    const data = normalizePayload(row.payload)
    data.id = id
    const idx = store.submissions.findIndex((s) => s && String(s.id) === id)
    if (idx >= 0) store.submissions[idx] = data
    else store.submissions.push(data)
  }
  if (r.rows.length > 0) {
    console.log(`[starmc-api] 已从 PostgreSQL 合并 ${r.rows.length} 条 submission`)
  }
}

/**
 * @param {Record<string, unknown>} store
 */
export async function syncDirtySubmissionsToPg(store) {
  const pool = getPool()
  if (!pool || dirtySubmissionIds.size === 0) return
  if (!store || !Array.isArray(store.submissions)) return
  if (syncing) return
  syncing = true
  const ids = [...dirtySubmissionIds]
  dirtySubmissionIds.clear()
  const client = await pool.connect()
  let inTx = false
  try {
    await client.query('BEGIN')
    inTx = true
    for (const sid of ids) {
      const sub = store.submissions.find((s) => s && String(s.id) === sid)
      if (!sub) {
        await client.query('DELETE FROM site_submission WHERE id = $1', [sid])
        continue
      }
      const payload = normalizePayload(sub)
      const userId = String(payload.userId || '').trim()
      if (!userId) continue
      const sa = submittedAtFromPayload(payload)
      await client.query(
        `INSERT INTO site_submission (id, user_id, payload, submitted_at, updated_at)
         VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()), now())
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           payload = EXCLUDED.payload,
           submitted_at = EXCLUDED.submitted_at,
           updated_at = now()`,
        [sid, userId, JSON.stringify(payload), sa]
      )
    }
    await client.query('COMMIT')
    inTx = false
  } catch (e) {
    if (inTx) await client.query('ROLLBACK').catch(() => {})
    for (const id of ids) dirtySubmissionIds.add(id)
    throw e
  } finally {
    client.release()
    syncing = false
  }
}

export function queueSyncSubmissionsToPg(store) {
  if (!getPool() || dirtySubmissionIds.size === 0) return
  void syncDirtySubmissionsToPg(store).catch((err) => {
    console.error('[starmc-api] PostgreSQL 同步 submission 失败:', err?.message || err)
  })
}
