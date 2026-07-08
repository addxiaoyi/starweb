import { apiJsonWithAuth } from '@/shared/utils/security'
import { normalizePagedResponse, parseApiError } from '@/shared/utils/apiResponse'

export interface UserNotification {
  id: string
  type?: string
  title?: string
  message?: string
  detail?: Record<string, unknown>
  createdAt?: string
  readAt?: string
}

export interface NotificationTypeSummary {
  type: string
  label?: string
  total: number
  unread: number
}

interface NotificationListResp {
  items?: UserNotification[]
  total?: number
  page?: number
  pageSize?: number
  pagination?: {
    total?: number
    page?: number
    pageSize?: number
    totalPages?: number
    hasMore?: boolean
    hasPrev?: boolean
  }
  message?: string
  code?: string
  error?: string
}

interface NotificationTypesResp {
  items?: NotificationTypeSummary[]
  total?: number
  unread?: number
  message?: string
  code?: string
  error?: string
}

export async function fetchUserNotifications(query: {
  page?: number
  pageSize?: number
  type?: string
  unreadOnly?: boolean
}) {
  const qs = new URLSearchParams()
  if (query.page) qs.set('page', String(query.page))
  if (query.pageSize) qs.set('pageSize', String(query.pageSize))
  if (query.type) qs.set('type', query.type)
  if (query.unreadOnly) qs.set('unreadOnly', 'true')
  const path = `/api/user/notifications${qs.toString() ? `?${qs.toString()}` : ''}`
  const { response, data } = await apiJsonWithAuth<NotificationListResp>(path, null, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(parseApiError(data, `通知列表加载失败 (${response.status})`))
  }
  return normalizePagedResponse<UserNotification>(data, {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  })
}

export async function fetchUserNotificationUnreadCount() {
  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; count?: number; message?: string; code?: string; error?: string }>(
    '/api/user/notifications/unread-count',
    null,
    { cache: 'no-store' }
  )
  if (!response.ok) {
    throw new Error(parseApiError(data, `通知未读数加载失败 (${response.status})`))
  }
  return Number(data?.count || 0)
}

export async function fetchUserNotificationTypes(includeKnown = true) {
  const qs = new URLSearchParams()
  if (!includeKnown) qs.set('includeKnown', 'false')
  const path = `/api/user/notifications/types${qs.toString() ? `?${qs.toString()}` : ''}`
  const { response, data } = await apiJsonWithAuth<NotificationTypesResp>(path, null, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(parseApiError(data, `通知类型加载失败 (${response.status})`))
  }
  const rows = Array.isArray(data?.items) ? data.items : []
  return rows.map((row) => ({
    type: String(row?.type || '').trim(),
    label: row?.label ? String(row.label) : undefined,
    total: Math.max(0, Number(row?.total || 0)),
    unread: Math.max(0, Number(row?.unread || 0)),
  }))
}

export async function markUserNotificationRead(id: string) {
  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; readAt?: string; message?: string; code?: string; error?: string }>(
    `/api/user/notifications/${encodeURIComponent(id)}/read`,
    null,
    { method: 'PATCH' }
  )
  if (!response.ok) {
    throw new Error(parseApiError(data, `通知已读失败 (${response.status})`))
  }
  return data
}

export async function markAllUserNotificationsRead() {
  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; updated?: number; message?: string; code?: string; error?: string }>(
    '/api/user/notifications/read-all',
    null,
    { method: 'POST' }
  )
  if (!response.ok) {
    throw new Error(parseApiError(data, `通知批量已读失败 (${response.status})`))
  }
  return Number(data?.updated || 0)
}
