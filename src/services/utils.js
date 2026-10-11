import crypto from 'crypto'

/**
 * 解析时间字符串为毫秒时间戳，无效返回 0
 */
export function parseTimeMs(value) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : 0
}

/**
 * 截断并清理短文本
 */
export function normalizeShortText(input, maxLen = 120) {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw
}

/**
 * 确保值为普通对象，否则返回空对象
 */
export function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * 简单邮箱格式校验
 */
export function isValidEmailAddress(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * 根据 User-Agent 分类设备类型
 */
export function classifyDeviceType(uaRaw) {
  const ua = String(uaRaw || '').toLowerCase()
  if (!ua) return 'unknown'
  if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler')) return 'bot'
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  return 'desktop'
}

/**
 * 脱敏 IP 地址用于日志记录
 */
export function maskIpForLog(ip) {
  const raw = String(ip || '').trim()
  if (!raw) return 'unknown'
  if (raw.includes(':')) {
    return raw.split(':').slice(0, 3).join(':') + ':****'
  }
  const seg = raw.split('.')
  if (seg.length === 4) {
    return `${seg[0]}.${seg[1]}.*.*`
  }
  return 'masked'
}

/**
 * 判断是否为内网 IP
 */
export function isPrivateIp(ip) {
  const s = String(ip || '').trim()
  if (!s) return true
  return s.startsWith('10.') || s.startsWith('127.') || s.startsWith('192.168.') || s.startsWith('172.16.')
}

/**
 * 生成 10 个恢复码
 */
export function makeRecoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase())
}
