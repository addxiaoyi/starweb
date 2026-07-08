import type { SiteNavItem } from './siteArchitecture'
import type { User } from '@/stores/auth'

export type NavAudience = 'guest' | 'member' | 'reviewer'

const roleSetOf = (user: User | null): Set<string> => {
  if (!user) return new Set()
  return new Set<string>([
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(user.role ? [user.role] : [])
  ].map((r) => String(r || '').toLowerCase()))
}

export const resolveAudience = (isLoggedIn: boolean, user: User | null): NavAudience => {
  if (!isLoggedIn) return 'guest'
  const roles = roleSetOf(user)
  if (roles.has('admin') || roles.has('reviewer') || roles.has('moderator') || roles.has('staff')) return 'reviewer'
  return 'member'
}

export const filterNavByAudience = (items: SiteNavItem[], audience: NavAudience): SiteNavItem[] => {
  return items.filter((item) => {
    if (item.requiresReviewer) return audience === 'reviewer'
    return true
  })
}
