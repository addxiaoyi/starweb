import crypto from 'crypto'
import { markUserProfileDirty } from '../db/siteUserProfileSync.js'
import { isValidSiteUsername, makeUniqueSiteUsername } from '../validation/siteUsername.js'

export function findSupertokensLinkedUser(store, stUserId) {
  const id = String(stUserId || '').trim()
  if (!id) return null
  return (
    store.users.find(
      (u) =>
        Array.isArray(u.oauthAccounts) &&
        u.oauthAccounts.some((o) => o && o.provider === 'supertokens' && o.subject === id)
    ) || null
  )
}

function primaryEmail(stUser) {
  const emails = stUser?.emails
  if (!Array.isArray(emails) || !emails.length) return ''
  return String(emails[0] ?? '')
    .trim()
    .slice(0, 254)
}

function emailVerifiedFromStUser(stUser) {
  const methods = stUser?.loginMethods
  if (!Array.isArray(methods)) return true
  const ep = methods.find((m) => m && m.recipeId === 'emailpassword')
  if (ep && typeof ep.verified === 'boolean') return ep.verified
  return true
}

/** 将 SuperTokens 用户映射为站内 JSON 用户（皮肤站 / VLA external_user_id 仍用本地 id/uuid）。 */
export function ensureSupertokensLocalUser(store, stUser) {
  const sub = String(stUser?.id || '').trim()
  if (!sub) return null

  const email = primaryEmail(stUser)
  const ev = emailVerifiedFromStUser(stUser)
  let user = findSupertokensLinkedUser(store, sub)

  let usernameCandidate
  if (email && isValidSiteUsername(email).ok) {
    usernameCandidate = email
  } else {
    usernameCandidate = `用户_${sub.slice(0, 12)}`
  }

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      uuid: crypto.randomUUID(),
      username: makeUniqueSiteUsername(store, usernameCandidate),
      passwordHash: '',
      email,
      emailVerified: ev,
      oauthAccounts: [
        {
          provider: 'supertokens',
          subject: sub,
          email: email || undefined,
          linkedAt: new Date().toISOString()
        }
      ],
      linkedMcUsername: null,
      linkedMcUuid: null,
      verifiedMojang: false,
      emailVerifyToken: null,
      emailVerifyExpires: null,
      roles: []
    }
    store.users.push(user)
    markUserProfileDirty(user.id)
    return user
  }

  syncSupertokensLocalUser(user, stUser)
  if (!user.oauthAccounts.some((o) => o && o.provider === 'supertokens' && o.subject === sub)) {
    user.oauthAccounts.push({
      provider: 'supertokens',
      subject: sub,
      email: email || undefined,
      linkedAt: new Date().toISOString()
    })
  }
  markUserProfileDirty(user.id)
  return user
}

export function syncSupertokensLocalUser(local, stUser) {
  const email = primaryEmail(stUser)
  if (email) local.email = email
  local.emailVerified = emailVerifiedFromStUser(stUser)
}
