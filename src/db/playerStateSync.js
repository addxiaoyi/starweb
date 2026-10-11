/** @type {Set<string>} */
const dirty = new Set()

export function markPlayerStateDirty(userId) {
  const id = String(userId || '').trim()
  if (id) dirty.add(id)
}

export async function hydratePlayerStateFromPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool) return
  const r = await pool.query('SELECT user_id, payload FROM starmc_player_state')
  if (!store.playerState || typeof store.playerState !== 'object') store.playerState = {}
  for (const row of r.rows) {
    const uid = String(row.user_id || '').trim()
    if (!uid) continue
    store.playerState[uid] = row.payload || store.playerState[uid]
  }
}

export async function flushPlayerStateToPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool || dirty.size === 0) return
  const ids = [...dirty]
  dirty.clear()
  for (const userId of ids) {
    const payload = store.playerState?.[userId]
    if (!payload) continue
    await pool.query(
      `INSERT INTO starmc_player_state(user_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [userId, JSON.stringify(payload)]
    )
  }
}
