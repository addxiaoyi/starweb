import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()

const files = {
  server: join(ROOT, 'backend/src/server.js'),
  http: join(ROOT, 'backend/src/middleware/http.js'),
  envProd: join(ROOT, 'backend/.env.production.example'),
  viteConfig: join(ROOT, 'vite.config.ts'),
  nginxDev: join(ROOT, 'nginx.conf'),
  nginxProd: join(ROOT, 'nginx.prod.conf'),
  nginxSameHost: join(ROOT, 'deploy/linux/nginx.same-host.conf.example'),
  nginxVideo: join(ROOT, 'public/nginx-video-protection.conf'),
  sanitizer: join(ROOT, 'src/shared/utils/security.ts'),
  securityConfig: join(ROOT, 'src/shared/config/security.ts')
}

async function read(path) {
  return readFile(path, 'utf8')
}

function has(text, snippet) {
  return text.includes(snippet)
}

function hasRateLimiterExport(text, name) {
  return (
    has(text, `export const ${name} = rateLimit(`) ||
    has(text, `export const ${name} = createJsonRateLimiter(`)
  )
}

async function main() {
  const [server, http, envProd, viteConfig, nginxDev, nginxProd, nginxSameHost, nginxVideo, sanitizer, securityConfig] = await Promise.all([
    read(files.server),
    read(files.http),
    read(files.envProd),
    read(files.viteConfig),
    read(files.nginxDev),
    read(files.nginxProd),
    read(files.nginxSameHost),
    read(files.nginxVideo),
    read(files.sanitizer),
    read(files.securityConfig)
  ])

  const webSecurityFiles = [
    ['vite.config.ts', viteConfig],
    ['nginx.conf', nginxDev],
    ['nginx.prod.conf', nginxProd],
    ['deploy/linux/nginx.same-host.conf.example', nginxSameHost]
  ]
  const noWebInsecureCsp = webSecurityFiles.every(([, text]) =>
    !has(text, 'unsafe-eval') &&
    !has(text, 'frame-src *') &&
    !has(text, 'frame-ancestors *') &&
    !has(text, 'ALLOWALL') &&
    !has(text, 'Access-Control-Allow-Origin "*"') &&
    !has(text, "object-src '*'") &&
    has(text, "object-src 'none'") &&
    has(text, "frame-ancestors 'self'")
  )

  const checks = [
    {
      name: 'global rate limit enabled',
      ok: hasRateLimiterExport(http, 'globalLimiter') && has(server, 'app.use(globalLimiter)')
    },
    {
      name: 'authx callback rate limit enabled',
      ok:
        hasRateLimiterExport(http, 'authxWebhookCallbackLimiter') &&
        has(server, 'authxWebhookCallbackLimiter')
    },
    {
      name: 'uploads read rate limit enabled',
      ok: hasRateLimiterExport(http, 'uploadsReadLimiter') && has(server, "app.use('/uploads', uploadsReadLimiter)")
    },
    {
      name: 'webhook callback fail-closed in production',
      ok: has(server, 'config.isProd') && has(server, '!isPluginWebhookAuthConfigured()')
    },
    {
      name: 'plugin refresh fail-closed in production',
      ok: has(server, 'PLUGIN_REFRESH_SECRET')
    },
    {
      name: 'admin routes protected by secret in production',
      ok: has(server, '生产环境必须配置 DEV_ADMIN_SECRET')
    },
    {
      name: 'production env example includes critical secrets',
      ok:
        has(envProd, 'PLUGIN_REFRESH_SECRET=') &&
        has(envProd, 'DEV_ADMIN_SECRET=') &&
        has(envProd, 'AUTHX_VLA_WEBHOOK_SECRET=')
    },
    {
      name: 'web CSP and frame policies are restrictive',
      ok: noWebInsecureCsp
    },
    {
      name: 'docker nginx proxies SuperTokens auth routes',
      ok: has(nginxProd, 'location /auth/') && has(nginxProd, 'proxy_pass http://backend:8787/auth/')
    },
    {
      name: 'nginx rate limits enabled for static and API routes',
      ok:
        has(nginxProd, 'limit_req_zone $binary_remote_addr zone=starmc_static') &&
        has(nginxProd, 'limit_req_zone $binary_remote_addr zone=starmc_api') &&
        has(nginxProd, 'limit_req zone=starmc_static') &&
        has(nginxProd, 'limit_req zone=starmc_api') &&
        has(nginxSameHost, 'limit_req_zone $binary_remote_addr zone=starmc_site') &&
        has(nginxSameHost, 'limit_req_zone $binary_remote_addr zone=starmc_api')
    },
    {
      name: 'video nginx snippet prevents cross-site framing',
      ok: !has(nginxVideo, 'ALLOWALL') && !has(nginxVideo, 'frame-ancestors *') && has(nginxVideo, 'SAMEORIGIN')
    },
    {
      name: 'HTML sanitizer forbids scriptable markup',
      ok:
        !has(sanitizer, 'FORBID_TAGS: []') &&
        !has(sanitizer, 'FORBID_ATTR: []') &&
        has(sanitizer, "ALLOW_DATA_ATTR: false") &&
        has(sanitizer, "SAFE_FOR_TEMPLATES: true") &&
        has(sanitizer, "'script'") &&
        has(sanitizer, "'iframe'") &&
        has(sanitizer, "'onerror'")
    },
    {
      name: 'shared security config avoids wildcard sanitizer attributes',
      ok:
        !has(securityConfig, "ALLOWED_ATTR: ['*']") &&
        !has(securityConfig, 'FORBID_ATTR: []') &&
        has(securityConfig, "'srcdoc'") &&
        has(securityConfig, "'onerror'")
    }
  ]

  let failed = 0
  for (const c of checks) {
    if (c.ok) {
      console.log(`[security] PASS: ${c.name}`)
    } else {
      failed += 1
      console.error(`[security] FAIL: ${c.name}`)
    }
  }

  if (failed > 0) {
    console.error(`[security] baseline check failed (${failed} issue(s))`)
    process.exitCode = 1
    return
  }

  console.log('[security] baseline check passed')
}

main().catch((err) => {
  console.error('[security] baseline check error:', err?.message || err)
  process.exitCode = 1
})
