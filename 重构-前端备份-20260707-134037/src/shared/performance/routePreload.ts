const allPreloaders: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/views/HomeView.vue'),
  '/skin': () => import('@/views/SkinStationView.vue'),
  '/guide': () => import('@/views/GuideView.vue'),
  '/map': () => import('@/views/MapView.vue'),
  '/ztjk': () => import('@/views/ZtjkView.vue')
}

let started = false
let loadTimer: number | null = null

const idle = (cb: () => void) => {
  if (typeof window === 'undefined') return

  const idleCallback = window.requestIdleCallback?.bind(window)
  if (typeof idleCallback === 'function') {
    idleCallback(cb, { timeout: 1800 })
  } else {
    loadTimer = window.setTimeout(cb, 900)
  }
}

const parseWarmRoutes = () => {
  const raw = String(import.meta.env.VITE_PRELOAD_ROUTES || '/,/skin,/guide,/map')
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

const savePreloadHeat = (path: string) => {
  try {
    const key = '__starmc_preload_heat__'
    const data = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>
    data[path] = Number(data[path] || 0) + 1
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore
  }
}

const getHotRoutes = () => {
  try {
    const key = '__starmc_preload_heat__'
    const data = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>
    return Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([p]) => p)
      .filter((p) => p in allPreloaders)
  } catch {
    return []
  }
}

const pickRoutes = () => {
  const staticRoutes = parseWarmRoutes().filter((p) => p in allPreloaders)
  const hotRoutes = getHotRoutes()
  return Array.from(new Set([...staticRoutes, ...hotRoutes]))
}

export const markRouteVisitedForPreloadHeat = (path: string) => {
  if (!path) return
  savePreloadHeat(path)
}

export const startRoutePreload = () => {
  if (started) return
  started = true

  const preloadRoutes = pickRoutes()

  idle(async () => {
    for (const route of preloadRoutes) {
      const task = allPreloaders[route]
      if (!task) continue
      try {
        await task()
      } catch {
        // ignore preload errors
      }
    }
  })
}

export const stopRoutePreload = () => {
  if (loadTimer !== null) {
    window.clearTimeout(loadTimer)
    loadTimer = null
  }
  started = false
}
