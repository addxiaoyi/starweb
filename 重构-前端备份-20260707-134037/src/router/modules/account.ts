import type { RouteRecordRaw } from 'vue-router'

const m = (title: string, section: 'core' | 'explore' | 'operation' | 'account' | 'developer', extra: Record<string, unknown> = {}) => ({ title, section, ...extra })

export const accountRoutes: RouteRecordRaw[] = [
  { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: m('玩家档案', 'account') },
  { path: '/auth', name: 'auth', component: () => import('@/views/SkinStationView.vue'), meta: m('登录', 'account') },
  { path: '/notifications', name: 'notifications', component: () => import('@/views/NotificationCenterView.vue'), meta: m('通知中心', 'account', { requiresAuth: true }) },
  { path: '/mc-game-password-reset', name: 'mc-game-password-reset', component: () => import('@/views/McGamePasswordResetView.vue'), meta: m('重置游戏密码', 'account') },
  {
    path: '/mc-binding',
    name: 'mc-binding',
    component: () => import('@/views/McBindingView.vue'),
    meta: m('账号绑定', 'account', { requiresAuth: true })
  },
  {
    path: '/dashboard/:userId',
    name: 'user-dashboard',
    component: () => import('@/views/UserDashboardView.vue'),
    meta: m('用户仪表盘', 'account', { requiresAuth: true })
  }
]
