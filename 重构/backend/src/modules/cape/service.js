/**
 * 披风素材搜索：Openverse + Wikimedia Commons fallback。
 */

async function fetchJson(url, timeoutMs = 8000) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'starmc-cape-search/1.0'
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store'
  })
  if (!response.ok) return null
  return response.json()
}

export async function searchOpenverse(q, page, limit) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page=${page}&page_size=${limit}`
  const payload = await fetchJson(url)
  if (!payload) return null
  const rows = Array.isArray(payload?.results) ? payload.results : []
  const items = rows
    .map((item) => ({
      id: String(item?.id || item?.url || item?.title || ''),
      title: String(item?.title || '未命名图片'),
      description: item?.creator ? `作者：${String(item.creator)}` : '',
      thumbnailUrl: String(item?.thumbnail || ''),
      imageUrl: String(item?.url || item?.thumbnail || ''),
      source: 'openverse',
      author: String(item?.creator || ''),
      license: String(item?.license || ''),
      referenceUrl: String(item?.foreign_landing_url || item?.url || '')
    }))
    .filter((item) => Boolean(item.id) && Boolean(item.thumbnailUrl) && Boolean(item.imageUrl))
  return { items, total: Number(payload?.result_count || items.length) || items.length }
}

export async function searchWikimedia(q, page, limit) {
  const offset = (page - 1) * limit
  const primaryUrl = `https://commons.wikimedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
  const fallbackUrl = `https://commons.wikimedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${limit}&namespace=6&format=json&origin=*`

  const payload = await fetchJson(primaryUrl)
  if (payload) {
    const pages = Array.isArray(payload?.pages) ? payload.pages : []
    const items = pages
      .map((item) => ({
        id: String(item?.id || item?.key || item?.title || ''),
        title: String(item?.title || '未命名图片'),
        description: String(item?.excerpt || '').replace(/<[^>]+>/g, ' ').trim(),
        thumbnailUrl: String(item?.thumbnail?.url || ''),
        imageUrl: String((item?.thumbnail?.url || '').replace(/\/thumb\/(.+)\/\d+px-[^/]+$/, '/$1')),
        source: 'wikimedia',
        author: 'Wikimedia Commons',
        license: 'Wikimedia Commons',
        referenceUrl: String(item?.content_urls?.desktop?.page || '')
      }))
      .filter((item) => Boolean(item.id) && Boolean(item.thumbnailUrl) && Boolean(item.imageUrl))
    return { items, total: items.length }
  }

  const fallbackPayload = await fetchJson(fallbackUrl)
  if (!fallbackPayload) return null
  const titles = Array.isArray(fallbackPayload?.[1]) ? fallbackPayload[1] : []
  const descriptions = Array.isArray(fallbackPayload?.[2]) ? fallbackPayload[2] : []
  const links = Array.isArray(fallbackPayload?.[3]) ? fallbackPayload[3] : []
  const mediaLinks = Array.isArray(fallbackPayload?.[4]) ? fallbackPayload[4] : []
  const items = titles
    .map((title, index) => ({
      id: String(title || index),
      title: String(title || '未命名图片'),
      description: String(descriptions[index] || ''),
      thumbnailUrl: String(mediaLinks[index] || ''),
      imageUrl: String(mediaLinks[index] || ''),
      source: 'wikimedia',
      author: 'Wikimedia Commons',
      license: 'Wikimedia Commons',
      referenceUrl: String(links[index] || '')
    }))
    .filter((item) => Boolean(item.id) && Boolean(item.thumbnailUrl))
  return { items, total: items.length }
}
