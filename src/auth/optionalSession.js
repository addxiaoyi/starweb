export function createOptionalSessionUser({
  isReady,
  verifySession,
  attachLocalUser,
  resolveDevUser,
}) {
  let optionalVerifier = null

  return function optionalSessionUser(req, res, next) {
    if (!isReady()) {
      const devUser = resolveDevUser?.(req)
      if (devUser) req.user = devUser
      return next()
    }

    optionalVerifier ||= verifySession({ sessionRequired: false })
    return optionalVerifier(req, res, (err) => {
      if (err) return next(err)
      if (!req.session) return next()
      return attachLocalUser(req, res, next)
    })
  }
}
