import { completeLegacyPasswordlessAccount, isLegacyPasswordlessOnlyUser } from '../../auth/legacyAccountSetup.js'

function publicSetupStatus(stUser) {
  const email = Array.isArray(stUser?.emails) ? stUser.emails[0] : stUser?.email
  return {
    required: isLegacyPasswordlessOnlyUser(stUser),
    email: String(email || '').trim() || null,
  }
}

export function registerLegacyAccountSetupRoutes(app, deps) {
  const {
    requireUser,
    getStore,
    getSupertokensUser,
    emailPassword,
    jsonOk,
    jsonErr,
    scheduleSave,
    markUserProfileDirty,
    asyncHandler,
  } = deps

  app.get('/api/auth/account-setup', requireUser, asyncHandler(async (req, res) => {
    const stUser = await getSupertokensUser(req.session.getUserId())
    if (!stUser) return jsonErr(res, 401, '认证账号不存在', 'unauthorized')
    return jsonOk(res, publicSetupStatus(stUser))
  }))

  app.post('/api/auth/account-setup', requireUser, asyncHandler(async (req, res) => {
    const stUser = await getSupertokensUser(req.session.getUserId())
    if (!stUser) return jsonErr(res, 401, '认证账号不存在', 'unauthorized')

    const result = await completeLegacyPasswordlessAccount({
      store: getStore(),
      localUser: req.user,
      stUser,
      username: req.body?.username,
      password: req.body?.password,
      session: req.session,
      emailPassword,
    })
    if (!result.ok) {
      const status = result.code === 'username_taken' ? 409 : result.code === 'account_setup_not_required' ? 409 : 400
      return jsonErr(res, status, '账号补全失败', result.code)
    }

    markUserProfileDirty?.(req.user.id)
    scheduleSave?.()
    return jsonOk(res, { completed: true, user: result.user })
  }))
}
