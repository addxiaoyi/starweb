/**
 * TOTP 两步验证模块
 *
 * 从 server.js 提取的 TOTP 路由，覆盖：
 * - POST /api/user/totp/setup        — 生成待验证密钥
 * - POST /api/user/totp/enable       — 验证并启用
 * - POST /api/user/totp/disable      — 关闭（需验证码或恢复码）
 * - POST /api/user/totp/recovery-codes/rotate — 轮换恢复码
 */

export function registerTotpRoutes(app, deps) {
  const {
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
  } = deps

  app.post(
    '/api/user/totp/setup',
    requireUser,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')
      if (u.totpEnabled) return jsonErr(res, 400, '已启用两步验证', 'already_enabled')
      const secret = generateTotpSecret()
      u.totpPendingSecret = secret
      markUserProfileDirty(u.id)
      scheduleSave()
      const label = String(u.email || u.username || u.id)
      res.json({
        secret,
        otpauthUrl: totpKeyUri(label, secret)
      })
    })
  )

  app.post(
    '/api/user/totp/enable',
    requireUser,
    asyncHandler(async (req, res) => {
      const code = String(req.body?.code || '').trim()
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u?.totpPendingSecret) {
        return jsonErr(res, 400, '请先获取密钥（POST /api/user/totp/setup）', 'no_pending')
      }
      if (!verifyTotpToken(u.totpPendingSecret, code)) {
        return jsonErr(res, 400, '验证码错误', 'bad_code')
      }
      u.totpSecret = u.totpPendingSecret
      u.totpPendingSecret = null
      u.totpEnabled = true
      u.recoveryCodes = makeRecoveryCodes()
      u.recoveryCodesCount = u.recoveryCodes.length
      markUserProfileDirty(u.id)
      appendSecurityAudit(store, u.id, 'totp_enable', { recoveryCodesCount: u.recoveryCodesCount })
      pushUserNotification(store, u.id, {
        type: 'totp_enabled',
        title: '两步验证已启用',
        message: '你的账号安全性已提升，请妥善保管恢复码',
        detail: { recoveryCodesCount: u.recoveryCodesCount }
      })
      scheduleSave()
      res.json({ ok: true, recoveryCodes: u.recoveryCodes })
    })
  )

  app.post(
    '/api/user/totp/disable',
    requireUser,
    asyncHandler(async (req, res) => {
      const code = String(req.body?.code || '').trim()
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u?.totpEnabled || !u.totpSecret) {
        return jsonErr(res, 400, '未启用两步验证', 'not_enabled')
      }
      if (!verifyTotpToken(u.totpSecret, code)) {
        const recoveryCode = String(req.body?.recoveryCode || '').trim().toUpperCase()
        if (!recoveryCode || !Array.isArray(u.recoveryCodes) || !u.recoveryCodes.includes(recoveryCode)) {
          return jsonErr(res, 400, '验证码错误', 'bad_code')
        }
        u.recoveryCodes = u.recoveryCodes.filter((c) => c !== recoveryCode)
        u.recoveryCodesCount = u.recoveryCodes.length
      }
      u.totpEnabled = false
      u.totpSecret = null
      u.totpPendingSecret = null
      markUserProfileDirty(u.id)
      appendSecurityAudit(store, u.id, 'totp_disable', { recoveryCodesCount: Number(u.recoveryCodesCount || 0) })
      pushUserNotification(store, u.id, {
        type: 'totp_disabled',
        title: '两步验证已关闭',
        message: '账号已退回基础保护状态，建议尽快重新开启',
        detail: { recoveryCodesCount: Number(u.recoveryCodesCount || 0) }
      })
      scheduleSave()
      res.json({ ok: true })
    })
  )

  app.post('/api/user/totp/recovery-codes/rotate', requireUser, (req, res) => {
    const store = getStore()
    const u = store.users.find((x) => x.id === req.user.id)
    if (!u || !u.totpEnabled) return jsonErr(res, 400, '未启用两步验证', 'not_enabled')
    const code = String(req.body?.code || '').trim()
    if (!verifyTotpToken(u.totpSecret, code)) {
      return jsonErr(res, 400, '验证码错误', 'bad_code')
    }
    u.recoveryCodes = makeRecoveryCodes()
    u.recoveryCodesCount = u.recoveryCodes.length
    markUserProfileDirty(u.id)
    appendSecurityAudit(store, u.id, 'recovery_codes_rotate', { recoveryCodesCount: u.recoveryCodesCount })
    pushUserNotification(store, u.id, {
      type: 'recovery_codes_rotate',
      title: '恢复码已更新',
      message: '旧恢复码已失效，请保存新恢复码',
      detail: { recoveryCodesCount: u.recoveryCodesCount }
    })
    scheduleSave()
    res.json({ ok: true, recoveryCodes: u.recoveryCodes })
  })
}
