import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { config } from './config.js'
import { queuePgAfterJsonSave, awaitAllPgSync } from './db/pgSyncOutbound.js'

export const DATA_DIR = config.dataDir
export const STORE_PATH = path.join(DATA_DIR, 'store.json')
const STORE_TMP = path.join(DATA_DIR, 'store.json.tmp')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

// ============================================================
// P3-C3: 备份加密（AES-256-GCM）
// STORE_BACKUP_KEY 环境变量：64 字符十六进制字符串（32 字节密钥）
// 不配置时不加密（向后兼容）
// ============================================================
let _backupKey = null
function getBackupKey() {
  if (_backupKey !== null) return _backupKey
  const raw = process.env.STORE_BACKUP_KEY || ''
  if (!raw || raw.length < 64) {
    _backupKey = null
    return null
  }
  try {
    _backupKey = Buffer.from(raw.slice(0, 64), 'hex')
    if (_backupKey.length !== 32) {
      console.warn('[starmc-api] STORE_BACKUP_KEY 长度无效（需 64 位十六进制 = 32 字节），备份将不加密')
      _backupKey = null
    }
  } catch {
    _backupKey = null
  }
  return _backupKey
}

function encryptBackup(plaintext) {
  const key = getBackupKey()
  if (!key) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(0x2_1 /* AES-256-GCM */, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    v: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  })
}

let saveTimer = null
const SAVE_DEBOUNCE_MS = 200

/** @type {Record<string, unknown> | null} */
let cache = null

/** ISO 时间：最近一次成功落盘 store.json（用于健康检查） */
let lastSaveAt = null

let backupTimerId = null

export function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

/**
 * 原子写入：先写临时文件再 rename，降低断电/崩溃时 store.json 损坏概率。
 * Windows 上目标文件被占用时 rename 偶发 EPERM/EBUSY，回退为 copyFile + 删临时文件。
 */
function writeStoreAtomic(dataObj) {
  ensureDirs()
  const payload = JSON.stringify(dataObj, null, 2)
  fs.writeFileSync(STORE_TMP, payload, 'utf8')
  try {
    fs.renameSync(STORE_TMP, STORE_PATH)
  } catch (err) {
    const code = err && /** @type {NodeJS.ErrnoException} */ (err).code
    const win =
      process.platform === 'win32' &&
      (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')
    if (win) {
      try {
        fs.copyFileSync(STORE_TMP, STORE_PATH)
        try {
          fs.unlinkSync(STORE_TMP)
        } catch {
          /* ignore */
        }
        lastSaveAt = new Date().toISOString()
        return
      } catch (e2) {
        try {
          fs.unlinkSync(STORE_TMP)
        } catch {
          /* ignore */
        }
        throw e2
      }
    }
    try {
      fs.unlinkSync(STORE_TMP)
    } catch {
      /* ignore */
    }
    throw err
  }
  lastSaveAt = new Date().toISOString()
}

export function loadStore() {
  if (cache) return cache
  ensureDirs()
  if (!fs.existsSync(STORE_PATH)) {
    cache = createDefaultStore()
    writeStoreAtomic(cache)
    return cache
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8')
    cache = JSON.parse(raw)
    migrateStore(cache)
    try {
      lastSaveAt = new Date(fs.statSync(STORE_PATH).mtimeMs).toISOString()
    } catch {
      /* ignore */
    }
    return cache
  } catch (e) {
    const backup = `${STORE_PATH}.corrupt.${Date.now()}`
    try {
      if (fs.existsSync(STORE_PATH)) fs.copyFileSync(STORE_PATH, backup)
    } catch {
      /* ignore */
    }
    console.error('[starmc-api] store.json 损坏，已重置。备份:', backup, e?.message || e)
    cache = createDefaultStore()
    writeStoreAtomic(cache)
    return cache
  }
}

function migrateStore(s) {
  if (!s.users) s.users = []
  if (!s.sessions) s.sessions = {}
  if (!s.catalog) s.catalog = []
  if (!s.catalogSyncedAt) s.catalogSyncedAt = new Date().toISOString()
  if (!s.playerState) s.playerState = {}
  if (!s.submissions) s.submissions = []
  if (!s.authxEvents) s.authxEvents = []
  if (!Array.isArray(s.telemetryEvents)) s.telemetryEvents = []
  if (!Array.isArray(s.mcPasswordResetChallenges)) s.mcPasswordResetChallenges = []
  if (!Array.isArray(s.mcResetEvents)) s.mcResetEvents = []
  if (!Array.isArray(s.verifyCodeChallenges)) s.verifyCodeChallenges = []
  if (!s.verifyCodeLocks || typeof s.verifyCodeLocks !== 'object') s.verifyCodeLocks = {}
  if (!Array.isArray(s.reviewAuditLogs)) s.reviewAuditLogs = []
  if (!Array.isArray(s.skinReports)) s.skinReports = []
  if (!Array.isArray(s.userAdminAuditLogs)) s.userAdminAuditLogs = []
  if (!Array.isArray(s.opsAuditLogs)) s.opsAuditLogs = []
  if (!s.userFavorites || typeof s.userFavorites !== 'object') s.userFavorites = {}
  if (!s.userNotifications || typeof s.userNotifications !== 'object') s.userNotifications = {}
  if (!s.skinComments || typeof s.skinComments !== 'object') s.skinComments = {}
  if (!s.skinCommentLikes || typeof s.skinCommentLikes !== 'object') s.skinCommentLikes = {}
  if (!Array.isArray(s.skinInteractionLogs)) s.skinInteractionLogs = []
  if (!s.skinVersionHistory || typeof s.skinVersionHistory !== 'object') s.skinVersionHistory = {}
  if (!Array.isArray(s.asyncTasks)) s.asyncTasks = []
  if (!Array.isArray(s.deadLetterQueue)) s.deadLetterQueue = []
  if (!s.skinMetrics || typeof s.skinMetrics !== 'object') s.skinMetrics = {}
  if (!Array.isArray(s.skinSyncTasks)) s.skinSyncTasks = []
  if (!s.inviteCodeClaims || typeof s.inviteCodeClaims !== 'object') s.inviteCodeClaims = {}
  if (!s.dashboardConfigs || typeof s.dashboardConfigs !== 'object') s.dashboardConfigs = {}
  if (!s.dashboardShareTokens || typeof s.dashboardShareTokens !== 'object') s.dashboardShareTokens = {}
  if (!s.securityCenter || typeof s.securityCenter !== 'object') s.securityCenter = {}
  if (!s.securityCenter.sessions || typeof s.securityCenter.sessions !== 'object') s.securityCenter.sessions = {}
  if (!Array.isArray(s.securityCenter.alerts)) s.securityCenter.alerts = []
  if (!Array.isArray(s.securityCenter.loginEvents)) s.securityCenter.loginEvents = []
  if (!Array.isArray(s.securityCenter.auditLogs)) s.securityCenter.auditLogs = []
  if (!Array.isArray(s.securityCenter.webhookQueue)) s.securityCenter.webhookQueue = []
  if (!s.securityCenter.trustedDevices || typeof s.securityCenter.trustedDevices !== 'object') s.securityCenter.trustedDevices = {}
  if (!s.securityCenter.geoCache || typeof s.securityCenter.geoCache !== 'object') s.securityCenter.geoCache = {}
  if (!s.securityCenter.rules || typeof s.securityCenter.rules !== 'object') {
    s.securityCenter.rules = {
      failWeight: 70,
      unknownIpWeight: 30,
      highRiskThreshold: 70,
      mediumRiskThreshold: 35,
      requireMfaOnHighRisk: true,
      enableWebhookReplay: true
    }
  }
  for (const u of s.users) {
    if (typeof u !== 'object' || !u) continue
    if (u.emailVerified === 'false' || u.emailVerified === '0' || u.emailVerified === 0) {
      u.emailVerified = false
    } else if (u.emailVerified === 'true' || u.emailVerified === '1' || u.emailVerified === 1) {
      u.emailVerified = true
    } else if (u.emailVerified === undefined) u.emailVerified = true
    if (!Array.isArray(u.oauthAccounts)) u.oauthAccounts = []
    if (u.linkedMcUsername === undefined) u.linkedMcUsername = null
    if (u.linkedMcUuid === undefined) u.linkedMcUuid = null
    if (u.verifiedMojang === undefined) u.verifiedMojang = false
    if (u.emailVerifyToken === undefined) u.emailVerifyToken = null
    if (u.emailVerifyExpires === undefined) u.emailVerifyExpires = null
    if (u.totpSecret === undefined) u.totpSecret = null
    if (u.totpEnabled === undefined) u.totpEnabled = false
    if (u.totpPendingSecret === undefined) u.totpPendingSecret = null
    if (!Array.isArray(u.recoveryCodes)) u.recoveryCodes = []
    if (u.recoveryCodesCount === undefined) u.recoveryCodesCount = Array.isArray(u.recoveryCodes) ? u.recoveryCodes.length : 0
  }
  return s
}

function createDefaultStore() {
  const now = new Date().toISOString()
  return {
    users: [],
    sessions: {},
    catalogSyncedAt: now,
    catalog: defaultCatalog(),
    playerState: {},
    submissions: [],
    authxEvents: [],
    telemetryEvents: [],
    mcPasswordResetChallenges: [],
    mcResetEvents: [],
    verifyCodeChallenges: [],
    verifyCodeLocks: {},
    reviewAuditLogs: [],
    skinReports: [],
    userAdminAuditLogs: [],
    opsAuditLogs: [],
    userFavorites: {},
    userNotifications: {},
    skinComments: {},
    skinCommentLikes: {},
    skinInteractionLogs: [],
    skinVersionHistory: {},
    asyncTasks: [],
    deadLetterQueue: [],
    skinMetrics: {},
    skinSyncTasks: [],
    inviteCodeClaims: {},
    dashboardConfigs: {},
    dashboardShareTokens: {},
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
        enableWebhookReplay: true
      }
    }
  }
}

function defaultCatalog() {
  const demoSkin = 'https://mc-heads.net/skin/Notch'
  return [
    {
      id: 'official',
      title: '星辉默认套装',
      desc: '进服即可选用的官方风格皮肤',
      tag: '官方',
      cover: 'linear-gradient(145deg,#1e3a5f,#312e81)',
      skinTextureUrl: demoSkin,
      model: 'default'
    },
    {
      id: 'event',
      title: '活动限定',
      desc: '节假日活动皮肤将在此展示',
      tag: '活动',
      cover: 'linear-gradient(145deg,#422006,#9a3412)'
    },
    {
      id: 'community',
      title: '玩家精选',
      desc: '社区投稿审核通过后展示',
      tag: '社区',
      cover: 'linear-gradient(145deg,#14532d,#166534)',
      skinTextureUrl: demoSkin,
      model: 'slim'
    },
    {
      id: 'pvp',
      title: 'PVP 轻薄款',
      desc: '低噪声贴图，适合对战场景',
      tag: 'PVP',
      cover: 'linear-gradient(145deg,#3b0764,#6b21a8)'
    },
    {
      id: 'build',
      title: '建造者系列',
      desc: '偏写实工具人风格',
      tag: '建筑',
      cover: 'linear-gradient(145deg,#164e63,#0e7490)'
    },
    {
      id: 'more',
      title: '更多内容',
      desc: '本地后端已接入 GET /api/skins/catalog',
      tag: '本地',
      cover: 'linear-gradient(145deg,#374151,#1f2937)'
    }
  ]
}

export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    flushSaveSync()
  }, SAVE_DEBOUNCE_MS)
}

/** 立即落盘（用于优雅退出；与 debounce 共用同一把锁） */
export function flushSaveSync() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!cache) return
  try {
    writeStoreAtomic(cache)
    queuePgAfterJsonSave(cache)
  } catch (e) {
    console.error('[starmc-api] 持久化失败:', e?.message || e)
    throw e
  }
}

/** 优雅退出：落盘 store.json 并等待 PostgreSQL player_state 刷完 */
export async function flushSaveSyncAndPg() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!cache) return
  writeStoreAtomic(cache)
  await awaitAllPgSync(cache)
}

/**
 * 供 /api/health 使用：不暴露敏感字段；可选附带绝对路径（HEALTH_PERSIST_DETAIL）。
 */
export function getPersistSnapshot() {
  let storeBytes = null
  let storeReadable = false
  try {
    if (fs.existsSync(STORE_PATH)) {
      storeReadable = true
      storeBytes = fs.statSync(STORE_PATH).size
    }
  } catch {
    /* ignore */
  }
  let backupCount = 0
  try {
    if (fs.existsSync(BACKUP_DIR)) {
      backupCount = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('store-') && f.endsWith('.json')).length
    }
  } catch {
    /* ignore */
  }
  const base = {
    ok: true,
    backend: 'json-file',
    postgresPlayerState: Boolean(config.databaseUrl),
    postgresUserProfile: Boolean(config.databaseUrl),
    postgresSubmission: Boolean(config.databaseUrl),
    postgresStoreKv: Boolean(config.databaseUrl),
    lastSaveAt,
    storeBytes,
    storeReadable,
    backupCount,
    backupEnabled: config.storeBackupEnabled
  }
  if (config.healthPersistDetail) {
    return {
      ...base,
      dataDir: DATA_DIR,
      storePath: STORE_PATH,
      backupDir: BACKUP_DIR
    }
  }
  return base
}

function pruneBackups() {
  ensureDirs()
  let names = []
  try {
    names = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('store-') && f.endsWith('.json'))
  } catch {
    return
  }
  const keep = config.storeBackupKeep
  if (names.length <= keep) return
  const scored = names.map((name) => {
    const full = path.join(BACKUP_DIR, name)
    try {
      return { name, mtime: fs.statSync(full).mtimeMs }
    } catch {
      return { name, mtime: 0 }
    }
  })
  scored.sort((a, b) => b.mtime - a.mtime)
  for (const row of scored.slice(keep)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, row.name))
    } catch {
      /* ignore */
    }
  }
}

/** 将当前 store.json 复制到 backups/（存在且可读时） */
export function runStoreBackupOnce() {
  if (!config.storeBackupEnabled) return
  ensureDirs()
  if (!fs.existsSync(STORE_PATH)) return
  const raw = fs.readFileSync(STORE_PATH, 'utf8')
  let content
  let ext = '.json'
  if (getBackupKey()) {
    content = encryptBackup(raw)
    ext = '.enc'
  } else {
    content = raw
  }
  const dest = path.join(BACKUP_DIR, `store-${Date.now()}${ext}`)
  fs.writeFileSync(dest, content, 'utf8')
  pruneBackups()
}

/**
 * 启动定时备份；返回 `stop()` 用于测试或优雅退出时清理句柄。
 */
export function startStoreBackupScheduler() {
  if (!config.storeBackupEnabled) {
    return () => {}
  }
  const min = config.storeBackupIntervalMinutes
  if (!Number.isFinite(min) || min < 5) {
    return () => {}
  }
  const ms = min * 60 * 1000
  const tick = () => {
    try {
      runStoreBackupOnce()
    } catch (e) {
      console.error('[starmc-api] store 定时备份失败:', e?.message || e)
    }
  }
  backupTimerId = setInterval(tick, ms)
  if (typeof backupTimerId.unref === 'function') backupTimerId.unref()
  return () => {
    if (backupTimerId) {
      clearInterval(backupTimerId)
      backupTimerId = null
    }
  }
}

export function getStore() {
  return loadStore()
}
