/**
 * SSR 客户端入口
 * 用于接管预渲染的 HTML
 */

import { createApp } from '../main'

/**
 * 客户端激活
 */
async function hydrate() {
  const { app, router } = createApp()

  // 等待路由就绪
  await router.isReady()

  // 挂载应用（激活预渲染的 HTML）
  app.mount('#app', true)

  // 添加 hydration 完成标记
  document.documentElement.setAttribute('data-hydrated', 'true')
}

// 执行激活
hydrate().catch(console.error)
