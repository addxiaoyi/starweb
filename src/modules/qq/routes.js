/**
 * QQ 群组集成模块
 *
 * 提供 QQ 群/频道信息查询和 QQ 账号验证功能。
 * 当 QQ_BOT_TOKEN 和 QQ_GUILD_ID 未配置时，接口返回友好的
 * "未配置" 响应而非 500 错误。
 */

export function registerQqRoutes(app, deps) {
  const { jsonErr, jsonOk, getStore, requireUser, asyncHandler, config } = deps

  const isConfigured = () => {
    return Boolean(config?.qqBotToken || process.env.QQ_BOT_TOKEN)
  }

  // ── QQ 群/频道信息 ────────────────────────────────────────
  app.get(
    '/api/qq/guild-info',
    asyncHandler(async (_req, res) => {
      if (!isConfigured()) {
        return jsonOk(res, {
          ok: true,
          configured: false,
          message: 'QQ 群组功能尚未配置',
          guild: null,
        })
      }

      const store = getStore()
      const guildConfig = store.qqGuild || {}

      jsonOk(res, {
        ok: true,
        configured: true,
        guild: {
          id: guildConfig.guildId || config.qqGuildId || process.env.QQ_GUILD_ID || null,
          name: guildConfig.guildName || 'StarMC 交流群',
          memberCount: guildConfig.memberCount || null,
          joinUrl: guildConfig.joinUrl || null,
          updatedAt: guildConfig.updatedAt || null,
        },
      })
    })
  )

  // ── QQ 号绑定入口 ─────────────────────────────────────────
  // 网站不接收 QQ 绑定写入；NapCat 私聊验证码是唯一可信的绑定来源。
  app.post(
    '/api/qq/verify',
    requireUser,
    asyncHandler(async (req, res) => {
      return jsonErr(res, 410, 'QQ 绑定必须通过 NapCat 私聊验证码完成，请在游戏内发起绑定', 'napcat_required')
    })
  )

  // ── QQ 用户资料查询 ───────────────────────────────────────
  app.get(
    '/api/qq/profiles/:qq',
    requireUser,
    asyncHandler(async (req, res) => {
      const qq = String(req.params.qq || '').trim()
      if (!qq || !/^\d{5,12}$/.test(qq)) {
        return jsonErr(res, 400, 'QQ 号格式不正确', 'validation_error')
      }

      const store = getStore()
      const user = (store.users || []).find((u) => String(u.qqNumber || '') === qq)

      if (!user) {
        return jsonOk(res, { found: false, qq, profile: null })
      }

      jsonOk(res, {
        found: true,
        qq,
        profile: {
          userId: user.id,
          username: user.username || user.email || null,
          qqVerified: user.qqVerified || false,
          boundAt: user.qqBoundAt || null,
        },
      })
    })
  )
}
