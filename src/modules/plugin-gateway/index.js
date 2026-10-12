import express from 'express'
import { handlePluginCallback } from './handlers.js'
import { handleEmailChallengeSend } from './emailChallenge.js'

export function registerPluginGatewayRoutes(app, deps) {
  const {
    authxWebhookCallbackLimiter,
    eventBus,
    asyncHandler,
  } = deps

  const webhookJson = express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  })

  const runCallback = asyncHandler(async (req, res) => {
    const result = await handlePluginCallback(eventBus, req, deps)
    return res.status(result.status).json(result.json)
  })

  const runEmailChallenge = asyncHandler(async (req, res) => {
    const result = await handleEmailChallengeSend(req, deps)
    return res.status(result.status).json(result.json)
  })

  app.post('/api/v1/plugin/callback', authxWebhookCallbackLimiter, webhookJson, runCallback)
  app.post('/api/v1/plugin/email-challenge/send', authxWebhookCallbackLimiter, webhookJson, runEmailChallenge)
  // Keep the pre-1.1 endpoint working for older StarX nodes.
  app.post('/api/v1/plugin/bind-email', authxWebhookCallbackLimiter, webhookJson, runEmailChallenge)
  app.post('/api/plugin/authx/callback', authxWebhookCallbackLimiter, webhookJson, (req, res, next) => {
    res.setHeader('Deprecation', 'true')
    res.setHeader('Sunset', '2026-12-31')
    return runCallback(req, res, next)
  })
}
