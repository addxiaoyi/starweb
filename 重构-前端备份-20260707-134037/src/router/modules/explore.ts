import type { RouteRecordRaw } from 'vue-router'

const m = (title: string, section: 'core' | 'explore' | 'operation' | 'account' | 'developer', extra: Record<string, unknown> = {}) => ({ title, section, ...extra })

export const exploreRoutes: RouteRecordRaw[] = [
  { path: '/guide', name: 'guide', component: () => import('@/views/GuideView.vue'), meta: m('服务器教程', 'explore') },
  { path: '/map', name: 'map', component: () => import('@/views/MapView.vue'), meta: m('实时地图', 'explore') }
]
