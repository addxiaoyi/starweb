import crypto from 'node:crypto'
import nodemailer from 'nodemailer'

const SMTP_BASE_KEYS = [
  'SUPERTOKENS_SMTP_HOST',
  'SUPERTOKENS_SMTP_PORT',
  'SUPERTOKENS_SMTP_FROM_EMAIL',
]

const SMTP_AUTH_KEYS = [
  'SUPERTOKENS_SMTP_USER',
  'SUPERTOKENS_SMTP_PASSWORD',
]

const SANDBOX_SMTP_HOSTS = new Set([
  'smtp.ethereal.email',
])
const EMAIL_CODE_LENGTH = 6
const EMAIL_CODE_GROUP_SIZE = 3

function envBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function smtpAuthEnabled(env) {
  const value = String(env.SUPERTOKENS_SMTP_AUTH ?? 'true').trim()
  return !/^(0|false|no|off)$/i.test(value)
}

function escapeHtml(value) {
  const escapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return String(value).replace(/[&<>"']/g, (char) => escapes[char])
}

function renderText(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>')
}

function normalizeRequiredText(value, field) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`StarMC email requires ${field}`)
  return text
}

function validateEmailCode(value, field = 'email code') {
  const code = String(value || '').trim()
  if (!/^\d{6}$/.test(code)) throw new Error(`${field} must be six digits`)
  return code
}

export function generateEmailVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(EMAIL_CODE_LENGTH, '0')
}

export function isSandboxSmtpHost(host) {
  return SANDBOX_SMTP_HOSTS.has(String(host || '').trim().toLowerCase())
}

export function buildStarMcEmailContent({
  email,
  subject,
  eyebrow,
  title,
  titleEn,
  body,
  bodyEn,
  code,
  notice,
  noticeEn,
}) {
  const toEmail = normalizeRequiredText(email, 'a recipient')
  const mailSubject = normalizeRequiredText(subject, 'a subject')
  const hasCode = code !== undefined && code !== null && String(code).trim() !== ''
  const safeCode = hasCode ? validateEmailCode(code) : null
  const safeEyebrow = normalizeRequiredText(eyebrow, 'an eyebrow')
  const safeTitle = normalizeRequiredText(title, 'a Chinese title')
  const safeTitleEn = normalizeRequiredText(titleEn, 'an English title')
  const safeBody = normalizeRequiredText(body, 'Chinese body text')
  const safeBodyEn = normalizeRequiredText(bodyEn, 'English body text')
  const safeNotice = notice ? String(notice).trim() : ''
  const safeNoticeEn = noticeEn ? String(noticeEn).trim() : ''
  const codeMarkup = safeCode
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 20px;"><tr>${[0, EMAIL_CODE_GROUP_SIZE].map((start, groupIndex) => {
      const group = safeCode.slice(start, start + EMAIL_CODE_GROUP_SIZE)
      const digits = [...group].map((digit, digitIndex) => `${digitIndex ? '<td style="width:8px;"></td>' : ''}<td class="code-digit" style="width:52px;height:58px;border:1px solid #71717a;background:#18181b;color:#ffffff;text-align:center;font-family:'StarMC Pixel Bold','Courier New',monospace;font-size:30px;font-weight:700;line-height:58px;">${escapeHtml(digit)}</td>`).join('')
      return `${groupIndex ? '<td class="code-group-gap" style="width:24px;"></td>' : ''}<td><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${digits}</tr></table></td>`
    }).join('')}</tr></table><span style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;">Code: ${escapeHtml(safeCode)}</span>`
    : ''
  const noticeMarkup = safeNotice || safeNoticeEn
    ? `<p style="margin:0;padding-top:16px;border-top:1px solid #27272a;color:#a1a1aa;font-family:'StarMC Chinese Art','Microsoft YaHei',sans-serif;font-size:12px;line-height:20px;">${renderText(safeNotice)}${safeNotice && safeNoticeEn ? '<br>' : ''}<span style="font-family:'StarMC Pixel','Courier New',monospace;">${renderText(safeNoticeEn)}</span></p>`
    : ''
  const plainText = [
    safeTitle,
    safeTitleEn,
    safeBody,
    safeBodyEn,
    safeCode ? `Code: ${safeCode}` : '',
    safeNotice,
    safeNoticeEn,
  ].filter(Boolean).join('\n')

  return {
    toEmail,
    subject: mailSubject,
    isHtml: true,
    text: plainText,
    body: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: 'StarMC Pixel'; src: url('https://star-web.top/fonts/monocraft.ttf') format('truetype'); }
    @font-face { font-family: 'StarMC Pixel Bold'; src: url('https://star-web.top/fonts/monocraft-bold.ttf') format('truetype'); }
    @font-face { font-family: 'StarMC Chinese Art'; src: url('https://star-web.top/fonts/miseki-bitmap.ttf') format('truetype'); }
  </style>
</head>
<body style="margin:0;padding:0;background:#09090b;color:#fafafa;font-family:'StarMC Chinese Art','Microsoft YaHei',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#09090b;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#0c0c0d;border:1px solid #3f3f46;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #27272a;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:28px;height:28px;border:1px solid #a1a1aa;color:#ffffff;text-align:center;font-family:'StarMC Pixel Bold','Courier New',monospace;font-size:14px;font-weight:700;">S</td>
                  <td style="padding-left:10px;color:#ffffff;font-family:'StarMC Pixel Bold','Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:3px;">STARMC</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;background-color:#0c0c0d;background-image:linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px);background-size:18px 18px;">
              <p style="margin:0 0 10px;color:#a1a1aa;font-family:'StarMC Pixel','Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:1.4px;">${renderText(safeEyebrow)}</p>
              <h1 style="margin:0 0 6px;color:#ffffff;font-family:'StarMC Chinese Art','Microsoft YaHei',sans-serif;font-size:24px;line-height:32px;">${renderText(safeTitle)}</h1>
              <p style="margin:0 0 10px;color:#d4d4d8;font-family:'StarMC Pixel','Courier New',monospace;font-size:15px;line-height:24px;">${renderText(safeTitleEn)}</p>
              <p style="margin:0;color:#d4d4d8;font-family:'StarMC Chinese Art','Microsoft YaHei',sans-serif;font-size:14px;line-height:22px;">${renderText(safeBody)}${safeBody && safeBodyEn ? '<br>' : ''}<span style="font-family:'StarMC Pixel','Courier New',monospace;">${renderText(safeBodyEn)}</span></p>
              ${codeMarkup}
              ${noticeMarkup}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;border-top:1px solid #27272a;color:#71717a;font-family:'StarMC Pixel','Courier New',monospace;font-size:10px;letter-spacing:1px;">STARMC / SECURITY MESSAGE</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  }
}

export function buildPasswordlessEmailContent({ email, userInputCode, mode = 'login' }) {
  const code = validateEmailCode(userInputCode, 'Passwordless email code')
  const isRegistration = mode === 'register'
  return buildStarMcEmailContent({
    email,
    subject: isRegistration ? 'StarMC 注册验证码 / Registration code' : 'StarMC 登录验证码 / Sign-in code',
    eyebrow: isRegistration ? 'PIXEL MATRIX / 注册验证码' : 'PIXEL MATRIX / 登录验证码',
    title: isRegistration ? '验证你的邮箱。' : '验证你的登录。',
    titleEn: isRegistration ? 'Verify your email.' : 'Verify your sign-in.',
    body: isRegistration ? '请输入以下六位验证码以完成 StarMC 注册。' : '请输入以下六位验证码以继续登录 StarMC。',
    bodyEn: isRegistration
      ? 'Use this six-digit verification code to finish creating your StarMC account.'
      : 'Use this six-digit verification code to continue signing in to StarMC.',
    code,
    notice: '请勿将此验证码分享给任何人。',
    noticeEn: 'Never share this code with anyone.',
  })
}

export function createVerificationCodeSender(
  env = process.env,
  { required = false, production = false, transportFactory = nodemailer.createTransport } = {}
) {
  const smtp = getPasswordlessSmtpSettings(env, { required, production })
  if (!smtp) return null

  const transport = transportFactory(buildSmtpTransportOptions(smtp))

  return async ({ email, code, mode = 'login' }) => {
    const content = buildPasswordlessEmailContent({ email, userInputCode: code, mode })
    await transport.sendMail(buildTransactionalEmailMessage({ smtp, content }))
  }
}

export function buildSmtpTransportOptions(smtp) {
  const options = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
  }
  if (smtp.authEnabled) {
    options.auth = { user: smtp.authUsername, pass: smtp.password }
  }
  if (smtp.tlsServername) {
    options.tls = { servername: smtp.tlsServername }
  }
  return options
}

export function buildTransactionalEmailMessage({ smtp, content }) {
  return {
    from: { name: smtp.from.name, address: smtp.from.email },
    to: content.toEmail,
    subject: content.subject,
    html: content.body,
    text: content.text,
    envelope: {
      from: smtp.from.email,
      to: content.toEmail,
    },
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  }
}

export function createPasswordlessSmtpService({ transportFactory = nodemailer.createTransport } = {}) {
  return class PasswordlessSmtpService {
    constructor({ smtpSettings, override } = {}) {
      if (!smtpSettings) throw new Error('Passwordless SMTP settings are required')
      this.transport = transportFactory(buildSmtpTransportOptions(smtpSettings))
      const original = {
        getContent: async (input) => buildPasswordlessEmailContent(input),
      }
      const customized = typeof override === 'function' ? override(original) : original
      this.serviceImpl = { ...original, ...(customized || {}) }
      this.from = smtpSettings.from

      // SuperTokens copies own service methods into its ingredient adapter.
      this.sendEmail = async (input) => {
        const content = await this.serviceImpl.getContent(input)
        const message = buildTransactionalEmailMessage({
          smtp: { from: this.from },
          content,
        })
        if (!content.isHtml) {
          delete message.html
          message.text = content.body
        }
        await this.transport.sendMail(message)
      }
    }
  }
}

export function getPasswordlessSmtpSettings(
  env = process.env,
  { required = false, production = false } = {}
) {
  const authEnabled = smtpAuthEnabled(env)
  const requiredKeys = authEnabled ? [...SMTP_BASE_KEYS, ...SMTP_AUTH_KEYS] : SMTP_BASE_KEYS
  const missing = requiredKeys.filter((key) => !String(env[key] || '').trim())
  if (missing.length > 0) {
    if (required) {
      throw new Error(`Passwordless SMTP is missing: ${missing.join(', ')}`)
    }
    return null
  }

  const host = String(env.SUPERTOKENS_SMTP_HOST).trim()
  if (production && isSandboxSmtpHost(host)) {
    if (required) {
      throw new Error(`Production cannot use sandbox SMTP host: ${host}`)
    }
    return null
  }

  const port = Number(env.SUPERTOKENS_SMTP_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SUPERTOKENS_SMTP_PORT must be an integer between 1 and 65535')
  }

  const tlsServername = String(env.SUPERTOKENS_SMTP_TLS_SERVERNAME || '').trim()
  return {
    host,
    port,
    secure: envBool(env.SUPERTOKENS_SMTP_SECURE),
    authEnabled,
    authUsername: String(env.SUPERTOKENS_SMTP_USER).trim(),
    password: String(env.SUPERTOKENS_SMTP_PASSWORD),
    ...(tlsServername ? { tlsServername } : {}),
    from: {
      email: String(env.SUPERTOKENS_SMTP_FROM_EMAIL).trim(),
      name: String(env.SUPERTOKENS_SMTP_FROM_NAME || 'StarMC').trim(),
    },
  }
}

export function isSmtpConfigured(env = process.env, { production = false } = {}) {
  return getPasswordlessSmtpSettings(env, { production }) !== null
}
