import './load-env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import crypto from 'crypto'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import supertokens from 'supertokens-node'
import { middleware as stMiddleware, errorHandler as stErrorHandler } from 'supertokens-node/framework/express/index.js'
import { verifySession } from 'supertokens-node/recipe/session/framework/express/index.js'
import Session from 'supertokens-node/recipe/session/index.js'
import EmailPassword from 'supertokens-node/recipe/emailpassword/index.js'
import { config } from './config.js'
import { browserRecovery } from './browserRecovery.js'
import {
  globalLimiter,
  securityHeaderGuard,
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
  verifyCodeSendLimiter,
  verifyCodeConfirmLimiter
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
import { createAvatarUpload, createSkinUpload, createTextureUpload } from './upload.js'
import { initSuperTokens, isSuperTokensReady, probeSuperTokensCore, isSuperTokensCoreReachable } from './auth/supertokensInit.js'
import { createOptionalSessionUser } from './auth/optionalSession.js'
import { buildCapabilityMatrix } from './auth/capabilities.js'
import { createVerificationCodeSender, isSmtpConfigured } from './auth/supertokensEmailDelivery.js'
import { createSessionCoreAdapter, touchSessionDeviceMetadata } from './auth/sessionInventory.js'
import {
  ensureSupertokensLocalUser,
  findUserByUsername,
  findSupertokensLinkedUser,
  syncSupertokensLocalUser
} from './auth/supertokensUser.js'
import { isUserBanned } from './auth/userStatus.js'
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
import { importGithubSkin } from './modules/skinAdmin/githubImport.js'
import { registerCapeRoutes } from './modules/cape/routes.js'
import { registerShoutboxRoutes } from './modules/shoutbox/routes.js'
import { registerMapRoutes } from './modules/map/routes.js'
import { registerQqRoutes } from './modules/qq/routes.js'
import { registerMapHealthRoutes } from './modules/ops/mapHealth.js'
import { registerOpsRoutes } from './modules/ops/routes.js'
import { registerTelemetryRoutes } from './modules/telemetry/routes.js'
import { registerDashboardRoutes } from './modules/dashboard/routes.js'
import { registerUserRoutes } from './modules/user/routes.js'
import { registerAdminSupportRoutes } from './modules/adminSupport/routes.js'
import { buildUserDataExport } from './modules/user/dataExport.js'
import { registerTotpRoutes } from './modules/totp/routes.js'
import { registerMinecraftRoutes } from './modules/minecraft/routes.js'
import { registerVerifyCodeRoutes } from './modules/auth/verifyCodeRoutes.js'
import { registerLegacyAccountSetupRoutes } from './modules/auth/legacyAccountSetupRoutes.js'
import { registerGithubOAuthRoutes } from './modules/auth/githubOauthRoutes.js'
import { registerMcGamePasswordRoutes } from './modules/mcGamePassword/routes.js'
import { registerSkinRefreshRoutes } from './modules/plugin-gateway/skinRefresh.js'
import { registerTextureRoutes } from './modules/texture/routes.js'
import { migrateStoredTextureAssets } from './modules/texture/service.js'
import { registerSiteConfigRoutes } from './modules/siteConfig/routes.js'
import { registerWikiRoutes } from './modules/wiki/routes.js'
import { registerRoleAdminRoutes } from './modules/roleAdmin/routes.js'
import { registerPluginGatewayRoutes } from './modules/plugin-gateway/index.js'
import { registerPluginEnrollmentRoutes } from './modules/plugin-enrollment/routes.js'
import { registerSkinConsentRoutes } from './modules/skinConsent/routes.js'
import { registerPaymentRoutes } from './modules/payment/routes.js'
import { isPluginWebhookAuthConfigured } from './modules/plugin-gateway/adapter.js'
import { buildPublicBootstrap, buildPublicSiteFeatures } from './modules/public/bootstrap.js'
import { summarizeSubmissionStats } from './modules/skin/service.js'
import { invalidateAlertIndex } from './modules/security/service.js'
import { EventBus, Events } from './modules/event-bus/index.js'
import { registerEventBusSubscribers } from './modules/event-bus/registerEventBusSubscribers.js'
import { sleep, computeBackoffSec, CIRCUIT_BREAKER } from './modules/plugin-gateway/constants.js'
import {
  mapPluginAdminRequest,
  mapPluginGetRequest,
  resolvePluginApiBase,
  resolvePluginApiKey,
} from './modules/plugin-gateway/mapPluginAdminRequest.js'
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
import {
  parseTimeMs,
  normalizeShortText,
  isValidEmailAddress,
  classifyDeviceType,
  maskIpForLog,
  isPrivateIp,
  makeRecoveryCodes
} from './services/utils.js'
import {
  MC_BINDING_AUDIT_ACTIONS,
  actionLabel,
  verifyStatusLabel,
  buildMcBindingHistoryItemFromAudit
} from './services/mcBindingHistory.js'
import {
  ensureUserNotificationsStore,
  pushUserNotification
} from './services/notifications.js'
import {
  normalizeAsnCategory,
  buildDeviceProfileLabel,
  buildSecurityLabel,
  ensureTrustedDeviceBucket
} from './services/securityHelpers.js'
import { createStarxNetworkClient } from './services/starxNetworkStatus.js'
import {
  refreshStarxNetworkState,
  shouldRefreshStarxNetworkState,
} from './services/starxNetworkHealth.js'
import { buildProductionReadiness } from './services/productionReadiness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const upload = createSkinUpload()
const textureUpload = createTextureUpload()
const avatarUpload = createAvatarUpload()
let starxNetworkClient = null
let starxNetworkClientSignature = ''
const starxNetworkState = {
  lastAttemptAt: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  networkStatusHealthy: null,
  networkStatus: null,
  networkStatusCounts: null,
}
let starxNetworkRefreshPromise = null

function reconfigureStarxNetworkClient() {
  const baseUrl = String(config.starxNetworkApiBase || '').trim().replace(/\/+$/, '')
  const apiKey = String(config.starxNetworkApiKey || '').trim()
  const timeoutMs = Number(config.starxNetworkApiTimeoutMs || 5000)
  const signature = `${baseUrl}\u0000${apiKey}\u0000${timeoutMs}`
  if (signature === starxNetworkClientSignature) return Boolean(starxNetworkClient)
  starxNetworkClientSignature = signature
  starxNetworkClient = baseUrl && apiKey
    ? createStarxNetworkClient({ baseUrl, apiKey, timeoutMs })
    : null
  starxNetworkRefreshPromise = null
  starxNetworkState.lastAttemptAt = 0
  starxNetworkState.lastSuccessAt = null
  starxNetworkState.lastErrorAt = null
  starxNetworkState.networkStatusHealthy = null
  starxNetworkState.networkStatus = null
  starxNetworkState.networkStatusCounts = null
  return Boolean(starxNetworkClient)
}
reconfigureStarxNetworkClient()

async function refreshStarxNetworkStatus() {
  if (!starxNetworkClient) return null
  if (starxNetworkRefreshPromise) return starxNetworkRefreshPromise
  starxNetworkRefreshPromise = refreshStarxNetworkState({
    client: starxNetworkClient,
    state: starxNetworkState,
  }).finally(() => {
    starxNetworkRefreshPromise = null
  })
  return starxNetworkRefreshPromise
}

let authxAdapterDeprecationWarned = false
function warnAuthxAdapterDeprecated() {
  if (authxAdapterDeprecationWarned) return
  authxAdapterDeprecationWarned = true
  console.warn('[starmc-api] authx adapter is deprecated, only vla is supported')
}

const MAX_PLUGIN_BODY_SIZE = 1024 * 1024

const circuitState = { failures: 0, isOpen: false, halfOpenAfter: 0 }

const pluginFetchCounters = { total: 0, success: 0, failed: 0, history: [] }

/** @type {Array<{ event: string, errorMessage: string, timestamp: string }>} */
const eventHandlerFailures = []

function isCircuitOpen() {
  if (!circuitState.isOpen) return false
  if (Date.now() >= circuitState.halfOpenAfter) {
    circuitState.isOpen = false
    return false
  }
  return true
}

function recordCircuitSuccess() {
  circuitState.failures = 0
  circuitState.isOpen = false
  persistCircuitState()
}

function recordPluginFetchEvent(ok, latencyMs) {
  if (pluginFetchCounters.history.length >= 2000) {
    pluginFetchCounters.history.splice(0, pluginFetchCounters.history.length - 1500)
  }
  pluginFetchCounters.history.push({ ts: Date.now(), ok, latencyMs })
}

function recordCircuitFailure() {
  circuitState.failures++
  if (circuitState.failures >= CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
    circuitState.isOpen = true
    circuitState.halfOpenAfter = Date.now() + CIRCUIT_BREAKER.HALF_OPEN_MS
  }
  persistCircuitState()
}

function persistCircuitState() {
  try {
    const store = getStore()
    if (!store) return
    store.circuitState = {
      failures: circuitState.failures,
      isOpen: circuitState.isOpen,
      halfOpenAfter: circuitState.halfOpenAfter,
    }
    markKvDirty('circuit_state')
    scheduleSave()
  } catch (e) {
    console.error('[starmc-api] 持久化断路器状态失败:', e?.message || e)
  }
}

async function pluginFetchJson(apiPath, body) {
  if (isCircuitOpen()) {
    return { status: 503, json: { ok: false, error: 'circuit_open', detail: '插件服务暂时不可用（断路器已打开）' } }
  }

  const startMs = Date.now()
  const mapped = mapPluginAdminRequest(apiPath, body, config, warnAuthxAdapterDeprecated)
  const base = resolvePluginApiBase(config)
  const url = base + mapped.path
  const payload = JSON.stringify(mapped.body || {})

  let lastError
  for (let attempt = 0; attempt <= CIRCUIT_BREAKER.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(5000, CIRCUIT_BREAKER.BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 200)
      await sleep(delay)
    }

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), config.authxPluginRequestMs)
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...mapped.extraHeaders
      }
      if (config.authxPluginAdapter === 'vla' && config.authxVlaHmacSecret) {
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
      const latencyMs = Date.now() - startMs
      if (r.status < 500 || attempt === CIRCUIT_BREAKER.MAX_RETRIES) {
        pluginFetchCounters.total++
        if (r.status < 500) {
          recordCircuitSuccess()
          pluginFetchCounters.success++
          recordPluginFetchEvent(true, latencyMs)
        } else {
          recordCircuitFailure()
          pluginFetchCounters.failed++
          recordPluginFetchEvent(false, latencyMs)
        }
        return { status: r.status, json }
      }
      pluginFetchCounters.total++
      pluginFetchCounters.failed++
      recordPluginFetchEvent(false, latencyMs)
      lastError = { status: r.status, json }
    } catch (e) {
      const aborted = e?.name === 'AbortError'
      lastError = {
        status: aborted ? 504 : 502,
        json: { ok: false, error: aborted ? 'plugin_timeout' : 'plugin_unreachable', detail: String(e?.message || e) }
      }
      /* 不在 catch 中递增计数器，由后续 attempt 或 loop 结束后统一记录 */
    } finally {
      clearTimeout(t)
    }
  }

  /* 所有重试均失败时统一记录 */
  pluginFetchCounters.total++
  pluginFetchCounters.failed++
  recordCircuitFailure()
  recordPluginFetchEvent(false, Date.now() - startMs)
  return lastError
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
  // BUG FIX H-12: in production, an empty adminAllowedIps list used to fall
  // through to "allow any IP", which is dangerous because admins sometimes
  // forget to set ADMIN_ALLOWED_IPS in their env.  We now refuse by default
  // and require an explicit list.  In dev, the empty list still means
  // "any IP" so local development is unblocked.
  if (allow.length === 0) {
    if (config.isProd) {
      return false
    }
    return true
  }
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
const sessionCore = createSessionCoreAdapter(Session)

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
  await touchSessionDeviceMetadata({
    session: req.session,
    headers: req.headers,
    ip: req.ip,
  })
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
  if (isUserBanned(local)) {
    const currentHandle = typeof req.session.getHandle === 'function'
      ? req.session.getHandle()
      : null
    if (currentHandle && typeof sessionCore.revokeSession === 'function') {
      await sessionCore.revokeSession(currentHandle)
    }
    jsonErr(res, 403, '该账户已被封禁，请联系管理员', 'account_banned', {
      bannedAt: local.bannedAt || null,
      reason: local.banReason || null,
    })
    return
  }
  req.accountSetupRequired = req.session.getAccessTokenPayload()?.accountSetupRequired === true
  const allowedDuringAccountSetup = new Set(['/api/auth/account-setup', '/api/user/me'])
  if (req.accountSetupRequired && !allowedDuringAccountSetup.has(req.path)) {
    jsonErr(res, 403, '请先补全用户名和密码', 'account_setup_required')
    return
  }
  next()
})

const optionalSessionUser = createOptionalSessionUser({
  isReady: isSuperTokensReady,
  verifySession,
  attachLocalUser,
  resolveDevUser: (req) => {
    if (config.isProd) return null
    const devName = parseDevBearerToken(req)
    return devName ? ensureDevUserByName(getStore(), devName) : null
  },
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
        return jsonErr(res, 401, `Dev user "${String(devName).slice(0, 64)}" not found`, 'auth_invalid_dev_user')
      }
    }
    // BUG FIX RUNTIME-1: in dev/non-prod without ST, an unauthenticated
    // requireUser must return 401 (not 503).  503 is for "the endpoint
    // itself is broken"; here the caller is simply unauthenticated.
    return jsonErr(
      res,
      401,
      'Authentication required (SuperTokens core not configured)',
      'auth_unavailable',
      { isProd: config.isProd }
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
  const minecraftProfiles = Array.isArray(u.minecraftProfiles) ? u.minecraftProfiles : []
  const avatarMinecraftUsername = String(
    minecraftProfiles.find((profile) => String(profile?.username || '').trim())?.username
    || u.linkedMcUsername
    || ''
  ).trim()
  return {
    id: u.id,
    uuid: u.uuid,
    username: u.username,
    displayName: u.displayName || '',
    email: u.email || undefined,
    roles: Array.isArray(u.roles) ? u.roles : [],
    emailVerified: isUserEmailVerified(u),
    linkedMcUsername: u.linkedMcUsername || undefined,
    linkedMcUuid: u.linkedMcUuid || undefined,
    avatarMinecraftUsername: avatarMinecraftUsername || undefined,
    verifiedMojang: Boolean(u.verifiedMojang),
    totpEnabled: Boolean(u.totpEnabled),
    qqNumber: u.qqNumber || undefined,
    qqVerified: Boolean(u.qqVerified),
    bio: u.bio || '',
    avatar: u.avatar || undefined,
    balance: Number(u.balance || 0),
    lastCheckIn: u.lastCheckIn || undefined,
    createdAt: u.createdAt || undefined
  }
}

function parseDevBearerToken(req) {
  // BUG FIX C-1: dev bearer tokens must be explicitly opted-in, never
  // silently granted by virtue of `NODE_ENV !== 'production'`. Previously a
  // developer who accidentally deployed to staging with `NODE_ENV=development`
  // (e.g. via a leaked `.env` file) allowed `Authorization: Bearer dev:admin`
  // to log in as the `admin` user.  We now require an explicit, opt-in flag
  // AND restrict dev tokens to loopback callers only.
  if (config.isProd) return null
  if (process.env.DEV_ALLOW_BEARER !== '1') return null
  if (!isLoopbackRequest(req)) return null
  const auth = String(req.headers.authorization || '').trim()
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token.startsWith('dev:')) return null
  const username = token.slice(4).trim()
  if (!username) return null
  // Additional guard: only allow the dev user to exist if they were
  // pre-provisioned.  Auto-provisioning has been removed because it allowed
  // arbitrary identity creation from a stolen dev token.
  return username
}

function findExistingDevUser(store, username) {
  const un = String(username || '').trim()
  if (!un) return null
  return (store.users || []).find((x) => String(x?.username || '') === un) || null
}

function isLoopbackRequest(req) {
  // Accept requests from localhost loopback addresses only.  This is a
  // defence-in-depth check that complements the `DEV_ALLOW_BEARER` flag.
  const ip = String(req?.ip || '').trim()
  if (!ip) return false
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true
  // Express sometimes normalises loopback as `::ffff:127.0.0.1`; allow that too.
  return ip.startsWith('127.')
}

function ensureDevUserByName(store, username, email) {
  // BUG FIX C-1: do NOT auto-provision users.  Previously `ensureDevUserByName`
  // created a brand-new user record whenever a dev token name was not found.
  // This meant that a leaked dev token `dev:attacker` would silently register
  // a new account and (if the roles array was later patched) obtain elevated
  // privileges.  Now we only return a pre-existing user and return null
  // instead of creating one.
  return findExistingDevUser(store, username)
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
  if (!store.securityCenter.sessions || typeof store.securityCenter !== 'object') {
    store.securityCenter.sessions = {}
  }
  if (!Array.isArray(store.securityCenter.alerts)) store.securityCenter.alerts = []
  if (!Array.isArray(store.securityCenter.loginEvents)) store.securityCenter.loginEvents = []
  if (!Array.isArray(store.securityCenter.auditLogs)) store.securityCenter.auditLogs = []
  if (!Array.isArray(store.securityCenter.webhookQueue)) store.securityCenter.webhookQueue = []
  if (!store.securityCenter.trustedDevices || typeof store.securityCenter !== 'object') {
    store.securityCenter.trustedDevices = {}
  }
  if (!store.securityCenter.geoCache || typeof store.securityCenter !== 'object') store.securityCenter.geoCache = {}
  if (!store.securityCenter.rules || typeof store.securityCenter !== 'object') {
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
    outcome: String(payload.outcome || 'success').trim().toLowerCase() || 'success',
    failureReason: payload.reason ? String(payload.reason).trim() : null,
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
  invalidateAlertIndex(sc)

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
    replayToken: `replay_${crypto.randomBytes(8).toString('base64url')}`,
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


function roleSetOf(user) {
  return normalizeRoleSet(user)
}

function buildPermissionMatrix(user) {
  return buildCapabilityMatrix(user)
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


function signWebhookPayload(secret, payload) {
  if (!secret) return ''
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
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
    // BUG FIX: was using http:// which exposes the response body (containing
    // the visitor's IP and approximate location) to network attackers via
    // man-in-the-middle. ip-api.com supports HTTPS on its free tier.
    const r = await fetch(`https://ip-api.com/json/${encodeURIComponent(raw)}?lang=zh-CN&fields=status,country,regionName,city,isp,query`, {
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
            const backoffSec = computeBackoffSec(attempts)
            item.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString()
          }
        } catch (err) {
          item.lastError = String(err?.message || err?.code || 'delivery_failed')
          item.status = 'pending'
          const backoffSec = computeBackoffSec(attempts)
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
    const backoffSec = computeBackoffSec(attempts)
    item.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString()
    securityCenterChanged = true
  }
  if (securityCenterChanged) markKvDirty('security_center_state')
}

function catalogItemById(store, id) {
  return store.catalog.find((c) => c.id === id) || null
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

/** 仅匹配已绑定的游戏名；站点昵称 username 不参与解析，避免与进服 ID 混淆 */
function findUserByLinkedMcUsername(store, mcName) {
  const q = String(mcName || '').trim()
  if (!q) return null
  const lower = q.toLowerCase()
  return (
    store.users.find((u) => {
      const link = u.linkedMcUsername != null ? String(u.linkedMcUsername).trim() : ''
      if (link && link.toLowerCase() === lower) return true
      const profiles = Array.isArray(u.minecraftProfiles) ? u.minecraftProfiles : []
      return profiles.some((profile) => String(profile?.username || '').trim().toLowerCase() === lower)
    }) || null
  )
}

/** Match a bound Minecraft profile by UUID without falling back to a username. */
function findUserByLinkedMcUuid(store, mcUuid) {
  const wanted = String(mcUuid || '').trim().replaceAll('-', '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(wanted)) return null
  return store.users.find((user) => {
    const candidates = [user?.linkedMcUuid, user?.activeMinecraftUuid]
    if (Array.isArray(user?.minecraftProfiles)) {
      candidates.push(...user.minecraftProfiles.map((profile) => profile?.uuid))
    }
    return candidates.some((uuid) => String(uuid || '').replaceAll('-', '').toLowerCase() === wanted)
  }) || null
}

/**
 * Creates and configures the main Express API application.
 * All route registrations, middleware, and plugin-app wiring live here.
 */
function createApiApp({ eventBus }) {
  const app = express()

  // BUG FIX C-2: createApiApp was missing CORS configuration, meaning it would
  // accept cross-origin requests from ANY origin (equivalent to `origin: '*'`).
  // This allowed an attacker's malicious page to make authenticated API calls on
  // behalf of logged-in users via browser cookie forwarding.  We now apply the
  // same CORS policy as createPluginApp.  An empty corsOrigins list effectively
  // blocks all cross-origin requests, which is the correct default.
  const mainCorsOrigins =
    config.corsOrigins.length > 0
      ? { origin: config.corsOrigins, credentials: true }
      : { origin: false }
  app.use(cors(mainCorsOrigins))
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(securityHeaderGuard)
  app.use(antiCrawlerGuard)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Middleware
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.use(
    '/uploads',
    uploadsReadLimiter,
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
      // BUG FIX H-9: use timingSafeEqual to avoid leaking the secret length
      // via response time on a mismatch.
      const expected = Buffer.from(config.devAdminSecret || '', 'utf8')
      const provided = Buffer.from(h, 'utf8')
      const match =
        expected.length === provided.length &&
        crypto.timingSafeEqual(expected, provided)
      if (!match) {
        jsonErr(res, 403, '需要管理员密钥', 'forbidden')
        return false
      }
      return true
    }
    if (config.devAdminSecret) {
      const h = String(req.headers['x-admin-secret'] || '').trim()
      const expected = Buffer.from(config.devAdminSecret || '', 'utf8')
      const provided = Buffer.from(h, 'utf8')
      const match =
        expected.length === provided.length &&
        crypto.timingSafeEqual(expected, provided)
      if (!match) {
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

  function requireSuperAdminAccess(req, res) {
    return requireAdminAccess(req, res, {
      roles: ['superadmin'],
      requiredCapability: 'control_circuit_breaker',
      message: '需要超级管理员权限'
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
    eventBus,
    asyncHandler,
    scheduleSave,
    appendLoginEvent,
    completeMcVerifySession,
    failMcVerifySession,
    findUserByExternalUserId,
    findUserByLinkedMcUsername,
    ensureSiteUserForPluginEmail,
    isValidEmailAddress,
    markUserProfileDirty,
    appendSecurityAlert,
    vlaLinkExternalUser,
  })

  app.use(express.json({ limit: '512kb' }))
  app.use(geoBlockMiddleware())
  // Keep the broad flood guard global, but scope the stricter auth guard to auth paths.
  // Mounting authLimiter globally throttles normal catalog/profile traffic after a short burst.
  app.use(globalLimiter)
  app.use('/api/auth', authLimiter)
  app.use('/auth', authLimiter)
  app.post('/api/auth/resolve-identifier', asyncHandler(async (req, res) => {
    const identifier = String(req.body?.identifier || '').trim()
    if (!identifier || identifier.includes('@')) return jsonErr(res, 400, '请输入有效的邮箱或用户名', 'invalid_identifier')

    const user = findUserByUsername(getStore(), identifier)
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email || !isValidEmailAddress(email)) return jsonErr(res, 401, '邮箱或用户名错误', 'invalid_credentials')
    return jsonOk(res, { email })
  }))
  registerGithubOAuthRoutes(app, {
    config,
    asyncHandler,
    getStore,
    ensureSupertokensLocalUser,
    isSuperTokensReady,
    supertokens,
    EmailPassword,
    Session,
    markUserProfileDirty,
    scheduleSave,
  })
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

    if (starxNetworkClient && shouldRefreshStarxNetworkState(starxNetworkState)) {
      try {
        await refreshStarxNetworkStatus()
      } catch {
        // The health payload reports the recorded failure without failing the API itself.
      }
    }

    payload.pluginBridge = {
      adapter: starxNetworkClient ? 'starx' : config.authxPluginAdapter,
      circuitOpen: circuitState.isOpen,
      circuitFailures: circuitState.failures,
      webhookConfigured: isPluginWebhookAuthConfigured(config),
      networkStatusConfigured: Boolean(starxNetworkClient),
      networkStatusLastSuccessAt: starxNetworkState.lastSuccessAt,
      networkStatusLastErrorAt: starxNetworkState.lastErrorAt,
      networkStatusHealthy: starxNetworkState.networkStatusHealthy,
      networkStatus: starxNetworkState.networkStatus,
      networkStatusCounts: starxNetworkState.networkStatusCounts,
    }

    return payload
  }
  app.get('/health', asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await buildHealthPayload())
  }))
  app.get('/api/health', asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await buildHealthPayload())
  }))
  app.get('/api/ready', (_req, res) => {
    const readiness = buildProductionReadiness({
      production: config.isProd,
      supertokensConfigured: Boolean(config.supertokensConnectionUri),
      supertokensReady: isSuperTokensReady(),
    })
    return res.status(readiness.ready ? 200 : 503).json(readiness)
  })
  app.get('/api/browser-recovery', browserRecovery)
  // Compatibility endpoint for legacy dev proxy and health checks.
  app.get('/healthz', (_req, res) => res.status(200).send('ok'))

  // ── 服务器在线统计 API ──────────────────────────────────────
  // 用于前端 StatusView 的在线人数图表
  const playerStatsCache = { data: null, fetchedAt: 0 }
  const PLAYER_STATS_CACHE_MS = 30_000

  app.get('/api/server/player-stats', asyncHandler(async (_req, res) => {
    const now = Date.now()
    if (playerStatsCache.data && now - playerStatsCache.fetchedAt < PLAYER_STATS_CACHE_MS) {
      return res.json(playerStatsCache.data)
    }

    const store = getStore()
    let onlinePlayers = null
    let maxPlayers = null
    let serverList = []
    let metrics = null
    let collectedAt = null
    let source = 'fallback'

    if (starxNetworkClient) {
      try {
        const status = await refreshStarxNetworkStatus()
        onlinePlayers = status.online
        maxPlayers = status.max
        serverList = status.servers
        metrics = status.metrics
        collectedAt = status.collectedAt
        source = 'starx'
      } catch {
        // refreshStarxNetworkStatus records and logs the failure.
      }
    }

    // 尝试从 VLA 插件网关获取实时数据
    if (onlinePlayers === null && config.authxPluginAdapter === 'vla' && config.authxPluginBase && !circuitState.isOpen) {
      try {
        const result = await pluginFetchGet('/v1/server/status')
        if (result.status === 200 && result.json) {
          const data = result.json
          onlinePlayers = data.onlinePlayers ?? data.online ?? null
          maxPlayers = data.maxPlayers ?? data.max ?? null
          serverList = Array.isArray(data.servers) ? data.servers.map((s) => ({
            name: s.name || s.id,
            online: s.onlinePlayers ?? s.online ?? 0,
            max: s.maxPlayers ?? s.max ?? 0,
            status: s.status || 'online',
          })) : []
          source = 'vla'
        }
      } catch {
        // 插件网关不可达，使用回退数据
      }
    }

    // 回退：从 store 中的 playerState 统计活跃玩家数
    if (onlinePlayers === null) {
      const states = store.playerState || {}
      const fiveMinAgo = now - 5 * 60_000
      const hourAgo = now - 60 * 60_000
      const activeRecently = Object.values(states).filter((ps) => {
        const lastSeen = Date.parse(String(ps?.lastSeenAt || ''))
        return Number.isFinite(lastSeen) && lastSeen > fiveMinAgo
      }).length
      const activeHourly = Object.values(states).filter((ps) => {
        const lastSeen = Date.parse(String(ps?.lastSeenAt || ''))
        return Number.isFinite(lastSeen) && lastSeen > hourAgo
      }).length
      onlinePlayers = activeRecently
      maxPlayers = maxPlayers || Math.max(activeHourly, activeRecently, 20)
    }

    // 构建历史统计点 (从登录事件中推断)
    const sc = ensureSecurityCenter(store)
    const dayMs = 24 * 60 * 60_000
    const historyDays = Math.min(30, Math.max(1, Number(_req.query?.days) || 7))
    const history = []
    for (let d = historyDays - 1; d >= 0; d--) {
      const dayStart = now - (d + 1) * dayMs
      const dayEnd = now - d * dayMs
      const dateStr = new Date(dayEnd).toISOString().slice(0, 10)
      const logins = (sc.loginEvents || []).filter((e) => {
        const t = e.tsMs || Date.parse(String(e.createdAt || ''))
        return Number.isFinite(t) && t >= dayStart && t < dayEnd
      })
      const uniquePlayers = new Set(logins.map((e) => e.userId || e.username)).size
      history.push({ date: dateStr, players: uniquePlayers, logins: logins.length })
    }

    const payload = {
      ok: true,
      online: onlinePlayers,
      max: maxPlayers,
      servers: serverList,
      history,
      source,
      metrics,
      collectedAt,
      updatedAt: new Date().toISOString(),
    }

    playerStatsCache.data = payload
    playerStatsCache.fetchedAt = now

    res.json(payload)
  }))

  registerTelemetryRoutes(app, {
    config,
    getStore,
    scheduleSave,
    requireTelemetryAccess,
    maskIpForLog,
    classifyDeviceType,
    pruneTelemetryEvents,
    checkTelemetryRateLimit,
    makeReqLogger,
    crypto,
  })

  const authxOpenApiPath = path.join(__dirname, '../docs/openapi/authx.yaml')
  const frontendOpenApiPath = path.join(__dirname, '../docs/openapi/frontend-public.yaml')
  const mapOpenApiPath = path.join(__dirname, '../docs/openapi/map.yaml')
  const apiContractPath = path.join(__dirname, '../docs/api-contract.md')
  app.get('/api/docs/openapi/authx', (_req, res) => {
    try {
      const yaml = readFileSync(authxOpenApiPath, 'utf8')
      res.type('text/yaml; charset=utf-8').send(yaml)
    } catch {
      return jsonErr(res, 404, 'OpenAPI 文档不存在', 'openapi_not_found')
    }
  })
  app.get('/api/docs/openapi/frontend-public', (_req, res) => {
    try {
      const yaml = readFileSync(frontendOpenApiPath, 'utf8')
      res.type('text/yaml; charset=utf-8').send(yaml)
    } catch {
      return jsonErr(res, 404, 'OpenAPI 文档不存在', 'openapi_not_found')
    }
  })
  app.get('/api/docs/openapi/map', (_req, res) => {
    try {
      const yaml = readFileSync(mapOpenApiPath, 'utf8')
      res.type('text/yaml; charset=utf-8').send(yaml)
    } catch {
      return jsonErr(res, 404, '地图 OpenAPI 文档不存在', 'openapi_not_found')
    }
  })
  app.get('/api/docs/api-contract', (_req, res) => {
    try {
      const markdown = readFileSync(apiContractPath, 'utf8')
      res.type('text/markdown; charset=utf-8').send(markdown)
    } catch {
      return jsonErr(res, 404, 'API 契约文档不存在', 'api_contract_not_found')
    }
  })

  function triggerVlaSkinRefreshIfConfigured(mcUsername, playerUuid = '') {
    if (!config.vlaNotifyOnSkinChange) return Promise.resolve({ status: 'not_configured' })
    const name = String(mcUsername || '').trim()
    const uuid = String(playerUuid || '').trim().replaceAll('-', '').toLowerCase()
    if (!name && !/^[0-9a-f]{32}$/.test(uuid)) return Promise.resolve({ status: 'not_linked' })
    return pluginFetchJson('/api/plugin/authx/admin/skin-refresh', {
      username: name || undefined,
      player_uuid: uuid || undefined,
      reason: 'skin_changed',
    })
      .then(() => ({ status: 'dispatched' }))
      .catch((err) => {
        console.warn(
          '[starmc-api] VLA skin/refresh 通知失败:',
          err && err.message ? err.message : err
        )
        return { status: 'failed' }
      })
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

  async function vlaLinkExternalUser(mcUsername, externalUserId, playerUuid = '', verified = false) {
    const r = await pluginFetchJson('/internal/v1/link/external-user', {
      username: mcUsername,
      external_user_id: externalUserId,
      player_uuid: playerUuid,
      verified: verified === true
    })
    const ok =
      r.status === 200 &&
      r.json &&
      (r.json.ok === true || r.json.ok === undefined)
    return { ok, status: r.status, json: r.json }
  }

  async function resolveGameBindingCode(code) {
    const response = await pluginFetchJson('/v1/admin/bindings/resolve-code', { code })
    const identity = response.json || {}
    return {
      ok: response.status === 200 && identity.ok === true,
      status: response.status,
      playerUuid: identity.playerUuid || null,
      username: identity.username || null,
      error: identity.error || null,
    }
  }

  function buildPublicBootstrapContext() {
    return {
      config,
      store: getStore(),
      circuitState,
      summarizeSubmissionStats,
      isPluginWebhookAuthConfigured,
      isSuperTokensReady,
      isSmtpConfigured: () => isSmtpConfigured(process.env, {
        production: config.isProd,
      }),
    }
  }

  app.get('/api/public/site-features', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(buildPublicSiteFeatures(buildPublicBootstrapContext()))
  })

  app.get('/api/public/bootstrap', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(buildPublicBootstrap(buildPublicBootstrapContext()))
  })

  registerMcGamePasswordRoutes(app, {
    mcGamePasswordRequestLimiter,
    mcGamePasswordConfirmLimiter,
    asyncHandler,
    getStore,
    config,
    crypto,
    jsonErrWithRequest,
    jsonOkWithRequest,
    createMcGamePasswordChallenge,
    confirmMcGamePasswordReset,
    pluginFetchJson,
    pushMcResetEvent,
  })

  // ============================================================
  // 验证码登录/注册 API
  // ============================================================

  registerVerifyCodeRoutes(app, {
    verifyCodeSendLimiter,
    verifyCodeConfirmLimiter,
    asyncHandler,
    getStore,
    crypto,
    jsonErr,
    jsonErrWithRequest,
    jsonOkWithRequest,
    sendVerifyCode,
    confirmVerifyCodeLogin,
    isSuperTokensReady,
    supertokens,
    EmailPassword,
    Session,
    findUsersByEmail: (email) => supertokens.listUsersByAccountInfo('public', { email }),
    ensureLocalUser: (user, options) => ensureSupertokensLocalUser(getStore(), user, options),
    sendVerificationEmail: createVerificationCodeSender(process.env, { production: config.isProd }),
  })

  registerLegacyAccountSetupRoutes(app, {
    requireUser,
    getStore,
    getSupertokensUser: (userId) => supertokens.getUser(userId),
    emailPassword: EmailPassword,
    jsonOk,
    jsonErr,
    scheduleSave,
    markUserProfileDirty,
    asyncHandler,
  })

  let pluginHealthCache = { at: 0, result: null }
  const PLUGIN_HEALTH_CACHE_MS = 5000

  async function pluginFetchHealthUncached() {
    const base = resolvePluginApiBase(config)
    if (!base) return { reachable: false, status: 0, error: 'plugin_base_missing', path: null }
    const configuredPaths = config.authxPluginHealthPaths.length > 0
      ? config.authxPluginHealthPaths
      : ['/healthz', '/v1/health']
    const paths = config.authxPluginAdapter === 'starx'
      ? [...new Set(['/v1/health', ...configuredPaths])]
      : configuredPaths
    let last = /** @type {Record<string, unknown>} */ ({})
    for (const raw of paths) {
      const pathSuffix = raw.startsWith('/') ? raw : `/${raw}`
      const url = `${base}${pathSuffix}`
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), config.authxPluginRequestMs)
      try {
        const headers = {}
        const apiKey = resolvePluginApiKey(config)
        if (apiKey) headers['X-API-Key'] = apiKey
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

  async function pluginFetchHealth() {
    const now = Date.now()
    if (pluginHealthCache.result && now - pluginHealthCache.at < PLUGIN_HEALTH_CACHE_MS) {
      return pluginHealthCache.result
    }
    const result = await pluginFetchHealthUncached()
    pluginHealthCache = { at: now, result }
    return result
  }

  /**
   * @param {Record<string, string | number | undefined>} [queryObj] - 查询参数（会 URL 编码）
   * @returns {{ status: number, text: string, json?: unknown }}
   */
  async function pluginFetchGet(pathSuffix, queryObj) {
    const base = resolvePluginApiBase(config)
    const apiKey = resolvePluginApiKey(config)
    const mapped = mapPluginGetRequest(pathSuffix, queryObj)
    let suffix = mapped.path
    queryObj = mapped.query
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
      if (apiKey) {
        headers['X-API-Key'] = apiKey
      }
      if (!apiKey && config.authxPluginAdapter !== 'vla' && config.authxAdminSecret) {
        warnAuthxAdapterDeprecated()
        headers['X-AuthX-Admin-Secret'] = config.authxAdminSecret
      }
      const r = await fetch(url, { method: 'GET', signal: ctrl.signal, headers })
      let text = await r.text()
      if (text.length > MAX_PLUGIN_BODY_SIZE) {
        text = text.slice(0, MAX_PLUGIN_BODY_SIZE)
      }
      let json
      const ct = (r.headers.get('content-type') || '').toLowerCase()
      const ttrim = text.trim()
      if (ttrim && ct.includes('application/json')) {
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

  app.get('/api/auth/status', optionalSessionUser, asyncHandler(async (req, res) => {
    if (!isSuperTokensReady()) {
      if (!config.isProd) {
        return res.json({
          ok: true,
          supertokens: false,
          coreReachable: false,
          devAuthFallback: true,
          authenticated: Boolean(req.user),
          message: '开发模式：SuperTokens 未就绪，已启用 dev bearer 登录兜底（Authorization: Bearer dev:<username>）'
        })
      }
      return res.json({
        ok: false,
        supertokens: false,
        coreReachable: false,
        authenticated: false,
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
      authenticated: Boolean(req.user),
      apiBasePath: config.supertokensApiBasePath,
      smtpConfigured: isSmtpConfigured(process.env, {
        production: config.isProd,
      })
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
    // BUG FIX RUNTIME-2: pass args in the documented order
    // (res, items, total, pageInfo, extra?).  See the regression test.
    return jsonPage(res, items, events.length, pagination)
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
    // BUG FIX RUNTIME-2: same pagination fix as the authx events route above.
    return jsonPage(res, items, list.length, pagination)
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
    requireUser,
    requireDevAdmin: requireAuthxAdminAccess,
    requireSuperAdmin: requireSuperAdminAccess,
    pluginFetchHealth,
    pluginFetchGet,
    pluginFetchJson,
    reconfigureStarxNetworkClient,
    getStore,
    config,
    adminPluginGetLimiter,
    jsonErr,
    jsonOk,
    eventBus,
    circuitBreakerStatus: circuitState,
    persistCircuitBreaker: persistCircuitState,
    pluginFetchCounters,
    eventHandlerFailures,
    scheduleSave,
    markKvDirty,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || 'admin', action, detail),
  })

  registerDashboardRoutes(app, {
    requireUser,
    hasRole,
    getStore,
    jsonErr,
    scheduleSave,
    markKvDirty,
    crypto,
  })

  registerUserRoutes(app, {
    requireUser,
    getStore,
    jsonErr,
    jsonOk,
    scheduleSave,
    markUserProfileDirty,
    publicUser,
    buildUserCenterSummary,
    buildPermissionMatrix,
    ensureUserNotificationsStore,
    resolvePaginationQuery,
    jsonPage,
    avatarUpload,
    uploadsDir: UPLOAD_DIR,
  })

  registerRoleAdminRoutes(app, {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    markUserProfileDirty,
    scheduleSave,
    appendSecurityAudit,
    publicUser,
    asyncHandler,
    createCredentialUser: (email, password) => EmailPassword.signUp('public', email, password),
    ensureLocalUser: (user, options) => ensureSupertokensLocalUser(getStore(), user, options),
    deleteCredentialUser: (userId) => supertokens.deleteUser(userId),
    sessionCore,
    avatarUpload,
    uploadsDir: UPLOAD_DIR,
  })

  registerAdminSupportRoutes(app, {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    pushUserNotification,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || 'admin', action, detail),
  })

  // ── GET /api/user/creator-follows — 获取关注的创作者列表 ──
  app.get('/api/user/creator-follows', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    const follows = Array.isArray(u.follows) ? u.follows : []
    jsonOk(res, follows)
  })

  // ── POST /api/user/creator-follows — 关注/取关创作者 ──
  app.post('/api/user/creator-follows', requireUser, (req, res) => {
    const creator = String(req.body?.creator || '').trim()
    if (!creator) return jsonErr(res, 400, '缺少 creator', 'validation_error', { field: 'creator' })
    if (creator.length > 64) return jsonErr(res, 400, 'creator 名称过长', 'validation_error', { field: 'creator' })

    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    if (!Array.isArray(u.follows)) u.follows = []

    const idx = u.follows.indexOf(creator)
    const following = idx === -1
    if (following) {
      u.follows.push(creator)
    } else {
      u.follows.splice(idx, 1)
    }
    markUserProfileDirty(u.id)
    scheduleSave()
    jsonOk(res, { creator, following, follows: u.follows })
  })

  // ── GET /api/user/creator-feed — 获取关注创作者的动态 ──
  app.get('/api/user/creator-feed', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    const follows = Array.isArray(u.follows) ? u.follows : []
    if (follows.length === 0) return jsonOk(res, [])

    const followSet = new Set(follows.map((f) => f.toLowerCase()))
    const catalog = Array.isArray(store.catalog) ? store.catalog : []
    const feed = catalog
      .filter((item) => {
        const creator = String(item.creator || '').trim().toLowerCase()
        return creator && followSet.has(creator)
      })
      .sort((a, b) => {
        const ta = Date.parse(String(a.createdAt || '')) || 0
        const tb = Date.parse(String(b.createdAt || '')) || 0
        return tb - ta
      })
      .slice(0, 50)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type || 'steve',
        creator: item.creator || 'Unknown',
        createdAt: item.createdAt || null,
        textureUrl: item.textureUrl || null,
      }))
    jsonOk(res, feed)
  })

  // ── POST /api/admin/users/reward — 管理员给用户发放奖励 ──
  app.post('/api/admin/users/reward', requireUser, (req, res) => {
    if (!requireAdmin(req, res)) return

    const userId = String(req.body?.userId || '').trim()
    const amount = Number(req.body?.amount)
    if (!userId) return jsonErr(res, 400, '缺少 userId', 'validation_error', { field: 'userId' })
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonErr(res, 400, 'amount 必须为正数', 'validation_error', { field: 'amount' })
    }

    const store = getStore()
    const targetUser = store.users.find((x) => x.id === userId)
    if (!targetUser) return jsonErr(res, 404, '目标用户不存在', 'not_found')

    // 记录奖励
    if (!Array.isArray(store.rewardLogs)) store.rewardLogs = []
    const rewardEntry = {
      id: crypto.randomUUID(),
      userId,
      amount,
      operatorId: req.user.id,
      operatorName: req.user.username,
      createdAt: new Date().toISOString(),
    }
    store.rewardLogs.unshift(rewardEntry)
    if (store.rewardLogs.length > 2000) store.rewardLogs.length = 2000

    // 推送通知给目标用户
    pushUserNotification(store, userId, {
      type: 'reward',
      title: '收到奖励',
      message: `管理员 ${req.user.username} 向你发放了 ${amount} 奖励`,
      detail: { amount, operatorId: req.user.id },
    })

    scheduleSave()
    jsonOk(res, { reward: rewardEntry })
  })

  registerOpsRoutes(app, {
    requireUser,
    requireOpsTaskAccess,
    requireAuditLogAccess,
    getStore,
    jsonErr,
    scheduleSave,
    ensureAsyncTasksStore,
    appendAsyncTask,
    updateAsyncTask,
    ensureDeadLetterQueue,
    ensureSecurityCenter,
    parseTimeMs,
    markKvDirty,
    createRetryOpsTaskHandler,
    createRetryDeadLetterHandler,
    crypto,
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
    appendSecurityAlert,
    sessionCore,
    maskIpForLog
  })

  registerMinecraftRoutes(app, {
    requireUser,
    requireAdmin,
    requireVerifiedEmail,
    asyncHandler,
    getStore,
    config,
    jsonErr,
    jsonPage,
    scheduleSave,
    markUserProfileDirty,
    markPlayerStateDirty,
    appendSecurityAudit,
    pushUserNotification,
    ensureSecurityCenter,
    ensurePlayerState,
    verifyTotpToken,
    normalizeShortText,
    parseTimeMs,
    vlaLinkExternalUser,
    resolveGameBindingCode,
    validateInviteForMcLink,
    claimInviteForUser,
    persistMojangSkinSync,
    buildMcBindingHistoryItemFromAudit,
    MC_BINDING_AUDIT_ACTIONS,
    verifyStatusLabel,
    getMcVerifySession,
    getMcVerifySessionHistory,
    createMcVerifySession,
    clearMcVerifySession,
    starxNetworkClient,
    getStarxNetworkClient: () => starxNetworkClient,
  })

  registerTotpRoutes(app, {
    requireUser,
    getStore,
    jsonErr,
    scheduleSave,
    markUserProfileDirty,
    appendSecurityAudit,
    pushUserNotification,
    generateTotpSecret,
    totpKeyUri,
    verifyTotpToken,
    makeRecoveryCodes,
    asyncHandler,
  })

  app.get('/api/user/data-export', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
    res.json(buildUserDataExport({
      store,
      userId: req.user.id,
      profile: publicUser(u),
      playerState: ensurePlayerState(store, req.user.id),
      securityCenter: ensureSecurityCenter(store),
    }))
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
    const name = String(req.user.linkedMcUsername || '').trim()
    if (!name) {
      return jsonErr(res, 400, '请先绑定游戏角色', 'not_linked')
    }
    const r = await pluginFetchGet('/v1/user/overview', { name })
    return respondPluginGetResult(res, r)
    })
  )

  app.get(
    '/api/user/mc-security-events',
    mcUserReadLimiter,
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
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
      roles: ['moderator', 'reviewer', 'admin'],
      message: '仅 moderator/reviewer/admin 可执行审核操作',
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
    requireAdmin,
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

  registerTextureRoutes(app, {
    requireUser,
    textureUpload,
    asyncHandler,
    getStore,
    jsonOk,
    jsonErr,
    uploadsDir: UPLOAD_DIR,
    reviewEnabled: Boolean(config.reviewEntryEnabled),
    markPlayerStateDirty,
    markSubmissionDirty,
    scheduleSave,
    ensurePlayerState,
    triggerVlaSkinRefreshIfConfigured,
  })

  registerSiteConfigRoutes(app, {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    markKvDirty,
    asyncHandler,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || 'admin', action, detail),
  })

  registerWikiRoutes(app, {
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || 'admin', action, detail),
  })

  registerPluginEnrollmentRoutes(app, {
    config,
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    markKvDirty,
    asyncHandler,
    uploadsDir: UPLOAD_DIR,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || 'plugin', action, detail),
  })
  registerPaymentRoutes(app, {
    config,
    requireUser,
    requireAdmin,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || "admin", action, detail),
  })

  registerSkinConsentRoutes(app, {
    requireUser,
    getStore,
    jsonOk,
    jsonErr,
    scheduleSave,
    appendAuditLog: (action, detail, req) => appendSecurityAudit(getStore(), req.user?.id || 'user', action, detail),
  })

  registerSkinAdminRoutes(app, {
    importGithubSkin,
    requireUser,
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

  registerCapeRoutes(app, {
    jsonOk,
    jsonErr,
    getStore,
    requireUser,
    asyncHandler,
    scheduleSave,
    ensurePlayerState,
    markPlayerStateDirty,
  })

  registerQqRoutes(app, {
    jsonErr,
    jsonOk,
    getStore,
    requireUser,
    asyncHandler,
    scheduleSave,
    config,
  })

  registerShoutboxRoutes(app, {
    requireUser,
    jsonOk,
    jsonErr,
    getStore,
    scheduleSave,
    asyncHandler,
    crypto,
  })

  registerMapRoutes(app, {
    requireUser,
    jsonOk,
    jsonErr,
    getStore,
    scheduleSave,
    asyncHandler,
    crypto,
  })

  registerMapHealthRoutes(app, { config, jsonErr })

  registerPublicSkinProfileRoutes(app, {
    config,
    jsonErr,
    getStore,
    asyncHandler,
    skinProfilePublicLimiter,
    findUserByLinkedMcUsername,
    findUserByLinkedMcUuid,
    ensurePlayerState,
    catalogItemById,
  })

  registerSkinRefreshRoutes(app, { config, jsonErr, eventBus })

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
    // BUG FIX C-4: previously the route only checked DEV_ADMIN_SECRET when
    // config.isProd was true, leaving the endpoint completely unauthenticated
    // in development / staging.  Any caller could approve any submission by
    // simply setting ALLOW_DEV_APPROVE=1 (a common misconfiguration for CI).
    // We now require the secret in EVERY environment.  We also add loopback
    // IP restriction as defence-in-depth.
    if (!config.devAdminSecret) {
      console.warn(
        '[starmc-api] ALLOW_DEV_APPROVE=1 但未配置 DEV_ADMIN_SECRET，dev 审核路由未启用'
      )
    } else if (config.isProd) {
      // BUG FIX C-4 (second pass): the previous version referenced `req` here,
      // but `req` is only defined inside the route handler closure, so the
      // `isLoopbackRequest({ ip: req?.ip })` always saw `ip=undefined` and
      // silently disabled the loopback check in non-prod.  In production
      // the loopback check is meaningless (the secret itself is the gate),
      // so we simply skip it.
      app.post('/api/dev/submissions/:id/approve', (req, res) => {
        const h = (req.headers['x-admin-secret'] || '').trim()
        // Use timing-safe comparison to prevent timing attacks (H-4).
        const secretBuf = Buffer.from(config.devAdminSecret || '')
        const headerBuf = Buffer.from(h)
        const match =
          secretBuf.length === headerBuf.length &&
          crypto.timingSafeEqual(secretBuf, headerBuf)
        if (!match) {
          return jsonErr(res, 403, '需要管理员密钥', 'forbidden')
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
    } else {
      // Non-prod: only register the route for loopback callers.  Use
      // ipAllowlistMiddleware as the per-request check.
      app.post('/api/dev/submissions/:id/approve', (req, res, next) => {
        if (!isLoopbackRequest(req)) {
          return jsonErr(res, 403, 'dev approve 仅允许 loopback 来源', 'forbidden_ip')
        }
        next()
      }, (req, res) => {
        const h = (req.headers['x-admin-secret'] || '').trim()
        // Use timing-safe comparison to prevent timing attacks (H-4).
        const secretBuf = Buffer.from(config.devAdminSecret || '')
        const headerBuf = Buffer.from(h)
        const match =
          secretBuf.length === headerBuf.length &&
          crypto.timingSafeEqual(secretBuf, headerBuf)
        if (!match) {
          return jsonErr(res, 403, '需要管理员密钥', 'forbidden')
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

function createPluginApp({ eventBus }) {
  const app = express()
  const corsOpts =
    config.corsOrigins.length > 0
      ? { origin: config.corsOrigins, credentials: true }
      : { origin: false }
  app.use(cors(corsOpts))
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '256kb' }))

  app.get('/healthz', (_req, res) => res.status(200).send('ok'))

  registerSkinRefreshRoutes(app, { config, jsonErr, eventBus })

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
    (async () => {
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
      if (st.circuitState && typeof st.circuitState === 'object') {
        circuitState.failures = Math.max(0, Number(st.circuitState.failures || 0))
        circuitState.isOpen = Boolean(st.circuitState.isOpen)
        circuitState.halfOpenAfter = Number(st.circuitState.halfOpenAfter || 0)
        console.log(`[starmc-api] 已恢复断路器状态: failures=${circuitState.failures} isOpen=${circuitState.isOpen}`)
      }
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

  const textureMigration = await migrateStoredTextureAssets({ store: getStore(), uploadsDir: UPLOAD_DIR })
  if (textureMigration.migrated || textureMigration.failed) {
    console.log(`[starmc-api] 纹理迁移: scanned=${textureMigration.scanned} migrated=${textureMigration.migrated} skipped=${textureMigration.skipped} failed=${textureMigration.failed}`)
    for (const userId of Object.keys(getStore().playerState || {})) markPlayerStateDirty(userId)
    scheduleSave()
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

  if (config.supertokensConnectionUri) {
    initSuperTokens()
    await probeSuperTokensCore()
    console.log(`[starmc-api] SuperTokens Core reachable=${isSuperTokensCoreReachable()}`)
  }

  const eventBusLogger = {
    info: (...args) => console.info('[event-bus]', ...args),
    warn: (...args) => console.warn('[event-bus]', ...args),
    error: (...args) => console.error('[event-bus]', ...args),
  }
  const eventBus = new EventBus(eventBusLogger)

  registerEventBusSubscribers(eventBus, {
    pluginFetchJson,
    failMcVerifySession,
    completeMcVerifySession,
    appendLoginEvent,
    findUserByExternalUserId,
    computeLoginRisk,
    ensureSecurityCenter,
    markUserProfileDirty,
    scheduleSave,
    markKvDirty,
    isValidEmailAddress,
    findUserByLinkedMcUsername,
    ensureSiteUserForPluginEmail,
    appendSecurityAudit,
    appendSecurityAlert,
    pushUserNotification,
    logger: eventBusLogger,
  })

  const api = createApiApp({ eventBus })
  const serverApi = api.listen(config.apiPort, () => {
    console.log(`[starmc-api] API  http://127.0.0.1:${config.apiPort}`)
    console.log(`[starmc-api] 健康检查 GET http://127.0.0.1:${config.apiPort}/api/health`)
  })
  serverApi.on('error', (err) => {
    console.error(`[starmc-api] API 端口 ${config.apiPort} 不可用:`, err.message)
    process.exit(1)
  })

  const plugin = createPluginApp({ eventBus })
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

  let pluginBridgePollRunning = false
  let pluginBridgeLastPollAt = 0
  const pluginBridgePollTimer = setInterval(() => {
    const intervalMs = Math.min(300_000, Math.max(5_000, Number(config.pluginBridgePollIntervalMs) || 15_000))
    const now = Date.now()
    if (config.pluginBridgePollingEnabled === false
      || !starxNetworkClient
      || pluginBridgePollRunning
      || now - pluginBridgeLastPollAt < intervalMs) return
    pluginBridgeLastPollAt = now
    pluginBridgePollRunning = true
    refreshStarxNetworkStatus()
      .catch(() => {})
      .finally(() => { pluginBridgePollRunning = false })
  }, 1000)
  if (typeof pluginBridgePollTimer.unref === 'function') pluginBridgePollTimer.unref()

  if (config.storeBackupEnabled) {
    console.log(
      `[starmc-api] store 定时备份已启用：每 ${config.storeBackupIntervalMinutes} 分钟，保留 ${config.storeBackupKeep} 份 → ${config.dataDir}${path.sep}backups`
    )
  }

  gracefulShutdown(serverApi, serverPlugin, stopStoreBackup, () => {
    clearInterval(webhookTimer)
    clearInterval(pluginBridgePollTimer)
  })
}

process.on('unhandledRejection', (reason) => {
  console.error('[starmc-api] 未处理的 Promise 拒绝:', reason)
})

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
