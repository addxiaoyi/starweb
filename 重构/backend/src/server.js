import './load-env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import crypto from 'crypto'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import supertokens from 'supertokens-node'
import { middleware as stMiddleware, errorHandler as stErrorHandler } from 'supertokens-node/framework/express'
import { verifySession } from 'supertokens-node/recipe/session/framework/express'
import Session from 'supertokens-node/recipe/session'
import { config } from './config.js'
import {
  globalLimiter,
  antiCrawlerGuard,
  uploadsReadLimiter,
  authLimiter,
  authxWebhookCallbackLimiter,
  mcUserReadLimiter,
  adminPluginGetLimiter,
  skinProfilePublicLimiter,
  mcGamePasswordRequestLimiter,
  mcGamePasswordConfirmLimiter,
  mojangSkinSyncLimiter,
  verifyCodeSendLimiter
} from './middleware/http.js'
import {
  createMcGamePasswordChallenge,
  confirmMcGamePasswordReset
} from './features/mcGamePasswordReset.js'
import { sendVerifyCode, confirmVerifyCodeLogin } from './features/verifyCodeLogin.js'
import { generateTotpSecret, verifyTotpToken, totpKeyUri } from './features/totpUser.js'
import {
  validateInviteForMcLink,
  claimInviteForUser,
  geoBlockMiddleware
} from './features/inviteAndGeo.js'
import { fetchMojangSkinSnapshot } from './features/mojangSkin.js'
import { asyncHandler, errorHandler, notFoundHandler } from './middleware/error.js'
import {
  UPLOAD_DIR,
  ensureDirs,
  getStore,
  loadStore,
  scheduleSave,
  flushSaveSyncAndPg,
  getPersistSnapshot,
  startStoreBackupScheduler
} from './persist.js'
import { getPool, closePool } from './db/pool.js'
import { runMigrations } from './db/migrate.js'
import { hydratePlayerStateFromPg, markPlayerStateDirty } from './db/playerStateSync.js'
import { hydrateUserProfilesFromPg, markUserProfileDirty } from './db/siteUserProfileSync.js'
import { hydrateSubmissionsFromPg, markSubmissionDirty } from './db/submissionSync.js'
import { hydrateStoreKvFromPg, markKvDirty, STORE_KV_KEYS } from './db/storeKvSync.js'
import { fetchPgStats } from './db/pgStats.js'
import { createSkinUpload } from './upload.js'
import { initSuperTokens, isSuperTokensReady } from './auth/supertokensInit.js'
import { isSmtpConfigured } from './auth/supertokensEmailDelivery.js'
import {
  ensureSupertokensLocalUser,
  findSupertokensLinkedUser,
  syncSupertokensLocalUser
} from './auth/supertokensUser.js'
import {
  createMcVerifySession,
  getMcVerifySession,
  getMcVerifySessionHistory,
  clearMcVerifySession,
  completeMcVerifySession,
  failMcVerifySession,
} from './features/mcVerify.js'
import { registerSecurityRoutes } from './modules/security/index.js'
import { registerAuthxAdminRoutes } from './modules/authxAdmin/index.js'
import {
  registerSkinRoutes,
  registerSkinTextureRoute,
  registerPublicSkinProfileRoutes
} from './modules/skin/index.js'
import { registerSkinAdminRoutes } from './modules/skinAdmin/index.js'
import { registerCapeRoutes } from './modules/cape/routes.js'
import { registerQqRoutes } from './modules/qq/routes.js'
import { registerMapHealthRoutes } from './modules/ops/mapHealth.js'
import { registerSkinRefreshRoutes } from './modules/plugin-gateway/skinRefresh.js'
import { registerPluginGatewayRoutes } from './modules/plugin-gateway/index.js'
import { isPluginWebhookAuthConfigured } from './modules/plugin-gateway/adapter.js'
import { createRetryOpsTaskHandler } from './modules/ops/retryRoute.js'
import { createRetryDeadLetterHandler } from './modules/ops/deadLetterRetryRoute.js'
import {
  buildErrorBody,
  jsonError as sendJsonError,
  jsonOk as sendJsonOk,
  jsonPage,
  resolvePaginationQuery
} from './utils/response.js'
import {
  roleSetOf as normalizeRoleSet,
  hasRole as hasPermissionRole,
  requireRolesOrJson
} from './utils/permission.js'
import { requireAdminAccessOrJson } from './utils/adminAccess.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const upload = createSkinUpload()

let authxAdapterDeprecationWarned = false
function warnAuthxAdapterDeprecated() {
  if (authxAdapterDeprecationWarned) return
  authxAdapterDeprecationWarned = true
  console.warn('[starmc-api] authx adapter is deprecated, only vla is supported')
}

function jsonErr(res, status, message, code = 'error', details) {
  return sendJsonError(res, status, message, code, details)
}

function jsonOk(res, payload = {}, status = 200) {
  return sendJsonOk(res, payload, status)
}

function normalizeDetails(details = {}) {
  const out = {}
  for (const [key, value] of Object.entries(details || {})) {
    if (value === undefined || value === null) continue
    out[key] = value
  }
  return out
}

function jsonErrWithRequest(
  res,
  status,
  message,
  code,
  requestId,
  details = {},
  legacyFields = {}
) {
  const mergedDetails = normalizeDetails({
    requestId,
    ...details
  })
  const payload = buildErrorBody(message, code, mergedDetails)
  if (requestId) payload.requestId = requestId
  for (const [key, value] of Object.entries(legacyFields || {})) {
    if (value === undefined || value === null) continue
    payload[key] = value
  }
  return res.status(Number(status || 500)).json(payload)
}

function jsonOkWithRequest(res, payload = {}, requestId, status = 200) {
  const merged = {
    ...(payload && typeof payload === 'object' ? payload : {}),
    ...(requestId ? { requestId } : {})
  }
  return jsonOk(res, merged, status)
}

function makeReqLogger(req) {
  const started = Date.now()
  const reqId = crypto.randomUUID()
  const path = String(req.originalUrl || req.url || '')
  return {
    reqId,
    done(status, extra = {}) {
      if (process.env.LOG_STRUCTURED_API !== '1') return
      console.log(JSON.stringify({
        type: 'api_request',
        reqId,
        method: req.method,
        path,
        status,
        latencyMs: Date.now() - started,
        ip: maskIpForLog(req.ip),
        ...extra
      }))
    }
  }
}

function isAdminIpAllowed(req) {
  const allow = Array.isArray(config.adminAllowedIps) ? config.adminAllowedIps : []
  if (allow.length === 0) return true
  const ip = String(req.ip || '').trim()
  return allow.includes(ip)
}

const telemetryRate = new Map()

function checkTelemetryRateLimit(ip, incomingCount = 1) {
  const minute = Math.floor(Date.now() / 60000)
  const key = `${ip}#${minute}`
  const cur = Number(telemetryRate.get(key) || 0)
  const next = cur + Math.max(1, incomingCount)
  telemetryRate.set(key, next)

  if (Math.random() < 0.01) {
    const expireBefore = minute - 2
    for (const k of telemetryRate.keys()) {
      const m = Number(String(k).split('#')[1] || 0)
      if (m < expireBefore) telemetryRate.delete(k)
    }
  }

  return next <= Number(config.telemetryRateLimitPerMinute || 600)
}

function pruneTelemetryEvents(store) {
  if (!Array.isArray(store.telemetryEvents)) store.telemetryEvents = []
  const keepMs = Number(config.telemetryRetentionDays || 14) * 24 * 60 * 60 * 1000
  const now = Date.now()
  store.telemetryEvents = store.telemetryEvents.filter((ev) => {
    const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
    return Number.isFinite(t) && now - t <= keepMs
  })
  if (store.telemetryEvents.length > 10000) store.telemetryEvents.length = 10000
}

const verifyStSession = verifySession()

const attachLocalUser = asyncHandler(async (req, res, next) => {
  if (!isSuperTokensReady()) {
    jsonErr(res, 503, '登录服务未配置（缺少 SuperTokens Core 或 SUPERTOKENS_CONNECTION_URI）', 'auth_unavailable')
    return
  }
  const userId = req.session.getUserId()
  const stUser = await supertokens.getUser(userId)
  if (!stUser) {
    jsonErr(res, 401, '未授权', 'unauthorized')
    return
  }
  const store = getStore()
  let local = findSupertokensLinkedUser(store, userId)
  if (!local) {
    local = ensureSupertokensLocalUser(store, stUser)
    scheduleSave()
  } else {
    syncSupertokensLocalUser(local, stUser)
    markUserProfileDirty(local.id)
    scheduleSave()
  }
  req.user = local
  next()
})

function requireUser(req, res, next) {
  if (!isSuperTokensReady()) {
    if (!config.isProd) {
      const devName = parseDevBearerToken(req)
      if (devName) {
        const store = getStore()
        const user = ensureDevUserByName(store, devName)
        if (user) {
          req.user = user
          return next()
        }
      }
    }
    return jsonErr(
      res,
      503,
      '登录服务未配置（缺少 SuperTokens Core 或 SUPERTOKENS_CONNECTION_URI）',
      'auth_unavailable'
    )
  }
  verifyStSession(req, res, (err) => {
    if (err) return next(err)
    attachLocalUser(req, res, next)
  })
}

/** 未显式标记为 false 时视为已验证（兼容未迁移字段的旧用户记录） */
function isUserEmailVerified(u) {
  if (!u || typeof u !== 'object') return true
  const v = u.emailVerified
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return true
}

function publicUser(u) {
  return {
    id: u.id,
    uuid: u.uuid,
    username: u.username,
    email: u.email || undefined,
    roles: Array.isArray(u.roles) ? u.roles : [],
    emailVerified: isUserEmailVerified(u),
    linkedMcUsername: u.linkedMcUsername || undefined,
    linkedMcUuid: u.linkedMcUuid || undefined,
    verifiedMojang: Boolean(u.verifiedMojang),
    totpEnabled: Boolean(u.totpEnabled)
  }
}

function parseDevBearerToken(req) {
  const auth = String(req.headers.authorization || '').trim()
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token.startsWith('dev:')) return null
  const username = token.slice(4).trim()
  if (!username) return null
  return username
}

function ensureDevUserByName(store, username, email) {
  const un = String(username || '').trim()
  if (!un) return null
  let u = (store.users || []).find((x) => String(x?.username || '') === un)
  if (!u) {
    u = {
      id: crypto.randomUUID(),
      uuid: crypto.randomUUID(),
      username: un,
      email: String(email || '').trim() || `${un}@starmc.local`,
      roles: [],
      emailVerified: true,
      linkedMcUsername: null,
      linkedMcUuid: null,
      verifiedMojang: false,
      totpEnabled: false,
      totpSecret: null,
      totpPendingSecret: null,
      recoveryCodes: [],
      recoveryCodesCount: 0
    }
    store.users.push(u)
    markUserProfileDirty(u.id)
    scheduleSave()
  }
  return u
}

function requireVerifiedEmail(req, res, next) {
  if (!config.requireEmailVerifiedForSkinActions) {
    return next()
  }
  if (!isUserEmailVerified(req.user)) {
    return jsonErr(res, 403, '请先完成邮箱验证后再操作', 'email_not_verified')
  }
  next()
}

function ensurePlayerState(store, userId) {
  if (!store.playerState[userId]) {
    store.playerState[userId] = {
      activeSelection: null,
      recentSelections: [],
      nextAssetId: 1,
      assets: {},
      applied: {
        skinAssetId: 0,
        capeAssetId: 0,
        slot: 'default',
        version: 1
      }
    }
  }
  return store.playerState[userId]
}

function ensureSecurityCenter(store) {
  if (!store.securityCenter || typeof store.securityCenter !== 'object') {
    store.securityCenter = {}
  }
  if (!store.securityCenter.sessions || typeof store.securityCenter.sessions !== 'object') {
    store.securityCenter.sessions = {}
  }
  if (!Array.isArray(store.securityCenter.alerts)) store.securityCenter.alerts = []
  if (!Array.isArray(store.securityCenter.loginEvents)) store.securityCenter.loginEvents = []
  if (!Array.isArray(store.securityCenter.auditLogs)) store.securityCenter.auditLogs = []
  if (!Array.isArray(store.securityCenter.webhookQueue)) store.securityCenter.webhookQueue = []
  if (!store.securityCenter.trustedDevices || typeof store.securityCenter.trustedDevices !== 'object') {
    store.securityCenter.trustedDevices = {}
  }
  if (!store.securityCenter.geoCache || typeof store.securityCenter.geoCache !== 'object') store.securityCenter.geoCache = {}
  if (!store.securityCenter.rules || typeof store.securityCenter.rules !== 'object') {
    store.securityCenter.rules = {
      failWeight: 70,
      unknownIpWeight: 30,
      highRiskThreshold: 70,
      mediumRiskThreshold: 35,
      requireMfaOnHighRisk: true,
      enableWebhookReplay: true
    }
  }
  return store.securityCenter
}

function normalizeAsnCategory(asn) {
  const value = String(asn || '').trim().toLowerCase()
  if (!value) return 'unknown'
  if (value.includes('hosting') || value.includes('datacenter') || value.includes('cloud')) return 'datacenter'
  if (value.includes('proxy') || value.includes('vpn') || value.includes('tor')) return 'proxy_suspected'
  if (value.includes('residential') || value.includes('broadband') || value.includes('telecom') || value.includes('mobile')) return 'residential'
  return 'unknown'
}

function buildDeviceProfileLabel(event = {}) {
  const fingerprint = String(event.fingerprint || event.deviceFingerprint || '').trim()
  const method = String(event.method || '').trim().toLowerCase()
  if (!fingerprint) return 'unknown_device'
  if (method === 'trusted_device') return 'trusted_device'
  return 'known_device'
}

function ensureTrustedDeviceBucket(sc, userId) {
  const key = String(userId || '').trim() || 'anonymous'
  if (!sc.trustedDevices[key] || typeof sc.trustedDevices[key] !== 'object') {
    sc.trustedDevices[key] = {}
  }
  return sc.trustedDevices[key]
}

function findUserByExternalUserId(store, externalUserId) {
  const key = String(externalUserId || '').trim()
  if (!key) return null
  return store.users.find((user) => String(user?.id || '').trim() === key) || null
}

function computeLoginRisk(sc, userId, payload = {}) {
  const uid = String(userId || '').trim() || 'anonymous'
  const byUser = ensureTrustedDeviceBucket(sc, uid)
  const fingerprint = String(payload.fingerprint || payload.deviceFingerprint || '').trim()
  const ip = String(payload.ip || '').trim()
  const location = String(payload.location || '').trim()
  const asn = String(payload.asn || '').trim()
  const asnCategory = normalizeAsnCategory(asn)
  const previousEvents = sc.loginEvents.filter((row) => String(row?.userId || 'anonymous') === uid)
  const hasKnownFingerprint = fingerprint && Object.prototype.hasOwnProperty.call(byUser, fingerprint)
  const hasKnownIp = ip && previousEvents.some((row) => String(row?.ip || '').trim() === ip)
  const lastEvent = previousEvents[0] || null
  let score = 0
  if (!hasKnownFingerprint) score += 35
  if (!hasKnownIp) score += 25
  if (asnCategory === 'datacenter') score += 20
  if (asnCategory === 'proxy_suspected') score += 35
  if (location && lastEvent && String(lastEvent.location || '').trim() && String(lastEvent.location || '').trim() !== location) {
    score += 15
  }
  const previousAlerts = sc.alerts.filter((row) => String(row?.userId || 'anonymous') === uid).length
  score += Math.min(20, previousAlerts * 5)
  const riskScore = Math.min(100, score)
  const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 35 ? 'medium' : 'low'
  const deviceProfile = !fingerprint
    ? 'unknown_device'
    : !hasKnownFingerprint
      ? 'new_device'
      : !hasKnownIp
        ? 'same_device_network_anomaly'
        : 'trusted_device'
  return {
    riskScore,
    riskLevel,
    deviceProfile,
    asnCategory,
    isNewDevice: Boolean(fingerprint) && !hasKnownFingerprint,
    isNewIp: Boolean(ip) && !hasKnownIp,
  }
}

function appendLoginEvent(store, payload = {}) {
  const sc = ensureSecurityCenter(store)
  const externalUserId = String(payload.external_user_id || payload.externalUserId || '').trim()
  const user = externalUserId ? findUserByExternalUserId(store, externalUserId) : null
  const userId = user?.id || externalUserId || 'anonymous'
  const username = String(payload.username || '').trim()
  const fingerprint = String(payload.fingerprint || payload.deviceFingerprint || '').trim()
  const ip = String(payload.current_ip || payload.ip || payload.remoteAddress || '').trim()
  const location = String(payload.location || '').trim() || '未记录'
  const asn = String(payload.asn || '').trim() || '未记录'
  const existingRisk = {
    riskScore: Number(payload.risk_score),
    riskLevel: String(payload.risk_level || '').trim().toLowerCase(),
    deviceProfile: String(payload.device_profile || '').trim(),
  }
  const computed = computeLoginRisk(sc, userId, {
    fingerprint,
    ip,
    location,
    asn,
  })
  const previous = sc.loginEvents.find((row) => String(row?.userId || '') === String(userId || '')) || null
  const createdAt = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
    userId,
    username,
    uuid: String(payload.uuid || '').trim() || null,
    method: String(payload.method || '').trim() || 'unknown',
    ip,
    lastIp: String(payload.last_ip || previous?.ip || '').trim() || null,
    lastLoginTime: Number(payload.last_login_time || 0) || null,
    location,
    isp: String(payload.isp || '').trim() || '未记录',
    asn,
    asnCategory: computed.asnCategory,
    playtimeMs: Number(payload.playtime_ms || 0) || 0,
    riskScore: Number.isFinite(existingRisk.riskScore) ? existingRisk.riskScore : computed.riskScore,
    riskLevel: existingRisk.riskLevel || computed.riskLevel,
    deviceProfile: existingRisk.deviceProfile || computed.deviceProfile || buildDeviceProfileLabel(payload),
    fingerprint: fingerprint || null,
    externalUserId: externalUserId || null,
    createdAt,
    tsMs: payload.ts_ms != null && Number.isFinite(Number(payload.ts_ms)) ? Number(payload.ts_ms) : Date.now(),
  }
  sc.loginEvents.unshift(row)
  if (sc.loginEvents.length > 10000) sc.loginEvents.length = 10000
  if (fingerprint) {
    const bucket = ensureTrustedDeviceBucket(sc, userId)
    const previousDevice = bucket[fingerprint] || {}
    bucket[fingerprint] = {
      fingerprint,
      username,
      firstSeenAt: previousDevice.firstSeenAt || createdAt,
      lastSeenAt: createdAt,
      loginCount: Number(previousDevice.loginCount || 0) + 1,
      lastIp: ip || previousDevice.lastIp || null,
      lastLocation: location || previousDevice.lastLocation || null,
      lastAsn: asn || previousDevice.lastAsn || null,
      deviceProfile: row.deviceProfile,
    }
  }
  markKvDirty('security_center_state')
  return row
}

function deriveRiskFromEvents(events, rules) {
  const total = Array.isArray(events) ? events.length : 0
  if (!total) return { score: 0, level: 'low', suspicious: 0, unknownIp: 0 }
  const suspicious = events.filter((ev) => {
    const t = String(ev?.type || ev?.action || '').toLowerCase()
    return t.includes('fail') || t.includes('reject') || t.includes('ban') || t.includes('risk')
  }).length
  const unknownIp = events.filter((ev) => !String(ev?.ip || '').trim()).length
  const score = Math.min(
    100,
    Math.round((suspicious / total) * Number(rules?.failWeight || 70) + (unknownIp / total) * Number(rules?.unknownIpWeight || 30))
  )
  const high = Number(rules?.highRiskThreshold || 70)
  const medium = Number(rules?.mediumRiskThreshold || 35)
  const level = score >= high ? 'high' : score >= medium ? 'medium' : 'low'
  return { score, level, suspicious, unknownIp }
}

function appendSecurityAudit(store, userId, action, detail) {
  const sc = ensureSecurityCenter(store)
  sc.auditLogs.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId,
    action,
    detail: detail || {}
  })
  if (sc.auditLogs.length > 5000) sc.auditLogs.length = 5000
  markKvDirty('security_center_state')
}

function appendSecurityAlert(store, userId, level, title, payload) {
  const sc = ensureSecurityCenter(store)
  const eventId = crypto.randomUUID()
  const at = new Date().toISOString()
  sc.alerts.unshift({
    id: eventId,
    at,
    userId,
    level,
    title,
    payload: payload || {},
    read: false
  })
  if (sc.alerts.length > 2000) sc.alerts.length = 2000

  const idem = crypto
    .createHash('sha256')
    .update(`${userId}|${level}|${title}|${JSON.stringify(payload || {})}`)
    .digest('hex')
  const duplicated = sc.webhookQueue.find((q) => q.idempotencyKey === idem && q.status !== 'failed')
  if (duplicated) return

  sc.webhookQueue.unshift({
    id: crypto.randomUUID(),
    eventId,
    at,
    userId,
    level,
    title,
    payload: payload || {},
    status: 'pending',
    attempts: 0,
    replayToken: `replay_${Math.random().toString(36).slice(2, 10)}`,
    idempotencyKey: idem,
    nextRetryAt: at
  })
  if (sc.webhookQueue.length > 4000) sc.webhookQueue.length = 4000
  markKvDirty('security_center_state')
  pushUserNotification(store, userId, {
    type: 'security_alert',
    title: `安全告警（${String(level || 'unknown').toUpperCase()}）`,
    message: String(title || '检测到安全风险'),
    detail: {
      eventId,
      level,
      payload: payload || {},
      at,
    },
  })
}

function ensureUserNotificationsStore(store) {
  if (!store.userNotifications || typeof store.userNotifications !== 'object') {
    store.userNotifications = {}
  }
  return store.userNotifications
}

function pushUserNotification(store, userId, payload) {
  const uid = String(userId || '').trim()
  if (!uid) return null
  const notifications = ensureUserNotificationsStore(store)
  const list = Array.isArray(notifications[uid]) ? notifications[uid] : []
  const item = {
    id: crypto.randomUUID(),
    userId: uid,
    type: String(payload?.type || 'system'),
    title: String(payload?.title || '系统通知'),
    message: String(payload?.message || ''),
    detail: payload?.detail ?? null,
    createdAt: new Date().toISOString(),
    readAt: null,
  }
  list.unshift(item)
  if (list.length > 300) list.length = 300
  notifications[uid] = list
  markKvDirty('user_notifications')
  return item
}

function roleSetOf(user) {
  return normalizeRoleSet(user)
}

function buildPermissionMatrix(user) {
  const roles = roleSetOf(user)
  const isAdmin = roles.has('admin')
  const isReviewer = roles.has('reviewer')
  const isModerator = roles.has('moderator')
  const isStaff = isAdmin || isReviewer || isModerator
  return {
    roles: [...roles],
    capabilities: {
      canViewReviewerCenter: isReviewer || isAdmin || isModerator,
      canReviewSubmissions: isReviewer || isAdmin,
      canModerateReports: isModerator || isReviewer || isAdmin,
      canManageUsers: isAdmin,
      canViewTelemetry: isAdmin,
      canViewAuthxEvents: isAdmin,
      canManageAuthxAdmin: isAdmin,
      canViewMcResetEvents: isAdmin,
      canManageSecurityRules: isAdmin,
      canReplayWebhooks: isAdmin,
      canViewAuditLogs: isStaff,
      canManageTasks: isAdmin || isModerator,
      canRollbackSkinVersion: isAdmin || isReviewer || isModerator,
    }
  }
}

function ensureDeadLetterQueue(store) {
  if (!Array.isArray(store.deadLetterQueue)) store.deadLetterQueue = []
  return store.deadLetterQueue
}

function appendDeadLetter(store, payload) {
  const queue = ensureDeadLetterQueue(store)
  const row = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...payload,
  }
  queue.unshift(row)
  if (queue.length > 2000) queue.length = 2000
  markKvDirty('dead_letter_queue')
  return row
}

function ensureAsyncTasksStore(store) {
  if (!Array.isArray(store.asyncTasks)) store.asyncTasks = []
  return store.asyncTasks
}

function appendAsyncTask(store, payload) {
  const tasks = ensureAsyncTasksStore(store)
  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...payload
  }
  tasks.unshift(row)
  if (tasks.length > 2000) tasks.length = 2000
  markKvDirty('async_tasks')
  return row
}

function updateAsyncTask(store, taskId, patch = {}) {
  const tasks = ensureAsyncTasksStore(store)
  const row = tasks.find((x) => String(x?.id || '') === String(taskId || ''))
  if (!row) return null
  Object.assign(row, patch, { updatedAt: new Date().toISOString() })
  markKvDirty('async_tasks')
  return row
}

function classifyDeviceType(uaRaw) {
  const ua = String(uaRaw || '').toLowerCase()
  if (!ua) return 'unknown'
  if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler')) return 'bot'
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  return 'desktop'
}

function makeRecoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase())
}

function signWebhookPayload(secret, payload) {
  if (!secret) return ''
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

function maskIpForLog(ip) {
  const raw = String(ip || '').trim()
  if (!raw) return 'unknown'
  if (raw.includes(':')) {
    return raw.split(':').slice(0, 3).join(':') + ':****'
  }
  const seg = raw.split('.')
  if (seg.length === 4) {
    return `${seg[0]}.${seg[1]}.*.*`
  }
  return 'masked'
}

function isPrivateIp(ip) {
  const s = String(ip || '').trim()
  if (!s) return true
  return s.startsWith('10.') || s.startsWith('127.') || s.startsWith('192.168.') || s.startsWith('172.16.')
}

let lastGeoQueryAt = 0

async function fetchGeoLabelByIp(ip) {
  const raw = String(ip || '').trim()
  if (!raw || isPrivateIp(raw)) return '内网/本机'
  if (!config.geoipEnabled) return '公网（GeoIP已关闭）'

  const now = Date.now()
  const gap = now - lastGeoQueryAt
  if (gap < config.geoipMinIntervalMs) {
    await new Promise((resolve) => setTimeout(resolve, config.geoipMinIntervalMs - gap))
  }
  lastGeoQueryAt = Date.now()

  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(raw)}?lang=zh-CN&fields=status,country,regionName,city,isp,query`, {
      headers: { 'User-Agent': 'StarMC-SecurityCenter/1.0' }
    })
    if (!r.ok) return '公网（GeoIP查询失败）'
    const d = await r.json().catch(() => null)
    if (!d || d.status !== 'success') return '公网（GeoIP查询失败）'
    const parts = [d.country, d.regionName, d.city].filter(Boolean)
    const base = parts.join(' / ') || '公网'
    return d.isp ? `${base} · ${d.isp}` : base
  } catch {
    return '公网（GeoIP查询失败）'
  }
}

async function resolveGeoForIp(store, ip) {
  const raw = String(ip || '').trim()
  const sc = ensureSecurityCenter(store)
  if (!raw) return '未知地区'
  if (isPrivateIp(raw)) return '内网/本机'
  const hit = sc.geoCache[raw]
  if (hit && typeof hit === 'object' && hit.label) {
    const updatedAtMs = Date.parse(String(hit.updatedAt || '')) || 0
    const ttlMs = Number(config.geoipCacheTtlSec || 86400) * 1000
    if (updatedAtMs > 0 && Date.now() - updatedAtMs < ttlMs) {
      return String(hit.label)
    }
  }

  const label = await fetchGeoLabelByIp(raw)
  sc.geoCache[raw] = {
    label,
    updatedAt: new Date().toISOString()
  }
  markKvDirty('security_center_state')
  return label
}

function hasRole(user, role) {
  return hasPermissionRole(user, role)
}

function parseTimeMs(value) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : 0
}

function buildSecurityLabel(indicators) {
  if (indicators.hasAbnormalSessions || indicators.triggeredSecurityAlert) {
    return 'risk'
  }
  if (!indicators.totpEnabled || indicators.recentBindingChanges > 0) {
    return 'attention'
  }
  return 'safe'
}

function actionLabel(action) {
  const k = String(action || '').trim().toLowerCase()
  const map = {
    session_register: '新会话登录',
    session_revoke: '会话已撤销',
    session_revoke_all: '已一键下线会话',
    totp_enable: '启用了两步验证',
    totp_disable: '关闭了两步验证',
    recovery_codes_rotate: '更新了恢复码',
    link_minecraft: '绑定了游戏角色',
    unlink_minecraft: '解绑了游戏角色',
    verify_init: '发起了正版验证',
    verify_cancel: '取消了正版验证',
    verify_success: '正版验证成功',
    verify_failed: '正版验证失败',
    verify_callback_conflict: '验证回调冲突',
  }
  return map[k] || `安全事件：${k || 'unknown'}`
}

const MC_BINDING_AUDIT_ACTIONS = new Set([
  'link_minecraft',
  'unlink_minecraft',
  'verify_init',
  'verify_cancel',
  'verify_success',
  'verify_failed',
  'verify_callback_conflict',
])

function normalizeShortText(input, maxLen = 120) {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function buildMcBindingHistoryItemFromAudit(row) {
  const action = String(row?.action || '').trim().toLowerCase()
  const detail = toPlainObject(row?.detail)
  const session = toPlainObject(detail.session)
  const at = String(row?.at || '').trim()
  const reason =
    normalizeShortText(detail.reason || detail.failureReason || session.failureReason, 180) || null
  const conflictCode =
    normalizeShortText(detail.conflictCode || session.conflictCode, 80) || null
  const mcUsername =
    normalizeShortText(detail.mcUsername || session.mcUsername, 16).toLowerCase() || null
  const source = normalizeShortText(detail.source, 40) || null

  return {
    id: normalizeShortText(row?.id, 80) || crypto.randomUUID(),
    at: at || new Date().toISOString(),
    action,
    label: actionLabel(action),
    mcUsername,
    reason,
    conflictCode,
    source,
    detail,
  }
}

function verifyStatusLabel(status) {
  const key = String(status || '').trim().toLowerCase()
  const map = {
    pending: '进行中',
    succeeded: '已成功',
    failed: '已失败',
    cancelled: '已取消',
    expired: '已过期',
  }
  return map[key] || '未知状态'
}

function buildUserRecentActivities(store, userId, limit = 12) {
  const events = []
  const userFavorites = Array.isArray(store.userFavorites?.[userId]) ? store.userFavorites[userId] : []
  for (const fav of userFavorites) {
    const at = parseTimeMs(fav?.createdAt)
    if (!at) continue
    events.push({
      id: `fav:${fav?.id || fav?.skinId || at}`,
      type: 'favorite',
      title: '收藏了皮肤',
      subtitle: String(fav?.skinName || fav?.skinId || '未命名皮肤'),
      at,
      time: new Date(at).toISOString(),
    })
  }

  for (const sub of store.submissions || []) {
    if (String(sub?.userId || '') !== String(userId || '')) continue
    const submittedAt = parseTimeMs(sub?.submittedAt)
    if (submittedAt) {
      events.push({
        id: `sub:new:${sub?.id || submittedAt}`,
        type: 'submission',
        title: '提交了皮肤投稿',
        subtitle: String(sub?.fileName || sub?.id || '未命名资源'),
        at: submittedAt,
        time: new Date(submittedAt).toISOString(),
      })
    }
    const reviewedAt = parseTimeMs(sub?.reviewedAt)
    if (reviewedAt) {
      const status = String(sub?.status || '').toLowerCase()
      const reviewLabel = status === 'approved' ? '投稿已通过' : status === 'rejected' ? '投稿被驳回' : '投稿状态更新'
      events.push({
        id: `sub:review:${sub?.id || reviewedAt}`,
        type: 'submission_review',
        title: reviewLabel,
        subtitle: String(sub?.note || sub?.fileName || sub?.id || '查看投稿中心详情'),
        at: reviewedAt,
        time: new Date(reviewedAt).toISOString(),
      })
    }
  }

  const sc = ensureSecurityCenter(store)
  for (const a of sc.auditLogs || []) {
    if (String(a?.userId || '') !== String(userId || '')) continue
    const at = parseTimeMs(a?.at)
    if (!at) continue
    events.push({
      id: `audit:${a?.id || at}:${a?.action || 'event'}`,
      type: 'security',
      title: actionLabel(a?.action),
      subtitle: String(a?.detail?.message || a?.detail?.reason || ''),
      at,
      time: new Date(at).toISOString(),
    })
  }
  for (const alert of sc.alerts || []) {
    if (String(alert?.userId || '') !== String(userId || '')) continue
    const at = parseTimeMs(alert?.at)
    if (!at) continue
    events.push({
      id: `alert:${alert?.id || at}`,
      type: 'security_alert',
      title: `安全告警（${String(alert?.level || 'unknown').toUpperCase()}）`,
      subtitle: String(alert?.title || '检测到异常行为'),
      at,
      time: new Date(at).toISOString(),
    })
  }
  const notifications = ensureUserNotificationsStore(store)
  const notifyList = Array.isArray(notifications[userId]) ? notifications[userId] : []
  for (const n of notifyList.slice(0, 50)) {
    const at = parseTimeMs(n?.createdAt)
    if (!at) continue
    events.push({
      id: `notice:${n?.id || at}`,
      type: 'notification',
      title: String(n?.title || '系统通知'),
      subtitle: String(n?.message || ''),
      at,
      time: new Date(at).toISOString(),
    })
  }

  events.sort((a, b) => b.at - a.at)
  return events.slice(0, limit).map((event) => ({
    id: event.id,
    type: event.type,
    title: event.title,
    subtitle: event.subtitle,
    time: event.time
  }))
}

function buildUserSecurityIndicators(store, user) {
  const sc = ensureSecurityCenter(store)
  const userId = String(user?.id || '')
  const now = Date.now()
  const recentWindow = 30 * 24 * 60 * 60 * 1000
  const bindingActions = new Set(['link_minecraft', 'unlink_minecraft'])
  const sessions = Object.values(sc.sessions || {}).filter((s) => String(s?.userId || '') === userId)
  const activeSessions = sessions.filter((s) => s?.active !== false)
  const sessionIps = new Set(activeSessions.map((s) => String(s?.ip || '').trim()).filter(Boolean))
  const recentAlerts = (sc.alerts || []).filter((a) => String(a?.userId || '') === userId && now - parseTimeMs(a?.at) <= recentWindow)
  const highRiskAlerts = recentAlerts.filter((a) => String(a?.level || '').toLowerCase() === 'high')
  const recentBindingChanges = (sc.auditLogs || []).filter(
    (a) =>
      String(a?.userId || '') === userId &&
      bindingActions.has(String(a?.action || '').toLowerCase()) &&
      now - parseTimeMs(a?.at) <= recentWindow
  ).length
  const hasAbnormalSessions = sessionIps.size > 2 || highRiskAlerts.length > 0

  const indicators = {
    totpEnabled: Boolean(user?.totpEnabled),
    hasAbnormalSessions,
    recentBindingChanges,
    triggeredSecurityAlert: recentAlerts.length > 0,
    activeSessions: activeSessions.length,
    recentSecurityAlertCount: recentAlerts.length,
    highRiskAlertCount: highRiskAlerts.length,
  }

  return {
    ...indicators,
    level: buildSecurityLabel(indicators),
  }
}

function buildUserCenterSummary(store, user) {
  const userId = String(user?.id || '')
  const favorites = Array.isArray(store.userFavorites?.[userId]) ? store.userFavorites[userId] : []
  const submissions = (store.submissions || []).filter((s) => String(s?.userId || '') === userId)
  const security = buildUserSecurityIndicators(store, user)
  const recentActivity = buildUserRecentActivities(store, userId, 12)
  return {
    favoritesCount: favorites.length,
    submissionsCount: submissions.length,
    recentActivity,
    security,
  }
}

function requireAdmin(req, res, next) {
  const ok = requireRolesOrJson(req, res, {
    roles: ['admin'],
    message: '仅管理员可执行该操作',
    requiredCapability: 'manage_admin',
  })
  if (!ok) return false
  if (typeof next === 'function') next()
  return true
}

function requiresStepUpForHighRisk(user, sc, riskLevel) {
  if (!sc?.rules?.requireMfaOnHighRisk) return false
  if (riskLevel !== 'high') return false
  if (!user?.totpEnabled) return false
  return true
}

function verifyStepUp(req, user) {
  if (!user?.totpEnabled || !user?.totpSecret) return true
  const code = String(req.body?.totpCode || req.headers['x-totp-code'] || '').trim()
  if (!code) return false
  return verifyTotpToken(user.totpSecret, code)
}

async function processWebhookQueue(store) {
  const sc = ensureSecurityCenter(store)
  const now = Date.now()
  const maxAttempts = 5
  const secret = String(config.authxVlaWebhookSecrets?.[0] || '')
  let securityCenterChanged = false
  for (const item of sc.webhookQueue) {
    if (!item || item.status === 'sent' || item.status === 'replayed' || item.status === 'failed') continue
    const nextAt = Date.parse(String(item.nextRetryAt || item.at || '')) || 0
    if (nextAt > now) continue
    const attempts = Number(item.attempts || 0)
    if (attempts >= maxAttempts) {
      item.status = 'failed'
      securityCenterChanged = true
      if (!item.deadLetterId) {
        const dead = appendDeadLetter(store, {
          type: 'security_webhook',
          sourceId: String(item.id || ''),
          eventId: String(item.eventId || ''),
          userId: String(item.userId || ''),
          reason: String(item.lastError || 'max_attempts_exceeded'),
          payload: {
            title: item.title,
            level: item.level,
            attempts,
            replayToken: item.replayToken
          }
        })
        item.deadLetterId = String(dead?.id || '')
        securityCenterChanged = true
        for (const user of Array.isArray(store.users) ? store.users : []) {
          if (!roleSetOf(user).has('admin')) continue
          pushUserNotification(store, user.id, {
            type: 'webhook_failed',
            title: '安全 Webhook 投递失败',
            message: `事件 ${String(item.eventId || '')} 已进入死信队列`,
            detail: {
              deadLetterId: item.deadLetterId,
              sourceId: String(item.id || ''),
              attempts,
              reason: String(item.lastError || 'max_attempts_exceeded')
            }
          })
        }
      }
      continue
    }
    item.attempts = attempts + 1
    item.lastTryAt = new Date().toISOString()
    securityCenterChanged = true

    if (secret) {
      const payload = JSON.stringify({
        eventId: item.eventId,
        at: item.at,
        userId: item.userId,
        level: item.level,
        title: item.title,
        payload: item.payload || {}
      })
      item.signature = signWebhookPayload(secret, payload)
      const outboundUrl = String(config.webhookOutboundUrl || '').trim()
      if (outboundUrl) {
        try {
          const resp = await fetch(outboundUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-VLA-Signature': item.signature,
            },
            body: payload,
            signal: AbortSignal.timeout(10000),
          })
          if (resp.ok) {
            item.status = 'sent'
            item.sentAt = new Date().toISOString()
            item.lastError = ''
          } else {
            item.lastError = `http_${resp.status}`
            item.status = 'pending'
            const backoffSec = Math.min(300, 2 ** attempts)
            item.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString()
          }
        } catch (err) {
          item.lastError = String(err?.message || err?.code || 'delivery_failed')
          item.status = 'pending'
          const backoffSec = Math.min(300, 2 ** attempts)
          item.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString()
        }
      } else {
        item.status = 'pending'
        item.lastError = 'no_outbound_url'
      }
      securityCenterChanged = true
      continue
    }

    item.lastError = 'webhook_secret_missing'
    item.status = 'pending'
    const backoffSec = Math.min(300, 2 ** attempts)
    item.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString()
    securityCenterChanged = true
  }
  if (securityCenterChanged) markKvDirty('security_center_state')
}

function catalogItemById(store, id) {
  return store.catalog.find((c) => c.id === id) || null
}

function isValidEmailAddress(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function ensureSiteUserForPluginEmail(store, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('missing_email')
  }
  if (!isSuperTokensReady()) {
    throw new Error('supertokens_unavailable')
  }
  let stUsers = await supertokens.listUsersByAccountInfo('public', { email: normalizedEmail })
  let stUser = Array.isArray(stUsers) && stUsers.length > 0 ? stUsers[0] : null
  let created = false
  if (!stUser) {
    const { EmailPassword } = await import('supertokens-node/recipe/emailpassword')
    const randomPassword = crypto.randomBytes(24).toString('base64url') + 'Aa1!'
    const signUpResult = await EmailPassword.signUp('public', normalizedEmail, randomPassword)
    if (signUpResult.status !== 'OK') {
      if (signUpResult.status !== 'EMAIL_ALREADY_EXISTS_ERROR') {
        throw new Error('account_create_failed')
      }
    } else {
      created = true
    }
    stUsers = await supertokens.listUsersByAccountInfo('public', { email: normalizedEmail })
    stUser = Array.isArray(stUsers) && stUsers.length > 0 ? stUsers[0] : null
  }
  if (!stUser) {
    throw new Error('account_resolve_failed')
  }
  const localUser = ensureSupertokensLocalUser(store, stUser)
  if (!localUser) {
    throw new Error('local_user_create_failed')
  }
  localUser.email = normalizedEmail
  localUser.emailVerified = true
  markUserProfileDirty(localUser.id)
  return { localUser, stUser, created }
}

function createApiApp() {
  const app = express()
  if (config.trustProxy) app.set('trust proxy', 1)

  initSuperTokens()

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  )

  const stCors = isSuperTokensReady() ? supertokens.getAllCORSHeaders() : []
  const corsOpts =
    config.corsOrigins.length > 0
      ? {
          origin: config.corsOrigins,
          credentials: true,
          allowedHeaders: ['content-type', ...stCors]
        }
      : { origin: false }

  app.use(cors(corsOpts))
  app.use(globalLimiter)
  app.use(antiCrawlerGuard)
  app.use(config.supertokensApiBasePath, authLimiter)

  ensureDirs()
  app.use('/uploads', uploadsReadLimiter)
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      index: false,
      maxAge: config.isProd ? '7d' : 0,
      fallthrough: false
    })
  )

  /**
   * 生产环境：必须配置 DEV_ADMIN_SECRET，且请求头 X-Admin-Secret 一致。
   * 开发环境：未配置密钥时不拦截；若配置了则校验（便于与预发环境一致）。
   */
  function requireDevAdmin(req, res) {
    if (!isAdminIpAllowed(req)) {
      jsonErr(res, 403, '当前来源 IP 不允许访问管理接口', 'forbidden_ip')
      return false
    }

    if (config.isProd) {
      if (!config.devAdminSecret) {
        jsonErr(
          res,
          503,
          '生产环境必须配置 DEV_ADMIN_SECRET 后方可使用管理接口',
          'misconfigured'
        )
        return false
      }
      const h = String(req.headers['x-admin-secret'] || '').trim()
      if (h !== config.devAdminSecret) {
        jsonErr(res, 403, '需要管理员密钥', 'forbidden')
        return false
      }
      return true
    }
    if (config.devAdminSecret) {
      const h = String(req.headers['x-admin-secret'] || '').trim()
      if (h !== config.devAdminSecret) {
        jsonErr(res, 403, '需要管理员密钥', 'forbidden')
        return false
      }
    }
    return true
  }

  function requireAdminAccess(req, res, options = {}) {
    return requireAdminAccessOrJson(req, res, {
      ...options,
      requireDevAdmin
    })
  }

  function requireTelemetryAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['admin'],
      requiredCapability: 'view_telemetry',
      message: '需要遥测查看权限'
    })
  }

  function requireAuthxEventsAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['admin'],
      requiredCapability: 'view_authx_events',
      message: '需要 AuthX 事件查看权限'
    })
  }

  function requireMcResetAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['admin'],
      requiredCapability: 'view_mc_reset_events',
      message: '需要 MC 重置审计查看权限'
    })
  }

  function requireOpsTaskAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['admin', 'moderator'],
      requiredCapability: 'manage_tasks',
      message: '需要任务管理权限'
    })
  }

  function requireAuditLogAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['admin', 'reviewer', 'moderator'],
      requiredCapability: 'view_audit_logs',
      message: '需要审计日志查看权限'
    })
  }

  function requireAuthxAdminAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['admin'],
      requiredCapability: 'manage_authx_admin',
      message: '需要 AuthX 管理权限'
    })
  }

  function pruneMcResetEvents(store) {
    if (!Array.isArray(store.mcResetEvents)) store.mcResetEvents = []
    const maxItems = 10000
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000
    const now = Date.now()
    store.mcResetEvents = store.mcResetEvents.filter((x) => {
      const ts = new Date(String(x?.createdAt || '')).getTime()
      if (!Number.isFinite(ts)) return false
      return now - ts <= maxAgeMs
    })
    if (store.mcResetEvents.length > maxItems) {
      store.mcResetEvents.length = maxItems
    }
  }

  function pushMcResetEvent(store, event) {
    if (!Array.isArray(store.mcResetEvents)) store.mcResetEvents = []
    store.mcResetEvents.unshift(event)
    pruneMcResetEvents(store)
    scheduleSave()
  }

  registerPluginGatewayRoutes(app, {
    config,
    jsonErr,
    getStore,
    authxWebhookCallbackLimiter,
    callbackDeps: {
      failMcVerifySession,
      completeMcVerifySession,
      appendLoginEvent,
      appendSecurityAudit,
      appendSecurityAlert,
      pushUserNotification,
      findUserByExternalUserId,
      computeLoginRisk,
      ensureSecurityCenter,
      markUserProfileDirty,
      scheduleSave,
      markKvDirty,
    },
    bindEmailDeps: {
      isValidEmailAddress,
      findUserByLinkedMcUsername,
      ensureSiteUserForPluginEmail,
      vlaLinkExternalUser,
      vlaAdminBindEmail,
      markUserProfileDirty,
      appendSecurityAudit,
      pushUserNotification,
      scheduleSave,
    },
  })

  app.use(express.json({ limit: '512kb' }))
  app.use(geoBlockMiddleware())
  if (isSuperTokensReady()) {
    app.use(stMiddleware())
  }

  async function buildHealthPayload() {
    const payload = {
      ok: true,
      service: 'starmc-api',
      persist: getPersistSnapshot()
    }

    const store = getStore()
    const events = Array.isArray(store?.telemetryEvents) ? store.telemetryEvents : []
    payload.telemetry = {
      enabled: Boolean(config.telemetryEnabled),
      retentionDays: Number(config.telemetryRetentionDays || 14),
      rateLimitPerMinute: Number(config.telemetryRateLimitPerMinute || 600),
      total: events.length,
      lastReceivedAt: events[0]?.receivedAt || null
    }

    if (config.databaseUrl && config.healthPgStats) {
      const pool = getPool()
      if (pool) {
        try {
          payload.pg = await fetchPgStats(pool)
        } catch (err) {
          payload.pg = { ok: false, error: String(err?.message || err) }
        }
      }
    }
    return payload
  }
  app.get('/health', asyncHandler(async (_req, res) => res.json(await buildHealthPayload())))
  app.get('/api/health', asyncHandler(async (_req, res) => res.json(await buildHealthPayload())))
  // Compatibility endpoint for legacy dev proxy and health checks.
  app.get('/healthz', (_req, res) => res.status(200).send('ok'))

  app.post('/api/metrics/web-vitals', (req, res) => {
    const p = req.body
    if (!p || typeof p !== 'object') return res.sendStatus(400)
    if (typeof p.name !== 'string' || typeof p.value !== 'number') return res.sendStatus(400)

    const pathname = typeof p.pathname === 'string' && p.pathname.trim() ? p.pathname.trim() : '/'
    const ts = Number(p.ts)
    const tsOk = Number.isFinite(ts) && ts > 0
    const metricName = String(p.name || '').toUpperCase()
    const metricValue = Number(p.value)

    if (process.env.LOG_WEB_VITALS === '1') {
      console.log('[web-vitals]', {
        name: metricName,
        value: metricValue,
        rating: p.rating,
        navigationType: p.navigationType,
        pathname,
        ts: tsOk ? ts : Date.now(),
        ip: maskIpForLog(req.ip)
      })
    }

    if (process.env.WEB_VITALS_ALERT_LOG === '1') {
      const threshold =
        metricName === 'LCP' ? 4000
        : metricName === 'INP' ? 500
        : metricName === 'CLS' ? 0.25
        : null
      if (threshold != null && metricValue > threshold) {
        console.warn('[web-vitals][alert]', {
          name: metricName,
          value: metricValue,
          threshold,
          pathname,
          rating: p.rating,
          navigationType: p.navigationType,
          ts: tsOk ? ts : Date.now(),
          ip: req.ip
        })
      }
    }

    res.sendStatus(204)
  })

  app.post('/api/telemetry', (req, res) => {
    const safeEnd = (status = 204) => {
      if (!res.headersSent) {
        res.status(status)
      }
      return res.end()
    }
    const reqLog = makeReqLogger(req)

    try {
      if (!config.telemetryEnabled) {
        return safeEnd(204)
      }

      const events = Array.isArray(req.body?.events) ? req.body.events : []
      if (events.length === 0) {
        reqLog.done(204, { reason: 'empty_events' })
        return safeEnd(204)
      }

      const ip = String(req.ip || 'unknown')
      const maxBatch = 50
      const incoming = Math.min(maxBatch, events.length)
      if (!checkTelemetryRateLimit(ip, incoming)) {
        reqLog.done(204, { reason: 'rate_limited' })
        return safeEnd(204)
      }

      const accepted = []
      const ua = String(req.headers['user-agent'] || '')
      for (const ev of events.slice(0, maxBatch)) {
        if (!ev || typeof ev !== 'object') continue
        if (String(ev.type || '') !== 'route_view') continue
        const item = {
          id: crypto.randomUUID(),
          type: 'route_view',
          path: String(ev.path || '').slice(0, 256),
          name: String(ev.name || '').slice(0, 128),
          section: String(ev.section || 'core').slice(0, 64),
          title: String(ev.title || '').slice(0, 128),
          ts: Number(ev.ts) > 0 ? Number(ev.ts) : Date.now(),
          ip: maskIpForLog(req.ip),
          uaHash: crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16),
          role: String(ev.role || 'guest').slice(0, 32),
          actor: String(ev.actor || '').slice(0, 64),
          deviceType: classifyDeviceType(ua),
          receivedAt: new Date().toISOString()
        }
        if (!item.path) continue
        accepted.push(item)
      }

      if (accepted.length === 0) {
        reqLog.done(204, { reason: 'no_valid_events' })
        return safeEnd(204)
      }

      const store = getStore()
      if (!Array.isArray(store.telemetryEvents)) store.telemetryEvents = []
      store.telemetryEvents.unshift(...accepted)
      pruneTelemetryEvents(store)
      try {
        scheduleSave()
      } catch (e) {
        console.warn('[starmc-api] telemetry scheduleSave failed:', e?.message || e)
      }

      if (process.env.LOG_ROUTE_TELEMETRY === '1') {
        console.log('[route-telemetry]', {
          count: accepted.length,
          sample: accepted[0],
          total: store.telemetryEvents.length,
          batchTs: Date.now()
        })
      }

      reqLog.done(202, { accepted: accepted.length })
      return res.status(202).json({ ok: true, accepted: accepted.length })
    } catch (e) {
      console.warn('[starmc-api] telemetry ingest failed:', e?.message || e)
      reqLog.done(204, { reason: 'exception' })
      return safeEnd(204)
    }
  })

  app.get('/api/admin/telemetry/stats', (req, res) => {
    if (!requireTelemetryAccess(req, res)) return
    const store = getStore()
    const allEvents = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []

    const range = String(req.query.range || '').trim()
    const now = Date.now()
    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : 0

    const events = rangeMs > 0
      ? allEvents.filter((ev) => {
        const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
        return Number.isFinite(t) && now - t <= rangeMs
      })
      : allEvents

    const total = events.length
    const bySection = {}
    const byPath = {}
    const byRole = {}
    const byDeviceType = {}
    const dailyTrend = new Map()
    const weeklyTrend = new Map()
    const monthlyTrend = new Map()

    const weekKeyOf = (t) => {
      const d = new Date(t)
      const year = d.getUTCFullYear()
      const dayUtc = Date.UTC(year, d.getUTCMonth(), d.getUTCDate())
      const firstUtc = Date.UTC(year, 0, 1)
      const week = Math.floor((dayUtc - firstUtc) / (7 * 24 * 60 * 60 * 1000)) + 1
      return `${year}-W${String(week).padStart(2, '0')}`
    }

    const bumpMap = (map, key) => {
      const k = String(key || 'unknown')
      map.set(k, Number(map.get(k) || 0) + 1)
    }

    for (const ev of events) {
      const section = String(ev?.section || 'core')
      const path = String(ev?.path || '')
      const role = String(ev?.role || 'guest')
      const deviceType = String(ev?.deviceType || 'unknown')
      const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
      bySection[section] = Number(bySection[section] || 0) + 1
      if (path) byPath[path] = Number(byPath[path] || 0) + 1
      byRole[role] = Number(byRole[role] || 0) + 1
      byDeviceType[deviceType] = Number(byDeviceType[deviceType] || 0) + 1
      if (Number.isFinite(t) && t > 0) {
        const d = new Date(t)
        const dayKey = d.toISOString().slice(0, 10)
        const monthKey = d.toISOString().slice(0, 7)
        bumpMap(dailyTrend, dayKey)
        bumpMap(weeklyTrend, weekKeyOf(t))
        bumpMap(monthlyTrend, monthKey)
      }
    }

    const topPaths = Object.entries(byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }))

    const funnel = {
      home: Number(byPath['/'] || 0),
      skin: Number(byPath['/skin'] || 0),
      auth: Number(byPath['/auth'] || 0)
    }

    const trendBy = (map, limit) =>
      Array.from(map.entries())
        .map(([bucket, count]) => ({ bucket, count }))
        .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))
        .slice(-limit)

    const pathCounts = Object.values(byPath).map((n) => Number(n || 0))
    const mean = pathCounts.length > 0
      ? pathCounts.reduce((sum, n) => sum + n, 0) / pathCounts.length
      : 0
    const variance = pathCounts.length > 0
      ? pathCounts.reduce((sum, n) => sum + (n - mean) ** 2, 0) / pathCounts.length
      : 0
    const std = Math.sqrt(variance)
    const anomalyThreshold = mean + std * 2
    const anomalyPaths = Object.entries(byPath)
      .filter(([, count]) => Number(count) >= Math.max(20, anomalyThreshold))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }))

    res.json({
      ok: true,
      total,
      bySection,
      topPaths,
      funnel,
      dimensions: {
        role: byRole,
        deviceType: byDeviceType
      },
      trend: {
        day: trendBy(dailyTrend, 30),
        week: trendBy(weeklyTrend, 16),
        month: trendBy(monthlyTrend, 12)
      },
      anomalies: {
        pathBurst: anomalyPaths
      },
      range: range || 'all'
    })
  })

  app.get('/api/admin/telemetry/events', (req, res) => {
    if (!requireTelemetryAccess(req, res)) return
    const reqLog = makeReqLogger(req)
    const store = getStore()
    const events = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []
    const pagination = resolvePaginationQuery(req.query, {
      defaultPageSize: 100,
      maxPageSize: 500
    })
    const section = String(req.query.section || '').trim().toLowerCase()
    const pathQuery = String(req.query.path || '').trim().toLowerCase()
    const range = String(req.query.range || '').trim()

    const now = Date.now()
    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : 0

    let filtered = events
    if (rangeMs > 0) {
      filtered = filtered.filter((ev) => {
        const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
        return Number.isFinite(t) && now - t <= rangeMs
      })
    }
    if (section) {
      filtered = filtered.filter((e) => String(e?.section || '').toLowerCase() === section)
    }
    if (pathQuery) {
      filtered = filtered.filter((e) => String(e?.path || '').toLowerCase().includes(pathQuery))
    }

    const items = filtered.slice(pagination.offset, pagination.offset + pagination.pageSize)
    reqLog.done(200, {
      route: 'telemetry_events',
      total: filtered.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      offset: pagination.offset,
      limit: pagination.limit,
      range: range || 'all'
    })
    return jsonPage(res, {
      total: filtered.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      items,
      range: range || 'all',
      offset: pagination.offset,
      limit: pagination.limit
    })
  })

  app.get('/api/admin/telemetry/export', (req, res) => {
    if (!requireTelemetryAccess(req, res)) return
    const store = getStore()
    const events = Array.isArray(store.telemetryEvents) ? store.telemetryEvents : []
    const section = String(req.query.section || '').trim().toLowerCase()
    const pathQuery = String(req.query.path || '').trim().toLowerCase()
    const range = String(req.query.range || '').trim()
    const format = String(req.query.format || 'csv').trim().toLowerCase()

    const now = Date.now()
    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : range === '7d' ? 7 * 24 * 60 * 60 * 1000
      : 0

    let filtered = events
    if (rangeMs > 0) {
      filtered = filtered.filter((ev) => {
        const t = Date.parse(String(ev?.receivedAt || '')) || Number(ev?.ts || 0)
        return Number.isFinite(t) && now - t <= rangeMs
      })
    }
    if (section) filtered = filtered.filter((e) => String(e?.section || '').toLowerCase() === section)
    if (pathQuery) filtered = filtered.filter((e) => String(e?.path || '').toLowerCase().includes(pathQuery))
    filtered = filtered.slice(0, 5000)

    if (format === 'json') {
      return res.json({ ok: true, total: filtered.length, items: filtered })
    }

    const rows = [
      ['receivedAt', 'path', 'name', 'section', 'role', 'deviceType', 'ip', 'uaHash']
    ]
    for (const ev of filtered) {
      rows.push([
        String(ev?.receivedAt || ''),
        String(ev?.path || ''),
        String(ev?.name || ''),
        String(ev?.section || ''),
        String(ev?.role || ''),
        String(ev?.deviceType || ''),
        String(ev?.ip || ''),
        String(ev?.uaHash || '')
      ])
    }
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="telemetry-export-${Date.now()}.csv"`)
    res.send(`\uFEFF${csv}`)
  })

  const authxOpenApiPath = path.join(__dirname, '../docs/openapi/authx.yaml')
  app.get('/api/docs/openapi/authx', (_req, res) => {
    try {
      const yaml = readFileSync(authxOpenApiPath, 'utf8')
      res.type('text/yaml; charset=utf-8').send(yaml)
    } catch {
      return jsonErr(res, 404, 'OpenAPI 文档不存在', 'openapi_not_found')
    }
  })

  /**
   * 将站点统一 Admin 契约映射到各插件实现（AuthX / VLA）。
   */
  function mapPluginAdminRequest(apiPath, body) {
    const isVla = config.authxPluginAdapter === 'vla'
    if (!isVla) {
      warnAuthxAdapterDeprecated()
      return { path: apiPath, body: body || {}, extraHeaders: {} }
    }
    const extraHeaders = {}
    if (config.authxVlaApiKey) {
      extraHeaders['X-API-Key'] = config.authxVlaApiKey
    }
    if (apiPath.endsWith('/admin/reset-password')) {
      const { username, newPassword } = body || {}
      return {
        path: '/v1/admin/password',
        body: { username, password: newPassword },
        extraHeaders
      }
    }
    if (apiPath.endsWith('/admin/bind-email')) {
      return { path: '/v1/admin/bind-email', body: body || {}, extraHeaders }
    }
    if (apiPath.endsWith('/admin/unbind-device')) {
      const { username, device } = body || {}
      return {
        path: '/v1/admin/unbind-device',
        body: { username, fingerprint: device == null ? '' : String(device) },
        extraHeaders
      }
    }
    if (apiPath === '/internal/v1/link/external-user') {
      const { username, external_user_id: ext } = body || {}
      return {
        path: '/v1/link/external-user',
        body: { username, external_user_id: ext },
        extraHeaders
      }
    }
    if (apiPath.endsWith('/admin/kick-online')) {
      return { path: '/v1/admin/kick-online', body: body || {}, extraHeaders }
    }
    if (apiPath.endsWith('/admin/ban')) {
      return { path: '/v1/admin/ban', body: body || {}, extraHeaders }
    }
    if (apiPath.endsWith('/admin/delete-user')) {
      return { path: '/v1/admin/delete-user', body: body || {}, extraHeaders }
    }
    if (apiPath.endsWith('/admin/skin-refresh')) {
      return { path: '/v1/skin/refresh', body: body || {}, extraHeaders }
    }
    if (apiPath.endsWith('/admin/link-external-user')) {
      const { username, external_user_id: ext } = body || {}
      return {
        path: '/v1/link/external-user',
        body: { username, external_user_id: ext },
        extraHeaders
      }
    }
    return { path: apiPath, body: body || {}, extraHeaders }
  }

  async function pluginFetchJson(apiPath, body) {
    const mapped = mapPluginAdminRequest(apiPath, body)
    const base = String(config.authxPluginBase || '').replace(/\/+$/, '')
    const url = base + mapped.path
    const payload = JSON.stringify(mapped.body || {})
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), config.authxPluginRequestMs)
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...mapped.extraHeaders
      }
      if (
        config.authxPluginAdapter === 'vla' &&
        config.authxVlaHmacSecret
      ) {
        const ts = Math.floor(Date.now() / 1000).toString()
        const sig = crypto
          .createHmac('sha256', config.authxVlaHmacSecret)
          .update(`${ts}\n${payload}`, 'utf8')
          .digest('hex')
        headers['X-VLA-Timestamp'] = ts
        headers['X-VLA-Signature'] = sig
      }
      if (config.authxPluginAdapter !== 'vla' && config.authxAdminSecret) {
        warnAuthxAdapterDeprecated()
        headers['X-AuthX-Admin-Secret'] = config.authxAdminSecret
      }
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: ctrl.signal
      })
      const text = await r.text()
      let json = {}
      if (text) {
        try {
          json = JSON.parse(text)
        } catch {
          json = { ok: false, error: 'invalid_json' }
        }
      }
      return { status: r.status, json }
    } catch (e) {
      const aborted = e?.name === 'AbortError'
      return {
        status: aborted ? 504 : 502,
        json: {
          ok: false,
          error: aborted ? 'plugin_timeout' : 'plugin_unreachable',
          detail: String(e?.message || e)
        }
      }
    } finally {
      clearTimeout(t)
    }
  }

  function triggerVlaSkinRefreshIfConfigured(mcUsername) {
    if (!config.vlaNotifyOnSkinChange) return
    if (config.authxPluginAdapter !== 'vla') return
    const name = String(mcUsername || '').trim()
    if (!name) return
    pluginFetchJson('/api/plugin/authx/admin/skin-refresh', { username: name }).catch((err) => {
      console.warn(
        '[starmc-api] VLA skin/refresh 通知失败:',
        err && err.message ? err.message : err
      )
    })
  }

  /** 仅匹配已绑定的游戏名；站点昵称 username 不参与解析，避免与进服 ID 混淆 */
  function findUserByLinkedMcUsername(store, mcName) {
    const q = String(mcName || '').trim()
    if (!q) return null
    const lower = q.toLowerCase()
    return (
      store.users.find((u) => {
        const link = u.linkedMcUsername != null ? String(u.linkedMcUsername).trim() : ''
        return link && link.toLowerCase() === lower
      }) || null
    )
  }

  /**
   * 供网站皮肤站同页预览：本地资源使用同源相对路径 `/uploads/...`（开发环境经 Vite 代理即可访问），
   * 判定顺序与 resolvePublicSkinTextures 一致，但不依赖 PUBLIC_API_BASE_URL。
   */
  function resolveSkinStationPreview(store, user) {
    const ps = ensurePlayerState(store, user.id)
    const sel = ps.activeSelection
    if (sel && sel.catalogId) {
      const item = catalogItemById(store, sel.catalogId)
      if (item && item.skinTextureUrl) {
        const model = item.model === 'slim' ? 'slim' : 'default'
        const skinUrl = String(item.skinTextureUrl).trim()
        const capeRaw = item.capeTextureUrl != null ? String(item.capeTextureUrl).trim() : ''
        return {
          skinUrl,
          capeUrl: capeRaw || undefined,
          model
        }
      }
    }
    const skinId = Number(ps.applied.skinAssetId) || 0
    if (skinId > 0) {
      const asset = ps.assets[`skin_${skinId}`]
      if (asset && asset.path) {
        const rel = String(asset.path).replace(/\\/g, '/')
        const model = asset.model === 'slim' ? 'slim' : 'default'
        const skinUrl = `/uploads/${encodeURI(rel)}`
        let capeUrl
        const capeId = Number(ps.applied.capeAssetId) || 0
        if (capeId > 0) {
          const capeAsset = ps.assets[`cape_${capeId}`]
          if (capeAsset && capeAsset.path) {
            const crel = String(capeAsset.path).replace(/\\/g, '/')
            capeUrl = `/uploads/${encodeURI(crel)}`
          }
        }
        return { skinUrl, capeUrl, model }
      }
    }
    const ms = ps.mojangSkin
    if (ms && ms.syncOk && typeof ms.skinUrl === 'string' && ms.skinUrl) {
      const model = ms.model === 'slim' ? 'slim' : 'default'
      const cape =
        ms.capeUrl != null && String(ms.capeUrl).trim() ? String(ms.capeUrl).trim() : undefined
      return { skinUrl: String(ms.skinUrl).trim(), capeUrl: cape, model }
    }
    return null
  }

  async function persistMojangSkinSync(store, userId, mcUsername) {
    const user = store.users.find((x) => x.id === userId)
    if (!user) return { ok: false, error: 'no_user' }
    const r = await fetchMojangSkinSnapshot(mcUsername)
    if (!r.ok) return r
    const snap = r.snapshot
    const ps = ensurePlayerState(store, userId)
    ps.mojangSkin = {
      syncOk: true,
      syncedAt: new Date().toISOString(),
      mcUuidUndashed: snap.mcUuidUndashed,
      canonicalName: snap.canonicalName,
      skinUrl: snap.skinUrl,
      model: snap.model,
      capeUrl: snap.capeUrl,
      texturesValue: snap.texturesValue,
      texturesSignature: snap.texturesSignature
    }
    if (snap.mcUuidDashed) {
      user.linkedMcUuid = snap.mcUuidDashed
      markUserProfileDirty(userId)
    }
    ps.applied.version = (ps.applied.version || 1) + 1
    markPlayerStateDirty(userId)
    scheduleSave()
    return { ok: true, snapshot: snap }
  }

  async function vlaLinkExternalUser(mcUsername, externalUserId) {
    if (config.authxPluginAdapter !== 'vla') {
      return { ok: false, skipped: true, message: '当前未使用 VLA 适配器，跳过链接' }
    }
    const r = await pluginFetchJson('/internal/v1/link/external-user', {
      username: mcUsername,
      external_user_id: externalUserId
    })
    const ok =
      r.status === 200 &&
      r.json &&
      (r.json.ok === true || r.json.ok === undefined)
    return { ok, status: r.status, json: r.json }
  }

  async function vlaAdminBindEmail(mcUsername, email) {
    if (config.authxPluginAdapter !== 'vla') {
      return { ok: false, skipped: true, message: '当前未使用 VLA 适配器，跳过邮箱同步' }
    }
    const r = await pluginFetchJson('/api/plugin/authx/admin/bind-email', {
      username: mcUsername,
      email,
    })
    const ok =
      r.status === 200 &&
      r.json &&
      (r.json.ok === true || r.json.ok === undefined)
    return { ok, status: r.status, json: r.json }
  }

  app.get('/api/public/site-features', (_req, res) => {
    res.json({
      mcGamePasswordReset:
        config.mcGamePasswordResetEnabled && config.authxPluginAdapter === 'vla',
      inviteRequiredForMcLink: config.inviteCodesRequiredForMcLink,
      requireTotpForMcLink: config.requireTotpForMcLink,
      reviewEntryEnabled: config.reviewEntryEnabled,
      totpAvailable: true,
      geoPolicyActive: (config.geoBlockedCountries || []).length > 0,
      mcBindingEnabled: true,
      mojangVerifyEnabled: true,
    })
  })

  app.post(
    '/api/public/mc-game-password/request-code',
    mcGamePasswordRequestLimiter,
    asyncHandler(async (req, res) => {
      const reqId = crypto.randomUUID()
      const startedAt = Date.now()
      const { email, linkedMcUsername } = req.body || {}
      res.setHeader('x-request-id', reqId)
      const store = getStore()
      const r = await createMcGamePasswordChallenge(store, {
        email,
        linkedMcUsername,
        ip: req.ip
      })
      const latencyMs = Date.now() - startedAt
      const baseEvent = {
        id: crypto.randomUUID(),
        reqId,
        type: 'request_code',
        ip: req.ip,
        adapter: config.authxPluginAdapter,
        mcUsername: String(linkedMcUsername || '').trim() || undefined,
        latencyMs,
        createdAt: new Date().toISOString()
      }
      if (!r.ok && r.error === 'rate_limited') {
        const retryAfterSec = Math.max(1, Number(r.retryAfterSec) || 60)
        pushMcResetEvent(store, {
          ...baseEvent,
          ok: false,
          reason: 'rate_limited',
          pluginStatus: 'rate_limited_before_plugin',
          status: 429,
          retryAfterSec
        })
        console.warn('[starmc-api][mc-reset][request-code]', {
          reqId,
          ok: false,
          reason: 'rate_limited',
          adapter: config.authxPluginAdapter,
          pluginStatus: 'rate_limited_before_plugin',
          ip: req.ip,
          latencyMs,
          retryAfterSec
        })
        res.setHeader('retry-after', String(retryAfterSec))
        return jsonErrWithRequest(
          res,
          429,
          `请求过于频繁，请在 ${retryAfterSec} 秒后重试`,
          'too_many_requests',
          reqId,
          {
            retryAfterSec
          },
          {
            retryAfterSec
          }
        )
      }
      if (!r.ok && r.error === 'vla_required') {
        pushMcResetEvent(store, {
          ...baseEvent,
          ok: false,
          reason: 'vla_required',
          pluginStatus: 'adapter_mismatch',
          status: 503
        })
        console.warn('[starmc-api][mc-reset][request-code]', {
          reqId,
          ok: false,
          reason: 'vla_required',
          adapter: config.authxPluginAdapter,
          pluginStatus: 'adapter_mismatch',
          ip: req.ip,
          latencyMs
        })
        return jsonErrWithRequest(
          res,
          503,
          '未配置 VLA 适配器',
          'vla_required',
          reqId,
          {
            adapter: config.authxPluginAdapter,
            pluginStatus: 'adapter_mismatch'
          }
        )
      }
      if (!r.ok && r.error === 'disabled') {
        pushMcResetEvent(store, {
          ...baseEvent,
          ok: false,
          reason: 'disabled',
          pluginStatus: 'feature_disabled',
          status: 503
        })
        console.warn('[starmc-api][mc-reset][request-code]', {
          reqId,
          ok: false,
          reason: 'disabled',
          adapter: config.authxPluginAdapter,
          pluginStatus: 'feature_disabled',
          ip: req.ip,
          latencyMs
        })
        return jsonErrWithRequest(
          res,
          503,
          '未启用游戏密码重置',
          'disabled',
          reqId,
          {
            pluginStatus: 'feature_disabled'
          }
        )
      }
      pushMcResetEvent(store, {
        ...baseEvent,
        ok: true,
        reason: 'accepted',
        pluginStatus: 'not_called_request_challenge_only',
        status: 200
      })
      console.info('[starmc-api][mc-reset][request-code]', {
        reqId,
        ok: true,
        adapter: config.authxPluginAdapter,
        pluginStatus: 'not_called_request_challenge_only',
        ip: req.ip,
        linkedMcUsername: String(linkedMcUsername || '').trim() || undefined,
        latencyMs
      })
      return jsonOkWithRequest(
        res,
        { message: '若信息匹配已验证邮箱且已绑定角色，将收到邮件验证码' },
        reqId
      )
    })
  )

  app.post(
    '/api/public/mc-game-password/confirm',
    mcGamePasswordConfirmLimiter,
    asyncHandler(async (req, res) => {
      const reqId = crypto.randomUUID()
      const startedAt = Date.now()
      const { mcUsername, code, newPassword } = req.body || {}
      res.setHeader('x-request-id', reqId)
      const store = getStore()
      const result = await confirmMcGamePasswordReset(
        store,
        { mcUsername, code, newPassword },
        async ({ username, newPassword: np }) => {
          const pr = await pluginFetchJson('/api/plugin/authx/admin/reset-password', {
            username,
            newPassword: np
          })
          return { status: pr.status, json: pr.json }
        }
      )
      const latencyMs = Date.now() - startedAt
      const baseEvent = {
        id: crypto.randomUUID(),
        reqId,
        type: 'confirm',
        adapter: config.authxPluginAdapter,
        mcUsername: String(mcUsername || '').trim() || undefined,
        latencyMs,
        createdAt: new Date().toISOString()
      }
      if (!result.ok) {
        const msg =
          result.error === 'bad_code'
            ? '验证码错误'
            : result.error === 'expired'
              ? '验证码已过期，请重新申请'
              : result.error === 'no_challenge'
                ? '请先申请验证码'
                : result.error === 'too_many_attempts'
                  ? '尝试次数过多'
                  : result.error === 'plugin_reject'
                    ? '游戏库拒绝修改（请确认角色已注册且插件已开启写接口）'
                    : result.error === 'bad_password'
                      ? `密码长度须在 6–${config.maxPasswordLength} 之间`
                      : '重置失败'
        pushMcResetEvent(store, {
          ...baseEvent,
          ok: false,
          reason: result.error || 'unknown',
          pluginStatus: result.error === 'plugin_reject' ? 'plugin_reject' : 'not_reached_or_local_validation_failed',
          status: result.status || 400
        })
        console.warn('[starmc-api][mc-reset][confirm]', {
          reqId,
          ok: false,
          reason: result.error || 'unknown',
          adapter: config.authxPluginAdapter,
          pluginStatus: result.error === 'plugin_reject' ? 'plugin_reject' : 'not_reached_or_local_validation_failed',
          status: result.status || 400,
          latencyMs
        })
        const status = Number(result.status || 400)
        if (status === 429 && Number(result.retryAfterSec || 0) > 0) {
          res.setHeader('retry-after', String(Math.max(1, Number(result.retryAfterSec))))
        }
        return jsonErrWithRequest(
          res,
          status,
          msg,
          result.error || 'error',
          reqId,
          {
            attemptsLeft: result.attemptsLeft,
            retryAfterSec: result.retryAfterSec,
            pluginDetail: result.detail
          },
          {
            attemptsLeft: result.attemptsLeft,
            retryAfterSec: result.retryAfterSec
          }
        )
      }
      pushMcResetEvent(store, {
        ...baseEvent,
        ok: true,
        reason: 'password_updated',
        pluginStatus: 'password_updated',
        status: 200
      })
      console.info('[starmc-api][mc-reset][confirm]', {
        reqId,
        ok: true,
        adapter: config.authxPluginAdapter,
        pluginStatus: 'password_updated',
        mcUsername: String(mcUsername || '').trim() || undefined,
        latencyMs
      })
      return jsonOkWithRequest(res, { message: '游戏密码已更新' }, reqId)
    })
  )

  // ============================================================
  // 验证码登录/注册 API
  // ============================================================

  /** 发送验证码 */
  app.post(
    '/api/auth/verify-code/send',
    verifyCodeSendLimiter,
    asyncHandler(async (req, res) => {
      const reqId = crypto.randomUUID()
      const startedAt = Date.now()
      const { email, mode = 'login' } = req.body || {}
      res.setHeader('x-request-id', reqId)

      if (!email) {
        return jsonErrWithRequest(
          res,
          400,
          '邮箱不能为空',
          'missing_email',
          reqId,
          {
            field: 'email'
          }
        )
      }

      const store = getStore()
      const result = await sendVerifyCode(store, {
        email,
        ip: req.ip,
        mode: mode === 'register' ? 'register' : 'login'
      })

      const latencyMs = Date.now() - startedAt

      if (!result.ok) {
        console.info('[starmc-api][verify-code][send]', {
          reqId,
          ok: false,
          error: result.error,
          ip: req.ip,
          latencyMs
        })
        if (result.error === 'rate_limited') {
          const retryAfterSec = Math.max(1, Number(result.retryAfterSec) || 60)
          res.setHeader('Retry-After', String(retryAfterSec))
          return jsonErrWithRequest(
            res,
            429,
            `操作过于频繁，请 ${retryAfterSec} 秒后重试`,
            'rate_limited',
            reqId,
            { retryAfterSec },
            { retryAfterSec }
          )
        }
        if (result.error === 'ip_rate_limited') {
          const retryAfterSec = Math.max(1, Number(result.retryAfterSec) || 60)
          res.setHeader('Retry-After', String(retryAfterSec))
          return jsonErrWithRequest(
            res,
            429,
            `当前 IP 请求过于频繁，请 ${retryAfterSec} 秒后重试`,
            'ip_rate_limited',
            reqId,
            { retryAfterSec },
            { retryAfterSec }
          )
        }
        if (result.error === 'invalid_email') {
          return jsonErrWithRequest(
            res,
            400,
            '邮箱格式不正确',
            'invalid_email',
            reqId,
            { field: 'email' }
          )
        }
        if (result.error === 'account_locked') {
          const retryAfterSec = Math.max(1, Number(result.retryAfterSec) || 3600)
          res.setHeader('Retry-After', String(retryAfterSec))
          return jsonErrWithRequest(
            res,
            429,
            `操作过于频繁，账号已临时封禁，请 ${retryAfterSec} 秒后重试`,
            'account_locked',
            reqId,
            { retryAfterSec },
            { retryAfterSec }
          )
        }
        return jsonErrWithRequest(res, 500, '发送失败', 'send_failed', reqId)
      }

      console.info('[starmc-api][verify-code][send]', {
        reqId,
        ok: true,
        ip: req.ip,
        latencyMs
      })
      return jsonOkWithRequest(
        res,
        {
          message: `验证码已发送至 ${result.email || email}`,
          challengeId: result.id || null
        },
        reqId
      )
    })
  )

  /** 验证验证码并登录/注册 */
  app.post(
    '/api/auth/verify-code/confirm',
    (req, res, next) => {
      // P3-C7: 仅接受 JSON 请求，防止跨域表单伪造
      const ct = String(req.headers['content-type'] || '').toLowerCase()
      if (!ct.includes('application/json')) {
        return jsonErr(res, 415, '仅支持 application/json', 'unsupported_media_type')
      }
      next()
    },
    asyncHandler(async (req, res) => {
      const reqId = crypto.randomUUID()
      const startedAt = Date.now()
      const { id, email, code, password, mode = 'login' } = req.body || {}
      res.setHeader('x-request-id', reqId)

      if (!email || !code) {
        return jsonErrWithRequest(
          res,
          400,
          '邮箱和验证码不能为空',
          'missing_params',
          reqId,
          {
            fields: ['email', 'code']
          }
        )
      }

      const store = getStore()
      const loginMode = mode === 'register' ? 'register' : 'login'

      // 创建 SuperTokens Session（需要在响应头设置 cookie）
      let sessionCreated = false
      let stUserId = null

      const result = await confirmVerifyCodeLogin(
        store,
        { id, email, code, password, mode: loginMode },
        {
          onLogin: async (em) => {
            // 登录模式：通过邮箱查找用户
            if (!isSuperTokensReady()) {
              throw new Error('SuperTokens 未初始化')
            }
            // 查找用户
            const stUsers = await supertokens.listUsersByAccountInfo(
              'public',
              { email: em }
            )
            if (!stUsers || stUsers.length === 0) {
              throw new Error('用户不存在，请先注册')
            }
            stUserId = stUsers[0].id

            // 创建 SuperTokens Session
            await Session.createNewSession(res, 'public', stUserId, {}, {})
            sessionCreated = true

            return { userId: stUserId, email: em }
          },
          onRegister: async (em, pw) => {
            // 注册模式：创建新用户
            if (!isSuperTokensReady()) {
              throw new Error('SuperTokens 未初始化')
            }
            const { EmailPassword } = await import('supertokens-node/recipe/emailpassword')
            const resp = await EmailPassword.signUp('public', em, pw)
            if (resp.status !== 'OK') {
              throw new Error(resp.status === 'EMAIL_ALREADY_EXISTS_ERROR' ? '邮箱已注册' : '注册失败')
            }
            stUserId = resp.user.id

            // 创建 SuperTokens Session
            await Session.createNewSession(res, 'public', stUserId, {}, {})
            sessionCreated = true

            return { userId: stUserId, email: em }
          }
        }
      )

      const latencyMs = Date.now() - startedAt

      if (!result.ok) {
        console.info('[starmc-api][verify-code][confirm]', {
          reqId,
          ok: false,
          error: result.error,
          ip: req.ip,
          latencyMs
        })
        const msgMap = {
          bad_code: '验证码错误',
          expired: '验证码已过期，请重新获取',
          no_challenge: '请先获取验证码',
          too_many_attempts: '尝试次数过多，请重新获取',
          account_locked: '账号已临时封禁，请稍后再试',
          invalid_email: '邮箱格式不正确',
          bad_password: '密码长度需在 6-128 位之间',
          auth_error: '认证失败',
          user_not_found: '用户不存在，请先注册',
          user_exists: '该邮箱已注册，请直接登录',
          register_failed: '注册失败，请稍后重试'
        }
        const statusMap = {
          account_locked: 429,
          too_many_attempts: 429,
          auth_error: 500
        }
        const status = Number(statusMap[result.error] || 400)
        const retryAfterSec = Number(result.retryAfterSec)
        if (status === 429 && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          res.setHeader('Retry-After', String(Math.max(1, Math.floor(retryAfterSec))))
        }
        return jsonErrWithRequest(
          res,
          status,
          msgMap[result.error] || '验证失败',
          result.error || 'verification_failed',
          reqId,
          {
            attemptsLeft: result.attemptsLeft,
            retryAfterSec: result.retryAfterSec,
            mode: loginMode
          },
          {
            attemptsLeft: result.attemptsLeft,
            retryAfterSec: result.retryAfterSec
          }
        )
      }

      console.info('[starmc-api][verify-code][confirm]', {
        reqId,
        ok: true,
        mode: loginMode,
        sessionCreated,
        ip: req.ip,
        latencyMs
      })
      return jsonOkWithRequest(
        res,
        {
          message: loginMode === 'register' ? '注册成功' : '登录成功',
          user: result.user
        },
        reqId
      )
    })
  )

  async function pluginFetchHealth() {
    const base = String(config.authxPluginBase || '').replace(/\/+$/, '')
    const paths =
      config.authxPluginHealthPaths.length > 0
        ? config.authxPluginHealthPaths
        : ['/healthz', '/v1/health']
    let last = /** @type {Record<string, unknown>} */ ({})
    for (const raw of paths) {
      const pathSuffix = raw.startsWith('/') ? raw : `/${raw}`
      const url = `${base}${pathSuffix}`
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), config.authxPluginRequestMs)
      try {
        const headers = {}
        if (config.authxPluginAdapter === 'vla' && config.authxVlaApiKey) {
          headers['X-API-Key'] = config.authxVlaApiKey
        }
        const r = await fetch(url, { method: 'GET', signal: ctrl.signal, headers })
        const text = await r.text()
        last = {
          reachable: true,
          status: r.status,
          body: text.slice(0, 256),
          path: pathSuffix
        }
        const trimmed = text.trim()
        if (trimmed.startsWith('{')) {
          try {
            const j = JSON.parse(trimmed)
            if (j && typeof j === 'object' && !Array.isArray(j)) {
              last.parsed = j
            }
          } catch {
            /* 非 JSON 健康页 */
          }
        }
        if (r.status >= 200 && r.status < 300) {
          clearTimeout(t)
          return last
        }
      } catch (e) {
        last = {
          reachable: false,
          status: 0,
          error: String(e?.message || e),
          path: pathSuffix
        }
      } finally {
        clearTimeout(t)
      }
    }
    return last
  }

  /**
   * @param {Record<string, string | number | undefined>} [queryObj] - 查询参数（会 URL 编码）
   * @returns {{ status: number, text: string, json?: unknown }}
   */
  async function pluginFetchGet(pathSuffix, queryObj) {
    const base = String(config.authxPluginBase || '').replace(/\/+$/, '')
    let suffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`
    if (queryObj && typeof queryObj === 'object') {
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(queryObj)) {
        if (v != null && String(v).trim() !== '') {
          sp.set(k, String(v))
        }
      }
      const qs = sp.toString()
      if (qs) {
        suffix += `?${qs}`
      }
    }
    const url = base + suffix
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), config.authxPluginRequestMs)
    try {
      const headers = { Accept: 'application/json, text/plain;q=0.9' }
      if (config.authxPluginAdapter === 'vla' && config.authxVlaApiKey) {
        headers['X-API-Key'] = config.authxVlaApiKey
      }
      if (config.authxPluginAdapter !== 'vla' && config.authxAdminSecret) {
        warnAuthxAdapterDeprecated()
        headers['X-AuthX-Admin-Secret'] = config.authxAdminSecret
      }
      const r = await fetch(url, { method: 'GET', signal: ctrl.signal, headers })
      const text = await r.text()
      let json
      const ct = (r.headers.get('content-type') || '').toLowerCase()
      const ttrim = text.trim()
      if (
        ttrim &&
        (ct.includes('application/json') || ttrim.startsWith('{') || ttrim.startsWith('['))
      ) {
        try {
          json = JSON.parse(ttrim)
        } catch {
          /* Prometheus 等纯文本 */
        }
      }
      return { status: r.status, text, json }
    } catch (e) {
      const aborted = e?.name === 'AbortError'
      return {
        status: aborted ? 504 : 502,
        text: aborted ? 'timeout' : String(e?.message || e),
        json: undefined
      }
    } finally {
      clearTimeout(t)
    }
  }

  function respondPluginGetResult(res, result) {
    const status = result?.status >= 100 && result?.status < 600 ? result.status : 502
    if (result?.json !== undefined) {
      return res.status(status).json(result.json)
    }
    return res.status(status).send(result?.text || '')
  }

  app.get('/api/auth/status', asyncHandler(async (_req, res) => {
    if (!isSuperTokensReady()) {
      if (!config.isProd) {
        return res.json({
          ok: true,
          supertokens: false,
          coreReachable: false,
          devAuthFallback: true,
          message: '开发模式：SuperTokens 未就绪，已启用 dev bearer 登录兜底（Authorization: Bearer dev:<username>）'
        })
      }
      return res.json({
        ok: false,
        supertokens: false,
        coreReachable: false,
        message: '请在环境中配置 SUPERTOKENS_CONNECTION_URI 并启动 SuperTokens Core'
      })
    }
    let coreReachable = false
    try {
      const uri = config.supertokensConnectionUri.replace(/\/+$/, '')
      const ctrl = new AbortController()
      const tHello = setTimeout(() => ctrl.abort(), 2500)
      const r = await fetch(`${uri}/hello`, { signal: ctrl.signal })
      clearTimeout(tHello)
      coreReachable = r.ok
    } catch {
      coreReachable = false
    }
    res.json({
      ok: coreReachable,
      supertokens: true,
      coreReachable,
      apiBasePath: config.supertokensApiBasePath,
      smtpConfigured: isSmtpConfigured()
    })
  }))

  app.get('/api/plugin/authx/events', (req, res) => {
    if (!requireAuthxEventsAccess(req, res)) return
    const store = getStore()
    const events = Array.isArray(store.authxEvents) ? store.authxEvents : []
    const pagination = resolvePaginationQuery(req.query, {
      defaultPageSize: 100,
      maxPageSize: 500
    })
    const items = events.slice(pagination.offset, pagination.offset + pagination.pageSize)
    return jsonPage(res, {
      total: events.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      items,
      offset: pagination.offset,
      limit: pagination.limit
    })
  })

  function buildFilteredMcResetEvents(store, query = {}) {
    const ok = String(query.ok || '').trim()
    const type = String(query.type || '').trim()
    const q = String(query.q || '').trim().toLowerCase()
    const range = String(query.range || '').trim()
    const sort = String(query.sort || 'createdAt_desc').trim()

    const rangeMs =
      range === '15m' ? 15 * 60 * 1000
      : range === '1h' ? 60 * 60 * 1000
      : range === '24h' ? 24 * 60 * 60 * 1000
      : 0
    const now = Date.now()

    let list = store.mcResetEvents
    if (ok === 'true') list = list.filter((x) => x && x.ok === true)
    if (ok === 'false') list = list.filter((x) => x && x.ok === false)
    if (type) list = list.filter((x) => String(x?.type || '') === type)
    if (q) {
      list = list.filter((x) => {
        const reqId = String(x?.reqId || '').toLowerCase()
        const mcUsername = String(x?.mcUsername || '').toLowerCase()
        return reqId.includes(q) || mcUsername.includes(q)
      })
    }
    if (rangeMs > 0) {
      list = list.filter((x) => {
        const ts = new Date(String(x?.createdAt || '')).getTime()
        return Number.isFinite(ts) && now - ts <= rangeMs
      })
    }

    if (sort === 'createdAt_asc') {
      list = list.slice().sort((a, b) => {
        const ta = new Date(String(a?.createdAt || '')).getTime()
        const tb = new Date(String(b?.createdAt || '')).getTime()
        return ta - tb
      })
    } else {
      list = list.slice().sort((a, b) => {
        const ta = new Date(String(a?.createdAt || '')).getTime()
        const tb = new Date(String(b?.createdAt || '')).getTime()
        return tb - ta
      })
    }
    return list
  }

  app.get('/api/admin/mc-reset/events', (req, res) => {
    if (!requireMcResetAccess(req, res)) return
    const store = getStore()
    pruneMcResetEvents(store)
    const pagination = resolvePaginationQuery(req.query, {
      defaultPageSize: 100,
      maxPageSize: 500
    })
    const list = buildFilteredMcResetEvents(store, req.query)
    const items = list.slice(pagination.offset, pagination.offset + pagination.pageSize)
    return jsonPage(res, {
      total: list.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      items,
      offset: pagination.offset,
      limit: pagination.limit
    })
  })

  app.get('/api/admin/mc-reset/stats', (req, res) => {
    if (!requireMcResetAccess(req, res)) return
    const store = getStore()
    pruneMcResetEvents(store)
    const list = buildFilteredMcResetEvents(store, req.query)
    const total = list.length
    const success = list.filter((x) => x && x.ok === true).length
    const failed = total - success
    const successRate = total > 0 ? Number(((success / total) * 100).toFixed(2)) : 0
    const failRate = total > 0 ? Number(((failed / total) * 100).toFixed(2)) : 0

    const reasonMap = new Map()
    for (const ev of list) {
      const key = String(ev?.reason || 'unknown')
      reasonMap.set(key, (reasonMap.get(key) || 0) + 1)
    }
    const reasons = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)

    const latencies = list
      .map((x) => Number(x?.latencyMs || 0))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b)

    function percentile(arr, p) {
      if (arr.length === 0) return 0
      const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1))
      return arr[idx]
    }

    const latency = {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length > 0 ? latencies[latencies.length - 1] : 0
    }

    const range = String(req.query.range || '').trim()
    const now = Date.now()
    const trendCfg =
      range === '15m' ? { bucketMs: 60 * 1000, count: 15 }
      : range === '1h' ? { bucketMs: 5 * 60 * 1000, count: 12 }
      : { bucketMs: 60 * 60 * 1000, count: 24 }

    const bucketStart = now - trendCfg.bucketMs * trendCfg.count
    const trend = Array.from({ length: trendCfg.count }, (_, i) => {
      const start = bucketStart + i * trendCfg.bucketMs
      return {
        ts: new Date(start).toISOString(),
        total: 0,
        success: 0,
        failed: 0,
        successRate: 0
      }
    })

    for (const ev of list) {
      const t = new Date(String(ev?.createdAt || '')).getTime()
      if (!Number.isFinite(t) || t < bucketStart || t >= now) continue
      const idx = Math.floor((t - bucketStart) / trendCfg.bucketMs)
      if (idx < 0 || idx >= trend.length) continue
      trend[idx].total += 1
      if (ev?.ok === true) trend[idx].success += 1
      else trend[idx].failed += 1
    }
    for (const b of trend) {
      b.successRate = b.total > 0 ? Number(((b.success / b.total) * 100).toFixed(2)) : 0
    }

    const alerts = {
      failRateHigh: failRate >= 20,
      p95HighLatency: latency.p95 >= 1500
    }

    res.json({
      ok: true,
      total,
      success,
      failed,
      successRate,
      failRate,
      latency,
      reasons,
      trend,
      alerts
    })
  })

  registerAuthxAdminRoutes(app, {
    requireDevAdmin: requireAuthxAdminAccess,
    pluginFetchHealth,
    pluginFetchJson,
    pluginFetchGet,
    config,
    adminPluginGetLimiter,
    jsonErr,
    jsonOk
  })

  function normalizeDashboardConfig(input) {
    const fallback = {
      layout: 'classic',
      widgets: ['cpu', 'mem', 'load', 'disk', 'net', 'proc', 'percpu', 'temp'],
      thresholds: {
        cpuWarn: 70,
        cpuCritical: 90,
        memWarn: 75,
        memCritical: 90,
        loadWarnRate: 0.85,
        loadCriticalRate: 1.2,
        diskWarn: 80,
        diskCritical: 92,
        tempWarn: 65,
        tempCritical: 80
      },
      filters: {
        alertLevel: 'all'
      }
    }

    const src = input && typeof input === 'object' ? input : {}
    const thresholds = src.thresholds && typeof src.thresholds === 'object' ? src.thresholds : {}
    const filters = src.filters && typeof src.filters === 'object' ? src.filters : {}

    const toNum = (v, d) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : d
    }

    const widgets = Array.isArray(src.widgets)
      ? src.widgets.map((w) => String(w || '').trim()).filter(Boolean).slice(0, 24)
      : fallback.widgets

    return {
      layout: String(src.layout || fallback.layout),
      widgets: widgets.length ? widgets : fallback.widgets,
      thresholds: {
        cpuWarn: Math.min(100, Math.max(0, toNum(thresholds.cpuWarn, fallback.thresholds.cpuWarn))),
        cpuCritical: Math.min(100, Math.max(0, toNum(thresholds.cpuCritical, fallback.thresholds.cpuCritical))),
        memWarn: Math.min(100, Math.max(0, toNum(thresholds.memWarn, fallback.thresholds.memWarn))),
        memCritical: Math.min(100, Math.max(0, toNum(thresholds.memCritical, fallback.thresholds.memCritical))),
        loadWarnRate: Math.max(0, toNum(thresholds.loadWarnRate, fallback.thresholds.loadWarnRate)),
        loadCriticalRate: Math.max(0, toNum(thresholds.loadCriticalRate, fallback.thresholds.loadCriticalRate)),
        diskWarn: Math.min(100, Math.max(0, toNum(thresholds.diskWarn, fallback.thresholds.diskWarn))),
        diskCritical: Math.min(100, Math.max(0, toNum(thresholds.diskCritical, fallback.thresholds.diskCritical))),
        tempWarn: Math.min(130, Math.max(0, toNum(thresholds.tempWarn, fallback.thresholds.tempWarn))),
        tempCritical: Math.min(130, Math.max(0, toNum(thresholds.tempCritical, fallback.thresholds.tempCritical)))
      },
      filters: {
        alertLevel: ['all', 'warn', 'critical'].includes(String(filters.alertLevel || '').toLowerCase())
          ? String(filters.alertLevel).toLowerCase()
          : fallback.filters.alertLevel
      }
    }
  }

  app.get('/api/user/:userId/dashboard-config', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权查看该用户仪表盘配置', 'forbidden')
    }

    if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') {
      store.dashboardConfigs = {}
    }

    const configRaw = store.dashboardConfigs[targetUserId]
    const normalized = normalizeDashboardConfig(configRaw)
    if (!configRaw) {
      store.dashboardConfigs[targetUserId] = normalized
      markKvDirty('dashboard_configs')
      scheduleSave()
    }

    res.json({ ok: true, userId: targetUserId, config: normalized })
  })

  app.put('/api/user/:userId/dashboard-config', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权修改该用户仪表盘配置', 'forbidden')
    }

    if (!store.dashboardConfigs || typeof store.dashboardConfigs !== 'object') {
      store.dashboardConfigs = {}
    }

    const normalized = normalizeDashboardConfig(req.body?.config)
    store.dashboardConfigs[targetUserId] = normalized
    markKvDirty('dashboard_configs')
    scheduleSave()

    res.json({ ok: true, userId: targetUserId, config: normalized })
  })

  app.post('/api/user/:userId/dashboard-share-token', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权生成该用户只读分享链接', 'forbidden')
    }

    if (!store.dashboardShareTokens || typeof store.dashboardShareTokens !== 'object') {
      store.dashboardShareTokens = {}
    }

    const token = crypto.randomBytes(24).toString('base64url')
    const now = Date.now()
    const ttlSec = Math.max(300, Math.min(7 * 24 * 60 * 60, Number(req.body?.ttlSec) || 24 * 60 * 60))

    store.dashboardShareTokens[token] = {
      userId: targetUserId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSec * 1000).toISOString(),
      createdBy: req.user.id
    }

    for (const [k, v] of Object.entries(store.dashboardShareTokens)) {
      const exp = Date.parse(String(v?.expiresAt || ''))
      if (!Number.isFinite(exp) || exp < Date.now()) {
        delete store.dashboardShareTokens[k]
      }
    }

    scheduleSave()
    res.json({ ok: true, token, expiresInSec: ttlSec })
  })

  app.get('/api/public/dashboard-share/:token', (req, res) => {
    const store = getStore()
    const token = String(req.params.token || '').trim()
    if (!token) return jsonErr(res, 400, '缺少 token', 'validation_error')

    const rec = store.dashboardShareTokens?.[token]
    if (!rec || typeof rec !== 'object') return jsonErr(res, 404, '分享链接不存在', 'not_found')

    const expiresMs = Date.parse(String(rec.expiresAt || ''))
    if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
      delete store.dashboardShareTokens[token]
      scheduleSave()
      return jsonErr(res, 410, '分享链接已过期', 'expired')
    }

    const userId = String(rec.userId || '').trim()
    const cfg = normalizeDashboardConfig(store.dashboardConfigs?.[userId])
    res.json({ ok: true, userId, config: cfg, readonly: true, expiresAt: rec.expiresAt })
  })

  app.get('/api/user/:userId/dashboard-share-tokens', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权查看该用户分享链接', 'forbidden')
    }

    const out = []
    const now = Date.now()
    for (const [token, rec] of Object.entries(store.dashboardShareTokens || {})) {
      if (!rec || typeof rec !== 'object') continue
      if (String(rec.userId || '') !== targetUserId) continue
      const expiresMs = Date.parse(String(rec.expiresAt || ''))
      if (!Number.isFinite(expiresMs) || expiresMs < now) continue
      out.push({
        token,
        createdAt: rec.createdAt,
        expiresAt: rec.expiresAt,
        createdBy: rec.createdBy
      })
    }

    out.sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')))
    res.json({ ok: true, userId: targetUserId, items: out })
  })

  app.delete('/api/user/:userId/dashboard-share-token/:token', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    const token = String(req.params.token || '').trim()
    if (!targetUserId || !token) return jsonErr(res, 400, '缺少参数', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权撤销该分享链接', 'forbidden')
    }

    const rec = store.dashboardShareTokens?.[token]
    if (!rec || String(rec.userId || '') !== targetUserId) {
      return jsonErr(res, 404, '分享链接不存在', 'not_found')
    }

    delete store.dashboardShareTokens[token]
    scheduleSave()
    res.json({ ok: true, revoked: true })
  })

  app.delete('/api/user/:userId/dashboard-share-tokens', requireUser, (req, res) => {
    const store = getStore()
    const targetUserId = String(req.params.userId || '').trim()
    if (!targetUserId) return jsonErr(res, 400, '缺少 userId', 'validation_error')

    const isSelf = targetUserId === req.user.id
    const isAdminUser = hasRole(req.user, 'admin')
    if (!isSelf && !isAdminUser) {
      return jsonErr(res, 403, '无权撤销该用户分享链接', 'forbidden')
    }

    let revoked = 0
    for (const [token, rec] of Object.entries(store.dashboardShareTokens || {})) {
      if (!rec || typeof rec !== 'object') continue
      if (String(rec.userId || '') !== targetUserId) continue
      delete store.dashboardShareTokens[token]
      revoked++
    }

    scheduleSave()
    res.json({ ok: true, revoked })
  })

  app.get('/api/user/me', requireUser, (req, res) => {
    const u = req.user
    if (u) {
      markUserProfileDirty(u.id)
      scheduleSave()
    }
    const user = publicUser(u)
    jsonOk(res, { ...user, user })
  })

  app.get('/api/user/center/summary', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    const summary = buildUserCenterSummary(store, u)
    jsonOk(res, {
      user: publicUser(u),
      ...summary,
    })
  })

  app.get('/api/user/permissions', requireUser, (req, res) => {
    res.json({
      ok: true,
      ...buildPermissionMatrix(req.user)
    })
  })

  app.get('/api/admin/ops/tasks', (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const store = getStore()
    const pagination = resolvePaginationQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200
    })
    const status = String(req.query.status || '').trim().toLowerCase()
    const type = String(req.query.type || '').trim().toLowerCase()

    const asyncTasks = ensureAsyncTasksStore(store).map((row) => ({
      id: String(row?.id || ''),
      source: 'async_tasks',
      type: String(row?.type || ''),
      status: String(row?.status || 'pending'),
      createdAt: String(row?.createdAt || ''),
      updatedAt: String(row?.updatedAt || row?.createdAt || ''),
      payload: row
    }))
    const syncTasks = (Array.isArray(store.skinSyncTasks) ? store.skinSyncTasks : []).map((row) => ({
      id: String(row?.id || ''),
      source: 'skin_sync_tasks',
      type: String(row?.type || 'catalog_sync'),
      status: String(row?.status || 'unknown'),
      createdAt: String(row?.startedAt || row?.finishedAt || ''),
      updatedAt: String(row?.finishedAt || row?.startedAt || ''),
      payload: row
    }))
    const webhookTasks = ensureSecurityCenter(store).webhookQueue.map((row) => ({
      id: String(row?.id || ''),
      source: 'security_webhook_queue',
      type: 'security_webhook',
      status: String(row?.status || 'pending'),
      createdAt: String(row?.at || ''),
      updatedAt: String(row?.lastTryAt || row?.sentAt || row?.lastReplayAt || row?.at || ''),
      payload: row
    }))
    let items = [...asyncTasks, ...syncTasks, ...webhookTasks]
    if (status) items = items.filter((row) => String(row.status).toLowerCase() === status)
    if (type) items = items.filter((row) => String(row.type).toLowerCase().includes(type))
    items = items
      .sort((a, b) => parseTimeMs(b.updatedAt) - parseTimeMs(a.updatedAt))
    const total = items.length
    const start = pagination.offset
    return jsonPage(res, {
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      items: items.slice(start, start + pagination.limit)
    })
  })

  app.post('/api/admin/ops/tasks', (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const type = String(req.body?.type || '').trim()
    if (!type) return jsonErr(res, 400, '缺少 type', 'validation_error')
    const store = getStore()
    const row = appendAsyncTask(store, {
      type,
      status: String(req.body?.status || 'pending'),
      payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
      createdBy: String(req.body?.createdBy || req.ip || ''),
    })
    scheduleSave()
    res.status(201).json({ ok: true, item: row })
  })

  app.patch('/api/admin/ops/tasks/:id', (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const id = String(req.params.id || '').trim()
    if (!id) return jsonErr(res, 400, '缺少任务 id', 'validation_error')
    const store = getStore()
    const patch = {}
    if (req.body?.status !== undefined) patch.status = String(req.body.status || '')
    if (req.body?.payload !== undefined && req.body.payload && typeof req.body.payload === 'object') {
      patch.payload = req.body.payload
    }
    if (req.body?.finishedAt !== undefined) patch.finishedAt = String(req.body.finishedAt || '')
    const row = updateAsyncTask(store, id, patch)
    if (!row) return jsonErr(res, 404, '任务不存在', 'not_found')
    scheduleSave()
    res.json({ ok: true, item: row })
  })

  const retryOpsTaskHandler = createRetryOpsTaskHandler({
    requireDevAdmin: requireOpsTaskAccess,
    jsonErr,
    getStore,
    scheduleSave,
    markKvDirty,
    createId: () => crypto.randomUUID(),
  })
  app.post('/api/admin/ops/tasks/:id/retry', retryOpsTaskHandler)

  app.get('/api/admin/ops/dead-letters', (req, res) => {
    if (!requireOpsTaskAccess(req, res)) return
    const store = getStore()
    const pagination = resolvePaginationQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200
    })
    const type = String(req.query.type || '').trim().toLowerCase()
    const resolved = String(req.query.resolved || '').trim().toLowerCase()
    let items = ensureDeadLetterQueue(store).slice()
    if (type) items = items.filter((row) => String(row?.type || '').toLowerCase().includes(type))
    if (resolved === 'true') items = items.filter((row) => Boolean(row?.resolvedAt))
    if (resolved === 'false') items = items.filter((row) => !row?.resolvedAt)
    items.sort((a, b) => parseTimeMs(b?.at) - parseTimeMs(a?.at))
    const total = items.length
    const start = pagination.offset
    return jsonPage(res, {
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      items: items.slice(start, start + pagination.limit)
    })
  })

  const retryDeadLetterHandler = createRetryDeadLetterHandler({
    requireDevAdmin: requireOpsTaskAccess,
    jsonErr,
    getStore,
    scheduleSave,
    markKvDirty,
    ensureDeadLetterQueue,
    ensureSecurityCenter,
    appendAsyncTask,
    createId: () => crypto.randomUUID(),
  })
  app.post('/api/admin/ops/dead-letters/:id/retry', retryDeadLetterHandler)

  app.get('/api/admin/audit/logs', (req, res) => {
    if (!requireAuditLogAccess(req, res)) return
    const store = getStore()
    const moduleFilter = String(req.query.module || '').trim().toLowerCase()
    const actionFilter = String(req.query.action || '').trim().toLowerCase()
    const q = String(req.query.q || '').trim().toLowerCase()
    const pagination = resolvePaginationQuery(req.query, {
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200
    })

    const userAdminLogs = (Array.isArray(store.userAdminAuditLogs) ? store.userAdminAuditLogs : []).map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.at || ''),
      module: 'user_admin',
      action: String(row?.action || ''),
      actorUserId: String(row?.actorUserId || ''),
      actorUsername: String(row?.actorUsername || ''),
      targetUserId: String(row?.targetUserId || ''),
      targetUsername: String(row?.targetUsername || ''),
      detail: row?.detail || {},
      diff: row?.detail?.before && row?.detail?.after ? { before: row.detail.before, after: row.detail.after } : undefined
    }))
    const reviewLogs = (Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []).map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.time || row?.at || ''),
      module: 'skin_review',
      action: String(row?.action || ''),
      actorUserId: '',
      actorUsername: String(row?.operator || ''),
      targetUserId: '',
      targetUsername: '',
      detail: row || {}
    }))
    const securityLogs = ensureSecurityCenter(store).auditLogs.map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.at || ''),
      module: 'security',
      action: String(row?.action || ''),
      actorUserId: String(row?.userId || ''),
      actorUsername: '',
      targetUserId: String(row?.userId || ''),
      targetUsername: '',
      detail: row?.detail || {}
    }))
    const opsLogs = (Array.isArray(store.opsAuditLogs) ? store.opsAuditLogs : []).map((row) => ({
      id: String(row?.id || ''),
      at: String(row?.at || ''),
      module: 'ops',
      action: String(row?.action || ''),
      actorUserId: String(row?.actorUserId || ''),
      actorUsername: String(row?.actorUsername || ''),
      targetUserId: String(row?.targetId || ''),
      targetUsername: '',
      detail: row?.detail || {}
    }))
    let items = [...userAdminLogs, ...reviewLogs, ...securityLogs, ...opsLogs]
    if (moduleFilter) items = items.filter((row) => String(row.module || '').toLowerCase() === moduleFilter)
    if (actionFilter) items = items.filter((row) => String(row.action || '').toLowerCase().includes(actionFilter))
    if (q) {
      items = items.filter((row) => {
        const haystack = [
          row.action,
          row.actorUsername,
          row.actorUserId,
          row.targetUsername,
          row.targetUserId,
          JSON.stringify(row.detail || {})
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    items = items.sort((a, b) => parseTimeMs(b.at) - parseTimeMs(a.at))
    const total = items.length
    const start = pagination.offset
    return jsonPage(res, {
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      items: items.slice(start, start + pagination.limit)
    })
  })

  app.get('/api/admin/audit/export', (req, res) => {
    if (!requireAuditLogAccess(req, res)) return
    const store = getStore()
    const moduleFilter = String(req.query.module || '').trim().toLowerCase()
    const rows = []
    const pick = (module, at, action, actor, target, detail) => {
      if (moduleFilter && moduleFilter !== module) return
      rows.push([module, at, action, actor, target, JSON.stringify(detail || {})])
    }
    for (const row of Array.isArray(store.userAdminAuditLogs) ? store.userAdminAuditLogs : []) {
      pick(
        'user_admin',
        String(row?.at || ''),
        String(row?.action || ''),
        String(row?.actorUsername || row?.actorUserId || ''),
        String(row?.targetUsername || row?.targetUserId || ''),
        row?.detail || {}
      )
    }
    for (const row of Array.isArray(store.reviewAuditLogs) ? store.reviewAuditLogs : []) {
      pick(
        'skin_review',
        String(row?.time || row?.at || ''),
        String(row?.action || ''),
        String(row?.operator || ''),
        String(row?.submissionId || ''),
        row || {}
      )
    }
    for (const row of ensureSecurityCenter(store).auditLogs) {
      pick(
        'security',
        String(row?.at || ''),
        String(row?.action || ''),
        String(row?.userId || ''),
        String(row?.userId || ''),
        row?.detail || {}
      )
    }
    for (const row of Array.isArray(store.opsAuditLogs) ? store.opsAuditLogs : []) {
      pick(
        'ops',
        String(row?.at || ''),
        String(row?.action || ''),
        String(row?.actorUsername || row?.actorUserId || ''),
        String(row?.targetId || ''),
        row?.detail || {}
      )
    }
    const header = ['module', 'at', 'action', 'actor', 'target', 'detail']
    const csv = [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`)
    res.send(`\uFEFF${csv}`)
  })

  registerSecurityRoutes(app, {
    requireUser,
    requireAdmin,
    getStore,
    ensureSecurityCenter,
    appendSecurityAudit,
    scheduleSave,
    jsonErr,
    jsonOk,
    deriveRiskFromEvents,
    requiresStepUpForHighRisk,
    verifyStepUp,
    crypto,
    asyncHandler,
    config,
    pluginFetchGet,
    resolveGeoForIp,
    appendSecurityAlert
  })

  app.post(
    '/api/user/link-minecraft',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const inv = validateInviteForMcLink(store, req.user.id, req.body?.inviteCode)
      if (!inv.ok) {
        const map = {
          invite_required: '需要提供邀请码',
          bad_invite: '邀请码无效',
          invite_used: '邀请码已被其他账号使用'
        }
        return jsonErr(res, 403, map[inv.error] || '邀请码校验失败', inv.error)
      }
      const self = store.users.find((x) => x.id === req.user.id)
      if (config.requireTotpForMcLink && self?.totpEnabled) {
        const tok = String(req.body?.totpCode || '').trim()
        if (!verifyTotpToken(self.totpSecret, tok)) {
          return jsonErr(res, 403, '两步验证码错误', 'totp_invalid')
        }
      }
      const mc = String(req.body?.username || '').trim()
      if (!mc || mc.length < 3 || mc.length > 16) {
        return jsonErr(res, 400, '请输入有效的游戏角色名（3–16 字符）', 'validation_error')
      }
      const link = await vlaLinkExternalUser(mc, req.user.id)
      if (link.skipped) {
        return res.json({
          ok: true,
          message: link.message || '已跳过',
          linked: false
        })
      }
      if (!link.ok) {
        const msg =
          link.json?.error === 'not_found'
            ? '游戏库中不存在该角色名，请先在服务器注册后再绑定'
            : link.json?.error || '绑定失败'
        const status =
          link.status >= 400 && link.status < 600 ? link.status : 502
        return jsonErr(res, status, msg, 'link_failed')
      }
      const u = store.users.find((x) => x.id === req.user.id)
      if (u) {
        const prevLinked = u.linkedMcUsername != null ? String(u.linkedMcUsername).trim() : ''
        u.linkedMcUsername = mc
        markUserProfileDirty(u.id)
        appendSecurityAudit(store, u.id, 'link_minecraft', {
          mcUsername: mc,
          previousMcUsername: prevLinked || null,
          source: 'site',
          at: new Date().toISOString(),
        })
        pushUserNotification(store, u.id, {
          type: 'binding_changed',
          title: '游戏角色已绑定',
          message: `已绑定角色 ${mc}`,
          detail: { mcUsername: mc, action: 'link' }
        })
        scheduleSave()
      }
      if (inv.code) claimInviteForUser(store, req.user.id, inv.code)
      if (config.mojangSkinSyncEnabled) {
        queueMicrotask(() => {
          persistMojangSkinSync(getStore(), req.user.id, mc).catch((e) => {
            console.warn('[starmc-api] 绑定后 Mojang 皮肤同步失败:', e?.message || e)
          })
        })
      }
      res.json({ ok: true, linkedMcUsername: mc })
    })
  )

  app.post(
    '/api/user/unlink-minecraft',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      const mc = u?.linkedMcUsername != null ? String(u.linkedMcUsername).trim() : ''
      if (!mc) {
        return jsonErr(res, 400, '当前未绑定游戏角色', 'not_linked')
      }
      const reasonInput = String(req.body?.reason || '').trim()
      if (reasonInput.length > 180) {
        return jsonErr(res, 400, '解绑原因不能超过 180 个字符', 'validation_error', {
          field: 'reason',
          maxLength: 180
        })
      }
      const unlinkReason = normalizeShortText(reasonInput, 180) || 'user_request'
      if (config.requireTotpForMcLink && u.totpEnabled) {
        const tok = String(req.body?.totpCode || '').trim()
        if (!verifyTotpToken(u.totpSecret, tok)) {
          return jsonErr(res, 403, '两步验证码错误', 'totp_invalid')
        }
      }
      const unbind = await vlaLinkExternalUser(mc, '')
      if (!unbind.skipped && !unbind.ok) {
        const status =
          unbind.status >= 400 && unbind.status < 600 ? unbind.status : 502
        return jsonErr(res, status, unbind.json?.error || '解绑失败', 'unlink_failed')
      }
      u.linkedMcUsername = null
      u.linkedMcUuid = null
      markUserProfileDirty(u.id)
      appendSecurityAudit(store, u.id, 'unlink_minecraft', {
        mcUsername: mc,
        reason: unlinkReason,
        source: 'site',
        at: new Date().toISOString(),
      })
      pushUserNotification(store, u.id, {
        type: 'binding_changed',
        title: '游戏角色已解绑',
        message: `已解绑角色 ${mc}`,
        detail: { mcUsername: mc, action: 'unlink', reason: unlinkReason }
      })
      const psUn = ensurePlayerState(store, u.id)
      psUn.mojangSkin = null
      psUn.applied.version = (psUn.applied.version || 1) + 1
      markPlayerStateDirty(u.id)
      scheduleSave()
      res.json({
        ok: true,
        message: '已解绑游戏角色（插件侧 external_user_id 已清除）',
        reason: unlinkReason,
      })
    })
  )

  /**
   * 获取 Minecraft 绑定状态
   * GET /api/user/minecraft/status
   */
  app.get(
    '/api/user/minecraft/status',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')

      const linked = Boolean(u.linkedMcUsername)
      const verifySession = getMcVerifySession(req.user.id)

      res.json({
        ok: true,
        linked: Boolean(u.linkedMcUsername),
        mcUsername: u.linkedMcUsername || null,
        mcUuid: u.linkedMcUuid || null,
        verifiedMojang: Boolean(u.verifiedMojang),
        // VLA 联动开关
        vlaLinked: linked,
        // 当前验证码会话
        verifySession: verifySession.hasSession
          ? {
              id: verifySession.lastState?.id || null,
              code: verifySession.code,
              serverId: verifySession.lastState?.serverId || null,
              mcUsername: verifySession.mcUsername,
              verified: verifySession.verified,
              expired: verifySession.expired,
              createdAt: verifySession.createdAt,
              expiresAt: verifySession.expiresAt,
              retryCount: verifySession.retryCount,
              maxRetries: verifySession.maxRetries,
            }
          : null,
        // 新版状态机回传（前端按需接入，不影响旧字段）
        verifyState: {
          status: verifySession.status,
          failureReason: verifySession.failureReason,
          conflictCode: verifySession.conflictCode,
          retryCount: verifySession.retryCount,
          maxRetries: verifySession.maxRetries,
          createdAt: verifySession.createdAt,
          expiresAt: verifySession.expiresAt,
          hasActiveSession: verifySession.hasSession,
          lastState: verifySession.lastState,
        },
      })
    })
  )

  /**
   * 绑定与验证相关操作历史（基于安全审计）
   * GET /api/user/minecraft/binding-history
   */
  app.get(
    '/api/user/minecraft/binding-history',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const sc = ensureSecurityCenter(store)
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
      const actionFilter = normalizeShortText(req.query.action, 48).toLowerCase()
      const q = normalizeShortText(req.query.q, 180).toLowerCase()

      let items = (Array.isArray(sc.auditLogs) ? sc.auditLogs : [])
        .filter((row) => String(row?.userId || '') === String(req.user.id || ''))
        .filter((row) =>
          MC_BINDING_AUDIT_ACTIONS.has(String(row?.action || '').trim().toLowerCase())
        )
        .map((row) => buildMcBindingHistoryItemFromAudit(row))

      if (actionFilter) {
        items = items.filter((row) => String(row?.action || '').toLowerCase() === actionFilter)
      }
      if (q) {
        items = items.filter((row) => {
          const haystack = [
            row.action,
            row.label,
            row.mcUsername,
            row.reason,
            row.conflictCode,
            row.source,
            JSON.stringify(row.detail || {}),
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(q)
        })
      }

      items.sort((a, b) => parseTimeMs(b.at) - parseTimeMs(a.at))
      const total = items.length
      const start = (page - 1) * pageSize
      return jsonPage(res, { total, page, pageSize, items: items.slice(start, start + pageSize) })
    })
  )

  /**
   * 正版验证会话历史（状态机快照）
   * GET /api/user/minecraft/verify-history
   */
  app.get(
    '/api/user/minecraft/verify-history',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
      const statusFilter = normalizeShortText(req.query.status, 24).toLowerCase()

      const history = getMcVerifySessionHistory(req.user.id, {
        page,
        pageSize,
        status: statusFilter || undefined,
      })
      const items = history.items.map((row) => ({
        ...row,
        label: verifyStatusLabel(row?.status),
        retryCount: Number(row?.retries || 0),
        maxRetries: Number(row?.maxRetries || 0),
        timeline: {
          createdAt: Number(row?.createdAt || 0) || null,
          expiresAt: Number(row?.expiresAt || 0) || null,
          finishedAt: Number(row?.finishedAt || 0) || null,
        },
      }))

      return jsonPage(res, {
        total: history.total,
        page,
        pageSize,
        items,
      })
    })
  )

  /**
   * 发起正版验证
   * POST /api/user/minecraft/verify/init
   * 要求：已绑定 MC 用户名（与 VLA linkedMcUsername 一致）
   */
  app.post(
    '/api/user/minecraft/verify/init',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')

      const mcUsername = String(req.body?.mcUsername || u.linkedMcUsername || '').trim().toLowerCase()
      if (!mcUsername || mcUsername.length < 3 || mcUsername.length > 16) {
        return jsonErr(res, 400, '请提供有效的游戏角色名（3–16 字符）', 'bad_username')
      }

      // 必须与已绑定的用户名一致（防止验证别人的账号）
      if (u.linkedMcUsername && u.linkedMcUsername.toLowerCase() !== mcUsername) {
        return jsonErr(res, 400, '只能验证当前绑定的游戏角色', 'username_mismatch')
      }

      const createResult = createMcVerifySession(req.user.id, mcUsername, {
        force: Boolean(req.body?.force),
      })
      if (!createResult.ok) {
        if (createResult.error === 'session_conflict') {
          return jsonErr(
            res,
            409,
            '当前已有进行中的验证会话，请先取消或等待过期',
            'verify_session_conflict',
            { activeSession: createResult.session }
          )
        }
        if (createResult.error === 'init_rate_limited') {
          return jsonErr(
            res,
            429,
            '验证发起过于频繁，请稍后再试',
            'verify_init_rate_limited',
            { retryAfterSeconds: createResult.retryAfterSeconds }
          )
        }
        if (createResult.error === 'max_retries_exceeded') {
          return jsonErr(
            res,
            429,
            '验证重试次数已达上限，请稍后再试',
            'verify_max_retries_exceeded',
            {
              retryAfterSeconds: createResult.retryAfterSeconds,
              retryCount: createResult.retryCount,
              maxRetries: createResult.maxRetries,
            }
          )
        }
        return jsonErr(res, 400, '发起验证失败', createResult.error || 'verify_init_failed')
      }
      const session = createResult.session
      appendSecurityAudit(store, req.user.id, 'verify_init', {
        mcUsername,
        sessionId: session?.id || null,
        retryCount: Number(session?.retries || 0),
        maxRetries: Number(session?.maxRetries || 0),
        source: 'site',
      })
      pushUserNotification(store, req.user.id, {
        type: 'verify_init',
        title: '已发起正版验证',
        message: `请在游戏内完成验证（角色：${mcUsername}）`,
        detail: {
          mcUsername,
          expiresAt: session?.expiresAt || null,
          retryCount: Number(session?.retries || 0)
        }
      })
      res.json({
        ok: true,
        code: session.code,
        serverId: session.serverId,
        expiresInSeconds: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
        instructions: createResult.instructions,
        state: {
          sessionId: session.id,
          status: session.status,
          retryCount: session.retries,
          maxRetries: session.maxRetries,
          expiresAt: session.expiresAt,
          remainingInitQuota: createResult.remainingInitQuota,
        },
      })
    })
  )

  /**
   * 清除当前验证码会话（用户主动取消）
   * POST /api/user/minecraft/verify/cancel
   */
  app.post(
    '/api/user/minecraft/verify/cancel',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const reasonInput = String(req.body?.reason || '').trim()
      if (reasonInput.length > 180) {
        return jsonErr(res, 400, '取消原因不能超过 180 个字符', 'validation_error', {
          field: 'reason',
          maxLength: 180
        })
      }
      const cancelReason = normalizeShortText(reasonInput, 180) || 'user_cancelled'
      const beforeState = getMcVerifySession(req.user.id)
      const cancelled = clearMcVerifySession(req.user.id, cancelReason)
      const verifyState = getMcVerifySession(req.user.id)
      const lastState = verifyState.lastState || beforeState.lastState || null
      appendSecurityAudit(store, req.user.id, 'verify_cancel', {
        cancelled: Boolean(cancelled),
        reason: cancelReason,
        source: 'site',
        sessionId: lastState?.id || null,
        mcUsername:
          normalizeShortText(lastState?.mcUsername || beforeState.mcUsername, 16).toLowerCase() || null,
      })
      if (cancelled) {
        pushUserNotification(store, req.user.id, {
          type: 'verify_cancel',
          title: '正版验证已取消',
          message: '当前验证会话已取消',
          detail: {
            cancelled: true,
            reason: cancelReason,
            sessionId: lastState?.id || null,
          }
        })
      }
      res.json({
        ok: true,
        cancelled: Boolean(cancelled),
        state: {
          status: verifyState.status,
          failureReason: verifyState.failureReason,
          conflictCode: verifyState.conflictCode,
          retryCount: verifyState.retryCount,
          maxRetries: verifyState.maxRetries,
          hasActiveSession: verifyState.hasSession,
          lastState: verifyState.lastState,
        }
      })
    })
  )

  app.post(
    '/api/user/totp/setup',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
      if (u.totpEnabled) return jsonErr(res, 400, '已启用两步验证', 'already_enabled')
      const secret = generateTotpSecret()
      u.totpPendingSecret = secret
      markUserProfileDirty(u.id)
      scheduleSave()
      const label = String(u.email || u.username || u.id)
      res.json({
        secret,
        otpauthUrl: totpKeyUri(label, secret)
      })
    })
  )

  app.post(
    '/api/user/totp/enable',
    requireUser,
    asyncHandler(async (req, res) => {
      const code = String(req.body?.code || '').trim()
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u?.totpPendingSecret) {
        return jsonErr(res, 400, '请先获取密钥（POST /api/user/totp/setup）', 'no_pending')
      }
      if (!verifyTotpToken(u.totpPendingSecret, code)) {
        return jsonErr(res, 400, '验证码错误', 'bad_code')
      }
      u.totpSecret = u.totpPendingSecret
      u.totpPendingSecret = null
      u.totpEnabled = true
      u.recoveryCodes = makeRecoveryCodes()
      u.recoveryCodesCount = u.recoveryCodes.length
      markUserProfileDirty(u.id)
      appendSecurityAudit(store, u.id, 'totp_enable', { recoveryCodesCount: u.recoveryCodesCount })
      pushUserNotification(store, u.id, {
        type: 'totp_enabled',
        title: '两步验证已启用',
        message: '你的账号安全性已提升，请妥善保管恢复码',
        detail: { recoveryCodesCount: u.recoveryCodesCount }
      })
      scheduleSave()
      res.json({ ok: true, recoveryCodes: u.recoveryCodes })
    })
  )

  app.post(
    '/api/user/totp/disable',
    requireUser,
    asyncHandler(async (req, res) => {
      const code = String(req.body?.code || '').trim()
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u?.totpEnabled || !u.totpSecret) {
        return jsonErr(res, 400, '未启用两步验证', 'not_enabled')
      }
      if (!verifyTotpToken(u.totpSecret, code)) {
        const recoveryCode = String(req.body?.recoveryCode || '').trim().toUpperCase()
        if (!recoveryCode || !Array.isArray(u.recoveryCodes) || !u.recoveryCodes.includes(recoveryCode)) {
          return jsonErr(res, 400, '验证码错误', 'bad_code')
        }
        u.recoveryCodes = u.recoveryCodes.filter((c) => c !== recoveryCode)
        u.recoveryCodesCount = u.recoveryCodes.length
      }
      u.totpEnabled = false
      u.totpSecret = null
      u.totpPendingSecret = null
      markUserProfileDirty(u.id)
      appendSecurityAudit(store, u.id, 'totp_disable', { recoveryCodesCount: Number(u.recoveryCodesCount || 0) })
      pushUserNotification(store, u.id, {
        type: 'totp_disabled',
        title: '两步验证已关闭',
        message: '账号已退回基础保护状态，建议尽快重新开启',
        detail: { recoveryCodesCount: Number(u.recoveryCodesCount || 0) }
      })
      scheduleSave()
      res.json({ ok: true })
    })
  )

  app.post('/api/user/totp/recovery-codes/rotate', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u || !u.totpEnabled) return jsonErr(res, 400, '未启用两步验证', 'not_enabled')
    const code = String(req.body?.code || '').trim()
    if (!verifyTotpToken(u.totpSecret, code)) {
      return jsonErr(res, 400, '验证码错误', 'bad_code')
    }
    u.recoveryCodes = makeRecoveryCodes()
    u.recoveryCodesCount = u.recoveryCodes.length
    markUserProfileDirty(u.id)
    appendSecurityAudit(store, u.id, 'recovery_codes_rotate', { recoveryCodesCount: u.recoveryCodesCount })
    pushUserNotification(store, u.id, {
      type: 'recovery_codes_rotate',
      title: '恢复码已更新',
      message: '旧恢复码已失效，请保存新恢复码',
      detail: { recoveryCodesCount: u.recoveryCodesCount }
    })
    scheduleSave()
    res.json({ ok: true, recoveryCodes: u.recoveryCodes })
  })

  app.get('/api/user/data-export', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    const ps = ensurePlayerState(store, req.user.id)
    res.json({
      exportedAt: new Date().toISOString(),
      profile: publicUser(u),
      playerState: {
        applied: ps.applied,
        activeSelection: ps.activeSelection || undefined,
        recentSelections: ps.recentSelections?.length ? ps.recentSelections : undefined
      },
      submissions: store.submissions
        .filter((s) => s.userId === req.user.id)
        .map((s) => ({
          id: s.id,
          fileName: s.fileName,
          kind: s.kind,
          status: s.status,
          submittedAt: s.submittedAt,
          reviewedAt: s.reviewedAt,
          note: s.note
        })),
      authxEventsReceived: store.authxEvents.filter(
        (e) => e.externalUserId === req.user.id
      ).length
    })
  })

  /**
   * 用户态只读代理 VLA（Bearer + 已验证邮箱）；external_user_id 固定为当前用户 id，避免越权。
   */
  app.get(
    '/api/user/mc-account',
    mcUserReadLimiter,
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
    if (config.authxPluginAdapter !== 'vla') {
      return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'vla_adapter_required')
    }
    const name = String(req.user.linkedMcUsername || '').trim()
    if (!name) {
      return jsonErr(res, 400, '请先绑定游戏角色', 'not_linked')
    }
    const r = await pluginFetchGet('/v1/user/detail', { name })
    return respondPluginGetResult(res, r)
    })
  )

  app.get(
    '/api/user/mc-profiles',
    mcUserReadLimiter,
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
    if (config.authxPluginAdapter !== 'vla') {
      return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'vla_adapter_required')
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const r = await pluginFetchGet('/v1/user/profiles', {
      external_user_id: req.user.id,
      limit: String(limit)
    })
    return respondPluginGetResult(res, r)
    })
  )

  app.get(
    '/api/user/mc-security-events',
    mcUserReadLimiter,
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
    if (config.authxPluginAdapter !== 'vla') {
      return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'vla_adapter_required')
    }
    const name = String(req.user.linkedMcUsername || '').trim()
    if (!name) {
      return jsonErr(res, 400, '请先绑定游戏角色', 'not_linked')
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const r = await pluginFetchGet('/v1/security/events', { name, limit: String(limit) })
    return respondPluginGetResult(res, r)
    })
  )

  function requireReviewerOrAdmin(req, res, next) {
    const ok = requireRolesOrJson(req, res, {
      roles: ['reviewer', 'admin'],
      message: '仅 reviewer/admin 可执行审核操作',
      requiredCapability: 'review_submissions',
    })
    if (!ok) return
    next()
  }

  function requireModerator(req, res, next) {
    const ok = requireRolesOrJson(req, res, {
      roles: ['moderator', 'reviewer', 'admin'],
      message: '仅 moderator/reviewer/admin 可执行该操作',
      requiredCapability: 'moderate_reports',
    })
    if (!ok) return
    next()
  }

  registerSkinRoutes(app, {
    config,
    jsonErr,
    jsonOk,
    jsonPage,
    getStore,
    scheduleSave,
    requireUser,
    requireVerifiedEmail,
    requireReviewerOrAdmin,
    requireModerator,
    upload,
    UPLOAD_DIR,
    path,
    ensurePlayerState,
    isUserEmailVerified,
    resolveSkinStationPreview,
    persistMojangSkinSync,
    triggerVlaSkinRefreshIfConfigured,
    markSubmissionDirty,
    markPlayerStateDirty,
    catalogItemById,
    mojangSkinSyncLimiter,
    markKvDirty,
    asyncHandler,
    crypto
  })

  registerSkinAdminRoutes(app, {
    config,
    jsonErr,
    jsonOk,
    jsonPage,
    resolvePaginationQuery,
    getStore,
    scheduleSave,
    markKvDirty,
    markUserProfileDirty,
    requireAdmin,
    asyncHandler,
    crypto,
    path,
    UPLOAD_DIR,
    upload,
  })

  registerSkinTextureRoute(app, { jsonErr })

  registerCapeRoutes(app, { jsonOk })

  registerQqRoutes(app, { jsonErr, jsonOk })

  registerMapHealthRoutes(app, { config, jsonErr })

  registerPublicSkinProfileRoutes(app, {
    config,
    jsonErr,
    getStore,
    asyncHandler,
    skinProfilePublicLimiter,
    findUserByLinkedMcUsername,
    ensurePlayerState
  })

  registerSkinRefreshRoutes(app, { config, jsonErr, pluginFetchJson })

  app.get('/api/skin/current', (req, res) => {
    const uuid = String(req.query.uuid || '').trim()
    if (!uuid) return jsonErr(res, 400, '缺少 uuid', 'validation_error')
    const store = getStore()
    const user = store.users.find((u) => u.uuid === uuid)
    if (!user) return jsonErr(res, 404, '用户不存在', 'not_found')
    const ps = ensurePlayerState(store, user.id)
    const v = ps.applied.version || 1
    const etag = `"skin-v${v}"`
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }
    res.setHeader('ETag', etag)
    res.json({
      uuid,
      skinAssetId: ps.applied.skinAssetId,
      capeAssetId: ps.applied.capeAssetId,
      slot: ps.applied.slot,
      version: v,
      message: 'ok'
    })
  })

  const devApproveEnabled = process.env.ALLOW_DEV_APPROVE === '1'
  if (devApproveEnabled) {
    if (config.isProd && !config.devAdminSecret) {
      console.warn(
        '[starmc-api] 生产环境已设置 ALLOW_DEV_APPROVE=1 但未配置 DEV_ADMIN_SECRET，dev 审核路由未启用'
      )
    } else {
      app.post('/api/dev/submissions/:id/approve', (req, res) => {
        if (config.isProd) {
          const h = (req.headers['x-admin-secret'] || '').trim()
          if (!config.devAdminSecret || h !== config.devAdminSecret) {
            return jsonErr(res, 403, '需要管理员密钥', 'forbidden')
          }
        }
        const store = getStore()
        const sub = store.submissions.find((s) => s.id === req.params.id)
        if (!sub) return jsonErr(res, 404, '投稿不存在', 'not_found')
        sub.status = 'approved'
        sub.reviewedAt = new Date().toISOString()
        sub.note = 'dev approve'
        markSubmissionDirty(sub.id)
        scheduleSave()
        res.json({ ok: true })
      })
    }
  }

  app.use(notFoundHandler)
  if (isSuperTokensReady()) {
    app.use(stErrorHandler())
  }
  app.use(errorHandler)

  return app
}

function createPluginApp() {
  const app = express()
  const corsOpts =
    config.corsOrigins.length > 0
      ? { origin: config.corsOrigins, credentials: true }
      : { origin: false }
  app.use(cors(corsOpts))
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '256kb' }))

  app.get('/healthz', (_req, res) => res.status(200).send('ok'))

  registerSkinRefreshRoutes(app, { config, jsonErr })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

function gracefulShutdown(serverApi, serverPlugin, stopStoreBackup, stopWebhookTicker) {
  const shutdown = (signal) => {
    console.log(`[starmc-api] 收到 ${signal}，正在落盘并退出…`)
    try {
      stopStoreBackup()
    } catch {
      /* ignore */
    }
    try {
      stopWebhookTicker()
    } catch {
      /* ignore */
    }
    ;(async () => {
      try {
        await flushSaveSyncAndPg()
      } catch {
        /* persist already logged */
      }
      try {
        await closePool()
      } catch {
        /* ignore */
      }
      serverApi.close(() => {
        serverPlugin.close(() => process.exit(0))
      })
    })().catch(() => process.exit(1))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

async function main() {
  const nodeMajor = Number((process.versions.node || '').split('.')[0])
  if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
    console.error(`[starmc-api] 需要 Node.js 18 及以上，当前为 ${process.version}`)
    process.exit(1)
  }
  if (typeof globalThis.fetch !== 'function') {
    console.error('[starmc-api] 当前运行环境缺少 globalThis.fetch，请使用 Node 18+')
    process.exit(1)
  }

  loadStore()
  console.log(`[starmc-api] 数据目录: ${config.dataDir}`)

  const pool = getPool()
  if (pool) {
    try {
      if (config.pgMigrateOnStart) {
        await runMigrations(pool)
      }
      const st = getStore()
      await hydratePlayerStateFromPg(st)
      await hydrateUserProfilesFromPg(st)
      await hydrateSubmissionsFromPg(st)
      await hydrateStoreKvFromPg(st)
      if (config.pgKvSyncOnStart) {
        for (const k of STORE_KV_KEYS) {
          markKvDirty(k)
        }
      }
      scheduleSave()
      console.log(
        '[starmc-api] PostgreSQL 已启用：player_state / user_profile / submission / store_kv（hydrate + 双写）'
      )
    } catch (e) {
      console.error('[starmc-api] PostgreSQL 初始化失败:', e?.message || e)
      try {
        await closePool()
      } catch {
        /* ignore */
      }
      process.exit(1)
    }
  }

  if (config.isProd && config.skinBridgePublicProfile && !config.publicApiBaseUrl) {
    console.warn(
      '[starmc-api] 生产环境未设置 PUBLIC_API_BASE_URL：VLA custom 皮肤拉取与 /uploads 外链将不可用；参见 backend/.env.example'
    )
  }

  if (config.isProd) {
    if (!config.devAdminSecret) {
      console.warn(
        '[starmc-api] 生产环境未设置 DEV_ADMIN_SECRET：/api/admin/authx/* 将返回 503（misconfigured）'
      )
    }
    if (!config.pluginRefreshSecret) {
      console.warn(
        '[starmc-api] 生产环境未设置 PLUGIN_REFRESH_SECRET：POST /plugin/skin/refresh 将返回 503（misconfigured）'
      )
    }
    if (!isPluginWebhookAuthConfigured()) {
      console.warn(
        '[starmc-api] 生产环境未配置 AUTHX_VLA_WEBHOOK_SECRET(S) 或 AUTHX_CALLBACK_SECRET：POST /api/plugin/authx/callback 将返回 503（misconfigured）'
      )
    }
  }

  const api = createApiApp()
  const serverApi = api.listen(config.apiPort, () => {
    console.log(`[starmc-api] API  http://127.0.0.1:${config.apiPort}`)
    console.log(`[starmc-api] 健康检查 GET http://127.0.0.1:${config.apiPort}/api/health`)
  })
  serverApi.on('error', (err) => {
    console.error(`[starmc-api] API 端口 ${config.apiPort} 不可用:`, err.message)
    process.exit(1)
  })

  const plugin = createPluginApp()
  const serverPlugin = plugin.listen(config.pluginPort, () => {
    console.log(
      `[starmc-api] 插件桩 http://127.0.0.1:${config.pluginPort}  (/healthz, /plugin/skin/refresh)`
    )
  })
  serverPlugin.on('error', (err) => {
    console.error(`[starmc-api] 插件端口 ${config.pluginPort} 不可用:`, err.message)
    process.exit(1)
  })

  const stopStoreBackup = startStoreBackupScheduler()
  const webhookTimer = setInterval(() => {
    const store = getStore()
    processWebhookQueue(store)
      .then(() => scheduleSave())
      .catch((e) => console.warn('[starmc-api] webhook queue tick failed:', e?.message || e))
  }, 5000)
  if (typeof webhookTimer.unref === 'function') webhookTimer.unref()

  if (config.storeBackupEnabled) {
    console.log(
      `[starmc-api] store 定时备份已启用：每 ${config.storeBackupIntervalMinutes} 分钟，保留 ${config.storeBackupKeep} 份 → ${config.dataDir}${path.sep}backups`
    )
  }

  gracefulShutdown(serverApi, serverPlugin, stopStoreBackup, () => clearInterval(webhookTimer))
}

process.on('unhandledRejection', (reason) => {
  console.error('[starmc-api] 未处理的 Promise 拒绝:', reason)
})

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
