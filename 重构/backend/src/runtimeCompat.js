/**
 * 跨 Node 小版本 / 运行时的兼容工具（不依赖 Buffer#base64url 等较新 API 的语义细节）。
 */
import crypto from 'crypto'

/**
 * UTF-8 字符串常量时比较；长度不同返回 false，避免 crypto.timingSafeEqual 抛错。
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqualUtf8(a, b) {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  if (sa.length !== sb.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'))
  } catch {
    return false
  }
}

/** RFC 4648 base64url 编码（无填充） */
export function toBase64Url(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** RFC 4648 base64url 解码 */
export function fromBase64Url(str) {
  const s = String(str ?? '').trim()
  if (!s) throw new Error('empty_base64url')
  const pad = (4 - (s.length % 4)) % 4
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  return Buffer.from(b64, 'base64')
}
