/**
 * 站点显示/登录名策略：须为完整邮箱格式，或包含至少一个汉字（Han）；
 * 禁止纯英文、数字与 ASCII 符号组合，避免与游戏 ID 风格混淆。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HAS_HAN_RE = /\p{Script=Han}/u

/**
 * @param {string} raw
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function isValidSiteUsername(raw) {
  const s = String(raw ?? '').trim()
  if (s.length < 2) {
    return { ok: false, message: '用户名至少 2 个字符' }
  }
  if (s.length > 254) {
    return { ok: false, message: '用户名过长（最多 254 字符）' }
  }
  if (EMAIL_RE.test(s)) {
    return { ok: true }
  }
  if (HAS_HAN_RE.test(s)) {
    return { ok: true }
  }
  return {
    ok: false,
    message: '用户名须为有效邮箱，或包含中文；不可为纯英文、数字与符号'
  }
}

/**
 * 在用户名合法前提下生成库内唯一名（邮箱按不区分大小写比较）。
 * @param {{ users: Array<{ username?: string }> }} store
 * @param {string} baseRaw
 */
export function makeUniqueSiteUsername(store, baseRaw) {
  let v = isValidSiteUsername(baseRaw)
  let base = String(baseRaw ?? '').trim().slice(0, 254)
  if (!v.ok) {
    base = '用户_oauth'
    v = isValidSiteUsername(base)
    if (!v.ok) base = '用户'
  }
  let candidate = base
  let n = 0
  const used = (name) =>
    store.users.some((u) => String(u.username || '').toLowerCase() === name.toLowerCase())
  while (used(candidate)) {
    n += 1
    if (EMAIL_RE.test(base)) {
      const at = base.lastIndexOf('@')
      if (at < 1) {
        candidate = `${base}_${n}`
        continue
      }
      const local = base.slice(0, at)
      const domain = base.slice(at + 1)
      candidate = `${local}_${n}@${domain}`
    } else {
      candidate = `${base}_${n}`
    }
  }
  return candidate
}
