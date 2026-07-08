import type { RouteRecordRaw } from 'vue-router'

const m = (title: string, section: 'core' | 'explore' | 'operation' | 'account' | 'developer', extra: Record<string, unknown> = {}) => ({ title, section, ...extra })

export const coreRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: m('首页', 'core') },
  { path: '/skin', name: 'skin', component: () => import('@/views/SkinCatalogView.vue'), meta: m('皮肤目录', 'core') },
  { path: '/skin/library', name: 'skin-library', component: () => import('@/views/SkinLibraryView.vue'), meta: m('皮肤库', 'core') },
  {
    path: '/skin/:id',
    name: 'skin-detail',
    component: () => import('@/views/SkinDetailView.vue'),
    meta: m('皮肤详情', 'core'),
  },
  {
    path: '/skin/manage',
    name: 'skin-manage',
    component: () => import('@/views/SkinStationView.vue'),
    meta: m('皮肤管理', 'core', { requiresAuth: true }),
  },
  {
    path: '/skin/compare',
    name: 'skin-compare',
    component: () => import('@/views/SkinCompareView.vue'),
    meta: m('皮肤对比', 'core'),
  },
  {
    path: '/skin/favorites',
    name: 'skin-favorites',
    component: () => import('@/views/FavoritesView.vue'),
    meta: m('我的收藏', 'core', { requiresAuth: true }),
  },
  {
    path: '/share/:code',
    name: 'skin-share',
    component: () => import('@/views/SkinShareView.vue'),
    meta: m('皮肤分享', 'core'),
  },
]
