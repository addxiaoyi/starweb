export const MC_USERNAME = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 16,
}

export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  HALF_OPEN_MS: 30000,
  MAX_RETRIES: 2,
  BASE_DELAY_MS: 1000,
}

export const WEBHOOK_RETRY = {
  MAX_BACKOFF_SEC: 300,
  BASE_DELAY_SEC: 2,
}

export function computeBackoffSec(attempts) {
  const base = Math.min(WEBHOOK_RETRY.MAX_BACKOFF_SEC, WEBHOOK_RETRY.BASE_DELAY_SEC ** attempts)
  const jitter = Math.random() * 0.3 * base
  return base + jitter
}

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
