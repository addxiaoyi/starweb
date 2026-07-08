import pg from 'pg'
import { config } from '../config.js'

/** @type {pg.Pool | null} */
let pool = null

export function getPool() {
  if (!config.databaseUrl) return null
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: Math.min(20, Math.max(2, Number(process.env.PG_POOL_MAX) || 10))
    })
    pool.on('error', (err) => {
      console.error('[starmc-api] PostgreSQL 池异常:', err?.message || err)
    })
  }
  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
