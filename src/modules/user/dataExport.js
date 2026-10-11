const SENSITIVE_KEY = /(?:password|passwd|pass_hash|passwordhash|token|secret|totp|recoverycodes?|api[_-]?key|authorization|cookie|fingerprint|sessionhandle|replaytoken|verificationcode|challengecode)/i

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function sanitizeExportValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => sanitizeExportValue(item, seen))
  if (!isPlainObject(value)) return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  const output = {}
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(String(key).replaceAll('-', '_'))) continue
    output[key] = sanitizeExportValue(nested, seen)
  }
  seen.delete(value)
  return output
}

function ownedRows(rows, userId) {
  if (!Array.isArray(rows)) return []
  const uid = String(userId)
  return rows
    .filter((row) => String(row?.userId ?? row?.ownerId ?? row?.externalUserId ?? '') === uid)
    .map((row) => sanitizeExportValue(row))
}

function trustedDevicesFor(securityCenter, userId) {
  const bucket = securityCenter?.trustedDevices?.[userId]
  if (!bucket || typeof bucket !== 'object') return []
  return Object.values(bucket).map((device) => sanitizeExportValue(device))
}

export function buildUserDataExport({
  store,
  userId,
  profile,
  playerState,
  securityCenter,
  exportedAt = new Date().toISOString(),
}) {
  const uid = String(userId)
  const submissions = Array.isArray(store?.submissions)
    ? store.submissions.filter((row) => String(row?.userId ?? '') === uid)
    : []
  const reports = Array.isArray(store?.reports)
    ? store.reports.filter((row) => String(row?.userId ?? row?.reporterId ?? '') === uid)
    : []

  return sanitizeExportValue({
    schemaVersion: 2,
    exportedAt,
    profile,
    playerState,
    submissions,
    reports,
    favorites: store?.favorites?.[uid] ?? [],
    notifications: store?.userNotifications?.[uid] ?? [],
    security: {
      sessions: securityCenter?.sessions?.[uid] ?? [],
      alerts: ownedRows(securityCenter?.alerts, uid),
      loginEvents: ownedRows(securityCenter?.loginEvents, uid),
      auditLogs: ownedRows(securityCenter?.auditLogs, uid),
      trustedDevices: trustedDevicesFor(securityCenter, uid),
    },
    platformEvents: {
      authx: ownedRows(store?.authxEvents, uid),
      telemetry: ownedRows(store?.telemetryEvents, uid),
      minecraftPasswordResets: ownedRows(store?.mcResetEvents, uid),
      reviewAudit: ownedRows(store?.reviewAuditLogs, uid),
    },
  })
}
