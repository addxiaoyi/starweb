/**
 * SuperTokens 发信：邮箱验证、密码重置。
 * 通过 `config.js` 读取 `SUPERTOKENS_SMTP_*`；未配置时在开发环境将事件打印到控制台。
 */
import nodemailer from 'nodemailer'
import { config } from '../config.js'

function smtpConfigured() {
  return Boolean(
    config.smtpHost &&
      config.smtpFromEmail &&
      config.smtpPassword &&
      (config.smtpUser || config.smtpFromEmail)
  )
}

function createTransporter() {
  const fromEmail = config.smtpFromEmail
  const authUser = config.smtpUser || fromEmail
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: authUser,
      pass: config.smtpPassword
    }
  })
}

function pickLink(input) {
  return (
    input?.emailVerifyLink ||
    input?.passwordResetLink ||
    input?.urlWithLinkCode ||
    input?.link ||
    ''
  )
}

function buildMailContent(input) {
  const type = String(input?.type || '')
  const link = String(pickLink(input) || '').trim()
  const isVerify = type === 'EMAIL_VERIFICATION'
  const subject = isVerify ? '【StarMC】邮箱验证' : '【StarMC】密码重置'
  const actionText = isVerify ? '验证邮箱' : '重置密码'

  const text = [
    '您好，',
    '',
    `请点击下方链接完成${actionText}：`,
    link || '(系统未提供链接)',
    '',
    '如果这不是您的操作，请忽略本邮件。',
    '',
    '— StarMC'
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1f2937; line-height:1.6; max-width:560px; margin:auto;">
      <h2 style="margin:0 0 12px;">${subject}</h2>
      <p style="margin:0 0 12px;">请点击下方按钮完成${actionText}：</p>
      <p style="margin:0 0 16px;">
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">${actionText}</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;word-break:break-all;">若按钮不可点击，请复制链接：${link || '(系统未提供链接)'}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">如果这不是您的操作，请忽略本邮件。</p>
    </div>
  `

  return { subject, text, html }
}

/** 无 SMTP 时仅记录事件，不打印完整链接，避免敏感 token 泄露 */
function consoleLogDelivery() {
  return {
    sendEmail: async (input) => {
      const to = input.user?.email || '?'
      if (input.type === 'EMAIL_VERIFICATION') {
        console.log(`[starmc-api][email] DELIVERY_EVENT to=${to} kind=verify`)
      } else if (input.type === 'PASSWORD_RESET') {
        console.log(`[starmc-api][email] DELIVERY_EVENT to=${to} kind=reset`)
      } else {
        console.log(`[starmc-api][email] DELIVERY_EVENT to=${to} kind=other`)
      }
    }
  }
}

function smtpDeliveryService() {
  const transporter = createTransporter()
  const from = `${config.smtpFromName} <${config.smtpFromEmail}>`

  return {
    sendEmail: async (input) => {
      const to = String(input?.user?.email || '').trim()
      if (!to) throw new Error('supertokens delivery missing recipient email')
      const content = buildMailContent(input)
      await transporter.sendMail({
        from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html
      })
    }
  }
}

export function isSmtpConfigured() {
  return smtpConfigured()
}

export function emailPasswordDelivery() {
  if (smtpConfigured()) {
    return { service: smtpDeliveryService() }
  }
  if (config.isProd) {
    console.warn(
      '[starmc-api] 未配置 SMTP（SUPERTOKENS_SMTP_*），密码重置/验证邮件仅打印到日志，请尽快配置。'
    )
  } else {
    console.warn(
      '[starmc-api] 未配置 SMTP：密码重置/验证邮件链接将打印到控制台（开发模式）。'
    )
  }
  return { service: consoleLogDelivery() }
}

export function emailVerificationDelivery() {
  if (smtpConfigured()) {
    return { service: smtpDeliveryService() }
  }
  if (config.isProd) {
    console.warn(
      '[starmc-api] 未配置 SMTP，邮箱验证邮件仅打印到日志，请尽快配置 SUPERTOKENS_SMTP_*。'
    )
  }
  return { service: consoleLogDelivery() }
}
