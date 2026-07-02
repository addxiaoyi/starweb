function safeInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

export function buildErrorBody(message, code = 'error', details) {
  const normalizedCode = String(code || 'error').trim() || 'error'
  const body = {
    ok: false,
    success: false,
    message: String(message || '请求失败'),
    code: normalizedCode,
    error: normalizedCode
  }
  if (details !== undefined) body.details = details
  return body
}

export function jsonError(res, status, message, code = 'error', details) {
  const safeStatus = safeInt(status, 500)
  return res.status(safeStatus).json(buildErrorBody(message, code, details))
}

export function normalizePagination(totalRaw, pageRaw, pageSizeRaw) {
  const total = Math.max(0, safeInt(totalRaw, 0))
  const pageSize = Math.max(1, safeInt(pageSizeRaw, 20))
  const page = Math.max(1, safeInt(pageRaw, 1))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const normalizedPage = Math.min(page, totalPages)
  return {
    total,
    page: normalizedPage,
    pageSize,
    totalPages,
    hasMore: normalizedPage < totalPages,
    hasPrev: normalizedPage > 1
  }
}

export function jsonPage(res, payload = {}, status = 200) {
  const {
    items,
    total,
    page,
    pageSize,
    pagination: _ignoredPagination,
    ...extra
  } = payload || {}

  const pagination = normalizePagination(total, page, pageSize)

  return res.status(safeInt(status, 200)).json({
    ok: true,
    success: true,
    items: Array.isArray(items) ? items : [],
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pagination,
    ...extra
  })
}

export function jsonOk(res, payload = {}, status = 200) {
  return res.status(safeInt(status, 200)).json({
    ok: true,
    success: true,
    ...(payload && typeof payload === 'object' ? payload : {})
  })
}

export function resolvePaginationQuery(query = {}, options = {}) {
  const defaultPage = Math.max(1, safeInt(options.defaultPage, 1))
  const defaultPageSize = Math.max(1, safeInt(options.defaultPageSize, 20))
  const maxPageSize = Math.max(1, safeInt(options.maxPageSize, 200))

  const rawPage = query?.page
  const rawPageSize = query?.pageSize
  const rawOffset = query?.offset
  const rawLimit = query?.limit

  const hasPageInputs = rawPage !== undefined || rawPageSize !== undefined
  const hasOffsetInputs = rawOffset !== undefined || rawLimit !== undefined

  const clampPageSize = (value) => Math.min(maxPageSize, Math.max(1, safeInt(value, defaultPageSize)))
  const clampOffset = (value) => Math.max(0, safeInt(value, 0))

  if (hasPageInputs || !hasOffsetInputs) {
    const page = Math.max(1, safeInt(rawPage, defaultPage))
    const pageSize = clampPageSize(rawPageSize)
    const offset = (page - 1) * pageSize
    return {
      mode: 'page',
      page,
      pageSize,
      offset,
      limit: pageSize
    }
  }

  const pageSize = clampPageSize(rawLimit)
  const offset = clampOffset(rawOffset)
  const page = Math.floor(offset / pageSize) + 1
  return {
    mode: 'offset',
    page,
    pageSize,
    offset,
    limit: pageSize
  }
}
