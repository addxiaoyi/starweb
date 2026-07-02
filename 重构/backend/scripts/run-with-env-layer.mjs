import { spawn } from 'child_process'

const [, , modeArg, ...nodeArgs] = process.argv
const mode = String(modeArg || '').trim().toLowerCase() === 'simple' ? 'simple' : 'overlay'

if (nodeArgs.length === 0) {
  console.error('[env-layer] 用法: node scripts/run-with-env-layer.mjs <simple|overlay> <node args...>')
  process.exit(1)
}

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    STARMC_ENV_LAYER_MODE: mode,
  },
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

child.on('error', (err) => {
  console.error('[env-layer] 启动失败:', err?.message || err)
  process.exit(1)
})
