import express, { Router } from 'express'
import { createPluginGatewayHandlers } from './handlers.js'

export function registerPluginGatewayRoutes(app, deps) {
  const handlers = createPluginGatewayHandlers(deps)
  const router = Router()

  router.use(deps.authxWebhookCallbackLimiter)
  router.use(express.raw({ type: 'application/json', limit: '64kb' }))
  router.post('/callback', handlers.callback)
  router.post('/bind-email', handlers.bindEmail)

  // 版本化新路由
  app.use('/api/v1/plugin', router)
  app.use('/api/v2/plugin', router)
  // 旧版兼容路由
  app.use('/api/plugin/authx', router)
}
