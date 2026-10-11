/** @typedef {import('../../config.js').default} AppConfig */

export const PUBLIC_API_CONTRACT_VERSION = '2026-07-11'

/**
 * @param {{
 *   config: AppConfig,
 *   store: object,
 *   circuitState?: { isOpen?: boolean },
 *   summarizeSubmissionStats?: (store: object) => object,
 *   isPluginWebhookAuthConfigured?: (config: AppConfig) => boolean,
 * }} ctx
 */
export function buildPublicSiteFeatures(ctx) {
  const {
    config,
    store,
    circuitState = { isOpen: false },
    summarizeSubmissionStats,
    isPluginWebhookAuthConfigured = () => false,
  } = ctx

  /** @type {Record<string, unknown>} */
  const body = {
    ok: true,
    success: true,
    mcGamePasswordReset:
      config.mcGamePasswordResetEnabled
      && Boolean(
        (config.starxNetworkApiBase || config.authxPluginBase)
        && (config.starxNetworkApiKey || config.authxVlaApiKey)
      ),
    inviteRequiredForMcLink: config.inviteCodesRequiredForMcLink,
    requireTotpForMcLink: config.requireTotpForMcLink,
    reviewEntryEnabled: config.reviewEntryEnabled,
    totpAvailable: true,
    geoPolicyActive: (config.geoBlockedCountries || []).length > 0,
    mcBindingEnabled: true,
    mojangVerifyEnabled: true,
    telemetryEnabled: config.telemetryEnabled,
    mojangSkinSyncEnabled: config.mojangSkinSyncEnabled,
    skinBridgePublicProfile: config.skinBridgePublicProfile,
    vlaNotifyOnSkinChange: config.vlaNotifyOnSkinChange,
    pluginBridge: {
      adapter: config.starxNetworkApiBase && config.starxNetworkApiKey
        ? 'starx'
        : config.authxPluginAdapter,
      circuitOpen: Boolean(circuitState.isOpen),
      webhookConfigured: isPluginWebhookAuthConfigured(config),
      networkStatusConfigured: Boolean(config.starxNetworkApiBase && config.starxNetworkApiKey),
    },
  }

  if (config.reviewEntryEnabled && typeof summarizeSubmissionStats === 'function') {
    body.reviewStats = summarizeSubmissionStats(store)
  }

  return body
}

/**
 * @param {{
 *   config: AppConfig,
 *   store: object,
 *   circuitState?: { isOpen?: boolean },
 *   summarizeSubmissionStats?: (store: object) => object,
 *   isPluginWebhookAuthConfigured?: (config: AppConfig) => boolean,
 *   isSuperTokensReady?: () => boolean,
 *   isSmtpConfigured?: () => boolean,
 * }} ctx
 */
export function buildPublicBootstrap(ctx) {
  const {
    config,
    isSuperTokensReady = () => false,
    isSmtpConfigured = () => false,
  } = ctx

  const siteFeatures = buildPublicSiteFeatures(ctx)
  const { ok, success, reviewStats, ...featureFlags } = siteFeatures

  /** @type {string[]} */
  const oauthProviders = []
  if (
    config.oauthGithubClientId &&
    config.oauthGithubClientSecret &&
    config.oauthGithubRedirectUri &&
    config.oauthStateSecret
  ) {
    oauthProviders.push('github')
  }

  /** @type {Record<string, unknown>} */
  const auth = {
    apiBasePath: config.supertokensApiBasePath || '/auth',
    emailCodeLogin: true,
    emailVerificationRequired: true,
    emailVerificationOptional: false,
    oauthProviders,
    supertokensConfigured: isSuperTokensReady(),
    smtpConfigured: isSmtpConfigured(),
  }

  if (!config.isProd && !isSuperTokensReady()) {
    auth.devAuthFallback = true
  }

  return {
    ok,
    success,
    contractVersion: PUBLIC_API_CONTRACT_VERSION,
    site: {
      name: config.supertokensAppName || 'StarMC',
      publicSiteOrigin: config.publicSiteOrigin || null,
      publicApiOrigin: config.publicApiBaseUrl || null,
    },
    features: {
      ...featureFlags,
      ...(reviewStats != null ? { reviewStats } : {}),
    },
    auth,
    realtime: {
      skinLibrarySse: '/api/skins/library/stream',
      skinLibraryPoll: '/api/skins/library/sync-status',
      recommendedPollMs: 15_000,
    },
    endpoints: {
      bootstrap: '/api/public/bootstrap',
      siteFeatures: '/api/public/site-features',
      authStatus: '/api/auth/status',
      userMe: '/api/user/me',
      userPermissions: '/api/user/permissions',
      userCenterSummary: '/api/user/center/summary',
      securityCenter: '/api/security/center',
      webVitals: '/api/metrics/web-vitals',
      telemetry: '/api/telemetry',
      playerStats: '/api/server/player-stats',
    },
    docs: {
      apiContract: '/api/docs/api-contract',
      openapiAuthx: '/api/docs/openapi/authx',
      openapiFrontend: '/api/docs/openapi/frontend-public',
      openapiMap: '/api/docs/openapi/map',
    },
  }
}
