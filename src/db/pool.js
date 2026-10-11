import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null

export function getPool() {
  if (config.skipPg) return null
  const url = String(config.databaseUrl || process.env.DATABASE_URL || '').trim()
  if (!url) return null
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    pool.on('error', (err) => {
      console.warn('[pg] pool error:', err?.message || err)
    })
  }
  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end().catch(() => {})
    pool = null
  }
}
