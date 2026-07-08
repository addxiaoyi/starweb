import { getPool } from './pool.js'

/** site_store_kv.key → 对应 store 字段（catalog 与 catalogSyncedAt 合并为 catalog_state） */
export const STORE_KV_KEYS = [
  'invite_code_claims',
  'authx_events',
  'catalog_state',
  'mc_password_reset_challenges',
  'mc_password_reset_audit_events',
  'review_audit_logs',
  'user_admin_audit_logs',
  'ops_audit_logs',
  'security_center_state',
  'dashboard_configs',
  'skin_reports',
  'user_favorites',
  'user_notifications',
  'skin_comments',
  'skin_comment_likes',
  'skin_interaction_logs',
  'skin_version_history',
  'async_tasks',
  'dead_letter_queue',
  'skin_metrics',
  'skin_sync_tasks',
  'circuit_state'
]

const dirtyKeys = new Set()
let syncing = false

export function markKvDirty(key) {
  if (!STORE_KV_KEYS.includes(key)) return
  dirtyKeys.add(key)
}

function payloadForKey(key, store) {
  switch (key) {
    case 'invite_code_claims':
      return store.inviteCodeClaims && typeof store.inviteCodeClaims === 'object'
        ? store.inviteCodeClaims
        : {}
    case 'authx_events':
      return Array.isArray(store.authxEvents) ? store.authxEvents : []
    case 'catalog_state':
      return {
        catalog: Array.isArray(store.catalog) ? store.catalog : [],
        catalogSyncedAt:
          typeof store.catalogSyncedAt === 'string'
            ? store.catalogSyncedAt
            : new Date().toISOString()
      }
    case 'mc_password_reset_challenges':
      return Array.isArray(store.mcPasswordResetChallenges)
        ? store.mcPasswordResetChallenges
        : []
    case 'mc_password_reset_audit_events':
      return Array.isArray(store.mcPasswordResetAuditEvents)
        ? store.mcPasswordResetAuditEvents
        : []
    case 'review_audit_logs':
      return Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []
    case 'user_admin_audit_logs':
      return Array.isArray(store.userAdminAuditLogs) ? store.userAdminAuditLogs : []
    case 'ops_audit_logs':
      return Array.isArray(store.opsAuditLogs) ? store.opsAuditLogs : []
    case 'security_center_state':
      return store.securityCenter && typeof store.securityCenter === 'object'
        ? {
            sessions:
              store.securityCenter.sessions && typeof store.securityCenter.sessions === 'object'
                ? store.securityCenter.sessions
                : {},
            alerts: Array.isArray(store.securityCenter.alerts) ? store.securityCenter.alerts : [],
            auditLogs: Array.isArray(store.securityCenter.auditLogs) ? store.securityCenter.auditLogs : [],
            webhookQueue: Array.isArray(store.securityCenter.webhookQueue) ? store.securityCenter.webhookQueue : [],
            geoCache:
              store.securityCenter.geoCache && typeof store.securityCenter.geoCache === 'object'
                ? store.securityCenter.geoCache
                : {},
            rules:
              store.securityCenter.rules && typeof store.securityCenter.rules === 'object'
                ? store.securityCenter.rules
                : {
                    failWeight: 70,
                    unknownIpWeight: 30,
                    highRiskThreshold: 70,
                    mediumRiskThreshold: 35,
                    requireMfaOnHighRisk: true,
                    enableWebhookReplay: true
                  }
          }
        : {
            sessions: {},
            alerts: [],
            auditLogs: [],
            webhookQueue: [],
            geoCache: {},
            rules: {
              failWeight: 70,
              unknownIpWeight: 30,
              highRiskThreshold: 70,
              mediumRiskThreshold: 35,
              requireMfaOnHighRisk: true,
              enableWebhookReplay: true
            }
          }
    case 'dashboard_configs':
      return store.dashboardConfigs && typeof store.dashboardConfigs === 'object'
        ? store.dashboardConfigs
        : {}
    case 'skin_reports':
      return Array.isArray(store.skinReports) ? store.skinReports : []
    case 'user_favorites':
      return store.userFavorites && typeof store.userFavorites === 'object'
        ? store.userFavorites
        : {}
    case 'user_notifications':
      return store.userNotifications && typeof store.userNotifications === 'object'
        ? store.userNotifications
        : {}
    case 'skin_comments':
      return store.skinComments && typeof store.skinComments === 'object'
        ? store.skinComments
        : {}
    case 'skin_comment_likes':
      return store.skinCommentLikes && typeof store.skinCommentLikes === 'object'
        ? store.skinCommentLikes
        : {}
    case 'skin_interaction_logs':
      return Array.isArray(store.skinInteractionLogs) ? store.skinInteractionLogs : []
    case 'skin_version_history':
      return store.skinVersionHistory && typeof store.skinVersionHistory === 'object'
        ? store.skinVersionHistory
        : {}
    case 'async_tasks':
      return Array.isArray(store.asyncTasks) ? store.asyncTasks : []
    case 'dead_letter_queue':
      return Array.isArray(store.deadLetterQueue) ? store.deadLetterQueue : []
    case 'skin_metrics':
      return store.skinMetrics && typeof store.skinMetrics === 'object'
        ? store.skinMetrics
        : {}
    case 'skin_sync_tasks':
      return Array.isArray(store.skinSyncTasks) ? store.skinSyncTasks : []
    case 'circuit_state':
      return store.circuitState && typeof store.circuitState === 'object'
        ? { failures: Number(store.circuitState.failures || 0), isOpen: Boolean(store.circuitState.isOpen), halfOpenAfter: Number(store.circuitState.halfOpenAfter || 0) }
        : { failures: 0, isOpen: false, halfOpenAfter: 0 }
    default:
      return null
  }
}

function applyPayload(key, store, raw) {
  let p = raw
  if (p == null) return
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p)
    } catch {
      return
    }
  }
  switch (key) {
    case 'invite_code_claims':
      if (p && typeof p === 'object') store.inviteCodeClaims = JSON.parse(JSON.stringify(p))
      break
    case 'authx_events':
      if (Array.isArray(p)) store.authxEvents = JSON.parse(JSON.stringify(p))
      break
    case 'catalog_state':
      if (p && typeof p === 'object') {
        if (Array.isArray(p.catalog)) store.catalog = JSON.parse(JSON.stringify(p.catalog))
        if (typeof p.catalogSyncedAt === 'string') store.catalogSyncedAt = p.catalogSyncedAt
      }
      break
    case 'mc_password_reset_challenges':
      if (Array.isArray(p)) store.mcPasswordResetChallenges = JSON.parse(JSON.stringify(p))
      break
    case 'mc_password_reset_audit_events':
      if (Array.isArray(p)) store.mcPasswordResetAuditEvents = JSON.parse(JSON.stringify(p))
      break
    case 'review_audit_logs':
      if (Array.isArray(p)) store.reviewAuditLogs = JSON.parse(JSON.stringify(p))
      break
    case 'user_admin_audit_logs':
      if (Array.isArray(p)) store.userAdminAuditLogs = JSON.parse(JSON.stringify(p))
      break
    case 'ops_audit_logs':
      if (Array.isArray(p)) store.opsAuditLogs = JSON.parse(JSON.stringify(p))
      break
    case 'security_center_state':
      if (p && typeof p === 'object') {
        const next = JSON.parse(JSON.stringify(p))
        store.securityCenter = next
      }
      break
    case 'dashboard_configs':
      if (p && typeof p === 'object') store.dashboardConfigs = JSON.parse(JSON.stringify(p))
      break
    case 'skin_reports':
      if (Array.isArray(p)) store.skinReports = JSON.parse(JSON.stringify(p))
      break
    case 'user_favorites':
      if (p && typeof p === 'object') store.userFavorites = JSON.parse(JSON.stringify(p))
      break
    case 'user_notifications':
      if (p && typeof p === 'object') store.userNotifications = JSON.parse(JSON.stringify(p))
      break
    case 'skin_comments':
      if (p && typeof p === 'object') store.skinComments = JSON.parse(JSON.stringify(p))
      break
    case 'skin_comment_likes':
      if (p && typeof p === 'object') store.skinCommentLikes = JSON.parse(JSON.stringify(p))
      break
    case 'skin_interaction_logs':
      if (Array.isArray(p)) store.skinInteractionLogs = JSON.parse(JSON.stringify(p))
      break
    case 'skin_version_history':
      if (p && typeof p === 'object') store.skinVersionHistory = JSON.parse(JSON.stringify(p))
      break
    case 'async_tasks':
      if (Array.isArray(p)) store.asyncTasks = JSON.parse(JSON.stringify(p))
      break
    case 'dead_letter_queue':
      if (Array.isArray(p)) store.deadLetterQueue = JSON.parse(JSON.stringify(p))
      break
    case 'skin_metrics':
      if (p && typeof p === 'object') store.skinMetrics = JSON.parse(JSON.stringify(p))
      break
    case 'skin_sync_tasks':
      if (Array.isArray(p)) store.skinSyncTasks = JSON.parse(JSON.stringify(p))
      break
    case 'circuit_state':
      if (p && typeof p === 'object') {
        store.circuitState = { failures: Number(p.failures || 0), isOpen: Boolean(p.isOpen), halfOpenAfter: Number(p.halfOpenAfter || 0) }
      }
      break
    default:
      break
  }
}

/**
 * @param {Record<string, unknown>} store
 */
export async function hydrateStoreKvFromPg(store) {
  const pool = getPool()
  if (!pool) return
  const r = await pool.query(
    `SELECT key, payload FROM site_store_kv WHERE key = ANY($1::text[])`,
    [STORE_KV_KEYS]
  )
  for (const row of r.rows) {
    applyPayload(String(row.key || ''), store, row.payload)
  }
  if (r.rows.length > 0) {
    console.log(`[starmc-api] 已从 PostgreSQL 合并 ${r.rows.length} 条 store_kv`)
  }
}

/**
 * @param {Record<string, unknown>} store
 */
export async function syncDirtyKvToPg(store) {
  const pool = getPool()
  if (!pool || dirtyKeys.size === 0) return
  if (syncing) return
  syncing = true
  const keys = [...dirtyKeys]
  dirtyKeys.clear()
  const client = await pool.connect()
  let inTx = false
  try {
    await client.query('BEGIN')
    inTx = true
    for (const key of keys) {
      const payload = payloadForKey(key, store)
      if (payload === null) continue
      await client.query(
        `INSERT INTO site_store_kv (key, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = now()`,
        [key, JSON.stringify(payload)]
      )
    }
    await client.query('COMMIT')
    inTx = false
  } catch (e) {
    if (inTx) await client.query('ROLLBACK').catch(() => {})
    for (const k of keys) dirtyKeys.add(k)
    throw e
  } finally {
    client.release()
    syncing = false
  }
}

export function queueSyncStoreKvToPg(store) {
  if (!getPool() || dirtyKeys.size === 0) return
  void syncDirtyKvToPg(store).catch((err) => {
    console.error('[starmc-api] PostgreSQL 同步 store_kv 失败:', err?.message || err)
  })
}
