/**
 * 登录闭环自检（配置层）：SuperTokens + SMTP + 邮箱验证门禁
 * 用法：在 backend 目录执行 `npm run doctor:auth-closure` 或 `npm run doctor:auth-closure:simple`
 */
import { resolveProjectEnv } from '../src/envLayering.js'

function env(key, fileEnv) {
  return String(process.env[key] ?? fileEnv[key] ?? '').trim()
}

const { env: fileEnv, mode, loadedFiles } = resolveProjectEnv()

const report = {
  supertokensConnectionUri: Boolean(env('SUPERTOKENS_CONNECTION_URI', fileEnv)),
  authApiDomain: Boolean(env('AUTH_API_DOMAIN', fileEnv)),
  authWebsiteDomain: Boolean(env('AUTH_WEBSITE_DOMAIN', fileEnv)),
  smtpHost: Boolean(env('SUPERTOKENS_SMTP_HOST', fileEnv) || env('SMTP_HOST', fileEnv)),
  smtpUser: Boolean(env('SUPERTOKENS_SMTP_USER', fileEnv) || env('SMTP_USER', fileEnv)),
  smtpPassword: Boolean(env('SUPERTOKENS_SMTP_PASSWORD', fileEnv) || env('SMTP_PASSWORD', fileEnv)),
  requireEmailVerifiedForSkins: env('REQUIRE_EMAIL_VERIFIED_FOR_SKINS', fileEnv) !== '0'
}

const required = [
  ['supertokensConnectionUri', '缺少 SUPERTOKENS_CONNECTION_URI'],
  ['authApiDomain', '缺少 AUTH_API_DOMAIN'],
  ['authWebsiteDomain', '缺少 AUTH_WEBSITE_DOMAIN'],
  ['smtpHost', '缺少 SMTP_HOST / SUPERTOKENS_SMTP_HOST'],
  ['smtpUser', '缺少 SMTP_USER / SUPERTOKENS_SMTP_USER'],
  ['smtpPassword', '缺少 SMTP_PASSWORD / SUPERTOKENS_SMTP_PASSWORD']
]

const failures = required.filter(([k]) => !report[k]).map(([, msg]) => msg)

console.log('[auth-closure] 配置检查结果:')
console.log(`[auth-closure] mode=${mode} sources=${loadedFiles.map((p) => p.split(/[/\\\\]/).pop()).join(' -> ') || 'process.env only'}`)
console.log(JSON.stringify(report, null, 2))

if (failures.length > 0) {
  console.log('\n[auth-closure] 失败项:')
  for (const m of failures) console.log('-', m)
  process.exit(1)
}

console.log('\n[auth-closure] 通过：登录-邮箱验证-门禁闭环所需配置已齐全。')
