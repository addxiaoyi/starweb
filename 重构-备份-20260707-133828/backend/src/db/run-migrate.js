import '../load-env.js'
import { config } from '../config.js'
import { closePool, getPool } from './pool.js'
import { runMigrations } from './migrate.js'

async function main() {
  if (!config.databaseUrl) {
    console.error('[starmc-api] 未设置 DATABASE_URL，跳过迁移')
    process.exit(1)
  }
  const pool = getPool()
  if (!pool) {
    console.error('[starmc-api] 无法创建数据库连接池')
    process.exit(1)
  }
  try {
    await runMigrations(pool)
    console.log('[starmc-api] 数据库迁移完成')
  } finally {
    await closePool()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
