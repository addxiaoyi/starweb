/**
 * MC 游戏密码重置模块
 *
 * 从 server.js 提取的公开密码重置路由：
 * - POST /api/public/mc-game-password/request-code — 请求重置验证码
 * - POST /api/public/mc-game-password/confirm      — 确认验证码并重置密码
 */

export function registerMcGamePasswordRoutes(app, deps) {
  const {
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
  } = deps

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
}
