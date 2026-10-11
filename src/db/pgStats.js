export async function fetchPgStats(pool) {
  if (!pool) return { ok: true, skipped: true }
  const [tables, activity] = await Promise.all([
    pool.query(
      `SELECT relname AS name, n_live_tup AS live_rows
       FROM pg_stat_user_tables
       WHERE relname LIKE 'starmc_%'
       ORDER BY relname`
    ),
    pool.query('SELECT NOW() AS now, current_database() AS database'),
  ])
  return {
    ok: true,
    database: activity.rows[0]?.database || null,
    now: activity.rows[0]?.now || null,
    tables: tables.rows,
  }
}
