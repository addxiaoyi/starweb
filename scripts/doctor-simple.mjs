import { applyProjectEnvToProcess } from '../src/envLayering.js'
import { probeSuperTokensCore } from '../src/auth/supertokensInit.js'
import { getPool } from '../src/db/pool.js'

applyProjectEnvToProcess({ mode: 'simple' })

console.log('[doctor] profile=', process.env.STARMC_PROFILE || 'local')
console.log('[doctor] api port=', process.env.PORT || 8787)

if (process.env.SUPERTOKENS_CONNECTION_URI) {
  const ok = await probeSuperTokensCore()
  console.log('[doctor] SuperTokens Core reachable=', ok)
} else {
  console.log('[doctor] SuperTokens Core: not configured (dev auth fallback available)')
}

const pool = getPool()
if (pool) {
  try {
    await pool.query('SELECT 1')
    console.log('[doctor] PostgreSQL: ok')
  } catch (e) {
    console.error('[doctor] PostgreSQL: failed', e?.message || e)
    process.exit(1)
  }
} else {
  console.log('[doctor] PostgreSQL: skipped (no DATABASE_URL)')
}

console.log('[doctor] done')
