import express, { Router } from 'express'
import { createPluginGatewayHandlers } from './handlers.js'

export function registerPluginGatewayRoutes(app, deps) {
  const handlers = createPluginGatewayHandlers(deps)

  function createRouter() {
    const r = Router()
    r.use(deps.authxWebhookCallbackLimiter)
    r.use(express.raw({ type: 'application/json', limit: '64kb' }))
    r.post('/callback', handlers.callback)
    r.post('/bind-email', handlers.bindEmail)
    return r
  }

  // 版本化新路由（各自独立实例，避免共享速率限制器状态）
  app.use('/api/v1/plugin', createRouter())
  app.use('/api/v2/plugin', createRouter())
  // 旧版兼容路由
  app.use('/api/plugin/authx', createRouter())
}
