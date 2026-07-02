/**
 * 只读统计：用于健康检查与运维脚本（不暴露行内容）。
 * @param {import('pg').Pool} pool
 */
export async function fetchPgStats(pool) {
  const r = await pool.query(`
    SELECT
      (SELECT count(*)::bigint FROM site_player_state) AS player_state,
      (SELECT count(*)::bigint FROM site_user_profile) AS user_profile,
      (SELECT count(*)::bigint FROM site_submission) AS submission,
      (SELECT count(*)::bigint FROM site_store_kv) AS store_kv,
      (SELECT count(*)::bigint FROM site_schema_migrations) AS migrations_applied
  `)
  const row = r.rows[0]
  return {
    ok: true,
    tables: {
      site_player_state: Number(row.player_state),
      site_user_profile: Number(row.user_profile),
      site_submission: Number(row.submission),
      site_store_kv: Number(row.store_kv)
    },
    migrationsApplied: Number(row.migrations_applied)
  }
}
