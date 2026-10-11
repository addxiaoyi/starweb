import { applyProjectEnvToProcess } from '../src/envLayering.js'

applyProjectEnvToProcess({ mode: 'simple' })

const secret = String(process.env.DEV_ADMIN_SECRET || '').trim()
const port = Number(process.env.PORT || 8787)
const base = String(process.env.PUBLIC_API_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '')
const timeoutMs = Math.min(30_000, Math.max(1000, Number(process.env.PLUGIN_PROBE_TIMEOUT_MS || 8000)))

if (!secret) {
  console.error('[plugin-probe] DEV_ADMIN_SECRET 未配置，无法探测 bridge-status')
  process.exit(2)
}

const url = `${base}/api/admin/authx/bridge-status`
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), timeoutMs)

let res
try {
  res = await fetch(url, {
    method: 'GET',
    headers: { 'X-Admin-Secret': secret },
    signal: controller.signal,
  })
} catch (err) {
  const message = err?.name === 'AbortError'
    ? `请求超时（${timeoutMs}ms）`
    : String(err?.message || err)
  console.error(`[plugin-probe] 无法连接 ${url}: ${message}`)
  process.exit(1)
} finally {
  clearTimeout(timer)
}

let body = null
try {
  body = await res.json()
} catch {
  body = null
}

const ready = Boolean(body?.ready)
const plugin = body?.plugin || {}
const circuit = body?.circuitBreaker || {}

console.log('[plugin-probe] bridge-status')
console.log(`  url: ${url}`)
console.log(`  http: ${res.status}`)
console.log(`  ready: ${ready}`)
console.log(`  adapter: ${String(body?.adapter || 'unknown')}`)
console.log(`  plugin.reachable: ${Boolean(plugin.reachable)}`)
console.log(`  plugin.status: ${plugin.status ?? 'n/a'}`)
console.log(`  circuit.isOpen: ${Boolean(circuit.isOpen)}`)

if (!res.ok) {
  console.error(`[plugin-probe] HTTP ${res.status} ${body?.message || body?.code || ''}`.trim())
  process.exit(1)
}

if (!ready) {
  console.error('[plugin-probe] 桥接未就绪（ready=false），请检查 VLA 密钥、Webhook 与插件健康')
  process.exit(1)
}

console.log('[plugin-probe] OK')
process.exit(0)
