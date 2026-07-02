#!/usr/bin/env node
/**
 * 静态预渲染脚本
 * 在构建完成后生成静态 HTML 文件
 */

import { createServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.resolve(root, 'dist')

/**
 * 需要预渲染的路由
 */
const routes = [
  '/',
  '/skin',
  '/skin/library',
  '/skin/compare',
  '/auth',
]

/**
 * 生成静态 HTML
 */
async function generateStaticHtml() {
  console.log('🚀 开始静态预渲染...')
  
  // 创建 SSR 服务器
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
  })

  // 加载服务端入口
  const { render } = await server.ssrLoadModule(path.resolve(root, 'src/ssg/entry-server.ts'))

  try {
    for (const route of routes) {
      console.log(`📄 渲染: ${route}`)
      
      // 模拟请求上下文
      const context = {
        url: route,
        ssr: true,
      }
      
      // 渲染页面
      const { html, preloadLinks } = await render(context)
      
      // 构建完整 HTML
      const template = fs.readFileSync(
        path.resolve(root, 'index.html'),
        'utf-8'
      )
      
      const finalHtml = template
        .replace('<!--app-html-->', html)
        .replace('<!--preload-links-->', preloadLinks)
        .replace(
          '<html',
          '<html data-prerendered="true"'
        )
      
      // 确定输出路径
      const outputPath = route === '/' 
        ? path.join(outDir, 'index.html')
        : path.join(outDir, route, 'index.html')
      
      // 确保目录存在
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      
      // 写入文件
      fs.writeFileSync(outputPath, finalHtml)
      console.log(`✅ 已生成: ${outputPath}`)
    }
    
    console.log('🎉 静态预渲染完成！')
  } catch (error) {
    console.error('❌ 预渲染失败:', error)
    process.exit(1)
  } finally {
    await server.close()
  }
}

// 执行预渲染
generateStaticHtml()
