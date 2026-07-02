import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const INDEX_HTML = join(DIST, 'index.html')

const JS_BUDGET_KB = Number(process.env.BUDGET_JS_KB || 900)
const CSS_BUDGET_KB = Number(process.env.BUDGET_CSS_KB || 220)

function toKB(n) {
  return Number((n / 1024).toFixed(2))
}

async function statByUrls(urls) {
  let total = 0
  for (const u of urls) {
    const clean = u.replace(/^\//, '')
    const p = join(DIST, clean)
    const buf = await readFile(p)
    total += buf.byteLength
  }
  return total
}

async function main() {
  const html = await readFile(INDEX_HTML, 'utf8')

  const jsUrls = Array.from(html.matchAll(/<script[^>]*src="([^"]+\.js)"[^>]*>/g)).map((m) => m[1])
  const cssUrls = Array.from(html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)).map((m) => m[1])

  const jsBytes = await statByUrls(jsUrls)
  const cssBytes = await statByUrls(cssUrls)

  const jsKB = toKB(jsBytes)
  const cssKB = toKB(cssBytes)

  console.log(`[budget] JS total: ${jsKB}KB (limit ${JS_BUDGET_KB}KB)`)
  console.log(`[budget] CSS total: ${cssKB}KB (limit ${CSS_BUDGET_KB}KB)`)

  const violations = []
  if (jsKB > JS_BUDGET_KB) violations.push(`JS 超预算: ${jsKB}KB > ${JS_BUDGET_KB}KB`)
  if (cssKB > CSS_BUDGET_KB) violations.push(`CSS 超预算: ${cssKB}KB > ${CSS_BUDGET_KB}KB`)

  if (violations.length > 0) {
    console.error('[budget] 超预算:')
    for (const v of violations) console.error(`- ${v}`)
    process.exitCode = 1
    return
  }

  console.log('[budget] 通过')
}

main().catch((err) => {
  console.error('[budget] 检查失败:', err?.message || err)
  process.exitCode = 1
})
