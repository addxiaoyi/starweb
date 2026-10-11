const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS starmc_player_state (
    user_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS starmc_user_profile (
    user_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS starmc_submission (
    submission_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS starmc_store_kv (
    kv_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS starmc_schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
]

export async function runMigrations(pool) {
  if (!pool) return { ok: true, skipped: true }
  for (const sql of MIGRATIONS) {
    await pool.query(sql)
  }
  await pool.query(
    `INSERT INTO starmc_schema_meta(key, value, updated_at)
     VALUES ('version', '2026-07-11', NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
  )
  return { ok: true, version: '2026-07-11' }
}
