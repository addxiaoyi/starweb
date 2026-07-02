import { onCLS, onINP, onLCP, type Metric } from 'web-vitals'

export interface WebVitalsMetrics {
  lcp: number
  inp: number
  cls: number
  ttfb: number
  fcp: number
}

const webVitalsState: WebVitalsMetrics = {
  lcp: 0,
  inp: 0,
  cls: 0,
  ttfb: 0,
  fcp: 0,
}

function sendMetric(metric: Metric) {
  const endpoint = import.meta.env.VITE_WEB_VITALS_ENDPOINT?.trim()

  if (metric.name === 'LCP') webVitalsState.lcp = metric.value
  if (metric.name === 'INP') webVitalsState.inp = metric.value
  if (metric.name === 'CLS') webVitalsState.cls = metric.value
  if (metric.name === 'TTFB') webVitalsState.ttfb = metric.value
  if (metric.name === 'FCP') webVitalsState.fcp = metric.value

  if (import.meta.env.DEV) {
    console.debug(`[web-vitals] ${metric.name}`, metric.value, metric.rating)
    return
  }

  if (!endpoint) return

  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    pathname: typeof location !== 'undefined' ? location.pathname : '/',
    ts: Date.now(),
  })

  try {
    const blob = new Blob([body], { type: 'application/json' })
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(endpoint, blob)) {
      return
    }
    void fetch(endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    })
  } catch {
    /* ignore */
  }
}

export function getWebVitalsData(): WebVitalsMetrics {
  return { ...webVitalsState }
}

export function initWebVitals() {
  onCLS(sendMetric)
  onINP(sendMetric)
  onLCP(sendMetric)
}
