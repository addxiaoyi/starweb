/**
 * 极简迁移：版本号记在 site_schema_migrations。
 */
const MIGRATIONS = [
  {
    version: '001_site_player_state',
    sql: `
CREATE TABLE IF NOT EXISTS site_player_state (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_player_state_updated_at_idx ON site_player_state (updated_at DESC);
`
  },
  {
    version: '002_site_user_submission',
    sql: `
CREATE TABLE IF NOT EXISTS site_user_profile (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_user_profile_updated_at_idx ON site_user_profile (updated_at DESC);

CREATE TABLE IF NOT EXISTS site_submission (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_submission_user_idx ON site_submission (user_id);
CREATE INDEX IF NOT EXISTS site_submission_submitted_at_idx ON site_submission (submitted_at DESC);
`
  },
  {
    version: '003_site_store_kv',
    sql: `
CREATE TABLE IF NOT EXISTS site_store_kv (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_store_kv_updated_at_idx ON site_store_kv (updated_at DESC);
`
  }
]

/**
 * @param {import('pg').Pool} pool
 */
export async function runMigrations(pool) {
  const client = await pool.connect()
  try {
    await client.query(`
CREATE TABLE IF NOT EXISTS site_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`)
    for (const m of MIGRATIONS) {
      const done = await client.query(
        'SELECT 1 AS x FROM site_schema_migrations WHERE version = $1',
        [m.version]
      )
      if (done.rowCount > 0) continue
      let inTx = false
      await client.query('BEGIN')
      inTx = true
      try {
        await client.query(m.sql)
        await client.query('INSERT INTO site_schema_migrations (version) VALUES ($1)', [m.version])
        await client.query('COMMIT')
        inTx = false
        console.log(`[starmc-api] PostgreSQL 迁移已应用: ${m.version}`)
      } catch (e) {
        if (inTx) await client.query('ROLLBACK').catch(() => {})
        throw e
      }
    }
  } finally {
    client.release()
  }
}
