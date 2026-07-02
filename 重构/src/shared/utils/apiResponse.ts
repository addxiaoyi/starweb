export interface ApiErrorShape {
  message?: string
  code?: string
  error?: string
  details?: unknown
}

export interface ApiPaginationShape {
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  hasMore?: boolean
  hasPrev?: boolean
}

export interface ApiPagedShape<T> {
  items?: T[]
  total?: number
  page?: number
  pageSize?: number
  pagination?: ApiPaginationShape
}

export interface NormalizedPagination {
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
  hasPrev: boolean
}

export interface NormalizedPaged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pagination: NormalizedPagination
}

const toInt = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function parseApiError(
  payload: unknown,
  fallback: string
) {
  const record = toRecord(payload)
  const message = typeof record?.message === 'string' ? record.message.trim() : ''
  if (message) return message
  const code = String(record?.code || record?.error || '').trim()
  if (code) return `${fallback} [${code}]`
  return fallback
}

export function normalizePagedResponse<T>(
  payload: ApiPagedShape<T> | null | undefined,
  defaults: { page?: number; pageSize?: number } = {}
): NormalizedPaged<T> {
  const rootTotal = toInt(payload?.total, 0)
  const rootPage = toInt(payload?.page, defaults.page ?? 1)
  const rootPageSize = toInt(payload?.pageSize, defaults.pageSize ?? 20)
  const paginationRaw = payload?.pagination || {}
  const total = Math.max(0, toInt(paginationRaw.total, rootTotal))
  const pageSize = Math.max(1, toInt(paginationRaw.pageSize, rootPageSize))
  const maxPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, toInt(paginationRaw.page, rootPage)), maxPages)
  const totalPages = Math.max(1, toInt(paginationRaw.totalPages, maxPages))
  const hasMore = Boolean(
    paginationRaw.hasMore !== undefined ? paginationRaw.hasMore : page < totalPages
  )
  const hasPrev = Boolean(
    paginationRaw.hasPrev !== undefined ? paginationRaw.hasPrev : page > 1
  )

  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total,
    page,
    pageSize,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
      hasPrev
    }
  }
}
