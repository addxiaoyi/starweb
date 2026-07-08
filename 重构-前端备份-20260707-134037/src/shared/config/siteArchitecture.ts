export type SiteNavSection = 'core' | 'explore' | 'operation' | 'account' | 'developer'

export interface SiteNavItem {
  path: string
  label: string
  section: SiteNavSection
  order: number
  requiresReviewer?: boolean
}

export const SITE_PRIMARY_NAV: SiteNavItem[] = [
  { path: '/', label: '首页', section: 'core', order: 10 },
  { path: '/ztjk', label: '状态', section: 'operation', order: 20 },
  { path: '/guide', label: '教程', section: 'explore', order: 30 },
  { path: '/map', label: '实时地图', section: 'explore', order: 40 },
  { path: '/skin', label: '皮肤目录', section: 'core', order: 50 },
  { path: '/skin/manage', label: '皮肤管理', section: 'core', order: 52 },
  { path: '/skin/review', label: '投稿审核', section: 'operation', order: 60, requiresReviewer: true }
]

export const ROUTE_SECTION_TITLE: Record<string, string> = {
  core: '核心体验',
  explore: '内容浏览',
  operation: '运营与状态',
  account: '账户中心',
  developer: '开发者中心'
}
