export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  HALF_OPEN_MS: 30_000,
  MAX_RETRIES: 2,
  BASE_DELAY_MS: 250,
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function computeBackoffSec(attempt) {
  return Math.min(60, 2 ** Math.max(0, attempt))
}
