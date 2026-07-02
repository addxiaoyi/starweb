import http from 'node:http'
import https from 'node:https'
import { applyProbeEnv, isConnectionRefused, printPrerequisiteFailure } from './probe-utils.mjs'

applyProbeEnv()

const base = (process.env.VLA_HTTP_BASE || 'http://127.0.0.1:8090').replace(/\/+$/, '')
const apiKey = process.env.VLA_API_KEY || process.env.VLA_HTTP_API_KEY || ''

async function status(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`)
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers,
        timeout: 5000
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode || 0))
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

const checks = []

try {
  checks.push(['health public', await status('/v1/health'), [200, 503]])
  checks.push(['metrics no key', await status('/v1/metrics/prometheus'), [401]])
  checks.push(['user exists no key', await status('/v1/user/exists?name=test'), [401]])

  if (apiKey) {
    checks.push(['metrics with key', await status('/v1/metrics/prometheus', { 'X-API-Key': apiKey }), [200]])
  }
} catch (err) {
  if (isConnectionRefused(err)) {
    printPrerequisiteFailure('http-api', base, err.message)
    process.exit(2)
  }
  throw err
}

let ok = true
for (const [name, got, wants] of checks) {
  const pass = wants.includes(got)
  ok = ok && pass
  console.log(`${pass ? 'OK' : 'FAIL'} ${name}: HTTP ${got} expected ${wants.join('/')}`)
}

process.exit(ok ? 0 : 1)
