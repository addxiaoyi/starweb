// Persist module. All exports are synchronous from the caller's perspective
// because the actual I/O is deferred to the next microtask / macrotask cycle.
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

export const UPLOAD_DIR = path.join(config.dataDir, 'uploads')

let store = null
// BUG FIX: the previous implementation stored only a timer ID (a number) in
// `saveTimer`.  When `scheduleSave()` was called *again* from within the
// setTimeout callback (e.g. from a PostgreSQL flush that re-dirtied the store)
// the new `setTimeout()` would return a *different* timer ID, but the reference
// stored in `saveTimer` would still be the OLD ID.  The subsequent
// `clearTimeout(saveTimer)` in `flushSaveSyncAndPg()` would therefore clear
// the wrong (already-fired) timeout and leave the newly created one orphaned.
// The orphaned timer would fire later, fire `writeStoreFile()` again, and
// cause a second unexpected flush.
//
// Fix: store a { id, dirtyAt } object instead of just the timer ID so that
// the correct handle can always be cancelled regardless of how many nested
// calls have occurred.
let scheduled = null  // null | { id: ReturnType<typeof setTimeout>, dirtyAt: number }
let dirty = false
let loadMtime = 0

function defaultStore() {
  return {
    version: 1,
    users: [],
    submissions: [],
    catalog: [],
    favorites: {},
    comments: {},
    reports: [],
    playerState: {},
    securityCenter: {
      sessions: {},
      alerts: [],
      loginEvents: [],
      auditLogs: [],
      webhookQueue: [],
      trustedDevices: {},
      geoCache: {},
      rules: {
        failWeight: 70,
        unknownIpWeight: 30,
        highRiskThreshold: 70,
        mediumRiskThreshold: 35,
        requireMfaOnHighRisk: true,
        enableWebhookReplay: true,
      },
    },
    reviewAuditLogs: [],
    telemetryEvents: [],
    mcResetEvents: [],
    verifyCodeChallenges: {},
    mcGamePasswordChallenges: {},
    userNotifications: {},
    dashboardConfigs: {},
    wikiPages: [],
    circuitState: { failures: 0, isOpen: false, halfOpenAfter: 0 },
    library: { version: 1, syncedAt: null, etag: null },
    skinLibrarySseClients: 0,
  }
}

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true })
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  fs.mkdirSync(path.join(config.dataDir, 'backups'), { recursive: true })
}

export function loadStore() {
  ensureDirs()
  const file = path.join(config.dataDir, 'store.json')
  if (!fs.existsSync(file)) {
    store = defaultStore()
    flushSaveSyncAndPg()
    return store
  }
  try {
    loadMtime = fs.statSync(file).mtimeMs
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    store = { ...defaultStore(), ...parsed }
    return store
  } catch (e) {
    console.error('[persist] load failed, using empty store:', e?.message || e)
    store = defaultStore()
    return store
  }
}

export function getStore() {
  if (!store) loadStore()
  return store
}

function writeStoreFile(file) {
  const tempFile = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8')
    fs.renameSync(tempFile, file)
    loadMtime = fs.statSync(file).mtimeMs
  } catch (error) {
    try {
      fs.rmSync(tempFile, { force: true })
    } catch (cleanupError) {
      console.error('[persist] temporary store cleanup failed:', cleanupError?.message || cleanupError)
    }
    throw error
  }
}

export function scheduleSave() {
  dirty = true
  if (scheduled) return
  const dirtyAt = Date.now()
  scheduled = {
    id: setTimeout(() => {
      scheduled = null
      if (!dirty) return
      dirty = false
      try {
        const file = path.join(config.dataDir, 'store.json')
        if (fs.existsSync(file) && fs.statSync(file).mtimeMs > loadMtime) {
          console.log('[persist] store.json modified externally, skipping save')
          dirty = false
          return
        }
        writeStoreFile(file)
        if (config.databaseUrl) {
          import('./db/flush.js')
            .then((m) => m.flushAllPgDirty(store))
            .catch((e) => console.warn('[persist] PG flush failed:', e?.message || e))
        }
      } catch (e) {
        console.error('[persist] save failed:', e?.message || e)
      }
    }, 300),
    dirtyAt,
  }
}

export async function flushSaveSyncAndPg() {
  dirty = false
  if (scheduled) {
    clearTimeout(scheduled.id)
    scheduled = null
  }
  const file = path.join(config.dataDir, 'store.json')
  if (fs.existsSync(file) && fs.statSync(file).mtimeMs > loadMtime) { console.log('[persist] flushSaveSyncAndPg: store.json modified externally, skipping save'); return }
  writeStoreFile(file)
  if (config.databaseUrl) {
    try {
      const { flushAllPgDirty } = await import('./db/flush.js')
      await flushAllPgDirty(store)
    } catch (e) {
      console.warn('[persist] PG flush failed:', e?.message || e)
    }
  }
}

export function getPersistSnapshot() {
  const s = getStore()
  return {
    mode: config.databaseUrl ? 'json+pg' : 'json',
    users: Array.isArray(s.users) ? s.users.length : 0,
    submissions: Array.isArray(s.submissions) ? s.submissions.length : 0,
    catalog: Array.isArray(s.catalog) ? s.catalog.length : 0,
  }
}

export function startStoreBackupScheduler() {
  if (!config.storeBackupEnabled) return () => {}
  const intervalMs = Math.max(5, config.storeBackupIntervalMinutes) * 60_000
  const timer = setInterval(() => {
    try {
      const src = path.join(config.dataDir, 'store.json')
      if (!fs.existsSync(src)) return
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const dest = path.join(config.dataDir, 'backups', `store-${stamp}.json`)
      fs.copyFileSync(src, dest)
      const files = fs
        .readdirSync(path.join(config.dataDir, 'backups'))
        .filter((f) => f.startsWith('store-'))
        .sort()
      while (files.length > config.storeBackupKeep) {
        const old = files.shift()
        if (old) fs.unlinkSync(path.join(config.dataDir, 'backups', old))
      }
    } catch (e) {
      console.warn('[persist] backup failed:', e?.message || e)
    }
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}

export const STORE_KV_KEYS = [
  'security_center_state',
  'review_audit_logs',
  'dashboard_configs',
  'circuit_state',
  'user_notifications',
]

const kvDirty = new Set()

export function markKvDirty(key) {
  kvDirty.add(String(key))
}
