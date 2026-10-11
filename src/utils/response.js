export function buildErrorBody(message, code = 'error', details) {
  const body = {
    ok: false,
    success: false,
    message: String(message || 'error'),
    code: String(code || 'error'),
    error: String(code || 'error'),
  }
  if (details && typeof details === 'object' && Object.keys(details).length > 0) {
    body.details = details
  }
  return body
}

export function jsonError(res, status, message, code = 'error', details) {
  return res.status(Number(status || 500)).json(buildErrorBody(message, code, details))
}

export function jsonOk(res, payload = {}, status = 200) {
  const body =
    payload && typeof payload === 'object'
      ? { ok: true, success: true, ...payload }
      : { ok: true, success: true, data: payload }
  return res.status(status).json(body)
}

export function resolvePaginationQuery(query = {}, options = {}) {
  const maxPageSize = Math.max(1, Number(options.maxPageSize || 100))
  let page = Number(query.page)
  let pageSize = Number(query.pageSize ?? query.limit)
  const offset = Number(query.offset)

  if (!Number.isFinite(page) || page < 1) page = 1
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = Number(options.defaultPageSize || 20)
  pageSize = Math.min(maxPageSize, Math.max(1, Math.floor(pageSize)))

  if (Number.isFinite(offset) && offset >= 0 && !query.page) {
    page = Math.floor(offset / pageSize) + 1
  }

  const totalPages = (total) => Math.max(1, Math.ceil(total / pageSize))
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    build(total) {
      const tp = totalPages(total)
      return {
        total,
        page,
        pageSize,
        totalPages: tp,
        hasMore: page < tp,
        hasPrev: page > 1,
      }
    },
  }
}

export function jsonPage(res, items, total, pageInfo, extra = {}) {
  const pagination = pageInfo.build(total)
  return res.json({
    ok: true,
    success: true,
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pagination,
    ...extra,
  })
}
