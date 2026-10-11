import { STORE_KV_KEYS, markKvDirty as persistMarkKvDirty } from '../persist.js'

/** @type {Set<string>} */
const dirty = new Set()

export { STORE_KV_KEYS }

export function markKvDirty(key) {
  persistMarkKvDirty(key)
  trackKvDirty(key)
}

function kvPayloadForKey(store, key) {
  switch (key) {
    case 'security_center_state':
      return store.securityCenter || {}
    case 'review_audit_logs':
      return store.reviewAuditLogs || []
    case 'dashboard_configs':
      return store.dashboardConfigs || {}
    case 'circuit_state':
      return store.circuitState || {}
    case 'user_notifications':
      return store.userNotifications || {}
    default:
      return null
  }
}

export async function hydrateStoreKvFromPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool) return
  const r = await pool.query('SELECT kv_key, payload FROM starmc_store_kv')
  for (const row of r.rows) {
    const key = String(row.kv_key || '').trim()
    const payload = row.payload
    if (!key || payload == null) continue
    if (key === 'security_center_state') store.securityCenter = payload
    else if (key === 'review_audit_logs') store.reviewAuditLogs = payload
    else if (key === 'dashboard_configs') store.dashboardConfigs = payload
    else if (key === 'circuit_state') store.circuitState = payload
    else if (key === 'user_notifications') store.userNotifications = payload
  }
}

export function trackKvDirty(key) {
  dirty.add(String(key))
}

export async function flushStoreKvToPg(store) {
  const pool = (await import('./pool.js')).getPool()
  if (!pool || dirty.size === 0) return
  const keys = [...dirty]
  dirty.clear()
  for (const key of keys) {
    const payload = kvPayloadForKey(store, key)
    if (payload == null) continue
    await pool.query(
      `INSERT INTO starmc_store_kv(kv_key, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (kv_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [key, JSON.stringify(payload)]
    )
  }
}
