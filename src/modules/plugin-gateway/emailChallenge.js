import nodemailer from 'nodemailer'
import { verifyPluginWebhookAuth } from './adapter.js'
import {
  buildStarMcEmailContent,
  buildTransactionalEmailMessage,
  buildSmtpTransportOptions,
  getPasswordlessSmtpSettings,
} from '../../auth/supertokensEmailDelivery.js'

function error(status, code, message) {
  return { status, json: { ok: false, success: false, code, error: code, message } }
}

export function buildMinecraftBindingEmail({ email, code, username }) {
  const safeCode = String(code || '').trim()
  if (!/^\d{6}$/.test(safeCode)) throw new Error('Minecraft email code must be six digits')
  const recipient = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('Invalid recipient email')
  const player = String(username || 'Minecraft 玩家').trim().slice(0, 32)
  const content = buildStarMcEmailContent({
    email: recipient,
    subject: 'StarMC 游戏账号邮箱验证码 / Minecraft account email code',
    eyebrow: 'PIXEL MATRIX / 游戏账号绑定',
    title: '确认你的游戏账号邮箱。',
    titleEn: 'Confirm your game account email.',
    body: `${player}，请输入以下六位验证码完成邮箱绑定。`,
    bodyEn: 'Use this six-digit code to finish linking your StarMC game account.',
    code: safeCode,
    notice: '验证码 10 分钟内有效，请勿转发。',
    noticeEn: 'This code expires in 10 minutes. Never forward it.',
  })
  return {
    to: recipient,
    subject: content.subject,
    text: content.text,
    html: content.body,
  }
}

export function createMinecraftSmtpTransport(env = process.env, config = {}) {
  const smtp = getPasswordlessSmtpSettings(env, {
    required: true,
    production: Boolean(config.isProd),
  })
  return {
    smtp,
    transport: nodemailer.createTransport(buildSmtpTransportOptions(smtp)),
  }
}

export async function handleEmailChallengeSend(req, deps) {
  const rawBody = req.rawBody || JSON.stringify(req.body || {})
  const auth = verifyPluginWebhookAuth(req, deps.config, rawBody)
  if (!auth.ok) return error(auth.status || 401, 'webhook_auth_failed', auth.message || 'Webhook 验签失败')

  let mail
  try {
    mail = buildMinecraftBindingEmail(req.body || {})
  } catch (cause) {
    return error(400, 'validation_error', cause.message)
  }
  let smtp, transport
  try {
    ({ smtp, transport } = createMinecraftSmtpTransport(process.env, deps.config))
    await transport.sendMail(buildTransactionalEmailMessage({
      smtp,
      content: {
        toEmail: mail.to,
        subject: mail.subject,
        body: mail.html,
        text: mail.text,
      },
    }))
  } catch (cause) {
    deps.logger?.error?.({ err: cause, recipient: mail.to }, 'Minecraft SMTP delivery failed')
    return error(503, 'smtp_delivery_failed', '网站邮件服务器暂时无法发送验证码，请稍后重试')
  }
  return { status: 200, json: { ok: true, success: true, message: '验证码已发送' } }
}
