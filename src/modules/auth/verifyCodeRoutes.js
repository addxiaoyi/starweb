/**
 * 验证码登录/注册模块
 *
 * 从 server.js 提取的验证码认证路由：
 * - POST /api/auth/verify-code/send    — 发送邮箱验证码
 * - POST /api/auth/verify-code/confirm — 验证码确认并创建会话
 */
import { isLegacyPasswordlessOnlyUser } from '../../auth/legacyAccountSetup.js'
import { isValidUsername } from '../../auth/supertokensUser.js'

export function registerVerifyCodeRoutes(app, deps) {
  const {
    verifyCodeSendLimiter,
    verifyCodeConfirmLimiter = verifyCodeSendLimiter,
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
    findUsersByEmail,
    ensureLocalUser,
    sendVerificationEmail,
  } = deps

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
      const requestMode = mode === 'register' ? 'register' : 'login'
      if (requestMode === 'register') {
        const normalizedEmail = String(email).trim().toLowerCase()
        const localExists = (store.users || []).some(
          (user) => String(user?.email || '').trim().toLowerCase() === normalizedEmail
        )
        let remoteExists = false
        if (!localExists && typeof findUsersByEmail === 'function' && isSuperTokensReady()) {
          const users = await findUsersByEmail(normalizedEmail)
          remoteExists = Array.isArray(users) && users.length > 0
        }
        if (localExists || remoteExists) {
          return jsonErrWithRequest(res, 409, '该邮箱已注册，请直接登录', 'user_exists', reqId)
        }
      }
      const result = await sendVerifyCode(store, {
        email,
        ip: req.ip,
        mode: requestMode,
        deliver: sendVerificationEmail,
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
        if (result.error === 'delivery_failed') {
          return jsonErrWithRequest(res, 503, '邮件服务暂时无法发送验证码，请稍后重试', 'email_delivery_failed', reqId)
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

  app.post(
    '/api/auth/verify-code/confirm',
    verifyCodeConfirmLimiter,
    (req, res, next) => {
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
      const requestedPassword = String(password || '')
      const requestedUsername = String(req.body?.username || '').trim()
      if (loginMode === 'register') {
        if (requestedPassword.length < 6 || requestedPassword.length > 128 || !isValidUsername(requestedUsername)) {
          return jsonErrWithRequest(
            res,
            400,
            '注册需要有效的用户名和 6-128 位密码',
            'registration_credentials_required',
            reqId,
            { fields: ['username', 'password'] }
          )
        }
      }

      let sessionCreated = false
      let stUserId = null

      const result = await confirmVerifyCodeLogin(
        store,
        { id, email, code, password: requestedPassword, username: requestedUsername, mode: loginMode },
        {
          onLogin: async (em) => {
            if (!isSuperTokensReady()) {
              throw new Error('SuperTokens 未初始化')
            }
            const stUsers = await supertokens.listUsersByAccountInfo(
              'public',
              { email: em }
            )
            if (!stUsers || stUsers.length === 0) {
              throw new Error('用户不存在，请先注册')
            }
            const stUser = stUsers[0]
            const loginMethod = stUser.loginMethods?.find(
              (method) => (
                method.recipeId === 'emailpassword' || method.recipeId === 'passwordless'
              ) && method.recipeUserId
            )
            if (!loginMethod) {
              throw new Error('用户认证方式不可用')
            }
            stUserId = stUser.id

            const accessTokenPayload = isLegacyPasswordlessOnlyUser(stUser)
              ? { accountSetupRequired: true }
              : {}
            await Session.createNewSession(req, res, 'public', loginMethod.recipeUserId, accessTokenPayload, {})
            sessionCreated = true

            return { userId: stUserId, email: em }
          },
          onRegister: async (em, pw, username) => {
            if (!isSuperTokensReady()) {
              throw new Error('SuperTokens 未初始化')
            }
            const resp = await EmailPassword.signUp('public', em, pw)
            if (resp.status !== 'OK') {
              throw new Error(resp.status === 'EMAIL_ALREADY_EXISTS_ERROR' ? '邮箱已注册' : '注册失败')
            }
            stUserId = resp.user.id
            ensureLocalUser?.(resp.user, { username })

            await Session.createNewSession(req, res, 'public', resp.recipeUserId, {}, {})
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
          account_banned: '该账户已被封禁，请联系管理员',
          mode_mismatch: '验证码流程已失效，请重新获取',
          delivery_failed: '邮件服务暂时无法发送验证码，请稍后重试',
          register_failed: '注册失败，请稍后重试'
        }
        const statusMap = {
          account_locked: 429,
          too_many_attempts: 429,
          account_banned: 403,
          auth_error: 500
          ,delivery_failed: 503
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
              bannedAt: result.bannedAt,
              reason: result.reason,
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
}
