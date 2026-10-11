export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

export function notFoundHandler(_req, res) {
  res.status(404).json({
    ok: false,
    success: false,
    message: 'Not Found',
    code: 'not_found',
    error: 'not_found',
  })
}

export function errorHandler(err, _req, res, _next) {
  const uploadLimitError = String(err?.code || '').startsWith('LIMIT_')
  const status = uploadLimitError ? 400 : Number(err?.status || err?.statusCode || 500)
  const code = uploadLimitError ? 'validation_error' : String(err?.code || 'internal_error')
  const message = uploadLimitError ? '上传文件不符合限制' : String(err?.message || 'Internal Server Error')
  if (!res.headersSent) {
    res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      success: false,
      message,
      code,
      error: code,
    })
  }
}
