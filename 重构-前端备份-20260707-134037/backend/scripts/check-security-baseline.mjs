import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const ROOT = process.cwd()

async function mustContain(file, expectedList) {
  const p = resolve(ROOT, file)
  const txt = await readFile(p, 'utf8')
  const misses = expectedList.filter((s) => !txt.includes(s))
  return { file, misses }
}

async function collectJsFiles(dirAbs) {
  const out = []
  const entries = await readdir(dirAbs, { withFileTypes: true })
  for (const ent of entries) {
    const full = join(dirAbs, ent.name)
    if (ent.isDirectory()) {
      const nested = await collectJsFiles(full)
      out.push(...nested)
      continue
    }
    if (ent.isFile() && full.endsWith('.js')) out.push(full)
  }
  return out
}

function findSensitiveConsoleHits(content) {
  const lines = content.split(/\r?\n/)
  const risky = /(token|authorization|password|secret|cookie|set-cookie|api[-_]?key)/i
  const consoleCall = /console\.(log|warn|error|info)\(/i
  const hits = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!consoleCall.test(line)) continue
    if (!risky.test(line)) continue
    hits.push({ line: i + 1, text: line.trim() })
  }
  return hits
}

async function checkSensitiveLogs() {
  const srcDir = resolve(ROOT, 'src')
  const files = await collectJsFiles(srcDir)
  const findings = []

  for (const fileAbs of files) {
    const txt = await readFile(fileAbs, 'utf8')
    const hits = findSensitiveConsoleHits(txt)
    if (hits.length > 0) {
      findings.push({
        file: fileAbs.replace(`${ROOT}${process.platform === 'win32' ? '\\' : '/'}`, ''),
        hits
      })
    }
  }

  return findings
}

async function main() {
  const checks = [
    mustContain('src/upload.js', [
      "const ALLOWED = new Set(['image/png', 'image/jpeg'])",
      'const ALLOWED_EXT = new Set',
      'function normalizedExtByMime',
      'if (ext && !ALLOWED_EXT.has(ext))',
      "limits: { fileSize: 4 * 1024 * 1024 }"
    ]),
    mustContain('src/middleware/http.js', [
      'export const globalLimiter',
      'export const uploadsReadLimiter',
      'export const authLimiter',
      'export const authxWebhookCallbackLimiter',
      'export const mcGamePasswordRequestLimiter',
      'export const mcGamePasswordConfirmLimiter'
    ]),
    mustContain('src/config.js', [
      'devAdminSecret',
      'pluginRefreshSecret',
      'authxVlaWebhookSecrets',
      'requireEmailVerifiedForSkinActions',
      'maxPasswordLength: 128'
    ]),
    mustContain('.env.example', [
      'PLUGIN_REFRESH_SECRET',
      'DEV_ADMIN_SECRET',
      'RATE_LIMIT_UPLOADS_READ',
      'RATE_LIMIT_AUTH',
      'BOT_UA_BLOCKLIST'
    ])
  ]

  const results = await Promise.all(checks)
  const failed = results.filter((r) => r.misses.length > 0)

  const sensitiveFindings = await checkSensitiveLogs()

  if (failed.length > 0 || sensitiveFindings.length > 0) {
    console.error('[security-baseline] failed')

    for (const f of failed) {
      console.error(`- ${f.file}`)
      for (const m of f.misses) {
        console.error(`  missing: ${m}`)
      }
    }

    for (const finding of sensitiveFindings) {
      console.error(`- ${finding.file}`)
      for (const hit of finding.hits) {
        console.error(`  sensitive-console line ${hit.line}: ${hit.text}`)
      }
    }

    process.exitCode = 1
    return
  }

  console.log('[security-baseline] passed')
}

main().catch((err) => {
  console.error('[security-baseline] error:', err?.message || err)
  process.exitCode = 1
})
