import crypto from 'node:crypto'

export function ensureCorrelationId(body = {}) {
  const candidate = String(body.correlationId || body.correlation_id || '').trim()
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID()
}
