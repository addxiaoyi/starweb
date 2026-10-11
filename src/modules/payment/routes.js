export function registerPaymentRoutes(app, { requireUser, requireAdmin, config }) {
  app.get('/api/admin/payment/config', requireUser, requireAdmin, (_req, res) => {
    const payload = {
      provider: 'alipay',
      appId: config.alipayAppId || null,
      returnUrl: config.paymentReturnUrl || null,
      notifyUrl: config.paymentNotifyUrl || null,
      privateKeyConfigured: Boolean(config.alipayPrivateKey),
      publicKeyConfigured: Boolean(config.alipayPublicKey),
    }
    res.json({ ...payload, ready: Boolean(payload.appId && payload.returnUrl && payload.notifyUrl && payload.privateKeyConfigured && payload.publicKeyConfigured) })
  })
}
