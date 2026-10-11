import { findUserByUsername, isValidUsername, normalizeUsername } from './supertokensUser.js'

function loginMethodRecipes(stUser) {
  return new Set(
    (Array.isArray(stUser?.loginMethods) ? stUser.loginMethods : [])
      .map((method) => String(method?.recipeId || '').trim().toLowerCase())
      .filter(Boolean)
  )
}

function accountEmail(stUser) {
  const email = Array.isArray(stUser?.emails) ? stUser.emails[0] : stUser?.email
  return String(email || '').trim().toLowerCase()
}

export function isLegacyPasswordlessOnlyUser(stUser) {
  const recipes = loginMethodRecipes(stUser)
  return recipes.has('passwordless') && !recipes.has('emailpassword')
}

export async function completeLegacyPasswordlessAccount({
  store,
  localUser,
  stUser,
  username,
  password,
  session,
  emailPassword,
}) {
  if (!isLegacyPasswordlessOnlyUser(stUser)) return { ok: false, code: 'account_setup_not_required' }

  const normalizedUsername = normalizeUsername(username)
  if (!isValidUsername(normalizedUsername)) return { ok: false, code: 'invalid_username' }
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return { ok: false, code: 'invalid_password' }
  }

  const duplicate = findUserByUsername(store, normalizedUsername)
  if (duplicate && String(duplicate.id) !== String(localUser?.id)) return { ok: false, code: 'username_taken' }

  const email = accountEmail(stUser)
  if (!email || !session || !emailPassword?.signUp) return { ok: false, code: 'account_setup_unavailable' }

  const signUp = await emailPassword.signUp('public', email, password, session)
  if (signUp.status !== 'OK') return { ok: false, code: 'credential_setup_failed', reason: signUp.status }

  localUser.username = normalizedUsername
  localUser.email = email
  localUser.supertokensUserId = signUp.user.id
  await session.mergeIntoAccessTokenPayload({ accountSetupRequired: false })
  return { ok: true, user: localUser, supertokensUserId: signUp.user.id }
}
