/**
 * 归一化 ASN 类别
 */
export function normalizeAsnCategory(asn) {
  const value = String(asn || '').trim().toLowerCase()
  if (!value) return 'unknown'
  if (value.includes('hosting') || value.includes('datacenter') || value.includes('cloud')) return 'datacenter'
  if (value.includes('proxy') || value.includes('vpn') || value.includes('tor')) return 'proxy_suspected'
  if (value.includes('residential') || value.includes('broadband') || value.includes('telecom') || value.includes('mobile')) return 'residential'
  return 'unknown'
}

/**
 * 构建设备画像标签
 */
export function buildDeviceProfileLabel(event = {}) {
  const fingerprint = String(event.fingerprint || event.deviceFingerprint || '').trim()
  const method = String(event.method || '').trim().toLowerCase()
  if (!fingerprint) return 'unknown_device'
  if (method === 'trusted_device') return 'trusted_device'
  return 'known_device'
}

/**
 * 构建安全指标标签
 */
export function buildSecurityLabel(indicators) {
  if (indicators.hasAbnormalSessions || indicators.triggeredSecurityAlert) {
    return 'risk'
  }
  if (!indicators.totpEnabled || indicators.recentBindingChanges > 0) {
    return 'attention'
  }
  return 'safe'
}

/**
 * 确保用户的信任设备桶存在
 */
export function ensureTrustedDeviceBucket(sc, userId) {
  const key = String(userId || '').trim() || 'anonymous'
  if (!sc.trustedDevices[key] || typeof sc.trustedDevices[key] !== 'object') {
    sc.trustedDevices[key] = {}
  }
  return sc.trustedDevices[key]
}
