import crypto from 'node:crypto'
import https from 'node:https'
import { isIP } from 'node:net'
import { isUserBanned } from '../../auth/userStatus.js'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails'
const STATE_COOKIE = 'starmc_github_oauth_state'
const GITHUB_REQUEST_TIMEOUT_MS = 15_000
const GITHUB_REQUEST_ATTEMPTS = 2
const STATE_TTL_MS = 10 * 60 * 1000
const FUTURE_CLOCK_SKEW_MS = 60 * 1000

function safeReturnTo(value) {
  const path = String(value || '/profile').trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/profile'
  return path
}

function signState(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

function equalState(left, right) {
  const leftBytes = Buffer.from(String(left || ''))
  const rightBytes = Buffer.from(String(right || ''))
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes)
}

function readCookie(req, name) {
  const header = String(req.headers?.cookie || '')
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(value.join('='))
    } catch {
      return ''
    }
  }
  return ''
}

function appendCookie(res, value) {
  const existing = res.getHeader?.('Set-Cookie')
  const cookies = existing ? (Array.isArray(existing) ? existing : [existing]) : []
  res.setHeader('Set-Cookie', [...cookies, value])
}

function stateCookie(state, config, maxAge) {
  const secure = config.isProd ? '; Secure' : ''
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/auth/callback/github; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function clearStateCookie(res, config) {
  appendCookie(res, stateCookie('', config, 0))
}

function isConfigured(config) {
  return Boolean(
    config.oauthGithubClientId &&
    config.oauthGithubClientSecret &&
    config.oauthGithubRedirectUri &&
    config.oauthStateSecret
  )
}

function readQuery(req, name) {
  const value = req.query?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

function verifiedEmail(rows) {
  if (!Array.isArray(rows)) return ''
  const selected = rows.find((row) => row?.primary === true && row?.verified === true)
    || rows.find((row) => row?.verified === true)
  return String(selected?.email || '').trim().toLowerCase()
}

function grantsGithubAdmin(config, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return false
  return (config.oauthGithubAdminEmails || []).some((entry) =>
    String(entry || '').trim().toLowerCase() === normalizedEmail)
}

function grantGithubAdminRole(user, config, email) {
  if (!user || !grantsGithubAdmin(config, email)) return false
  const roles = new Set((Array.isArray(user.roles) ? user.roles : [])
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean))
  if (roles.has('admin') || roles.has('superadmin')) return false
  roles.add('admin')
  user.roles = [...roles]
  return true
}

function recipeUserId(user) {
  const methods = Array.isArray(user?.loginMethods) ? user.loginMethods : []
  const method = methods.find((item) => item?.recipeId === 'emailpassword' && item?.recipeUserId)
  return method?.recipeUserId || null
}

function githubHeaders(accessToken) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'StarMC-OAuth',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function requestJson(fetchImpl, url, options) {
  let lastError
  for (let attempt = 1; attempt <= GITHUB_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
      })
      if (!response?.ok) throw new Error(`github_request_failed:${new URL(url).pathname}`)
      return response.json()
    } catch (error) {
      lastError = error
      const isNetworkFailure = error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error?.name)
      if (!isNetworkFailure || attempt === GITHUB_REQUEST_ATTEMPTS) throw error
    }
  }
  throw lastError || new Error('github_request_unreachable')
}

function requestJsonViaEdge(url, options, edgeIp) {
  if (isIP(edgeIp) !== 4) return Promise.reject(new Error('github_edge_ip_invalid'))
  const target = new URL(url)
  const body = typeof options?.body === 'string' ? options.body : ''
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: edgeIp,
      port: 443,
      servername: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: options?.method || 'GET',
      headers: { ...options?.headers, Host: target.hostname, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
      timeout: GITHUB_REQUEST_TIMEOUT_MS,
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const status = Number(response.statusCode || 0)
        if (status < 200 || status >= 300) return reject(new Error(`github_request_failed:${target.pathname}:${status}`))
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(new Error(`github_invalid_json:${target.pathname}`))
        }
      })
    })
    request.on('timeout', () => request.destroy(new Error('github_edge_timeout')))
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

async function requestGithubJson(fetchImpl, url, options, edgeIps = []) {
  try {
    return await requestJson(fetchImpl, url, options)
  } catch (primaryError) {
    for (const edgeIp of edgeIps) {
      try {
        return await requestJsonViaEdge(url, options, edgeIp)
      } catch (edgeError) {
        console.warn('[github-oauth] edge request failed', {
          edgeIp,
          path: new URL(url).pathname,
          reason: edgeError?.message || 'unknown',
        })
      }
    }
    throw primaryError
  }
}

async function resolveSessionUser({ email, deps }) {
  const {
    supertokens,
    EmailPassword,
    Session,
    getStore,
    ensureSupertokensLocalUser,
    markUserProfileDirty,
    scheduleSave,
    config,
    req,
    res,
  } = deps
  let users = await supertokens.listUsersByAccountInfo('public', { email })
  let user = Array.isArray(users) ? users[0] : null
  let userRecipeId = recipeUserId(user)

  if (!user) {
    const password = `${crypto.randomBytes(48).toString('base64url')}Aa1!`
    const created = await EmailPassword.signUp('public', email, password)
    if (created.status === 'OK') {
      user = created.user
      userRecipeId = created.recipeUserId || recipeUserId(user)
    } else if (created.status === 'EMAIL_ALREADY_EXISTS_ERROR') {
      users = await supertokens.listUsersByAccountInfo('public', { email })
      user = Array.isArray(users) ? users[0] : null
      userRecipeId = recipeUserId(user)
    } else {
      throw new Error('github_account_create_failed')
    }
  }

  if (!user || !userRecipeId) throw new Error('github_account_unavailable')

  // OAuth callbacks are browser navigations, so SuperTokens cannot infer cookie mode from its usual frontend header.
  req.headers = req.headers || {}
  req.headers['st-auth-mode'] = 'cookie'

  const siteUser = {
    ...user,
    emails: Array.isArray(user.emails) && user.emails.length > 0 ? user.emails : [email],
  }
  const localUser = ensureSupertokensLocalUser(getStore(), siteUser)
  if (isUserBanned(localUser)) {
    throw new Error('account_banned')
  }
  if (grantGithubAdminRole(localUser, config, email)) {
    markUserProfileDirty(localUser.id)
    scheduleSave()
  }
  await Session.createNewSession(req, res, 'public', userRecipeId, {}, {})
}

function isGithubNetworkFailure(error) {
  const code = String(error?.code || '').toUpperCase()
  const name = String(error?.name || '')
  const message = String(error?.message || '').toLowerCase()
  return ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)
    || ['AbortError', 'TimeoutError'].includes(name)
    || /timeout|timed out|network|fetch failed|socket/.test(message)
}

function githubCallbackFailure(error) {
  return error instanceof Error && error.message === 'account_banned'
    ? 'account_banned'
    : error instanceof Error && error.message === 'github_code_invalid'
      ? 'github_code_invalid'
    : isGithubNetworkFailure(error)
      ? 'github_timeout'
      : 'github_failed'
}

function failCallback(res, config, failure = 'github_failed') {
  clearStateCookie(res, config)
  res.redirect(302, `/login?oauth=${failure}`)
}

export function createGithubOAuthState({ secret, returnTo = '/profile', now = Date.now() }) {
  const payload = Buffer.from(JSON.stringify({
    iat: now,
    nonce: crypto.randomBytes(24).toString('base64url'),
    returnTo: safeReturnTo(returnTo),
  })).toString('base64url')
  return `${payload}.${signState(payload, secret)}`
}

export function verifyGithubOAuthState({ state, secret, now = Date.now() }) {
  const separator = String(state || '').lastIndexOf('.')
  if (separator <= 0) return null

  const payload = state.slice(0, separator)
  const signature = state.slice(separator + 1)
  if (!equalState(signature, signState(payload, secret))) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const issuedAt = Number(parsed?.iat)
    if (!Number.isFinite(issuedAt) || now - issuedAt > STATE_TTL_MS || issuedAt - now > FUTURE_CLOCK_SKEW_MS) {
      return null
    }
    return { returnTo: safeReturnTo(parsed.returnTo) }
  } catch {
    return null
  }
}

export function registerGithubOAuthRoutes(app, baseDeps) {
  const deps = { fetchImpl: fetch, ...baseDeps }
  const { config, asyncHandler } = deps

  app.get('/auth/callback/github/authorize', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!isConfigured(config)) {
      return res.status(503).json({ ok: false, code: 'oauth_unavailable', message: 'GitHub login is not configured' })
    }

    const state = createGithubOAuthState({
      secret: config.oauthStateSecret,
      returnTo: safeReturnTo(readQuery(req, 'returnTo')),
    })
    appendCookie(res, stateCookie(state, config, Math.floor(STATE_TTL_MS / 1000)))

    const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL)
    authorizeUrl.searchParams.set('client_id', config.oauthGithubClientId)
    authorizeUrl.searchParams.set('redirect_uri', config.oauthGithubRedirectUri)
    authorizeUrl.searchParams.set('scope', 'read:user user:email')
    authorizeUrl.searchParams.set('state', state)
    return res.redirect(302, authorizeUrl.toString())
  })

  app.get('/auth/callback/github', asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!isConfigured(config) || !deps.isSuperTokensReady()) return failCallback(res, config)

    const code = readQuery(req, 'code')
    const state = readQuery(req, 'state')
    const githubError = readQuery(req, 'error')
    const cookieState = readCookie(req, STATE_COOKIE)
    const stateData = verifyGithubOAuthState({ state, secret: config.oauthStateSecret })
    if (!stateData || !equalState(state, cookieState)) return failCallback(res, config)
    if (githubError === 'access_denied') return failCallback(res, config, 'github_cancelled')
    if (!code) return failCallback(res, config)

    try {
      const token = await requestGithubJson(deps.fetchImpl, GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.oauthGithubClientId,
          client_secret: config.oauthGithubClientSecret,
          code,
          redirect_uri: config.oauthGithubRedirectUri,
        }).toString(),
      }, config.oauthGithubEdgeIps)
      const accessToken = String(token?.access_token || '').trim()
      if (!accessToken) {
        if (token?.error === 'bad_verification_code') throw new Error('github_code_invalid')
        throw new Error('github_token_missing')
      }

      await requestGithubJson(
        deps.fetchImpl,
        GITHUB_USER_URL,
        { headers: githubHeaders(accessToken) },
        config.oauthGithubEdgeIps,
      )
      const emails = await requestGithubJson(
        deps.fetchImpl,
        GITHUB_EMAILS_URL,
        { headers: githubHeaders(accessToken) },
        config.oauthGithubEdgeIps,
      )
      const email = verifiedEmail(emails)
      if (!email) throw new Error('github_verified_email_missing')

      await resolveSessionUser({
        email,
        deps: { ...deps, req, res },
      })
      clearStateCookie(res, config)
      return res.redirect(302, stateData.returnTo)
    } catch (error) {
      console.error('[github-oauth] callback failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
      return failCallback(res, config, githubCallbackFailure(error))
    }
  }))
}
