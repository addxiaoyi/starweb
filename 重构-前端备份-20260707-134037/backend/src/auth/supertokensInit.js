import supertokens from 'supertokens-node'
import EmailPassword from 'supertokens-node/recipe/emailpassword'
import EmailVerification from 'supertokens-node/recipe/emailverification'
import ThirdParty from 'supertokens-node/recipe/thirdparty'
import Session from 'supertokens-node/recipe/session'
import { config } from '../config.js'
import { getStore, scheduleSave } from '../persist.js'
import { emailPasswordDelivery, emailVerificationDelivery } from './supertokensEmailDelivery.js'
import { ensureSupertokensLocalUser, findSupertokensLinkedUser, syncSupertokensLocalUser } from './supertokensUser.js'

let initialized = false
let initAttempted = false

export function initSuperTokens() {
  if (initAttempted) return
  initAttempted = true

  if (!config.supertokensConnectionUri) {
    console.warn(
      '[starmc-api] 未设置 SUPERTOKENS_CONNECTION_URI，SuperTokens 未初始化；登录相关接口不可用。'
    )
    return
  }

  initialized = true

  const syncLocalUserFromStUserId = async (stUserId) => {
    const uid = String(stUserId || '').trim()
    if (!uid) return
    const stUser = await supertokens.getUser(uid)
    if (!stUser) return
    const store = getStore()
    const local = findSupertokensLinkedUser(store, uid)
    if (local) {
      syncSupertokensLocalUser(local, stUser)
      scheduleSave()
      return
    }
    ensureSupertokensLocalUser(store, stUser)
    scheduleSave()
  }

  supertokens.init({
    framework: 'express',
    supertokens: {
      connectionURI: config.supertokensConnectionUri,
      apiKey: config.supertokensApiKey || undefined
    },
    appInfo: {
      appName: config.supertokensAppName,
      apiDomain: config.supertokensApiDomain,
      websiteDomain: config.supertokensWebsiteDomain,
      apiBasePath: config.supertokensApiBasePath,
      websiteBasePath: config.supertokensWebsiteBasePath
    },
    recipeList: [
      EmailPassword.init({
        emailDelivery: emailPasswordDelivery(),
        override: {
          apis: (originalImplementation) => ({
            ...originalImplementation,
            signUpPOST: async (input) => {
              const response = await originalImplementation.signUpPOST(input)
              if (response.status === 'OK') {
                const store = getStore()
                ensureSupertokensLocalUser(store, response.user)
                scheduleSave()
              }
              return response
            },
            signInPOST: async (input) => {
              const response = await originalImplementation.signInPOST(input)
              if (response.status === 'OK') {
                const store = getStore()
                ensureSupertokensLocalUser(store, response.user)
                scheduleSave()
              }
              return response
            }
          })
        }
      }),
      // GitHub 第三方登录（未配置 client_id 时自动禁用）
      ...(config.oauthGithubClientId && config.oauthGithubClientSecret
        ? [
            ThirdParty.init({
              signInAndUpFeature: {
                providers: [
                  {
                    config: {
                      thirdPartyId: 'github',
                      clientId: config.oauthGithubClientId,
                      clientSecret: config.oauthGithubClientSecret,
                      scope: ['read:user', 'user:email'],
                      authorizationRedirectQueryParams: {
                        redirect_uri: config.oauthGithubRedirectUri || `${config.supertokensWebsiteDomain}/auth/callback/github`
                      }
                    }
                  }
                ]
              }
            })
          ]
        : []),
      EmailVerification.init({
        mode: 'OPTIONAL',
        emailDelivery: emailVerificationDelivery(),
        override: {
          apis: (originalImplementation) => ({
            ...originalImplementation,
            verifyEmailPOST: async (input) => {
              const fn = originalImplementation.verifyEmailPOST
              if (!fn) return { status: 'GENERAL_ERROR' }
              const response = await fn(input)
              if (response.status === 'OK') {
                await syncLocalUserFromStUserId(response.user.id)
              }
              return response
            },
            isEmailVerifiedGET: async (input) => {
              const fn = originalImplementation.isEmailVerifiedGET
              if (!fn) return { status: 'GENERAL_ERROR' }
              const response = await fn(input)
              try {
                if (input?.session && typeof input.session.getUserId === 'function') {
                  await syncLocalUserFromStUserId(input.session.getUserId())
                }
              } catch {
                // ignore sync error
              }
              return response
            }
          })
        }
      }),
      Session.init({
        getTokenTransferMethod: () => 'cookie',
        cookieSameSite: 'strict',
        antiCsrf: 'VIA_CUSTOM_HEADER'
      })
    ]
  })
}

export function isSuperTokensReady() {
  return initialized
}
