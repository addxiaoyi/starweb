import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function envBool(key, fallback = false) {
  const raw = String(process.env[key] ?? '').trim().toLowerCase()
  if (!raw) return fallback
  if (/^(0|false|no|off)$/.test(raw)) return false
  if (/^(1|true|yes|on|enabled)$/.test(raw)) return true
  return fallback
}

function envInt(key, fallback) {
  const n = Number(process.env[key])
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function splitList(raw) {
  return String(raw || '')
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const profile = String(process.env.STARMC_PROFILE || process.env.NODE_ENV || 'development')
  .trim()
  .toLowerCase()
const isProd = profile === 'production' || process.env.NODE_ENV === 'production'
const skipPg = envBool('SKIP_PG', false)
const corsOrigins = splitList(process.env.CORS_ORIGIN)
const webhookSecrets = splitList(process.env.AUTHX_VLA_WEBHOOK_SECRETS)
if (!webhookSecrets.length && process.env.AUTHX_VLA_WEBHOOK_SECRET) {
  webhookSecrets.push(String(process.env.AUTHX_VLA_WEBHOOK_SECRET).trim())
}
if (isProd && skipPg) throw new Error('SKIP_PG cannot be enabled in production')

export const config = {
  profile,
  isProd,
  apiPort: envInt('PORT', 8787),
  pluginPort: envInt('PLUGIN_PORT', 8788),
  dataDir: path.resolve(__dirname, '..', 'data'),
  trustProxy: envBool('TRUST_PROXY', isProd),
  corsOrigins,
  publicSiteOrigin: String(process.env.PUBLIC_SITE_ORIGIN || '').trim() || null,
  publicApiBaseUrl: String(process.env.PUBLIC_API_BASE_URL || '').trim() || null,
  alipayAppId: String(process.env.ALIPAY_APP_ID || '').trim() || null,
  alipayPrivateKey: String(process.env.ALIPAY_PRIVATE_KEY || '').trim() || null,
  alipayPublicKey: String(process.env.ALIPAY_PUBLIC_KEY || '').trim() || null,
  paymentReturnUrl: String(process.env.PAYMENT_RETURN_URL || '').trim() || null,
  paymentNotifyUrl: String(process.env.PAYMENT_NOTIFY_URL || '').trim() || null,
  databaseUrl: skipPg ? null : String(process.env.DATABASE_URL || '').trim() || null,
  skipPg,
  pgMigrateOnStart: envBool('PG_MIGRATE_ON_START', true),
  pgKvSyncOnStart: envBool('PG_KV_SYNC_ON_START', false),
  healthPgStats: envBool('HEALTH_PG_STATS', true),
  supertokensConnectionUri: String(process.env.SUPERTOKENS_CONNECTION_URI || '').trim(),
  supertokensAppName: String(process.env.SUPERTOKENS_APP_NAME || 'StarMC').trim(),
  supertokensApiBasePath: String(process.env.AUTH_API_BASE_PATH || '/auth').trim() || '/auth',
  supertokensWebsiteBasePath: String(process.env.AUTH_WEBSITE_BASE_PATH || '/auth').trim() || '/auth',
  authApiDomain: String(process.env.AUTH_API_DOMAIN || process.env.PUBLIC_SITE_ORIGIN || '').trim(),
  authWebsiteDomain: String(process.env.AUTH_WEBSITE_DOMAIN || process.env.PUBLIC_SITE_ORIGIN || '').trim(),
  oauthGithubClientId: String(process.env.OAUTH_GITHUB_CLIENT_ID || '').trim(),
  oauthGithubClientSecret: String(process.env.OAUTH_GITHUB_CLIENT_SECRET || '').trim(),
  oauthGithubRedirectUri: String(process.env.OAUTH_GITHUB_REDIRECT_URI || '').trim(),
  oauthStateSecret: String(process.env.OAUTH_STATE_SECRET || '').trim(),
  oauthGithubEdgeIps: splitList(process.env.OAUTH_GITHUB_EDGE_IPS),
  oauthGithubAdminEmails: splitList(process.env.OAUTH_GITHUB_ADMIN_EMAILS).map((email) => email.toLowerCase()),
  sessionRefreshDays: envInt('SESSION_REFRESH_DAYS', 30),
  devAdminSecret: String(process.env.DEV_ADMIN_SECRET || '').trim(),
  pluginRefreshSecret: String(process.env.PLUGIN_REFRESH_SECRET || '').trim(),
  adminAllowedIps: splitList(process.env.ADMIN_ALLOWED_IPS),
  authxPluginAdapter: String(process.env.AUTHX_PLUGIN_ADAPTER || 'vla').trim().toLowerCase(),
  authxPluginBase: String(process.env.AUTHX_PLUGIN_BASE || 'http://127.0.0.1:8090').trim(),
  authxPluginRequestMs: envInt('AUTHX_PLUGIN_REQUEST_MS', 8000),
  authxPluginHealthPaths: splitList(process.env.AUTHX_PLUGIN_HEALTH_PATHS || '/health,/healthz,/api/health'),
  authxVlaApiKey: String(process.env.AUTHX_VLA_API_KEY || '').trim(),
  authxVlaHmacSecret: String(process.env.AUTHX_VLA_HMAC_SECRET || '').trim(),
  authxVlaWebhookSecrets: webhookSecrets,
  starxNetworkApiBase: String(process.env.STARX_NETWORK_API_BASE || '').trim(),
  starxNetworkApiKey: String(process.env.STARX_NETWORK_API_KEY || '').trim(),
  starxNetworkApiTimeoutMs: envInt('STARX_NETWORK_API_TIMEOUT_MS', 5000),
  pluginBridgeSecretKey: String(process.env.PLUGIN_BRIDGE_SECRET_KEY || '').trim(),
  pluginBridgePollingEnabled: envBool('PLUGIN_BRIDGE_POLLING_ENABLED', true),
  pluginBridgePollIntervalMs: envInt('PLUGIN_BRIDGE_POLL_INTERVAL_MS', 15_000),
  authxAdminSecret: String(process.env.AUTHX_ADMIN_SECRET || '').trim(),
  authxCallbackSecret: String(process.env.AUTHX_CALLBACK_SECRET || '').trim(),
  reviewEntryEnabled: envBool('REVIEW_ENTRY_ENABLED', false),
  inviteCodesRequiredForMcLink: envBool('INVITE_CODES_REQUIRED_FOR_MC_LINK', false),
  inviteCodes: splitList(process.env.INVITE_CODES),
  requireTotpForMcLink: envBool('REQUIRE_TOTP_FOR_MC_LINK', false),
  mcGamePasswordResetEnabled: envBool('MC_GAME_PASSWORD_RESET_ENABLED', true),
  mojangSkinSyncEnabled: envBool('MOJANG_SKIN_SYNC_ENABLED', true),
  telemetryEnabled: envBool('TELEMETRY_ENABLED', true),
  telemetryRetentionDays: envInt('TELEMETRY_RETENTION_DAYS', 14),
  telemetryRateLimitPerMinute: envInt('TELEMETRY_RATE_LIMIT_PER_MINUTE', 600),
  skinBridgePublicProfile: envBool('SKIN_BRIDGE_PUBLIC_PROFILE', true),
  vlaNotifyOnSkinChange: envBool('VLA_NOTIFY_ON_SKIN_CHANGE', true),
  geoBlockedCountries: splitList(process.env.GEO_BLOCKED_COUNTRIES).map((c) => c.toUpperCase()),
  geoipEnabled: envBool('GEOIP_ENABLED', false),
  geoipMinIntervalMs: envInt('GEOIP_MIN_INTERVAL_MS', 250),
  geoipCacheTtlSec: envInt('GEOIP_CACHE_TTL_SEC', 86400),
  requireEmailVerifiedForSkinActions: envBool('REQUIRE_EMAIL_VERIFIED_FOR_SKIN_ACTIONS', false),
  maxPasswordLength: envInt('MAX_PASSWORD_LENGTH', 72),
  storeBackupEnabled: envBool('STORE_BACKUP_ENABLED', true),
  storeBackupIntervalMinutes: envInt('STORE_BACKUP_INTERVAL_MINUTES', 30),
  storeBackupKeep: envInt('STORE_BACKUP_KEEP', 48),
  webhookOutboundUrl: String(process.env.WEBHOOK_OUTBOUND_URL || '').trim(),
  rateLimitGlobal: envInt('RATE_LIMIT_GLOBAL', 600),
  rateLimitAuth: envInt('RATE_LIMIT_AUTH', 120),
  rateLimitMcUser: envInt('RATE_LIMIT_MC_USER', 60),
  rateLimitAdminPluginGet: envInt('RATE_LIMIT_ADMIN_PLUGIN_GET', 120),
  pluginEnrollmentAllowPrivate: envBool('PLUGIN_ENROLLMENT_ALLOW_PRIVATE', false),
}

export default config
