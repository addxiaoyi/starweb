/**
 * Minecraft 绑定与正版验证模块
 *
 * 从 server.js 提取的 MC 相关路由：
 * - POST /api/user/link-minecraft            — 绑定游戏角色
 * - POST /api/user/unlink-minecraft          — 解绑游戏角色
 * - GET  /api/user/minecraft/status          — 绑定状态 + 验证会话
 * - GET  /api/user/minecraft/binding-history — 绑定操作历史
 * - GET  /api/user/minecraft/verify-history  — 正版验证会话历史
 * - POST /api/user/minecraft/verify/init     — 发起正版验证
 * - POST /api/user/minecraft/verify/cancel   — 取消正版验证
 */

const MAX_MINECRAFT_PROFILES = 3

function minecraftProfilesFor(user) {
  const stored = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
  const profiles = stored
    .map((profile) => ({
      username: String(profile?.username || '').trim(),
      uuid: String(profile?.uuid || '').trim(),
      linkedAt: profile?.linkedAt || null,
    }))
    .filter((profile) => profile.username)

  const legacyName = String(user?.linkedMcUsername || '').trim()
  const legacyUuid = String(user?.linkedMcUuid || '').trim()
  const hasLegacy = profiles.some((profile) =>
    (legacyUuid && profile.uuid === legacyUuid) || profile.username.toLowerCase() === legacyName.toLowerCase()
  )
  if (legacyName && !hasLegacy) profiles.unshift({ username: legacyName, uuid: legacyUuid, linkedAt: null })
  return profiles.slice(0, MAX_MINECRAFT_PROFILES)
}

function activeMinecraftProfile(user, profiles = minecraftProfilesFor(user)) {
  const activeUuid = String(user?.activeMinecraftUuid || user?.linkedMcUuid || '').trim()
  const activeName = String(user?.linkedMcUsername || '').trim().toLowerCase()
  return profiles.find((profile) => activeUuid && profile.uuid === activeUuid)
    || profiles.find((profile) => profile.username.toLowerCase() === activeName)
    || profiles[0]
    || null
}

function setActiveMinecraftProfile(user, profile) {
  user.activeMinecraftUuid = profile?.uuid || null
  user.linkedMcUsername = profile?.username || null
  user.linkedMcUuid = profile?.uuid || null
}

function grantDefaultSkinConsent(store, userId, profile) {
  if (!store.playerSkinConsents || typeof store.playerSkinConsents !== 'object') {
    store.playerSkinConsents = {}
  }
  const uuid = String(profile?.uuid || '').trim().replaceAll('-', '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(uuid)) return
  const now = new Date().toISOString()
  store.playerSkinConsents[`${userId}:${uuid}`] = {
    userId,
    playerUuid: uuid,
    playerName: String(profile.username || '').trim(),
    allowPublicSkin: true,
    allowPublicCape: true,
    allowDownload: false,
    source: 'binding-default',
    consentVersion: 1,
    consentedAt: now,
    revokedAt: null,
  }
}

function revokeSkinConsent(store, userId, playerUuid) {
  const uuid = String(playerUuid || '').trim().replaceAll('-', '').toLowerCase()
  const row = store.playerSkinConsents?.[`${userId}:${uuid}`]
  if (!row) return
  row.allowPublicSkin = false
  row.allowPublicCape = false
  row.allowDownload = false
  row.revokedAt = new Date().toISOString()
}

function publicMinecraftProfiles(user) {
  const profiles = minecraftProfilesFor(user)
  const active = activeMinecraftProfile(user, profiles)
  return profiles.map((profile) => ({
    username: profile.username,
    uuid: profile.uuid,
    active: profile === active,
  }))
}

export function registerMinecraftRoutes(app, deps) {
  const {
    requireUser,
    requireVerifiedEmail,
    asyncHandler,
    getStore,
    config,
    jsonErr,
    jsonPage,
    scheduleSave,
    markUserProfileDirty,
    markPlayerStateDirty,
    appendSecurityAudit,
    pushUserNotification,
    ensureSecurityCenter,
    ensurePlayerState,
    verifyTotpToken,
    normalizeShortText,
    parseTimeMs,
    vlaLinkExternalUser,
    resolveGameBindingCode,
    validateInviteForMcLink,
    claimInviteForUser,
    persistMojangSkinSync,
    buildMcBindingHistoryItemFromAudit,
    MC_BINDING_AUDIT_ACTIONS,
    verifyStatusLabel,
    getMcVerifySession,
    getMcVerifySessionHistory,
    createMcVerifySession,
    clearMcVerifySession,
    starxNetworkClient,
    getStarxNetworkClient = () => starxNetworkClient,
  } = deps

  app.post(
    '/api/user/minecraft/approval/confirm',
    requireUser,
    asyncHandler(async (req, res) => {
      const activeStarxNetworkClient = getStarxNetworkClient()
      if (!activeStarxNetworkClient) {
        return jsonErr(res, 503, '游戏网络授权服务暂不可用，请稍后重试', 'starx_unavailable')
      }
      const store = getStore()
      const user = store.users.find((entry) => entry.id === req.user.id)
      const username = String(user?.linkedMcUsername || '').trim()
      const playerId = String(user?.linkedMcUuid || '').trim()
      const email = String(user?.email || '').trim().toLowerCase()
      if (!username || !playerId) {
        return jsonErr(res, 409, '请先完成网站与游戏角色绑定', 'minecraft_not_linked')
      }

      const token = String(req.body?.token || '').trim()
      const action = String(req.body?.action || '').trim().toLowerCase()
      const allowedActions = new Set([
        'bind_email', 'enable_totp', 'bind_skin_account', 'approve_login',
      ])
      if (token.length < 32 || token.length > 256 || !allowedActions.has(action)) {
        return jsonErr(res, 400, '授权链接无效或操作不受支持', 'approval_invalid')
      }

      const approval = await activeStarxNetworkClient.confirmApproval({
        token,
        playerId,
        username,
        email,
        action,
      })
      appendSecurityAudit(store, user.id, 'minecraft_approval', {
        action,
        status: approval.status,
        at: new Date().toISOString(),
      })
      res.json({ ok: approval.ok === true, status: approval.status })
    }),
  )

  // ── 绑定游戏角色 ──────────────────────────────────────────
  app.post(
    '/api/user/link-minecraft',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const mc = String(req.body?.username || '').trim()
      if (!mc || mc.length < 3 || mc.length > 16) {
        return jsonErr(res, 400, '请输入有效的游戏角色名（3–16 字符）', 'validation_error')
      }

      const bindingCode = String(req.body?.bindingCode || '').trim()
      let verifiedIdentity = null
      if (bindingCode) {
        const resolved = await resolveGameBindingCode(bindingCode)
        if (!resolved?.ok) {
          return jsonErr(res, 403, '游戏内绑定链接已失效，请返回服务器重新获取', 'binding_token_invalid')
        }
        if (String(resolved.username || '').trim().toLowerCase() !== mc.toLowerCase()) {
          return jsonErr(res, 409, '绑定链接与当前游戏角色不一致', 'binding_identity_mismatch')
        }
        verifiedIdentity = resolved
      }

      const inv = verifiedIdentity
        ? { ok: true }
        : validateInviteForMcLink(store, req.user.id, req.body?.inviteCode)
      if (!inv.ok) {
        const map = {
          invite_required: '需要提供邀请码',
          bad_invite: '邀请码无效',
          invite_used: '邀请码已被其他账号使用'
        }
        return jsonErr(res, 403, map[inv.error] || '邀请码校验失败', inv.error)
      }
      const self = store.users.find((x) => x.id === req.user.id)
      const existingProfiles = minecraftProfilesFor(self)
      const duplicate = existingProfiles.find((profile) =>
        (verifiedIdentity?.playerUuid && profile.uuid === String(verifiedIdentity.playerUuid))
        || profile.username.toLowerCase() === mc.toLowerCase()
      )
      if (duplicate) {
        return jsonErr(res, 409, '该游戏角色已经绑定到此账号', 'minecraft_profile_exists')
      }
      if (existingProfiles.length >= MAX_MINECRAFT_PROFILES) {
        return jsonErr(res, 409, '每个网站账号最多绑定 3 个游戏角色', 'minecraft_profile_limit', {
          maxProfiles: MAX_MINECRAFT_PROFILES,
        })
      }
      if (!verifiedIdentity && config.requireTotpForMcLink && self?.totpEnabled) {
        const tok = String(req.body?.totpCode || '').trim()
        if (!verifyTotpToken(self.totpSecret, tok)) {
          return jsonErr(res, 403, '两步验证码错误', 'totp_invalid')
        }
      }
      const trustedUuid = String(verifiedIdentity?.playerUuid || '').trim()
      // A one-time binding code is already verified by the game server. Requiring
      // the separate Mojang flag here made normal offline/skin-site bindings
      // appear successful while never becoming trusted for password bypass.
      const trustedBinding = Boolean(verifiedIdentity && trustedUuid)
      const link = await vlaLinkExternalUser(mc, req.user.id, trustedUuid, trustedBinding)
      if (link.skipped) {
        return res.json({
          ok: true,
          message: link.message || '已跳过',
          linked: false
        })
      }
      if (!link.ok) {
        const msg =
          link.json?.error === 'not_found'
            ? '游戏库中不存在该角色名，请先在服务器注册后再绑定'
            : link.json?.error || '绑定失败'
        const status =
          link.status >= 400 && link.status < 600 ? link.status : 502
        return jsonErr(res, status, msg, 'link_failed')
      }
      const u = store.users.find((x) => x.id === req.user.id)
      if (u) {
        const prevLinked = u.linkedMcUsername != null ? String(u.linkedMcUsername).trim() : ''
        const profile = {
          username: mc,
          uuid: String(verifiedIdentity?.playerUuid || '').trim(),
          linkedAt: new Date().toISOString(),
        }
        u.minecraftProfiles = [...existingProfiles, profile]
        setActiveMinecraftProfile(u, profile)
        grantDefaultSkinConsent(store, u.id, profile)
        markUserProfileDirty(u.id)
        appendSecurityAudit(store, u.id, 'link_minecraft', {
          mcUsername: mc,
          previousMcUsername: prevLinked || null,
          source: verifiedIdentity ? 'game_token' : 'site',
          at: new Date().toISOString(),
        })
        pushUserNotification(store, u.id, {
          type: 'binding_changed',
          title: '游戏角色已绑定',
          message: `已绑定角色 ${mc}`,
          detail: { mcUsername: mc, action: 'link' }
        })
        scheduleSave()
      }
      if (inv.code) claimInviteForUser(store, req.user.id, inv.code)
      if (config.mojangSkinSyncEnabled) {
        queueMicrotask(() => {
          persistMojangSkinSync(getStore(), req.user.id, mc).catch((e) => {
            console.warn('[starmc-api] 绑定后 Mojang 皮肤同步失败:', e?.message || e)
          })
        })
      }
      res.json({
        ok: true,
        linkedMcUsername: mc,
        linkedMcUuid: verifiedIdentity?.playerUuid || null,
        profiles: publicMinecraftProfiles(u),
        maxProfiles: MAX_MINECRAFT_PROFILES,
      })
    })
  )

  // ── 解绑游戏角色 ──────────────────────────────────────────
  app.post(
    '/api/user/unlink-minecraft',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      const profiles = minecraftProfilesFor(u)
      const requestedUuid = String(req.body?.playerUuid || '').trim()
      const requestedName = String(req.body?.username || '').trim().toLowerCase()
      const profile = profiles.find((entry) => requestedUuid && entry.uuid === requestedUuid)
        || profiles.find((entry) => requestedName && entry.username.toLowerCase() === requestedName)
        || activeMinecraftProfile(u, profiles)
      const mc = profile?.username || ''
      if (!profile || !mc) {
        return jsonErr(res, 400, '当前未绑定游戏角色', 'not_linked')
      }
      revokeSkinConsent(store, u.id, profile.uuid)
      const reasonInput = String(req.body?.reason || '').trim()
      if (reasonInput.length > 180) {
        return jsonErr(res, 400, '解绑原因不能超过 180 个字符', 'validation_error', {
          field: 'reason',
          maxLength: 180
        })
      }
      const unlinkReason = normalizeShortText(reasonInput, 180) || 'user_request'
      if (config.requireTotpForMcLink && u.totpEnabled) {
        const tok = String(req.body?.totpCode || '').trim()
        if (!verifyTotpToken(u.totpSecret, tok)) {
          return jsonErr(res, 403, '两步验证码错误', 'totp_invalid')
        }
      }
      const unbind = await vlaLinkExternalUser(mc, '', profile.uuid || '', false)
      if (!unbind.skipped && !unbind.ok) {
        const status =
          unbind.status >= 400 && unbind.status < 600 ? unbind.status : 502
        return jsonErr(res, status, unbind.json?.error || '解绑失败', 'unlink_failed')
      }
      u.minecraftProfiles = profiles.filter((entry) => entry !== profile)
      setActiveMinecraftProfile(u, u.minecraftProfiles[0] || null)
      markUserProfileDirty(u.id)
      appendSecurityAudit(store, u.id, 'unlink_minecraft', {
        mcUsername: mc,
        reason: unlinkReason,
        source: 'site',
        at: new Date().toISOString(),
      })
      pushUserNotification(store, u.id, {
        type: 'binding_changed',
        title: '游戏角色已解绑',
        message: `已解绑角色 ${mc}`,
        detail: { mcUsername: mc, action: 'unlink', reason: unlinkReason }
      })
      const psUn = ensurePlayerState(store, u.id)
      psUn.mojangSkin = null
      psUn.applied.version = (psUn.applied.version || 1) + 1
      markPlayerStateDirty(u.id)
      scheduleSave()
      res.json({
        ok: true,
        message: '已解绑游戏角色（插件侧 external_user_id 已清除）',
        reason: unlinkReason,
        profiles: publicMinecraftProfiles(u),
      })
    })
  )

  // ── 绑定状态 ──────────────────────────────────────────────
  app.get(
    '/api/user/minecraft/status',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')

      const profiles = publicMinecraftProfiles(u)
      const activeProfile = profiles.find((profile) => profile.active) || null
      const linked = profiles.length > 0
      const verifySession = getMcVerifySession(req.user.id)

      res.json({
        ok: true,
        linked,
        mcUsername: activeProfile?.username || null,
        mcUuid: activeProfile?.uuid || null,
        profiles,
        maxProfiles: MAX_MINECRAFT_PROFILES,
        verifiedMojang: Boolean(u.verifiedMojang),
        vlaLinked: linked,
        verifySession: verifySession.hasSession
          ? {
              id: verifySession.lastState?.id || null,
              code: verifySession.code,
              serverId: verifySession.lastState?.serverId || null,
              mcUsername: verifySession.mcUsername,
              verified: verifySession.verified,
              expired: verifySession.expired,
              createdAt: verifySession.createdAt,
              expiresAt: verifySession.expiresAt,
              retryCount: verifySession.retryCount,
              maxRetries: verifySession.maxRetries,
            }
          : null,
        verifyState: {
          status: verifySession.status,
          failureReason: verifySession.failureReason,
          conflictCode: verifySession.conflictCode,
          retryCount: verifySession.retryCount,
          maxRetries: verifySession.maxRetries,
          createdAt: verifySession.createdAt,
          expiresAt: verifySession.expiresAt,
          hasActiveSession: verifySession.hasSession,
          lastState: verifySession.lastState,
        },
      })
    })
  )

  app.post(
    '/api/user/minecraft/active',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const user = store.users.find((entry) => entry.id === req.user.id)
      if (!user) return jsonErr(res, 404, '用户不存在', 'not_found')

      const playerUuid = String(req.body?.playerUuid || '').trim()
      const username = String(req.body?.username || '').trim().toLowerCase()
      const profiles = minecraftProfilesFor(user)
      const profile = profiles.find((entry) => playerUuid && entry.uuid === playerUuid)
        || profiles.find((entry) => username && entry.username.toLowerCase() === username)
      if (!profile) return jsonErr(res, 404, '绑定角色不存在', 'minecraft_profile_not_found')

      user.minecraftProfiles = profiles
      setActiveMinecraftProfile(user, profile)
      markUserProfileDirty(user.id)
      scheduleSave()
      return res.json({
        ok: true,
        activeProfile: { username: profile.username, uuid: profile.uuid, active: true },
        profiles: publicMinecraftProfiles(user),
      })
    })
  )

  app.post(
    '/api/user/minecraft/order',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const user = store.users.find((entry) => entry.id === req.user.id)
      if (!user) return jsonErr(res, 404, '用户不存在', 'not_found')

      const profiles = minecraftProfilesFor(user)
      const requested = Array.isArray(req.body?.playerUuids)
        ? req.body.playerUuids.map((value) => String(value || '').trim())
        : []
      const knownUuids = profiles.map((profile) => profile.uuid)
      const hasCompleteOrder = requested.length === profiles.length
        && requested.every(Boolean)
        && new Set(requested).size === requested.length
        && knownUuids.every(Boolean)
        && requested.every((uuid) => knownUuids.includes(uuid))
      if (!hasCompleteOrder) {
        return jsonErr(res, 400, '角色顺序必须包含当前账号的全部绑定角色', 'minecraft_profile_order_invalid')
      }

      const byUuid = new Map(profiles.map((profile) => [profile.uuid, profile]))
      user.minecraftProfiles = requested.map((uuid) => byUuid.get(uuid))
      markUserProfileDirty(user.id)
      scheduleSave()
      return res.json({ ok: true, profiles: publicMinecraftProfiles(user) })
    })
  )

  // ── 绑定操作历史 ──────────────────────────────────────────
  app.get(
    '/api/user/minecraft/binding-history',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const sc = ensureSecurityCenter(store)
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
      const actionFilter = normalizeShortText(req.query.action, 48).toLowerCase()
      const q = normalizeShortText(req.query.q, 180).toLowerCase()

      let items = (Array.isArray(sc.auditLogs) ? sc.auditLogs : [])
        .filter((row) => String(row?.userId || '') === String(req.user.id || ''))
        .filter((row) =>
          MC_BINDING_AUDIT_ACTIONS.has(String(row?.action || '').trim().toLowerCase())
        )
        .map((row) => buildMcBindingHistoryItemFromAudit(row))

      if (actionFilter) {
        items = items.filter((row) => String(row?.action || '').toLowerCase() === actionFilter)
      }
      if (q) {
        items = items.filter((row) => {
          const haystack = [
            row.action,
            row.label,
            row.mcUsername,
            row.reason,
            row.conflictCode,
            row.source,
            JSON.stringify(row.detail || {}),
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(q)
        })
      }

      items.sort((a, b) => parseTimeMs(b.at) - parseTimeMs(a.at))
      const total = items.length
      const start = (page - 1) * pageSize
      // pagination shape: { page, pageSize, build(total) }
      return jsonPage(res, items.slice(start, start + pageSize), total, {
        page,
        pageSize,
        build: (t) => {
          const totalPages = Math.max(1, Math.ceil(t / pageSize))
          return { total: t, page, pageSize, totalPages, hasMore: page < totalPages, hasPrev: page > 1 }
        },
      })
    })
  )

  // ── 验证会话历史 ──────────────────────────────────────────
  app.get(
    '/api/user/minecraft/verify-history',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
      const statusFilter = normalizeShortText(req.query.status, 24).toLowerCase()

      const history = getMcVerifySessionHistory(req.user.id, {
        page,
        pageSize,
        status: statusFilter || undefined,
      })
      const items = history.items.map((row) => ({
        ...row,
        label: verifyStatusLabel(row?.status),
        retryCount: Number(row?.retries || 0),
        maxRetries: Number(row?.maxRetries || 0),
        timeline: {
          createdAt: Number(row?.createdAt || 0) || null,
          expiresAt: Number(row?.expiresAt || 0) || null,
          finishedAt: Number(row?.finishedAt || 0) || null,
        },
      }))

      return jsonPage(res, items, history.total, {
        page,
        pageSize,
        build: (t) => {
          const totalPages = Math.max(1, Math.ceil(t / pageSize))
          return { total: t, page, pageSize, totalPages, hasMore: page < totalPages, hasPrev: page > 1 }
        },
      })
    })
  )

  // ── 发起正版验证 ──────────────────────────────────────────
  app.post(
    '/api/user/minecraft/verify/init',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const u = store.users.find((x) => x.id === req.user.id)
      if (!u) return jsonErr(res, 404, '用户不存在', 'not_found')

      const mcUsername = String(req.body?.mcUsername || u.linkedMcUsername || '').trim().toLowerCase()
      if (!mcUsername || mcUsername.length < 3 || mcUsername.length > 16) {
        return jsonErr(res, 400, '请提供有效的游戏角色名（3–16 字符）', 'bad_username')
      }

      if (u.linkedMcUsername && u.linkedMcUsername.toLowerCase() !== mcUsername) {
        return jsonErr(res, 400, '只能验证当前绑定的游戏角色', 'username_mismatch')
      }

      const createResult = createMcVerifySession(req.user.id, mcUsername, {
        force: Boolean(req.body?.force),
      })
      if (!createResult.ok) {
        if (createResult.error === 'session_conflict') {
          return jsonErr(
            res,
            409,
            '当前已有进行中的验证会话，请先取消或等待过期',
            'verify_session_conflict',
            { activeSession: createResult.session }
          )
        }
        if (createResult.error === 'init_rate_limited') {
          return jsonErr(
            res,
            429,
            '验证发起过于频繁，请稍后再试',
            'verify_init_rate_limited',
            { retryAfterSeconds: createResult.retryAfterSeconds }
          )
        }
        if (createResult.error === 'max_retries_exceeded') {
          return jsonErr(
            res,
            429,
            '验证重试次数已达上限，请稍后再试',
            'verify_max_retries_exceeded',
            {
              retryAfterSeconds: createResult.retryAfterSeconds,
              retryCount: createResult.retryCount,
              maxRetries: createResult.maxRetries,
            }
          )
        }
        return jsonErr(res, 400, '发起验证失败', createResult.error || 'verify_init_failed')
      }
      const session = createResult.session
      appendSecurityAudit(store, req.user.id, 'verify_init', {
        mcUsername,
        sessionId: session?.id || null,
        retryCount: Number(session?.retries || 0),
        maxRetries: Number(session?.maxRetries || 0),
        source: 'site',
      })
      pushUserNotification(store, req.user.id, {
        type: 'verify_init',
        title: '已发起正版验证',
        message: `请在游戏内完成验证（角色：${mcUsername}）`,
        detail: {
          mcUsername,
          expiresAt: session?.expiresAt || null,
          retryCount: Number(session?.retries || 0)
        }
      })
      res.json({
        ok: true,
        code: session.code,
        serverId: session.serverId,
        expiresInSeconds: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
        instructions: createResult.instructions,
        state: {
          sessionId: session.id,
          status: session.status,
          retryCount: session.retries,
          maxRetries: session.maxRetries,
          expiresAt: session.expiresAt,
          remainingInitQuota: createResult.remainingInitQuota,
        },
      })
    })
  )

  // ── 取消正版验证 ──────────────────────────────────────────
  app.post(
    '/api/user/minecraft/verify/cancel',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const store = getStore()
      const reasonInput = String(req.body?.reason || '').trim()
      if (reasonInput.length > 180) {
        return jsonErr(res, 400, '取消原因不能超过 180 个字符', 'validation_error', {
          field: 'reason',
          maxLength: 180
        })
      }
      const cancelReason = normalizeShortText(reasonInput, 180) || 'user_cancelled'
      const beforeState = getMcVerifySession(req.user.id)
      const cancelled = clearMcVerifySession(req.user.id, cancelReason)
      const verifyState = getMcVerifySession(req.user.id)
      const lastState = verifyState.lastState || beforeState.lastState || null
      appendSecurityAudit(store, req.user.id, 'verify_cancel', {
        cancelled: Boolean(cancelled),
        reason: cancelReason,
        source: 'site',
        sessionId: lastState?.id || null,
        mcUsername:
          normalizeShortText(lastState?.mcUsername || beforeState.mcUsername, 16).toLowerCase() || null,
      })
      if (cancelled) {
        pushUserNotification(store, req.user.id, {
          type: 'verify_cancel',
          title: '正版验证已取消',
          message: '当前验证会话已取消',
          detail: {
            cancelled: true,
            reason: cancelReason,
            sessionId: lastState?.id || null,
          }
        })
      }
      res.json({
        ok: true,
        cancelled: Boolean(cancelled),
        state: {
          status: verifyState.status,
          failureReason: verifyState.failureReason,
          conflictCode: verifyState.conflictCode,
          retryCount: verifyState.retryCount,
          maxRetries: verifyState.maxRetries,
          hasActiveSession: verifyState.hasSession,
          lastState: verifyState.lastState,
        }
      })
    })
  )
}
