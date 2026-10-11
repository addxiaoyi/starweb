export const SESSION_METADATA_INTERVAL_MS = 15 * 60 * 1000

function asHandleList(value) {
  return Array.isArray(value) ? value.filter((handle) => typeof handle === 'string' && handle) : []
}

function asTimestamp(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function deviceMetadata(info) {
  const metadata = info?.sessionDataInDatabase?.deviceMetadata
  return metadata && typeof metadata === 'object' ? metadata : {}
}

export function createSessionCoreAdapter(sessionRecipe) {
  return {
    getAllSessionHandlesForUser: (userId) => sessionRecipe.getAllSessionHandlesForUser(userId),
    getSessionInformation: (handle) => sessionRecipe.getSessionInformation(handle),
    revokeSession: (handle) => sessionRecipe.revokeSession(handle),
    revokeMultipleSessions: (handles) => sessionRecipe.revokeMultipleSessions(handles),
  }
}

export async function listUserSessions({ core, userId, currentHandle }) {
  const handles = asHandleList(await core.getAllSessionHandlesForUser(userId))
  const rows = await Promise.all(handles.map(async (handle) => {
    const info = await core.getSessionInformation(handle)
    if (!info || info.userId !== userId) return null

    const metadata = deviceMetadata(info)
    return {
      id: handle,
      current: handle === currentHandle,
      device: typeof metadata.device === 'string' && metadata.device ? metadata.device : '未知设备',
      ip: typeof metadata.ip === 'string' && metadata.ip ? metadata.ip : null,
      createdAt: asTimestamp(info.timeCreated),
      lastActiveAt: asTimestamp(metadata.lastSeenAt) ?? asTimestamp(info.timeCreated),
      expiresAt: asTimestamp(info.expiry),
    }
  }))

  return rows
    .filter(Boolean)
    .sort((left, right) => Number(right.lastActiveAt || 0) - Number(left.lastActiveAt || 0))
}

export async function revokeUserSession({ core, userId, handle }) {
  if (typeof handle !== 'string' || !handle) return false

  const handles = asHandleList(await core.getAllSessionHandlesForUser(userId))
  if (!handles.includes(handle)) return false

  return core.revokeSession(handle)
}

export async function revokeOtherUserSessions({ core, userId, currentHandle }) {
  const handles = asHandleList(await core.getAllSessionHandlesForUser(userId))
  const targets = handles.filter((handle) => handle !== currentHandle)
  if (!targets.length) return 0

  const revoked = await core.revokeMultipleSessions(targets)
  return Array.isArray(revoked) ? revoked.length : 0
}

export async function touchSessionDeviceMetadata({ session, headers, ip, now = Date.now }) {
  const existing = await session.getSessionDataFromDatabase()
  const metadata = deviceMetadata({ sessionDataInDatabase: existing })
  const previous = Number(metadata.lastSeenAt || 0)
  const timestamp = now()
  if (Number.isFinite(previous) && timestamp - previous < SESSION_METADATA_INTERVAL_MS) return false

  await session.updateSessionDataInDatabase({
    ...(existing && typeof existing === 'object' ? existing : {}),
    deviceMetadata: {
      device: String(headers?.['user-agent'] || '未知设备').slice(0, 180),
      ip: String(ip || ''),
      lastSeenAt: timestamp,
    },
  })
  return true
}
