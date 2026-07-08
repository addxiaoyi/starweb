import { getPool } from './pool.js'

const dirtyUserIds = new Set()
let syncing = false

export function markUserProfileDirty(userId) {
  if (userId == null || userId === '') return
  dirtyUserIds.add(String(userId))
}

function cloneUserPayload(u) {
  return JSON.parse(JSON.stringify(u))
}

/**
 * 启动时：PG 中的用户扩展档案合并进 store.users（按本地 id 覆盖或追加）。
 * @param {Record<string, unknown>} store
 */
export async function hydrateUserProfilesFromPg(store) {
  const pool = getPool()
  if (!pool || !Array.isArray(store.users)) return
  const r = await pool.query('SELECT user_id, payload FROM site_user_profile ORDER BY user_id')
  for (const row of r.rows) {
    const id = String(row.user_id || '')
    if (!id) continue
    let p = row.payload
    if (p == null) p = {}
    else if (typeof p === 'string') {
      try {
        p = JSON.parse(p)
      } catch {
        p = {}
      }
    }
    if (typeof p !== 'object') continue
    const data = cloneUserPayload(p)
    if (!data.id) data.id = id
    if (String(data.id) !== id) data.id = id
    const idx = store.users.findIndex((u) => u && String(u.id) === id)
    if (idx >= 0) store.users[idx] = data
    else store.users.push(data)
  }
  if (r.rows.length > 0) {
    console.log(`[starmc-api] 已从 PostgreSQL 合并 ${r.rows.length} 条 user_profile`)
  }
}

/**
 * @param {Record<string, unknown>} store
 */
export async function syncDirtyUserProfilesToPg(store) {
  const pool = getPool()
  if (!pool || dirtyUserIds.size === 0) return
  if (!store || !Array.isArray(store.users)) return
  if (syncing) return
  syncing = true
  const ids = [...dirtyUserIds]
  dirtyUserIds.clear()
  const client = await pool.connect()
  let inTx = false
  try {
    await client.query('BEGIN')
    inTx = true
    for (const userId of ids) {
      const u = store.users.find((x) => x && String(x.id) === userId)
      if (!u) {
        await client.query('DELETE FROM site_user_profile WHERE user_id = $1', [userId])
        continue
      }
      const payload = cloneUserPayload(u)
      await client.query(
        `INSERT INTO site_user_profile (user_id, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = now()`,
        [userId, JSON.stringify(payload)]
      )
    }
    await client.query('COMMIT')
    inTx = false
  } catch (e) {
    if (inTx) await client.query('ROLLBACK').catch(() => {})
    for (const id of ids) dirtyUserIds.add(id)
    throw e
  } finally {
    client.release()
    syncing = false
  }
}

export function queueSyncUserProfilesToPg(store) {
  if (!getPool() || dirtyUserIds.size === 0) return
  void syncDirtyUserProfilesToPg(store).catch((err) => {
    console.error('[starmc-api] PostgreSQL 同步 user_profile 失败:', err?.message || err)
  })
}
