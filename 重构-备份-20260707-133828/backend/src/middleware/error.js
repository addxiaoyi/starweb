import multer from 'multer'
import { config } from '../config.js'
import { buildErrorBody, jsonError } from '../utils/response.js'

/**
 * 包装 async 路由，统一交给错误处理中间件。
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export function notFoundHandler(req, res) {
  return jsonError(res, 404, 'Endpoint not found', 'not_found')
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return jsonError(res, 400, 'JSON 格式无效', 'invalid_json')
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return jsonError(res, 413, '文件过大', 'payload_too_large')
    }
    return jsonError(res, 400, err.message || '上传错误', 'upload_error')
  }
  if (err?.message === '仅支持 PNG/JPEG 皮肤文件') {
    return jsonError(res, 400, err.message, 'invalid_file_type')
  }

  const status = Number(err.status) || 500
  const body = buildErrorBody(
    status === 500 ? '服务器内部错误' : err.message || '错误',
    err.code || 'internal_error',
    err?.details
  )
  if (!config.isProd && err.stack) {
    body.stack = err.stack.split('\n').slice(0, 8).join('\n')
  }
  if (status === 500) {
    console.error('[starmc-api]', err?.message || err)
  }
  res.status(status).json(body)
}
