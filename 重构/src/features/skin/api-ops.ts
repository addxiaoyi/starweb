import { apiJsonWithAuth } from '@/shared/utils/security'
import { normalizePagedResponse, parseApiError, type ApiErrorShape } from '@/shared/utils/apiResponse'

export interface OpsTaskItem {
  id: string
  source: string
  type: string
  status: string
  createdAt?: string
  updatedAt?: string
  payload?: Record<string, unknown>
}

export interface OpsTaskRetryResponse {
  ok?: boolean
  replayed?: boolean
  source?: string
  item?: Record<string, unknown>
  asyncTask?: Record<string, unknown>
  message?: string
}

export interface DeadLetterItem {
  id: string
  at?: string
  type?: string
  sourceId?: string
  eventId?: string
  userId?: string
  reason?: string
  payload?: Record<string, unknown>
  retriedAt?: string
  resolvedAt?: string
  resolvedBy?: string
  retryResult?: string
}

export interface AuditLogItem {
  id: string
  at?: string
  module?: string
  action?: string
  actorUserId?: string
  actorUsername?: string
  targetUserId?: string
  targetUsername?: string
  detail?: Record<string, unknown>
  diff?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }
}

interface PagedResp<T> {
  ok?: boolean
  success?: boolean
  total?: number
  page?: number
  pageSize?: number
  items?: T[]
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

type FetchTaskQuery = {
  page?: number
  pageSize?: number
  status?: string
  type?: string
}

type FetchDeadLetterQuery = {
  page?: number
  pageSize?: number
  type?: string
  resolved?: 'true' | 'false' | ''
}

type FetchAuditQuery = {
  page?: number
  pageSize?: number
  module?: string
  action?: string
  q?: string
}

const ensureSecret = (adminSecret: string) => {
  const secret = String(adminSecret || '').trim()
  if (!secret) throw new Error('请输入管理员密钥')
  return secret
}

const toPaged = <T>(data: PagedResp<T> | null, defaults?: { page?: number; pageSize?: number }) => {
  const normalized = normalizePagedResponse<T>(data, defaults)
  return {
    items: normalized.items,
    total: normalized.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pagination: normalized.pagination
  }
}

function buildAdminHeaders(secret: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra || undefined)
  headers.set('X-Admin-Secret', secret)
  return headers
}

export async function fetchAdminOpsTasks(query: FetchTaskQuery, adminSecret: string) {
  const secret = ensureSecret(adminSecret)
  const qs = new URLSearchParams()
  if (query.page) qs.set('page', String(query.page))
  if (query.pageSize) qs.set('pageSize', String(query.pageSize))
  if (query.status) qs.set('status', query.status)
  if (query.type) qs.set('type', query.type)
  const path = `/api/admin/ops/tasks${qs.toString() ? `?${qs.toString()}` : ''}`
  const { response, data } = await apiJsonWithAuth<PagedResp<OpsTaskItem>>(path, null, {
    headers: buildAdminHeaders(secret)
  })
  if (!response.ok) {
    throw new Error(parseApiError(data, `任务列表加载失败 (${response.status})`))
  }
  return toPaged(data, { page: query.page, pageSize: query.pageSize })
}

export async function createAdminOpsTask(
  payload: { type: string; status?: string; payload?: Record<string, unknown>; createdBy?: string },
  adminSecret: string
) {
  const secret = ensureSecret(adminSecret)
  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; item?: OpsTaskItem; message?: string }>(
    '/api/admin/ops/tasks',
    null,
    {
      method: 'POST',
      headers: buildAdminHeaders(secret, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    }
  )
  if (!response.ok || !data?.item) {
    throw new Error(parseApiError(data, `创建任务失败 (${response.status})`))
  }
  return data.item
}

export async function patchAdminOpsTask(
  id: string,
  payload: { status?: string; payload?: Record<string, unknown>; finishedAt?: string },
  adminSecret: string
) {
  const secret = ensureSecret(adminSecret)
  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; item?: OpsTaskItem; message?: string }>(
    `/api/admin/ops/tasks/${encodeURIComponent(id)}`,
    null,
    {
      method: 'PATCH',
      headers: buildAdminHeaders(secret, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    }
  )
  if (!response.ok || !data?.item) {
    throw new Error(parseApiError(data, `更新任务失败 (${response.status})`))
  }
  return data.item
}

export async function retryAdminOpsTask(id: string, adminSecret: string): Promise<OpsTaskRetryResponse> {
  const secret = ensureSecret(adminSecret)
  const { response, data } = await apiJsonWithAuth<OpsTaskRetryResponse>(
    `/api/admin/ops/tasks/${encodeURIComponent(id)}/retry`,
    null,
    {
      method: 'POST',
      headers: buildAdminHeaders(secret)
    }
  )
  if (!response.ok) {
    throw new Error(parseApiError(data, `任务重试失败 (${response.status})`))
  }
  return data ?? { ok: false, replayed: false }
}

export async function fetchAdminDeadLetters(query: FetchDeadLetterQuery, adminSecret: string) {
  const secret = ensureSecret(adminSecret)
  const qs = new URLSearchParams()
  if (query.page) qs.set('page', String(query.page))
  if (query.pageSize) qs.set('pageSize', String(query.pageSize))
  if (query.type) qs.set('type', query.type)
  if (query.resolved) qs.set('resolved', query.resolved)
  const path = `/api/admin/ops/dead-letters${qs.toString() ? `?${qs.toString()}` : ''}`
  const { response, data } = await apiJsonWithAuth<PagedResp<DeadLetterItem>>(path, null, {
    headers: buildAdminHeaders(secret)
  })
  if (!response.ok) {
    throw new Error(parseApiError(data, `死信列表加载失败 (${response.status})`))
  }
  return toPaged(data, { page: query.page, pageSize: query.pageSize })
}

export async function retryAdminDeadLetter(id: string, adminSecret: string) {
  const secret = ensureSecret(adminSecret)
  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; replayed?: boolean; item?: DeadLetterItem; message?: string }>(
    `/api/admin/ops/dead-letters/${encodeURIComponent(id)}/retry`,
    null,
    {
      method: 'POST',
      headers: buildAdminHeaders(secret)
    }
  )
  if (!response.ok || !data?.item) {
    throw new Error(parseApiError(data, `死信重试失败 (${response.status})`))
  }
  return data
}

export async function fetchAdminAuditLogs(query: FetchAuditQuery, adminSecret: string) {
  const secret = ensureSecret(adminSecret)
  const qs = new URLSearchParams()
  if (query.page) qs.set('page', String(query.page))
  if (query.pageSize) qs.set('pageSize', String(query.pageSize))
  if (query.module) qs.set('module', query.module)
  if (query.action) qs.set('action', query.action)
  if (query.q) qs.set('q', query.q)
  const path = `/api/admin/audit/logs${qs.toString() ? `?${qs.toString()}` : ''}`
  const { response, data } = await apiJsonWithAuth<PagedResp<AuditLogItem>>(path, null, {
    headers: buildAdminHeaders(secret)
  })
  if (!response.ok) {
    throw new Error(parseApiError(data, `审计日志加载失败 (${response.status})`))
  }
  return toPaged(data, { page: query.page, pageSize: query.pageSize })
}

export async function exportAdminAuditCsv(adminSecret: string, moduleFilter = '') {
  const secret = ensureSecret(adminSecret)
  const qs = new URLSearchParams()
  if (moduleFilter) qs.set('module', moduleFilter)
  const path = `/api/admin/audit/export${qs.toString() ? `?${qs.toString()}` : ''}`
  const response = await fetch(path, {
    headers: buildAdminHeaders(secret, { rid: 'session' })
  })
  if (!response.ok) {
    let message = `审计导出失败 (${response.status})`
    try {
      const body = (await response.json()) as ApiErrorShape
      message = parseApiError(body, message)
    } catch {
      // ignore json parse
    }
    throw new Error(message)
  }
  return response.blob()
}
