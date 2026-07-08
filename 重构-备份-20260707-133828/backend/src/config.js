/**
 * 网站 API 运行时配置（从环境变量读取）。
 *
 * 【怎么改配置】
 *   1. 本地 simple flow：优先由根配置生成 `backend/.env.generated`，使用 `npm run dev:simple` / `npm run start:simple`。
 *   2. 手工覆盖 / 生产兼容：再维护 `backend/.env`，并使用 overlay 脚本（`npm run dev` / `npm run start`）。
 *   3. 本文 `config` 对象在进程启动时求值一次；改 `.env.generated` / `.env` 后都需重启 API 进程。
 *
 * 【教学文档】每个环境变量的含义、示例与注意事项以 `backend/.env.example` 中的中文注释为准；
 * 此处仅作默认值与类型解析，避免与 .env.example 重复长篇说明。
 *
 * 【相关链接】Node 环境文件：https://nodejs.org/docs/latest/api/cli.html#--env-filefile
 *  SuperTokens：https://supertokens.com/docs
 */
import path from 'path'
import { fileURLToPath } from 'url'

const __configDir = path.dirname(fileURLToPath(import.meta.url))

const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase()
const isProd = nodeEnv === 'production'

const DEV_CORS_DEFAULT =
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'

function parseList(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseOrigins() {
  const raw = process.env.CORS_ORIGIN || (isProd ? '' : DEV_CORS_DEFAULT)
  return parseList(raw)
}

function parsePort(val, fallback) {
  const n = Number(String(val ?? '').trim())
  if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback
  return Math.floor(n)
}

/**
 * VLA outbound-webhooks 验签：多条密钥（换行或 | 分隔），与插件各 endpoint secret 对应。
 * 若密钥本身含字符 `|`，请仅用换行分隔（不要用单行 | 语法）。
 */
function parseVlaWebhookSecrets() {
  const multi = String(process.env.AUTHX_VLA_WEBHOOK_SECRETS || '').trim()
  if (multi) {
    return multi
      .split(/\r?\n/)
      .flatMap((line) =>
        line
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
      )
  }
  const one = (process.env.AUTHX_VLA_WEBHOOK_SECRET || '').trim()
  return one ? [one] : []
}

/** 未设置时返回 defaultWhenEmpty；无法识别的非空字符串也回退为 defaultWhenEmpty */
function envTruthy(val, defaultWhenEmpty) {
  const s = String(val ?? '').trim().toLowerCase()
  if (!s) return defaultWhenEmpty
  if (/^(0|false|no|off)$/.test(s)) return false
  if (/^(1|true|yes|on|enabled)$/.test(s)) return true
  return defaultWhenEmpty
}

export const config = {
  isProd,
  apiPort: parsePort(process.env.PORT, 8787),
  pluginPort: parsePort(process.env.PLUGIN_PORT, 8788),
  corsOrigins: parseOrigins(),
  // P3-C2: trustProxy — 后端在 Nginx/CDN 代理后面时必须设为 true，
  //         否则 req.ip 为内网 IP，IP 维度频率限制失效。
  //         错误设为 true（实际无代理）则攻击者可伪造 X-Forwarded-For 绕过限制。
  trustProxy: envTruthy(process.env.TRUST_PROXY, false),

  /**
   * 网站业务数据目录：`store.json`、用户上传 `uploads/`、轮转备份 `backups/`。
   * 相对路径按进程 cwd 解析；未设置时默认为 `backend/data`（与源码目录相对固定）。
   */
  dataDir: (() => {
    const raw = String(process.env.DATA_DIR || '').trim()
    if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
    return path.join(__configDir, '..', 'data')
  })(),

  /**
   * true：按间隔将 `store.json` 复制到 `data/backups/` 并裁剪旧文件。
   * 默认生产环境开启、开发关闭（可用 STORE_BACKUP_ENABLED 覆盖）。
   */
  storeBackupEnabled: envTruthy(process.env.STORE_BACKUP_ENABLED, isProd),
  /** 备份间隔（分钟），范围 5–1440；无效值时按 60 */
  storeBackupIntervalMinutes: Math.min(
    1440,
    Math.max(5, Number(process.env.STORE_BACKUP_INTERVAL_MINUTES) || 60)
  ),
  /** 最多保留多少个备份文件（仅统计 backups/store-*.json） */
  storeBackupKeep: Math.min(500, Math.max(2, Number(process.env.STORE_BACKUP_KEEP) || 48)),

  /**
   * true：`/api/health` 的 `persist` 字段附带 `dataDir`、`storePath`（运维友好，监控慎用）。
   */
  healthPersistDetail: envTruthy(process.env.HEALTH_PERSIST_DETAIL, !isProd),

  /**
   * PostgreSQL 连接串（网站业务扩展，Phase 1：`site_player_state` JSONB）。
   * 未设置时仅使用 store.json，行为与旧版一致。
   */
  databaseUrl: String(process.env.DATABASE_URL || '').trim(),

  /** 进程启动时是否自动执行未完成迁移（需 DATABASE_URL） */
  pgMigrateOnStart: envTruthy(process.env.PG_MIGRATE_ON_START, true),

  /**
   * hydrate 后是否将 site_store_kv（邀请码、插件回调日志、大厅目录、改密挑战）全部标脏并同步到 PG。
   * 设为 0 可避免每次重启都写 KV（依赖后续业务写路径标脏）。
   */
  pgKvSyncOnStart: envTruthy(process.env.PG_KV_SYNC_ON_START, true),

  /**
   * true：GET /api/health 在存在 DATABASE_URL 时附带 `pg` 块（各表行数，只读聚合，轻微 DB 负载）。
   */
  healthPgStats: envTruthy(process.env.HEALTH_PG_STATS, false),

  /** POST /plugin/skin/refresh：生产环境必填，未设置则该路由返回 503 */
  pluginRefreshSecret: (process.env.PLUGIN_REFRESH_SECRET || '').trim(),
  /** AuthX 登录回调头校验（X-AuthX-Secret） */
  authxCallbackSecret: (process.env.AUTHX_CALLBACK_SECRET || '').trim(),
  /** 网站调用插件管理接口密钥（X-AuthX-Admin-Secret） */
  authxAdminSecret: (process.env.AUTHX_ADMIN_SECRET || '').trim(),
  /** 插件桥地址（用于调用 AuthX 插件 HTTP 服务） */
  authxPluginBase: (process.env.AUTHX_PLUGIN_BASE || 'http://127.0.0.1:8788').trim(),
  /**
   * 插件 HTTP 契约：vla（默认，Velocity-Limbo-Auth：/v1/health 与 /v1/admin/* + X-API-Key）
   * 或 authx（已废弃，仅保留兼容）。
   */
  authxPluginAdapter: (process.env.AUTHX_PLUGIN_ADAPTER || 'vla').trim().toLowerCase(),
  /** AUTHX_PLUGIN_ADAPTER=vla 时必填（对应 VLA config http-api.api-key） */
  authxVlaApiKey: (process.env.AUTHX_VLA_API_KEY || '').trim(),
  /**
   * VLA http-api.write-security.require-hmac=true 时，网站转发 POST 须带 X-VLA-Timestamp + X-VLA-Signature（与本变量相同密钥）。
   */
  authxVlaHmacSecret: (process.env.AUTHX_VLA_HMAC_SECRET || '').trim(),
  /**
   * 校验 VLA outbound-webhooks 的 X-VLA-Signature；任一条 secret 匹配即通过。
   * 多密钥：环境变量 AUTHX_VLA_WEBHOOK_SECRETS，每行一个（与插件多个 endpoint 各用不同 secret 时）。
   * 单密钥：仍可用 AUTHX_VLA_WEBHOOK_SECRET。
   */
  authxVlaWebhookSecrets: parseVlaWebhookSecrets(),
  /**
   * 安全告警出站 Webhook URL（选填）。设置后 processWebhookQueue 会将告警 payload
   * POST 到此地址，携带 X-VLA-Signature 签名。留空则表示仅本地排队不主动投递。
   */
  webhookOutboundUrl: (process.env.WEBHOOK_OUTBOUND_URL || '').trim(),
  /**
   * 健康探测 GET 路径，逗号分隔依次尝试，直至某一返回 2xx。
   * 默认同时兼容 AuthX 桩 /healthz 与 VLA /v1/health。
   */
  authxPluginHealthPaths: parseList(
    process.env.AUTHX_PLUGIN_HEALTH_PATHS || '/healthz,/v1/health'
  ),
  /** 网站 → 插件 Admin / 健康探测 请求超时（毫秒） */
  authxPluginRequestMs: Math.min(
    120_000,
    Math.max(3000, Number(process.env.AUTHX_PLUGIN_REQUEST_MS) || 10_000)
  ),
  /** /api/admin/authx/* 等：生产环境必填，未设置则返回 503；与 ALLOW_DEV_APPROVE=1 同时生效 */
  devAdminSecret: (process.env.DEV_ADMIN_SECRET || '').trim(),
  bcryptRounds: Math.min(12, Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 11)),
  maxPasswordLength: 128,
  maxSessionsPerUser: Math.min(50, Math.max(1, Number(process.env.MAX_SESSIONS_PER_USER) || 10)),
  /** Google OAuth（未配置 client_id 时禁用） */
  oauthGoogleClientId: (process.env.OAUTH_GOOGLE_CLIENT_ID || '').trim(),
  oauthGoogleClientSecret: (process.env.OAUTH_GOOGLE_CLIENT_SECRET || '').trim(),
  /** GitHub OAuth（未配置 client_id 时禁用） */
  oauthGithubClientId: (process.env.OAUTH_GITHUB_CLIENT_ID || '').trim(),
  oauthGithubClientSecret: (process.env.OAUTH_GITHUB_CLIENT_SECRET || '').trim(),
  /** 须与 GitHub OAuth App 中授权重定向 URI 完全一致 */
  oauthGithubRedirectUri: (process.env.OAUTH_GITHUB_REDIRECT_URI || '').trim(),
  /** 用于签名 OAuth state；未设时回退到 AUTHX_CALLBACK_SECRET 或内置开发占位 */
  oauthStateSecret: (process.env.OAUTH_STATE_SECRET || '').trim(),
  /** 邮件验证链接中的网站公开 origin，如 https://www.example.com */
  publicSiteOrigin: (process.env.PUBLIC_SITE_ORIGIN || '').trim(),
  /**
   * 设为 0 时关闭「仅已验证邮箱可操作」皮肤写接口门控（应急回滚或与旧前端联调）。
   * 默认开启。
   */
  requireEmailVerifiedForSkinActions: envTruthy(
    process.env.REQUIRE_EMAIL_VERIFIED_FOR_SKINS,
    true
  ),

  /**
   * SuperTokens Core 连接串，例如 http://127.0.0.1:3567
   * @see https://github.com/supertokens/supertokens-core
   */
  supertokensConnectionUri: (process.env.SUPERTOKENS_CONNECTION_URI || '').trim(),
  supertokensApiKey: (process.env.SUPERTOKENS_API_KEY || '').trim(),
  supertokensAppName: (process.env.SUPERTOKENS_APP_NAME || 'StarMC').trim(),
  /**
   * 浏览器访问 API 的域名（须与前端 SuperTokens 配置一致）。
   * 开发 + Vite 代理 /auth 时建议与网站同源，例如 http://localhost:5173
   */
  supertokensApiDomain: (process.env.AUTH_API_DOMAIN || '').trim().replace(/\/+$/, ''),
  supertokensWebsiteDomain: (process.env.AUTH_WEBSITE_DOMAIN || '').trim().replace(/\/+$/, ''),
  supertokensApiBasePath: (process.env.AUTH_API_BASE_PATH || '/auth').trim() || '/auth',
  supertokensWebsiteBasePath: (process.env.AUTH_WEBSITE_BASE_PATH || '/auth').trim() || '/auth',

  /**
   * 邮件发送（邮箱验证、密码重置）。未配置 SMTP 时开发环境仅打印链接到控制台；生产环境强烈建议配置。
   * SUPERTOKENS_SMTP_HOST、SUPERTOKENS_SMTP_PORT（默认 587）、SUPERTOKENS_SMTP_USER、SUPERTOKENS_SMTP_PASSWORD、
   * SUPERTOKENS_SMTP_FROM_EMAIL、可选 SUPERTOKENS_SMTP_FROM_NAME、SUPERTOKENS_SMTP_SECURE（1 表示 TLS）
   */
  smtpHost: (process.env.SUPERTOKENS_SMTP_HOST || process.env.SMTP_HOST || '').trim(),
  smtpPort: parsePort(process.env.SUPERTOKENS_SMTP_PORT || process.env.SMTP_PORT, 587),
  smtpUser: (process.env.SUPERTOKENS_SMTP_USER || process.env.SMTP_USER || '').trim(),
  smtpPassword: (process.env.SUPERTOKENS_SMTP_PASSWORD || process.env.SMTP_PASSWORD || '').trim(),
  smtpFromEmail: (process.env.SUPERTOKENS_SMTP_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || '').trim(),
  smtpFromName: (process.env.SUPERTOKENS_SMTP_FROM_NAME || process.env.SMTP_FROM_NAME || 'StarMC').trim(),
  smtpSecure: envTruthy(process.env.SUPERTOKENS_SMTP_SECURE || process.env.SMTP_SECURE, false),

  /**
   * 对外可访问的 API 根 URL（无尾斜杠），用于拼 `/uploads/...` 与 VLA `skin.custom-profile-url` 指向的站点。
   * 生产环境必须设为 Velocity 能访问到的地址（勿用 localhost，除非代理与后端同机）。
   * 未设置时：开发环境默认 `http://127.0.0.1:<PORT>`；生产为空（公开档案接口将不可用）。
   */
  publicApiBaseUrl: (() => {
    const ex = String(process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '')
    if (ex) return ex
    if (!isProd) return `http://127.0.0.1:${parsePort(process.env.PORT, 8787)}`
    return ''
  })(),

  /** false：关闭 GET /api/public/skin-profile/*（VLA custom 拉取） */
  skinBridgePublicProfile: envTruthy(process.env.SKIN_BRIDGE_PUBLIC_PROFILE, true),

  /** true：公开皮肤档案未命中已绑定账号时，按进服名回退查询 Mojang 皮肤。 */
  skinBridgeMojangFallback: envTruthy(process.env.SKIN_BRIDGE_MOJANG_FALLBACK, true),

  /** true：Mojang 也查不到时，返回稳定默认皮肤，避免 VLA 登录后拿不到 textures。 */
  skinBridgeDefaultFallback: envTruthy(process.env.SKIN_BRIDGE_DEFAULT_FALLBACK, true),
  skinBridgeDefaultSkinUrl: String(process.env.SKIN_BRIDGE_DEFAULT_SKIN_URL || '').trim(),
  skinBridgeDefaultModel:
    String(process.env.SKIN_BRIDGE_DEFAULT_MODEL || 'default').trim().toLowerCase() === 'slim'
      ? 'slim'
      : 'default',

  /**
   * 玩家在网站应用/选用皮肤后，是否异步调用 VLA POST /v1/skin/refresh（须 AUTHX_PLUGIN_ADAPTER=vla 且插件可达）。
   */
  vlaNotifyOnSkinChange: envTruthy(process.env.VLA_NOTIFY_ON_SKIN_CHANGE, true),

  /**
   * true：允许通过 Mojang 公开 API 拉取正版皮肤并写入 store（playerState.mojangSkin）。
   * 文档： https://minecraft.wiki/w/Mojang_API
   */
  mojangSkinSyncEnabled: envTruthy(process.env.MOJANG_SKIN_SYNC_ENABLED, true),

  /** 审核入口开关：true 时暴露审核 API 与前端入口 */
  reviewEntryEnabled: envTruthy(process.env.REVIEW_ENTRY_ENABLED, false),

  /** 遥测总开关：false 时 /api/telemetry 返回 204 且不落盘 */
  telemetryEnabled: envTruthy(process.env.TELEMETRY_ENABLED, true),
  /** 遥测每分钟每 IP 允许事件数（超出返回 429） */
  telemetryRateLimitPerMinute: Math.min(2000, Math.max(60, Number(process.env.TELEMETRY_RATE_LIMIT_PER_MINUTE) || 600)),
  /** 遥测保留天数（按 receivedAt/ts 清理） */
  telemetryRetentionDays: Math.min(90, Math.max(1, Number(process.env.TELEMETRY_RETENTION_DAYS) || 14)),
  /** 管理接口来源 IP 白名单（逗号分隔；空=不限制） */
  adminAllowedIps: parseList(process.env.ADMIN_ALLOWED_IPS || ''),
  /**
   * 请求 User-Agent；Mojang 要求可识别联系方式或项目名，勿用默认 Java/空串。
   */
  mojangApiUserAgent: (
    process.env.MOJANG_API_USER_AGENT ||
    'StarMC-SkinSync/1.0 (+https://minecraft.wiki/w/Mojang_API)'
  ).trim(),
  /** 单次拉取（profile + session）总超时上限（毫秒） */
  mojangApiTimeoutMs: Math.min(
    30000,
    Math.max(3000, Number(process.env.MOJANG_API_TIMEOUT_MS) || 12000)
  ),

  /**
   * 游戏库密码（邮件验证码）流程总开关。关闭后前端仍可能展示入口，但 API 会返回未启用。
   * 依赖：VLA 适配器、插件写接口、SMTP；详见 .env.example「游戏库密码」一节。
   */
  mcGamePasswordResetEnabled: envTruthy(process.env.MC_GAME_PASSWORD_RESET_ENABLED, true),
  /** 邮件中 6 位码的有效期（分钟），5–60 之间取整 */
  mcPasswordResetTtlMinutes: Math.min(
    60,
    Math.max(5, Number(process.env.MC_PASSWORD_RESET_TTL_MINUTES) || 15)
  ),
  /** 同一游戏角色名在 1 分钟内最多允许几次「申请验证码」（防刷邮箱） */
  mcPasswordResetBurstPerMinute: Math.min(
    5,
    Math.max(1, Number(process.env.MC_PASSWORD_RESET_BURST_PER_MIN) || 1)
  ),

  /**
   * true：绑定 `/api/user/link-minecraft` 必须提交有效 `inviteCode`。
   * 白名单来自 `INVITE_CODES`（逗号分隔）；占用关系存 store，一码通常只绑定一个网站账号。
   */
  inviteCodesRequiredForMcLink: envTruthy(process.env.INVITE_CODES_REQUIRED_FOR_MC_LINK, false),
  inviteCodesList: parseList(process.env.INVITE_CODES || '').map((s) => s.trim()),

  /**
   * 地区黑名单（ISO 3166-1 alpha-2，大写）。来源：CF-IPCountry 或 X-Country-Code。
   * 仅对 `geoBlockPathPrefixes` 或内置默认前缀下的写请求生效，避免误拦登录。
   */
  geoBlockedCountries: parseList(process.env.GEO_BLOCKED_COUNTRIES || '').map((s) =>
    String(s).trim().toUpperCase()
  ),
  /**
   * 非空时：只对以这些前缀开头的路径做地理拦截；空数组则使用 `features/inviteAndGeo.js` 内 DEFAULT_GEO_PREFIXES。
   */
  geoBlockPathPrefixes: parseList(process.env.GEO_BLOCKED_PATH_PREFIXES || ''),

  /**
   * true：已启用 TOTP 的用户在绑定/解绑游戏角色时必须在 body 里带 `totpCode`（Authenticator 6 位）。
   */
  requireTotpForMcLink: envTruthy(process.env.REQUIRE_TOTP_FOR_MC_LINK, false),
  /** 显示在 Authenticator「发行者」字段，一般为站点名 */
  totpIssuer: (process.env.TOTP_ISSUER || 'StarMC').trim(),

  /** GeoIP 查询开关（安全中心告警归属地） */
  geoipEnabled: envTruthy(process.env.GEOIP_ENABLED, true),
  /** GeoIP 缓存有效期（秒） */
  geoipCacheTtlSec: Math.min(7 * 24 * 3600, Math.max(60, Number(process.env.GEOIP_CACHE_TTL_SEC) || 24 * 3600)),
  /** GeoIP 查询最小间隔（毫秒，简单限流） */
  geoipMinIntervalMs: Math.min(5000, Math.max(0, Number(process.env.GEOIP_MIN_INTERVAL_MS) || 350)),

  /**
   * 地图服务健康探测目标地址。
   * 未设置时依次回退到 process.env.STARMC_MAP_*_ORIGIN，最后使用开发默认值。
   */
  mapSurvivalOrigin: String(process.env.STARMC_MAP_SURVIVAL_ORIGIN || '').trim(),
  mapNationWarOrigin: String(process.env.STARMC_MAP_NATION_WAR_ORIGIN || '').trim(),
  mapModSurvivalOrigin: String(process.env.STARMC_MAP_MOD_SURVIVAL_ORIGIN || '').trim()
}

if (!config.supertokensApiDomain) {
  config.supertokensApiDomain = `http://127.0.0.1:${config.apiPort}`
}
if (!config.supertokensWebsiteDomain) {
  const po = (config.publicSiteOrigin || '').trim().replace(/\/+$/, '')
  config.supertokensWebsiteDomain = po || (isProd ? config.supertokensApiDomain : 'http://localhost:5173')
}

if (isProd && config.corsOrigins.length === 0) {
  console.warn(
    '[starmc-api] 生产环境未设置 CORS_ORIGIN，浏览器跨域请求可能被拒绝。请显式配置。'
  )
}

if (config.authxPluginAdapter !== 'vla') {
  console.warn(
    '[starmc-api] authx adapter is deprecated, only vla is supported'
  )
}
