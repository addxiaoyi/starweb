/**
 * 静态预渲染配置
 * 用于生成 SEO 友好的静态 HTML
 */

/**
 * 需要预渲染的路由列表
 */
export const prerenderRoutes: string[] = [
  '/',
  '/skin',
  '/skin/library',
  '/skin/compare',
  '/login',
  '/register',
  '/about',
]

/**
 * 预渲染配置选项
 */
export interface PrerenderOptions {
  /** 静态文件输出目录 */
  outDir: string
  /** 需要预渲染的路由 */
  routes: string[]
  /** 是否包含路由参数 */
  includeParams?: boolean
  /** 等待渲染完成的超时时间(ms) */
  timeout?: number
  /** 渲染完成后执行的脚本 */
  postProcess?: (route: string, html: string) => string
}

/**
 * 默认预渲染配置
 */
export const defaultPrerenderOptions: PrerenderOptions = {
  outDir: 'dist',
  routes: prerenderRoutes,
  timeout: 30000,
  postProcess: (route, html) => {
    // 移除 Vue 的 data-v 属性以减小 HTML 体积
    let processed = html.replace(/\sdata-v-[a-f0-9]+/g, '')
    
    // 添加预渲染标记
    processed = processed.replace(
      '<html',
      '<html data-prerendered="true"'
    )
    
    return processed
  },
}

/**
 * 生成静态路由数据
 * 用于在预渲染时注入初始状态
 */
export function generateStaticData(route: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    route,
    timestamp: Date.now(),
  }

  switch (route) {
    case '/':
      data.title = 'StarMC - Minecraft 服务器社区'
      data.description = 'StarMC 提供优质 Minecraft 服务器体验，包括皮肤站、服务器状态、玩家社区等功能。'
      break
    case '/skin':
      data.title = '皮肤目录 - StarMC'
      data.description = '浏览和下载精选 Minecraft 皮肤，支持多种风格分类。'
      break
    case '/skin/library':
      data.title = '皮肤库 - StarMC'
      data.description = '搜索 StarMC 皮肤库中的海量皮肤资源，支持关键词搜索和筛选。'
      break
    case '/skin/compare':
      data.title = '皮肤对比 - StarMC'
      data.description = '并排对比两款 Minecraft 皮肤，找到最适合你的风格。'
      break
    case '/login':
      data.title = '登录 - StarMC'
      data.description = '登录 StarMC 账号，管理你的皮肤和收藏。'
      break
    case '/register':
      data.title = '注册 - StarMC'
      data.description = '创建 StarMC 账号，开始你的 Minecraft 之旅。'
      break
    case '/about':
      data.title = '关于 - StarMC'
      data.description = '了解 StarMC 服务器社区的愿景、团队和联系方式。'
      break
  }

  return data
}

/**
 * 生成结构化数据 (JSON-LD)
 */
export function generateStructuredData(route: string): object | null {
  const baseData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'StarMC',
    url: 'https://starmc.cn',
  }

  switch (route) {
    case '/':
      return {
        ...baseData,
        description: 'StarMC Minecraft 服务器社区',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://starmc.cn/skin/library?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      }
    case '/skin':
      return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'StarMC 皮肤目录',
        description: 'Minecraft 皮肤精选合集',
      }
    default:
      return null
  }
}
