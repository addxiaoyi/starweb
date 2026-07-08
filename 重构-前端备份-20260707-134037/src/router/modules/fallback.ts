import type { RouteRecordRaw } from 'vue-router'

const m = (title: string, section: 'core' | 'explore' | 'operation' | 'account' | 'developer', extra: Record<string, unknown> = {}) => ({ title, section, ...extra })

export const fallbackRoutes: RouteRecordRaw[] = [
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: m('虚空之下 (404)', 'core') }
]
