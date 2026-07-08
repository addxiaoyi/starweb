import nodemailer from 'nodemailer'
import { resolveProjectEnv } from '../src/envLayering.js'

async function checkHttpJson(url, timeoutMs = 5000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ac.signal })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: { message: String(e?.message || e) } }
  } finally {
    clearTimeout(t)
  }
}

async function checkSuperTokensCore(env) {
  const uri = String(env.SUPERTOKENS_CONNECTION_URI || '').trim().replace(/\/+$/, '')
  if (!uri) return { ok: false, detail: 'SUPERTOKENS_CONNECTION_URI 未配置' }
  const r = await checkHttpJson(`${uri}/hello`, 4000)
  if (!r.ok) return { ok: false, detail: `Core 不可达 (${r.status})` }
  return { ok: true, detail: `${uri}/hello` }
}

async function checkApiHealth(env) {
  const apiDomain = String(env.AUTH_API_DOMAIN || '').trim().replace(/\/+$/, '')
  if (!apiDomain) return { ok: false, detail: 'AUTH_API_DOMAIN 未配置' }
  const r = await checkHttpJson(`${apiDomain}/api/health`, 6000)
  if (!r.ok) return { ok: false, detail: `/api/health 不可用 (${r.status})` }
  return { ok: true, detail: 'api/health OK', payload: r.json }
}

async function checkSmtp(env) {
  const host = String(env.SUPERTOKENS_SMTP_HOST || '').trim()
  const port = Number(env.SUPERTOKENS_SMTP_PORT || 587)
  const secure = String(env.SUPERTOKENS_SMTP_SECURE || '0') === '1'
  const user = String(env.SUPERTOKENS_SMTP_USER || '').trim()
  const pass = String(env.SUPERTOKENS_SMTP_PASSWORD || '').trim()

  if (!host || !user || !pass) {
    return { ok: false, detail: 'SMTP 配置不完整（host/user/password）' }
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    })
    await transporter.verify()
    return { ok: true, detail: `${host}:${port} verify OK` }
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) }
  }
}

function checkGateConfig(env) {
  const flag = String(env.REQUIRE_EMAIL_VERIFIED_FOR_SKINS || '1').trim().toLowerCase()
  const enabled = !['0', 'false', 'off', 'no'].includes(flag)
  return {
    ok: enabled,
    detail: enabled
      ? '邮箱验证门禁已开启'
      : '邮箱验证门禁已关闭（REQUIRE_EMAIL_VERIFIED_FOR_SKINS=0）'
  }
}

async function main() {
  const { env, mode, loadedFiles } = resolveProjectEnv()
  const checks = []

  checks.push(['SuperTokens Core', await checkSuperTokensCore(env)])
  checks.push(['API Health', await checkApiHealth(env)])
  checks.push(['SMTP Verify', await checkSmtp(env)])
  checks.push(['Gate Config', checkGateConfig(env)])

  console.log('[e2e-auth-mail-gate] 结果：')
  console.log(`[e2e-auth-mail-gate] mode=${mode} sources=${loadedFiles.map((p) => p.split(/[/\\\\]/).pop()).join(' -> ') || 'process.env only'}`)
  for (const [name, r] of checks) {
    console.log(`- ${name}: ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail}`)
  }

  const failed = checks.filter(([, r]) => !r.ok)
  if (failed.length) {
    console.log('\n[e2e-auth-mail-gate] 总结：FAIL（存在未通过项）')
    process.exit(1)
  }

  console.log('\n[e2e-auth-mail-gate] 总结：PASS（登录-邮箱-门禁链路关键依赖可用）')
}

main().catch((e) => {
  console.error('[e2e-auth-mail-gate] 运行异常:', e?.message || e)
  process.exit(1)
})
