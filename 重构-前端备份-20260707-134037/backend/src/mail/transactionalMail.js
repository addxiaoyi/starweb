/**
 * 与 SuperTokens 并行的站点事务邮件（游戏密码重置等），复用 config 中 SMTP 变量。
 */
import nodemailer from 'nodemailer'
import { config } from '../config.js'

function smtpReady() {
  return Boolean(
    config.smtpHost &&
      config.smtpFromEmail &&
      config.smtpPassword &&
      (config.smtpUser || config.smtpFromEmail)
  )
}

export function canSendTransactionalMail() {
  return smtpReady()
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
export async function sendTransactionalMail(opts) {
  const to = String(opts.to || '').trim()
  if (!to) throw new Error('missing_to')
  if (!smtpReady()) {
    const preview = opts.text || opts.html || ''
    console.log(
      `[starmc-api][email][transactional] (无 SMTP，仅日志) to=${to} subject=${opts.subject}\n${preview.slice(0, 2000)}`
    )
    return { skipped: true }
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser || config.smtpFromEmail,
      pass: config.smtpPassword
    }
  })
  await transporter.sendMail({
    from: `"${config.smtpFromName}" <${config.smtpFromEmail}>`,
    to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  })
  return { skipped: false }
}
