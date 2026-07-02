/**
 * SEO 组合式函数
 * 统一管理页面元数据
 */

import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'

/**
 * SEO 配置接口
 */
export interface SEOConfig {
  /** 页面标题 */
  title: string
  /** 页面描述 */
  description?: string
  /** 关键词 */
  keywords?: string[]
  /** OG 图片 */
  ogImage?: string
  /** OG 类型 */
  ogType?: 'website' | 'article' | 'profile'
  /** 作者 */
  author?: string
  /** 发布日期 */
  publishedTime?: string
  /** 修改日期 */
  modifiedTime?: string
  /** 是否允许搜索引擎索引 */
  robots?: 'index,follow' | 'noindex,follow' | 'index,nofollow' | 'noindex,nofollow'
  /** 规范 URL */
  canonical?: string
  /** 结构化数据 */
  structuredData?: object
}

/**
 * 默认 SEO 配置
 */
const defaultSEO: Partial<SEOConfig> = {
  description: 'StarMC - 专注于提供优质 Minecraft 服务器体验的社区',
  keywords: ['Minecraft', '服务器', '皮肤', 'StarMC', '游戏社区'],
  ogType: 'website',
  robots: 'index,follow',
}

/**
 * 使用 SEO
 */
export function useSEO(config: SEOConfig | (() => SEOConfig)) {
  const route = useRoute()
  const configValue = typeof config === 'function' ? config() : config
  
  // 合并默认配置
  const mergedConfig = { ...defaultSEO, ...configValue }
  
  // 构建标题
  const fullTitle = mergedConfig.title.includes('StarMC')
    ? mergedConfig.title
    : `${mergedConfig.title} - StarMC`
  
  // 构建关键词
  const keywordsString = mergedConfig.keywords?.join(', ')
  
  // 构建规范 URL
  const canonicalUrl = mergedConfig.canonical 
    || `https://starmc.cn${route.path}`
  
  // 使用 @unhead/vue 设置元数据
  useHead({
    title: fullTitle,
    meta: [
      // 基础元数据
      { name: 'description', content: mergedConfig.description },
      { name: 'keywords', content: keywordsString },
      { name: 'author', content: mergedConfig.author || 'StarMC Team' },
      { name: 'robots', content: mergedConfig.robots },
      
      // Open Graph
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: mergedConfig.description },
      { property: 'og:type', content: mergedConfig.ogType },
      { property: 'og:url', content: canonicalUrl },
      { property: 'og:image', content: mergedConfig.ogImage || 'https://starmc.cn/og-image.png' },
      { property: 'og:site_name', content: 'StarMC' },
      
      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: mergedConfig.description },
      { name: 'twitter:image', content: mergedConfig.ogImage || 'https://starmc.cn/og-image.png' },
      
      // 文章特定
      ...(mergedConfig.publishedTime ? [
        { property: 'article:published_time', content: mergedConfig.publishedTime },
      ] : []),
      ...(mergedConfig.modifiedTime ? [
        { property: 'article:modified_time', content: mergedConfig.modifiedTime },
      ] : []),
    ],
    link: [
      { rel: 'canonical', href: canonicalUrl },
    ],
    script: mergedConfig.structuredData ? [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify(mergedConfig.structuredData),
      },
    ] : [],
  })
}

/**
 * 预定义的路由 SEO 配置
 */
export const routeSEOConfigs: Record<string, SEOConfig> = {
  home: {
    title: 'StarMC - Minecraft 服务器社区',
    description: 'StarMC 提供优质 Minecraft 服务器体验，包括皮肤站、服务器状态、玩家社区等功能。',
    keywords: ['Minecraft', '服务器', '皮肤', 'StarMC', '游戏社区', 'Minecraft服务器'],
  },
  skin: {
    title: '皮肤目录',
    description: '浏览和下载精选 Minecraft 皮肤，支持多种风格分类。',
    keywords: ['Minecraft皮肤', '皮肤下载', 'MC皮肤', '皮肤站'],
  },
  skinLibrary: {
    title: '皮肤库',
    description: '搜索 StarMC 皮肤库中的海量皮肤资源，支持关键词搜索和筛选。',
    keywords: ['皮肤库', '皮肤搜索', 'Minecraft皮肤库'],
  },
  skinCompare: {
    title: '皮肤对比',
    description: '并排对比两款 Minecraft 皮肤，找到最适合你的风格。',
    keywords: ['皮肤对比', 'Minecraft皮肤对比', '皮肤比较'],
  },
  skinDetail: {
    title: '皮肤详情',
    description: '查看 Minecraft 皮肤详情，3D预览、下载、收藏。',
    keywords: ['皮肤详情', '皮肤预览', 'Minecraft皮肤'],
    ogType: 'article',
  },
  login: {
    title: '登录',
    description: '登录 StarMC 账号，管理你的皮肤和收藏。',
    keywords: ['登录', 'StarMC登录', '账号登录'],
    robots: 'noindex,follow',
  },
  register: {
    title: '注册',
    description: '创建 StarMC 账号，开始你的 Minecraft 之旅。',
    keywords: ['注册', '创建账号', 'StarMC注册'],
    robots: 'noindex,follow',
  },
  favorites: {
    title: '我的收藏',
    description: '管理你收藏的 Minecraft 皮肤。',
    keywords: ['我的收藏', '皮肤收藏'],
    robots: 'noindex,follow',
  },
  about: {
    title: '关于',
    description: '了解 StarMC 服务器社区的愿景、团队和联系方式。',
    keywords: ['关于', '关于我们', 'StarMC团队'],
  },
}

/**
 * 根据路由名称获取 SEO 配置
 */
export function getSEOByRouteName(name: string): SEOConfig | undefined {
  return routeSEOConfigs[name]
}
