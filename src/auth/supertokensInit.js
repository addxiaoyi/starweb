import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session/index.js'
import EmailPassword from 'supertokens-node/recipe/emailpassword/index.js'
import Passwordless from 'supertokens-node/recipe/passwordless/index.js'
import { config } from '../config.js'
import {
  buildPasswordlessEmailContent,
  createPasswordlessSmtpService,
  generateEmailVerificationCode,
  getPasswordlessSmtpSettings,
} from './supertokensEmailDelivery.js'
import {
  ensureSupertokensLocalUser,
  findUserByUsername,
  isValidUsername,
  normalizeUsername,
} from './supertokensUser.js'
import { getStore } from '../persist.js'

let initialized = false
let coreReachable = null
const EMAIL_VERIFIED_REQUEST = Symbol('starmc.emailVerifiedRequest')

export function markEmailVerifiedRequest(request) {
  if (request && typeof request === 'object') {
    request[EMAIL_VERIFIED_REQUEST] = true
  }
  return request
}

function usernameFromFormFields(formFields) {
  const fields = Array.isArray(formFields) ? formFields : []
  return normalizeUsername(fields.find((field) => field?.id === 'username')?.value)
}

function usernameFromRequest(input) {
  const headerValue = input?.options?.req?.getHeaderValue?.('x-starmc-username')
  return normalizeUsername(headerValue || usernameFromFormFields(input?.formFields))
}

function coreFormFields(formFields) {
  return (Array.isArray(formFields) ? formFields : []).filter((field) => field?.id !== 'username')
}

export function createEmailPasswordRecipe({
  EmailPasswordRecipe = EmailPassword,
  getStore: getProfileStore = getStore,
  ensureLocalUser = ensureSupertokensLocalUser,
  findUsername = findUserByUsername,
} = {}) {
  return EmailPasswordRecipe.init({
    override: {
      apis: (original) => ({
        ...original,
        signUpPOST: async (input) => {
          const request = input?.options?.req
          if (request?.[EMAIL_VERIFIED_REQUEST] !== true) {
            return { status: 'SIGN_UP_NOT_ALLOWED', reason: 'EMAIL_VERIFICATION_REQUIRED' }
          }
          const username = usernameFromRequest(input)
          if (!isValidUsername(username)) {
            return { status: 'SIGN_UP_NOT_ALLOWED', reason: 'INVALID_USERNAME' }
          }

          const store = getProfileStore()
          if (findUsername(store, username)) {
            return { status: 'SIGN_UP_NOT_ALLOWED', reason: 'USERNAME_TAKEN' }
          }

          const response = await original.signUpPOST({
            ...input,
            formFields: coreFormFields(input.formFields),
          })
          if (response.status === 'OK') {
            ensureLocalUser(store, response.user, { username })
          }
          return response
        },
      }),
    },
  })
}

export function createPasswordlessRecipe({
  env = process.env,
  required = config.isProd,
  production = config.isProd,
  PasswordlessRecipe = Passwordless,
  SmtpService,
  smtpTransportFactory,
  findUsersByEmail = (email) => supertokens.listUsersByAccountInfo('public', { email }),
} = {}) {
  const smtpSettings = getPasswordlessSmtpSettings(env, { required, production })
  const emailDelivery = smtpSettings
    ? {
        service: new (SmtpService || createPasswordlessSmtpService({ transportFactory: smtpTransportFactory }))({
          smtpSettings,
          override: (original) => ({
            ...original,
            getContent: async (input) => buildPasswordlessEmailContent(input),
          }),
        }),
      }
    : undefined

  return PasswordlessRecipe.init({
    contactMethod: 'EMAIL',
    flowType: 'USER_INPUT_CODE',
    getCustomUserInputCode: async () => generateEmailVerificationCode(),
    ...(emailDelivery ? { emailDelivery } : {}),
    override: {
      apis: (original) => ({
        ...original,
        createCodePOST: async (input) => {
          if (!('email' in input)) return original.createCodePOST(input)

          const users = await findUsersByEmail(input.email)
          const hasExistingAccount = Array.isArray(users) && users.length > 0
          if (!hasExistingAccount) {
            return {
              status: 'SIGN_IN_UP_NOT_ALLOWED',
              reason: 'REGISTRATION_REQUIRED',
            }
          }

          return original.createCodePOST(input)
        },
      }),
    },
  })
}

export function createSessionRecipe({ SessionRecipe = Session } = {}) {
  return SessionRecipe.init({
    getTokenTransferMethod: () => 'cookie',
    cookieSecure: config.isProd,
    cookieSameSite: 'lax',
    refreshTokenValidity: Math.max(1, config.sessionRefreshDays) * 24 * 60,
  })
}

export async function probeSuperTokensCore() {
  const uri = String(config.supertokensConnectionUri || '').trim()
  if (!uri) {
    coreReachable = false
    return false
  }
  try {
    const r = await fetch(`${uri.replace(/\/+$/, '')}/hello`, {
      signal: AbortSignal.timeout(5000),
    })
    coreReachable = r.ok
  } catch {
    coreReachable = false
  }
  return coreReachable
}

export function initSuperTokens() {
  if (initialized) return
  if (!String(config.supertokensConnectionUri || '').trim()) return
  supertokens.init({
    framework: 'express',
    supertokens: { connectionURI: config.supertokensConnectionUri },
    appInfo: {
      appName: config.supertokensAppName,
      apiDomain: config.authApiDomain || 'http://127.0.0.1:8787',
      websiteDomain: config.authWebsiteDomain || 'http://127.0.0.1:5173',
      apiBasePath: config.supertokensApiBasePath,
      websiteBasePath: config.supertokensWebsiteBasePath,
    },
    recipeList: [createEmailPasswordRecipe(), createPasswordlessRecipe(), createSessionRecipe()],
  })
  initialized = true
}

export function isSuperTokensCoreReachable() {
  return coreReachable === true
}

export function isSuperTokensReady() {
  if (!initialized || !config.supertokensConnectionUri) return false
  if (coreReachable === false) return false
  if (!config.isProd && coreReachable !== true) return false
  return true
}
