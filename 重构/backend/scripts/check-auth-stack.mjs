/**
 * 跨平台自检：SuperTokens Core（/hello）与可选 PostgreSQL（SELECT 1）。
 * 在 backend 目录执行：npm run doctor 或 npm run doctor:simple
 */
import pg from 'pg'
import { resolveProjectEnv } from '../src/envLayering.js'

async function checkSuperTokens(baseUri) {
  const uri = String(baseUri || '').trim().replace(/\/+$/, '')
  if (!uri) {
    return { ok: false, skip: true, detail: '未设置 SUPERTOKENS_CONNECTION_URI（登录将不可用）' }
  }
  const url = `${uri}/hello`
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 4000)
  try {
    const res = await fetch(url, { signal: ac.signal })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status} ${text.slice(0, 120)}` }
    }
    if (!/hello/i.test(text)) {
      return { ok: false, detail: `非预期响应: ${text.slice(0, 80)}` }
    }
    return { ok: true, detail: url }
  } catch (e) {
    const msg = e?.name === 'AbortError' ? '连接超时' : String(e?.message || e)
    return { ok: false, detail: msg }
  } finally {
    clearTimeout(t)
  }
}

async function checkPostgres(databaseUrl) {
  const url = String(databaseUrl || '').trim()
  if (!url) {
    return { ok: true, skip: true, detail: '未设置 DATABASE_URL（仅用 store.json）' }
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000
  })
  try {
    const r = await pool.query('SELECT 1 AS ok')
    const ok = r.rows?.[0]?.ok === 1
    return ok ? { ok: true, detail: 'SELECT 1 成功' } : { ok: false, detail: '查询结果异常' }
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) }
  } finally {
    await pool.end().catch(() => {})
  }
}

const { env, mode, loadedFiles } = resolveProjectEnv()
const stUri = env.SUPERTOKENS_CONNECTION_URI
const dbUrl = env.DATABASE_URL

console.log(
  `[starmc-api] 环境自检（mode=${mode}，来源=${loadedFiles.map((p) => p.split(/[/\\\\]/).pop()).join(' -> ') || 'process.env only'} + process.env）\n`
)

const st = await checkSuperTokens(stUri)
if (st.skip) {
  console.log('SuperTokens Core:', '—', st.detail)
} else if (st.ok) {
  console.log('SuperTokens Core:', 'OK', `← ${st.detail}`)
} else {
  console.log('SuperTokens Core:', '失败', st.detail)
  console.log(
    '  提示: 裸机 → 安装官方 SuperTokens Core，监听 3567，与 SUPERTOKENS_CONNECTION_URI 一致；详见 backend/README.md'
  )
  console.log(
    '  提示: 若使用 Docker → 在「重构」目录 docker compose up -d supertokens-db supertokens'
  )
}

const pgR = await checkPostgres(dbUrl)
if (pgR.skip) {
  console.log('PostgreSQL:', '—', pgR.detail)
} else if (pgR.ok) {
  console.log('PostgreSQL:', 'OK', `← ${pgR.detail}`)
} else {
  console.log('PostgreSQL:', '失败', pgR.detail)
  console.log('  提示: 裸机 → 本机安装 PostgreSQL，在 .env 设置 DATABASE_URL 指向你的库')
  console.log(
    '  提示: 若使用 Docker → docker compose up -d site-postgres（示例端口 5433）'
  )
}

const stFail = !st.skip && !st.ok
const pgFail = !pgR.skip && !pgR.ok
process.exit(stFail || pgFail ? 1 : 0)
