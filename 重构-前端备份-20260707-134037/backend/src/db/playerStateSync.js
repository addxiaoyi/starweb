import { getPool } from './pool.js'

const dirtyUserIds = new Set()
let syncing = false

/** 在修改某用户的 playerState 后调用，配合 scheduleSave/flush 异步写入 PG */
export function markPlayerStateDirty(userId) {
  if (userId == null || userId === '') return
  dirtyUserIds.add(String(userId))
}

/**
 * 启动时：将 PG 中已有行合并进内存 store（按 user_id 覆盖，仅影响 PG 中存在的键）。
 * @param {Record<string, unknown>} store
 */
export async function hydratePlayerStateFromPg(store) {
  const pool = getPool()
  if (!pool || !store.playerState) return
  const r = await pool.query(
    'SELECT user_id, payload FROM site_player_state ORDER BY user_id'
  )
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
    if (typeof p !== 'object') p = {}
    store.playerState[id] = JSON.parse(JSON.stringify(p))
  }
  if (r.rows.length > 0) {
    console.log(`[starmc-api] 已从 PostgreSQL 合并 ${r.rows.length} 条 player_state`)
  }
}

/**
 * 将当前脏用户写入 PG（幂等 upsert）。
 * @param {Record<string, unknown>} store
 */
export async function syncDirtyPlayerStatesToPg(store) {
  const pool = getPool()
  if (!pool || dirtyUserIds.size === 0) return
  if (!store || !store.playerState) return
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
      const ps = store.playerState[userId]
      if (!ps || typeof ps !== 'object') continue
      await client.query(
        `INSERT INTO site_player_state (user_id, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = now()`,
        [userId, JSON.stringify(ps)]
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

/** flushSaveSync 成功后异步刷 PG，不阻塞主线程 */
export function queueSyncDirtyPlayerStatesToPg(store) {
  if (!getPool() || dirtyUserIds.size === 0) return
  void syncDirtyPlayerStatesToPg(store).catch((err) => {
    console.error('[starmc-api] PostgreSQL 同步 player_state 失败:', err?.message || err)
  })
}
