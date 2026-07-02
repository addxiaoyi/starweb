import type { Router } from 'vue-router'
import { markRouteVisitedForPreloadHeat } from '@/shared/performance/routePreload'

type TelemetryType = 'route_view'

interface RouteTelemetryEvent {
  type: TelemetryType
  path: string
  name: string
  section: string
  title: string
  role?: string
  actor?: string
  ts: number
}

declare global {
  interface Window {
    __starmc_telemetry__?: RouteTelemetryEvent[]
  }
}

const TELEMETRY_ENABLED = String(import.meta.env.VITE_TELEMETRY_ENABLED ?? '1') !== '0'
const SAMPLE_RATE = Math.min(1, Math.max(0, Number(import.meta.env.VITE_TELEMETRY_SAMPLE_RATE ?? '1')))
const QUEUE_LIMIT = 200
const FLUSH_BATCH = 20
const FLUSH_INTERVAL = 15000
const TELEMETRY_IDENTITY_KEY = '__starmc_telemetry_identity__'

const shouldSample = () => {
  if (SAMPLE_RATE >= 1) return true
  if (SAMPLE_RATE <= 0) return false
  return Math.random() < SAMPLE_RATE
}

const pushTelemetry = (event: RouteTelemetryEvent) => {
  const queue = window.__starmc_telemetry__ ||= []
  queue.push(event)
  if (queue.length > QUEUE_LIMIT) queue.shift()
}

const readTelemetryIdentity = () => {
  if (typeof window === 'undefined') return { role: 'guest', actor: '' }
  try {
    const raw = window.sessionStorage.getItem(TELEMETRY_IDENTITY_KEY)
    if (!raw) return { role: 'guest', actor: '' }
    const parsed = JSON.parse(raw) as { role?: string; actor?: string } | null
    return {
      role: String(parsed?.role || 'guest').slice(0, 32),
      actor: String(parsed?.actor || '').slice(0, 64)
    }
  } catch {
    return { role: 'guest', actor: '' }
  }
}

const flushQueue = async () => {
  if (!TELEMETRY_ENABLED) return
  const queue = window.__starmc_telemetry__ ||= []
  if (!queue.length) return

  const payload = queue.splice(0, FLUSH_BATCH)
  try {
    const resp = await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ events: payload })
    })
    // 静默处理远程 API 的 500 错误
    if (!resp.ok) return
  } catch {
    queue.unshift(...payload)
    if (queue.length > QUEUE_LIMIT) queue.length = QUEUE_LIMIT
  }
}

let flushTimer: number | null = null

const startFlushLoop = () => {
  if (flushTimer !== null) return
  flushTimer = window.setInterval(() => {
    void flushQueue()
  }, FLUSH_INTERVAL)

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushQueue()
    }
  })
}

export const installRouteTelemetry = (router: Router) => {
  if (!TELEMETRY_ENABLED) return
  startFlushLoop()

  router.afterEach((to) => {
    markRouteVisitedForPreloadHeat(to.path)
    if (!shouldSample()) return
    const identity = readTelemetryIdentity()
    pushTelemetry({
      type: 'route_view',
      path: to.fullPath,
      name: String(to.name || ''),
      section: String(to.meta?.section || 'core'),
      title: String(to.meta?.title || ''),
      role: identity.role,
      actor: identity.actor,
      ts: Date.now()
    })
  })
}
