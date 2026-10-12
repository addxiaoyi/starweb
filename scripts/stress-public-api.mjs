import { performance } from 'node:perf_hooks'

const base = String(process.env.STRESS_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '')
const total = readPositiveInt('STRESS_TOTAL', 1000)
const concurrency = Math.min(total, readPositiveInt('STRESS_CONCURRENCY', 50))
const timeoutMs = readPositiveInt('STRESS_TIMEOUT_MS', 5000)
const routes = String(process.env.STRESS_ROUTES || '/api/health,/api/public/bootstrap,/api/public/site-features')
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean)

if (routes.length === 0) throw new Error('STRESS_ROUTES must contain at least one route')
if (!isLocalBase(base) && process.env.ALLOW_STRESS !== '1') {
  throw new Error('Refusing non-local stress target; set ALLOW_STRESS=1 explicitly')
}

const jobs = Array.from({ length: total }, (_, index) => routes[index % routes.length])
const statusCounts = new Map()
const samples = []
let cursor = 0
let errors = 0
let peakRss = process.memoryUsage().rss

async function request(route) {
  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}${route}`, { signal: controller.signal })
    await response.arrayBuffer()
    samples.push(performance.now() - started)
    const key = String(response.status)
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1)
  } catch (error) {
    errors += 1
    const key = `ERR:${error?.name || 'unknown'}`
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1)
  } finally {
    clearTimeout(timer)
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
  }
}

async function worker() {
  while (true) {
    const index = cursor++
    if (index >= jobs.length) return
    await request(jobs[index])
  }
}

const started = performance.now()
await Promise.all(Array.from({ length: concurrency }, worker))
const elapsedMs = performance.now() - started
samples.sort((left, right) => left - right)
const percentile = (ratio) => samples[Math.min(samples.length - 1, Math.floor(samples.length * ratio))] || 0

console.log(JSON.stringify({
  base,
  total,
  concurrency,
  routes,
  elapsedMs: round(elapsedMs),
  requestsPerSecond: round(total / (elapsedMs / 1000)),
  errors,
  statusCounts: Object.fromEntries(statusCounts),
  latencyMs: {
    p50: round(percentile(0.50)),
    p95: round(percentile(0.95)),
    p99: round(percentile(0.99)),
    max: round(samples.at(-1) || 0),
  },
  peakRssMb: round(peakRss / 1024 / 1024),
}, null, 2))

function readPositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function isLocalBase(value) {
  try {
    const url = new URL(value)
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  } catch {
    return false
  }
}

function round(value) {
  return Math.round(value * 100) / 100
}
