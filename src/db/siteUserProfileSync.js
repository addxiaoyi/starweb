/** @type {Set<string>} */
const dirty = new Set()

export function markUserProfileDirty(userId) {
  const id = String(userId || '').trim()
  if (id) dirty.add(id)
}

export async function hydrateUserProfilesFromPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool) return
  const r = await pool.query('SELECT user_id, payload FROM starmc_user_profile')
  for (const row of r.rows) {
    const uid = String(row.user_id || '').trim()
    if (!uid) continue
    const user = store.users?.find((u) => String(u.id) === uid)
    if (user && row.payload && typeof row.payload === 'object') {
      Object.assign(user, row.payload)
    }
  }
}

export async function flushUserProfilesToPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool || dirty.size === 0) return
  const ids = [...dirty]
  dirty.clear()
  for (const userId of ids) {
    const user = store.users?.find((u) => String(u.id) === userId)
    if (!user) continue
    await pool.query(
      `INSERT INTO starmc_user_profile(user_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [userId, JSON.stringify(user)]
    )
  }
}
