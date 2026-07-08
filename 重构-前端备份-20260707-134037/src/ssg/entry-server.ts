/**
 * SSR 服务端入口
 * 用于静态预渲染
 */

import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import App from '../App.vue'
import { coreRoutes } from '../router/modules/core'
import { operationRoutes } from '../router/modules/operation'
import { accountRoutes } from '../router/modules/account'
import i18n from '../i18n'

/**
 * 创建 SSR 应用实例
 */
export async function createApp(url: string) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  
  // 创建内存历史的路由器
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...coreRoutes, ...operationRoutes, ...accountRoutes],
  })
  
  app.use(pinia)
  app.use(router)
  app.use(i18n)
  
  // 设置初始路由
  await router.push(url)
  await router.isReady()
  
  return { app, router }
}

/**
 * 渲染页面
 */
export async function render(context: { url: string }) {
  const { app } = await createApp(context.url)
  
  // 收集预加载链接
  const preloadLinks = collectPreloadLinks()
  
  // 渲染为字符串
  const html = await renderToString(app)
  
  return {
    html,
    preloadLinks,
  }
}

/**
 * 收集需要预加载的资源链接
 */
function collectPreloadLinks(): string {
  const links: string[] = []
  
  // 添加关键 CSS 预加载
  links.push('<link rel="preload" href="/styles/main.css" as="style">')
  
  // 添加关键字体预加载（如果有）
  // links.push('<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>')
  
  return links.join('\n')
}
