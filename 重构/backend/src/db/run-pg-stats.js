import '../load-env.js'
import { config } from '../config.js'
import { closePool, getPool } from './pool.js'
import { fetchPgStats } from './pgStats.js'

async function main() {
  if (!config.databaseUrl) {
    console.error('[starmc-api] 未设置 DATABASE_URL')
    process.exit(1)
  }
  const pool = getPool()
  if (!pool) {
    console.error('[starmc-api] 无法创建连接池')
    process.exit(1)
  }
  try {
    const stats = await fetchPgStats(pool)
    console.log(JSON.stringify(stats, null, 2))
  } finally {
    await closePool()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
