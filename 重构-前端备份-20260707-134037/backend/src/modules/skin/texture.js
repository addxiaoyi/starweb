/**
 * GET /api/skins/texture
 * 代理 mc-heads.net / textures.minecraft.net 皮肤图片，失败时返回 SVG fallback。
 */

const ALLOWED_HOSTS = new Set([
  'mc-heads.net',
  'textures.minecraft.net'
])

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function isPrivateIp(ip) {
  const trimmed = String(ip || '').trim().toLowerCase()
  if (trimmed.startsWith('127.')) return true
  if (trimmed.startsWith('10.')) return true
  if (trimmed.startsWith('192.168.')) return true
  if (trimmed.startsWith('169.254.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(trimmed)) return true
  if (trimmed === '::1' || trimmed === 'localhost') return true
  return false
}

async function isAllowedHost(hostname) {
  const lower = String(hostname || '').toLowerCase().trim()
  if (!ALLOWED_HOSTS.has(lower)) return false
  try {
    const { lookup } = await import('node:dns')
    const addresses = await new Promise((resolve, reject) => {
      lookup(lower, { all: true }, (err, addrs) => {
        if (err) return reject(err)
        resolve(addrs || [])
      })
    })
    if (Array.isArray(addresses) && addresses.some((a) => isPrivateIp(a?.address))) {
      return false
    }
  } catch {
    // 域名解析失败时维持白名单校验结果
  }
  return true
}

function hashSkinColor(seed) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }
  const hue = Math.abs(hash) % 360
  return {
    shirt: `hsl(${hue} 38% 34%)`,
    trim: `hsl(${(hue + 42) % 360} 46% 24%)`
  }
}

function fallbackSkinResponse(seed, reason) {
  const { shirt, trim } = hashSkinColor(seed)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" shape-rendering="crispEdges">
  <rect width="64" height="64" fill="transparent"/>
  <rect x="8" y="8" width="8" height="8" fill="#f2b39e"/>
  <rect x="40" y="8" width="8" height="8" fill="#111111"/>
  <rect x="20" y="20" width="8" height="12" fill="${shirt}"/>
  <rect x="20" y="36" width="8" height="12" fill="${trim}"/>
  <rect x="44" y="20" width="4" height="12" fill="#f2b39e"/>
  <rect x="36" y="52" width="4" height="12" fill="#8f8f8f"/>
  <rect x="4" y="20" width="4" height="12" fill="#f2b39e"/>
  <rect x="20" y="52" width="4" height="12" fill="#8f8f8f"/>
  <rect x="8" y="14" width="8" height="2" fill="#171717"/>
  <rect x="20" y="26" width="8" height="2" fill="${trim}"/>
</svg>`
  return {
    status: 200,
    body: svg,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'x-starmc-texture-fallback': reason
    }
  }
}

function jsonError(message, status) {
  return {
    status,
    body: { ok: false, message },
    headers: { 'cache-control': 'no-store' }
  }
}

export async function proxySkinTexture(rawUrl) {
  const urlString = String(rawUrl || '').trim()
  if (!urlString) return jsonError('缺少皮肤图片地址', 400)

  let target
  try {
    target = new URL(urlString)
  } catch {
    return jsonError('图片地址无效', 400)
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return jsonError('仅支持 http(s) 图片地址', 400)
  }

  if (!(await isAllowedHost(target.hostname))) {
    return jsonError('当前只允许代理受信任的皮肤源', 403)
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'user-agent': 'star-web.skin-texture-proxy/1.0',
        accept: 'image/png,image/*;q=0.9,*/*;q=0.1'
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    })

    if (!upstream.ok) {
      return fallbackSkinResponse(urlString, `upstream-${upstream.status}`)
    }

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase()
    if (!contentType.startsWith('image/')) {
      return jsonError('上游返回的不是图片内容', 415)
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return jsonError('图片体积超过允许范围', 413)
    }

    return {
      status: 200,
      body: buffer,
      headers: {
        'content-type': contentType || 'image/png',
        'content-length': String(buffer.byteLength),
        'cache-control': 'public, max-age=300, stale-while-revalidate=86400'
      }
    }
  } catch (error) {
    return fallbackSkinResponse(urlString, error instanceof Error ? error.message : 'proxy-error')
  }
}

export function registerSkinTextureRoute(app, deps = {}) {
  const jsonErr = deps.jsonErr || ((res, status, message) => res.status(status).json({ ok: false, message }))

  app.get('/api/skins/texture', async (req, res, next) => {
    try {
      const result = await proxySkinTexture(req.query.url)
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          if (value !== undefined) res.setHeader(key, value)
        }
      }
      if (Buffer.isBuffer(result.body)) {
        return res.status(result.status).send(result.body)
      }
      return jsonErr(res, result.status, result.body?.message || '请求失败')
    } catch (error) {
      next(error)
    }
  })
}
