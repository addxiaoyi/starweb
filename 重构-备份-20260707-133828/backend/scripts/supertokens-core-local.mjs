import { spawn } from 'child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { delimiter, dirname, join, sep } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendDir = join(__dirname, '..')
const runtimeDir = join(backendDir, '.runtime')
const pidFile = join(runtimeDir, 'supertokens-core-local.pid')
const outLog = join(runtimeDir, 'supertokens-core-local.out.log')
const errLog = join(runtimeDir, 'supertokens-core-local.err.log')
const coreHome = String(process.env.SUPERTOKENS_LOCAL_CORE_HOME || '').trim() ||
  join(backendDir, '.cache', 'supertokens-layer', 'l6_full', 'usr', 'lib', 'supertokens')
const connectionUri = String(process.env.SUPERTOKENS_CONNECTION_URI || 'http://127.0.0.1:3567')
  .trim()
  .replace(/\/+$/, '')
const action = String(process.argv[2] || 'status').toLowerCase()

function classpath() {
  return [
    join(coreHome, 'core', '*'),
    join(coreHome, 'plugin-interface', '*'),
    join(coreHome, 'plugin', '*'),
    join(coreHome, 'ee', '*')
  ].join(delimiter)
}

function ensureRuntimeDir() {
  if (!existsSync(runtimeDir)) {
    mkdirSync(runtimeDir, { recursive: true })
  }
}

function readPid() {
  if (!existsSync(pidFile)) return null
  const raw = readFileSync(pidFile, 'utf8').trim()
  const pid = Number(raw)
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function isPidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function fetchHello(timeoutMs = 3000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${connectionUri}/hello`, { signal: ac.signal })
    const text = await res.text()
    return res.ok && /hello/i.test(text)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function waitForHello(timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await fetchHello(2500)) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

function ensureCoreFiles() {
  const required = [
    join(coreHome, 'core'),
    join(coreHome, 'plugin-interface'),
    join(coreHome, 'plugin'),
    join(coreHome, 'ee'),
    join(coreHome, 'config.yaml')
  ]
  for (const p of required) {
    if (!existsSync(p)) {
      throw new Error(
        `缺少本地 Core 文件: ${p}\n` +
          '请先准备 SUPERTOKENS_LOCAL_CORE_HOME，或把镜像提取目录放到 backend/.cache/supertokens-layer/l6_full/usr/lib/supertokens'
      )
    }
  }
}

function writePid(pid) {
  ensureRuntimeDir()
  writeFileSync(pidFile, String(pid), 'utf8')
}

function removePid() {
  rmSync(pidFile, { force: true })
}

function runTaskkill(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    })
    killer.on('exit', () => resolve())
    killer.on('error', () => resolve())
  })
}

async function startCore() {
  if (await fetchHello()) {
    console.log(`[supertokens-local] already reachable: ${connectionUri}/hello`)
    return
  }

  ensureCoreFiles()
  ensureRuntimeDir()

  const stdoutFd = openSync(outLog, 'a')
  const stderrFd = openSync(errLog, 'a')
  const child = spawn(
    'java',
    ['-classpath', classpath(), 'io.supertokens.Main', `${coreHome}${sep}`],
    {
      cwd: coreHome,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', stdoutFd, stderrFd]
    }
  )
  child.unref()
  writePid(child.pid)

  const ok = await waitForHello(45000)
  if (!ok) {
    throw new Error(
      `Core 未在预期时间内就绪，请检查日志：\n- ${outLog}\n- ${errLog}`
    )
  }

  console.log(`[supertokens-local] started pid=${child.pid}`)
  console.log(`[supertokens-local] hello -> ${connectionUri}/hello`)
}

async function stopCore() {
  const pid = readPid()
  if (!pid) {
    console.log('[supertokens-local] no pid file, skipped')
    return
  }

  if (isPidAlive(pid)) {
    if (process.platform === 'win32') {
      await runTaskkill(pid)
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
    }
  }

  removePid()
  console.log(`[supertokens-local] stopped pid=${pid}`)
}

async function statusCore() {
  const pid = readPid()
  const alive = isPidAlive(pid)
  const hello = await fetchHello()
  console.log(
    `[supertokens-local] pid=${pid ?? 'none'} alive=${alive ? 'yes' : 'no'} hello=${hello ? 'ok' : 'fail'} uri=${connectionUri}/hello`
  )
  if (!hello) process.exit(1)
}

async function main() {
  if (action === 'start') {
    await startCore()
    return
  }
  if (action === 'stop') {
    await stopCore()
    return
  }
  if (action === 'status') {
    await statusCore()
    return
  }
  if (action === 'restart') {
    await stopCore()
    await startCore()
    return
  }
  console.log('usage: node scripts/supertokens-core-local.mjs <start|stop|status|restart>')
  process.exit(1)
}

main().catch((err) => {
  console.error('[supertokens-local] FAIL:', err?.message || err)
  process.exit(1)
})
