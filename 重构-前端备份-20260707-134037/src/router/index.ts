import { createRouter, createWebHistory, RouteRecordRaw, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'
import { coreRoutes } from './modules/core'
import { exploreRoutes } from './modules/explore'
import { operationRoutes } from './modules/operation'
import { accountRoutes } from './modules/account'
import { developerRoutes } from './modules/developer'
import { fallbackRoutes } from './modules/fallback'
import { buildPageTitle, buildPageDescription, upsertMetaDescription } from '@/shared/config/siteMeta'
import { installRouteTelemetry } from '@/shared/analytics/routeTelemetry'
import type { User } from '@/stores/auth'

interface RouteLocationSavedPosition {
  top: number;
  left: number;
}

let sessionHydrated = false
let sessionHydrating: Promise<void> | null = null
type MeResponse = { user?: User | null }

async function hydrateSession(auth: ReturnType<typeof useAuthStore>) {
  // 预渲染或服务端渲染时跳过 Session 恢复
  if (import.meta.env.SSR) return
  
  if (sessionHydrated) return
  if (!sessionHydrating) {
    sessionHydrating = (async () => {
      try {
        const r = await fetch('/api/user/me', { credentials: 'include', cache: 'no-store' })
        if (r.ok) {
          const data = await r.json().catch(() => null)
          if (data && typeof data === 'object' && 'user' in data) {
            // 与 store 结构对齐：{ uuid, username, roles?, role?, ... }
            auth.setUser(((data as MeResponse).user ?? null))
          }
        } else if (r.status === 401) {
          auth.logout()
        }
      } catch {
        // ignore network errors (degraded mode)
      } finally {
        sessionHydrated = true
      }
    })()
  }
  await sessionHydrating
}

const routes: Array<RouteRecordRaw> = [
  ...coreRoutes,
  ...exploreRoutes,
  ...operationRoutes,
  ...accountRoutes,
  ...developerRoutes,
  ...fallbackRoutes
]

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to: RouteLocationNormalized, _from: RouteLocationNormalized, savedPosition: RouteLocationSavedPosition | null) {
    return new Promise((resolve) => {
      const apply = () => {
        if (savedPosition) resolve(savedPosition)
        else if (to.hash) resolve({ el: to.hash, behavior: 'smooth' })
        else resolve({ top: 0 })
      }
      requestAnimationFrame(() => requestAnimationFrame(apply))
    })
  },
  routes
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const { isLoggedIn } = storeToRefs(auth)

  document.title = buildPageTitle(to)
  upsertMetaDescription(buildPageDescription(to))

  // 在导航开始时尽早恢复 session（无论目标路由是否需要登录）
  // 这样页面刷新后所有组件都能立即获取到正确的 isLoggedIn 状态
  if (!sessionHydrated && !auth.user) {
    await hydrateSession(auth)
  }

  // 需要登录的页面：检查恢复后的状态
  if (to.meta.requiresAuth && !isLoggedIn.value) {
    return { path: '/auth', query: { redirect: to.fullPath } }
  }

  if (to.name === 'user-dashboard') {
    const targetUserId = String(to.params.userId || '').trim()
    const user = auth.user
    const selfUserId = String(user?.id || '')

    if (!targetUserId) return { path: '/' }
    if (!isLoggedIn.value) {
      return { path: '/auth', query: { redirect: to.fullPath } }
    }
    await auth.refreshPermissions()
    const isAdmin = auth.canManageUsers
    if (targetUserId !== selfUserId && !isAdmin) {
      return { path: `/dashboard/${selfUserId || targetUserId}` }
    }
  }

  // Reviewer 路由：未登录或无审核权限时，统一降级到预览页
  if (to.meta.requiresReviewer) {
    const redirectToPreview = { path: '/skin', query: { mode: 'review-preview' } }

    if (!isLoggedIn.value) {
      return redirectToPreview
    }
    await auth.refreshPermissions()

    if (!auth.canReviewSubmissions) {
      return redirectToPreview
    }
  }

  // Admin 路由守卫
  if (to.meta.requiresAdmin) {
    if (!isLoggedIn.value) {
      return { path: '/auth', query: { redirect: to.fullPath } }
    }
    await auth.refreshPermissions()
    if (!auth.canManageUsers) {
      return { path: '/skin' }
    }
  }

  return true
})

installRouteTelemetry(router)

export default router
