import type { RouteLocationNormalized } from 'vue-router'
import { ROUTE_SECTION_TITLE } from './siteArchitecture'

const SITE_NAME = 'StarMC'
const DEFAULT_DESCRIPTION = 'StarMC 提供服务器状态、地图、皮肤与账户服务，帮助你快速进入社区与内容中心。'

const getRouteTitleParts = (route: RouteLocationNormalized) => {
  const section = String(route.meta?.section || 'core') as keyof typeof ROUTE_SECTION_TITLE
  const sectionTitle = ROUTE_SECTION_TITLE[section] || ROUTE_SECTION_TITLE.core
  const pageTitle = String(route.meta?.title || '首页')
  return { sectionTitle, pageTitle }
}

export const buildPageTitle = (route: RouteLocationNormalized): string => {
  const { sectionTitle, pageTitle } = getRouteTitleParts(route)
  return `${pageTitle} · ${sectionTitle} · ${SITE_NAME}`
}

export const buildPageDescription = (route: RouteLocationNormalized): string => {
  const { sectionTitle, pageTitle } = getRouteTitleParts(route)
  return `${SITE_NAME} ${sectionTitle} - ${pageTitle}。获取服务器状态、地图、皮肤与账户服务。`
}

export const upsertMetaDescription = (content: string) => {
  if (typeof document === 'undefined') return

  const head = document.head
  let el = head.querySelector('meta[name="description"]') as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', 'description')
    head.appendChild(el)
  }
  el.setAttribute('content', content || DEFAULT_DESCRIPTION)
}
