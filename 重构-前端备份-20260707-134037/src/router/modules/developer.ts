import type { RouteRecordRaw } from 'vue-router'

const m = (title: string, section: 'core' | 'explore' | 'operation' | 'account' | 'developer', extra: Record<string, unknown> = {}) => ({ title, section, ...extra })

export const developerRoutes: RouteRecordRaw[] = [
  { path: '/api-info', name: 'api-info', component: () => import('@/views/ApiInfoView.vue'), meta: m('开发者 API', 'developer') }
]
