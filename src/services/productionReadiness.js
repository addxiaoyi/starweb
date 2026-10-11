export function buildProductionReadiness({
  production = false,
  supertokensConfigured = false,
  supertokensReady = false,
} = {}) {
  const required = Boolean(production)
  const authReady = Boolean(supertokensConfigured && supertokensReady)
  const ready = !required || authReady

  return {
    ok: ready,
    ready,
    checks: {
      supertokens: {
        required,
        configured: Boolean(supertokensConfigured),
        ready: Boolean(supertokensReady),
      },
    },
  }
}
