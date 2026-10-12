import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPublicBootstrap,
  buildPublicSiteFeatures,
  PUBLIC_API_CONTRACT_VERSION,
} from '../src/modules/public/bootstrap.js'

function baseConfig(overrides = {}) {
  return {
    mcGamePasswordResetEnabled: true,
    authxPluginAdapter: 'vla',
    inviteCodesRequiredForMcLink: false,
    requireTotpForMcLink: false,
    reviewEntryEnabled: false,
    geoBlockedCountries: [],
    telemetryEnabled: true,
    mojangSkinSyncEnabled: true,
    skinBridgePublicProfile: true,
    vlaNotifyOnSkinChange: true,
    supertokensApiBasePath: '/auth',
    supertokensAppName: 'StarMC Test',
    publicSiteOrigin: 'http://127.0.0.1:5173',
    publicApiBaseUrl: 'http://127.0.0.1:8787',
    oauthGithubClientId: '',
    oauthGithubClientSecret: '',
    oauthGithubRedirectUri: 'http://127.0.0.1:5173/auth/github/callback',
    oauthStateSecret: 'test-oauth-state-secret',
    isProd: false,
    ...overrides,
  }
}

describe('buildPublicSiteFeatures', () => {
  it('includes extended UI feature flags', () => {
    const body = buildPublicSiteFeatures({
      config: baseConfig({ reviewEntryEnabled: true, telemetryEnabled: false }),
      store: {},
      circuitState: { isOpen: false },
      summarizeSubmissionStats: () => ({ pending: 1, total: 1 }),
      isPluginWebhookAuthConfigured: () => true,
    })

    assert.equal(body.ok, true)
    assert.equal(body.telemetryEnabled, false)
    assert.equal(body.mojangSkinSyncEnabled, true)
    assert.equal(body.skinBridgePublicProfile, true)
    assert.equal(body.vlaNotifyOnSkinChange, true)
    assert.deepEqual(body.reviewStats, { pending: 1, total: 1 })
    assert.equal(body.pluginBridge.webhookConfigured, true)
  })
})

describe('buildPublicBootstrap', () => {
  it('returns nested bootstrap payload for SPA boot', () => {
    const body = buildPublicBootstrap({
      config: baseConfig({
        oauthGithubClientId: 'gh-id',
        oauthGithubClientSecret: 'gh-secret',
      }),
      store: {},
      circuitState: { isOpen: true },
      isPluginWebhookAuthConfigured: () => false,
      isSuperTokensReady: () => true,
      isSmtpConfigured: () => true,
    })

    assert.equal(body.contractVersion, PUBLIC_API_CONTRACT_VERSION)
    assert.equal(body.site.name, 'StarMC Test')
    assert.equal(body.features.pluginBridge.circuitOpen, true)
    assert.deepEqual(body.auth.oauthProviders, ['github'])
    assert.equal(body.auth.supertokensConfigured, true)
    assert.equal(body.auth.smtpConfigured, true)
    assert.equal(body.realtime.skinLibrarySse, '/api/skins/library/stream')
    assert.equal(body.endpoints.bootstrap, '/api/public/bootstrap')
    assert.equal(body.docs.openapiFrontend, '/api/docs/openapi/frontend-public')
  })

  it('exposes devAuthFallback only when SuperTokens is not ready in dev', () => {
    const body = buildPublicBootstrap({
      config: baseConfig({ isProd: false }),
      store: {},
      isSuperTokensReady: () => false,
      isSmtpConfigured: () => false,
    })

    assert.equal(body.auth.devAuthFallback, true)
    assert.equal(body.auth.supertokensConfigured, false)
  })

  it('does not expose devAuthFallback in production', () => {
    const body = buildPublicBootstrap({
      config: baseConfig({ isProd: true }),
      store: {},
      isSuperTokensReady: () => false,
      isSmtpConfigured: () => false,
    })

    assert.equal(body.auth.devAuthFallback, undefined)
  })
})
