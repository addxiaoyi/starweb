/**
 * QQ 空间 portrait 接口：批量获取 QQ 昵称与头像。
 */

const QQ_ID_RE = /^\d{5,12}$/
const BAD_NICK_RE = /�|锟|[\uFFFD]/

export function normalizeQq(value) {
  return String(value || '').replace(/\D/g, '')
}

export function buildQqAvatarUrl(qq, size = 100) {
  const normalized = normalizeQq(qq)
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(normalized)}&s=${size}`
}

export function isUsableQqNickname(value) {
  const nickname = String(value || '').trim()
  if (!nickname) return false
  return !BAD_NICK_RE.test(nickname)
}

export function sanitizeUins(raw) {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map((entry) => normalizeQq(entry))
      .filter((qq) => QQ_ID_RE.test(qq))
  )].slice(0, 50)
}

export function parsePortraitJsonp(raw) {
  const text = String(raw || '').trim()
  const match = text.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/)
  if (!match) return {}
  try {
    const parsed = JSON.parse(match[1])
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function resolveAvatar(qq, entry) {
  if (!Array.isArray(entry)) return buildQqAvatarUrl(qq)
  const source = typeof entry[0] === 'string' ? entry[0].trim() : ''
  if (!source) return buildQqAvatarUrl(qq)
  return source.startsWith('http://') ? source.replace('http://', 'https://') : source
}

export function resolveNickname(entry) {
  if (!Array.isArray(entry)) return ''
  const name = typeof entry[6] === 'string' ? entry[6] : ''
  return String(name || '').trim()
}

export async function fetchQqProfiles(qqList, timeoutMs = 10000) {
  const normalized = sanitizeUins(qqList.join(','))
  if (normalized.length === 0) {
    return { ok: false, message: '缺少有效的 QQ 号列表', profiles: {} }
  }

  const url = `https://users.qzone.qq.com/fcg-bin/cgi_get_portrait.fcg?uins=${encodeURIComponent(normalized.join(','))}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'user-agent': 'star-web.qq-profile-proxy/1.0',
      accept: 'text/plain,*/*'
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs)
  })

  const raw = await response.text()
  const parsed = parsePortraitJsonp(raw)
  const profiles = {}

  for (const qq of normalized) {
    const entry = parsed[qq]
    profiles[qq] = {
      qq,
      nickname: resolveNickname(entry),
      avatarUrl: resolveAvatar(qq, entry)
    }
  }

  return {
    ok: true,
    source: 'qzone_portrait',
    fetchedAt: new Date().toISOString(),
    profiles
  }
}

export function buildQqProfilesFallback(qqList, message) {
  const normalized = sanitizeUins(qqList.join(','))
  const profiles = {}
  for (const qq of normalized) {
    profiles[qq] = { qq, nickname: '', avatarUrl: buildQqAvatarUrl(qq) }
  }
  return {
    ok: false,
    message,
    profiles
  }
}
