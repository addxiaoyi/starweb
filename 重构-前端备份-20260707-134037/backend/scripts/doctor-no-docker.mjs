/**
 * 无容器登录闭环自检：
 * 1) 使用本地 SuperTokens Core（可通过环境变量覆盖）
 * 2) 启动本机 API（独立端口），避免依赖线上域名
 * 3) 启动本机 SMTP Mock，供 doctor:e2e-auth-mail-gate 的 SMTP verify 使用
 */
import net from 'net'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { once } from 'events'
import { resolveEnvLayerMode } from '../src/envLayering.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendDir = join(__dirname, '..')
const envLayerMode = resolveEnvLayerMode()

const supertokensUri = String(
  process.env.DOCTOR_SUPERTOKENS_CONNECTION_URI ||
    process.env.SUPERTOKENS_CONNECTION_URI ||
    'http://127.0.0.1:3567'
).trim()

const mockSmtpHost = String(process.env.DOCTOR_MOCK_SMTP_HOST || '127.0.0.1').trim()
const mockSmtpPort = Number(process.env.DOCTOR_MOCK_SMTP_PORT || 2525)
const mockSmtpUser = String(process.env.DOCTOR_MOCK_SMTP_USER || 'dev_user').trim()
const mockSmtpPass = String(process.env.DOCTOR_MOCK_SMTP_PASS || 'dev_pass').trim()
const doctorApiPort = Number(process.env.DOCTOR_API_PORT || 18787)
const doctorPluginPort = Number(process.env.DOCTOR_PLUGIN_PORT || 18788)
const doctorApiDomain = String(
  process.env.DOCTOR_AUTH_API_DOMAIN || `http://127.0.0.1:${doctorApiPort}`
)
  .trim()
  .replace(/\/+$/, '')
const doctorPluginRefreshSecret = String(
  process.env.DOCTOR_PLUGIN_REFRESH_SECRET ||
    process.env.PLUGIN_REFRESH_SECRET ||
    'doctor-local-plugin-refresh-secret'
).trim()
const doctorWebsiteDomain = String(
  process.env.DOCTOR_AUTH_WEBSITE_DOMAIN || process.env.AUTH_WEBSITE_DOMAIN || 'http://127.0.0.1:5173'
)
  .trim()
  .replace(/\/+$/, '')

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function spawnProcess(cmd, args, options = {}) {
  return spawn(cmd, args, {
    cwd: backendDir,
    stdio: 'pipe',
    env: process.env,
    ...options
  })
}

function runNpmScript(scriptName, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(`${npmBin()} run ${scriptName}`, {
      cwd: backendDir,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...envOverrides
      }
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`npm run ${scriptName} failed with code ${code}`))
    })
  })
}

function waitForTcp(host, port, timeoutMs = 8000) {
  const start = Date.now()

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port })
      let finished = false

      const finish = (ok, err) => {
        if (finished) return
        finished = true
        socket.destroy()
        if (ok) return resolve()
        if (Date.now() - start >= timeoutMs) {
          return reject(err || new Error(`timeout waiting ${host}:${port}`))
        }
        setTimeout(tryConnect, 250)
      }

      socket.once('connect', () => finish(true))
      socket.once('error', (err) => finish(false, err))
      socket.setTimeout(1200, () => finish(false, new Error('connect timeout')))
    }

    tryConnect()
  })
}

async function stopChildProcess(child, name) {
  if (!child || child.exitCode !== null || child.killed) return
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true
      })
      await once(killer, 'exit')
      return
    }

    child.kill('SIGTERM')
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ])
    if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
  } catch (err) {
    console.warn(`[doctor-no-docker] stop ${name} warning: ${err?.message || err}`)
  }
}

async function main() {
  console.log('[doctor-no-docker] 启动无容器闭环自检...')
  let stoppingMock = false
  let stoppingApi = false

  const mockServer = spawnProcess(process.execPath, [join(__dirname, 'mock-smtp-server.mjs')], {
    env: {
      ...process.env,
      MOCK_SMTP_HOST: mockSmtpHost,
      MOCK_SMTP_PORT: String(mockSmtpPort),
      MOCK_SMTP_USER: mockSmtpUser,
      MOCK_SMTP_PASS: mockSmtpPass
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  mockServer.stdout.on('data', (buf) => process.stdout.write(String(buf)))
  mockServer.stderr.on('data', (buf) => process.stderr.write(String(buf)))

  mockServer.on('exit', (code) => {
    if (!stoppingMock && code !== 0) {
      console.error(`[doctor-no-docker] mock smtp 异常退出，code=${code}`)
    }
  })

  const apiServer = spawnProcess(
    process.execPath,
    ['src/server.js'],
    {
      env: {
        ...process.env,
        STARMC_ENV_LAYER_MODE: envLayerMode,
        PORT: String(doctorApiPort),
        PLUGIN_PORT: String(doctorPluginPort),
        PLUGIN_REFRESH_SECRET: doctorPluginRefreshSecret,
        AUTH_API_DOMAIN: doctorApiDomain,
        AUTH_WEBSITE_DOMAIN: doctorWebsiteDomain
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  apiServer.stdout.on('data', (buf) => process.stdout.write(String(buf)))
  apiServer.stderr.on('data', (buf) => process.stderr.write(String(buf)))
  apiServer.on('exit', (code) => {
    if (!stoppingApi && code !== 0) {
      console.error(`[doctor-no-docker] api server 异常退出，code=${code}`)
    }
  })

  try {
    await waitForTcp(mockSmtpHost, mockSmtpPort, 8000)
    await waitForTcp('127.0.0.1', doctorApiPort, 20000)

    const env = {
      STARMC_ENV_LAYER_MODE: envLayerMode,
      SUPERTOKENS_CONNECTION_URI: supertokensUri,
      AUTH_API_DOMAIN: doctorApiDomain,
      AUTH_WEBSITE_DOMAIN: doctorWebsiteDomain,
      SUPERTOKENS_SMTP_HOST: mockSmtpHost,
      SUPERTOKENS_SMTP_PORT: String(mockSmtpPort),
      SUPERTOKENS_SMTP_SECURE: '0',
      SUPERTOKENS_SMTP_USER: mockSmtpUser,
      SUPERTOKENS_SMTP_PASSWORD: mockSmtpPass
    }

    const authClosureScript =
      envLayerMode === 'simple' ? 'doctor:auth-closure:simple' : 'doctor:auth-closure'
    const doctorScript = envLayerMode === 'simple' ? 'doctor:simple' : 'doctor'
    const mailGateScript =
      envLayerMode === 'simple'
        ? 'doctor:e2e-auth-mail-gate:simple'
        : 'doctor:e2e-auth-mail-gate'

    console.log(`[doctor-no-docker] 环境分层模式: ${envLayerMode}`)

    console.log(`[doctor-no-docker] 1/3 ${authClosureScript}`)
    await runNpmScript(authClosureScript, env)

    console.log(`[doctor-no-docker] 2/3 ${doctorScript}`)
    await runNpmScript(doctorScript, env)

    console.log(`[doctor-no-docker] 3/3 ${mailGateScript}`)
    await runNpmScript(mailGateScript, env)

    console.log('[doctor-no-docker] PASS：无容器闭环检查通过。')
  } finally {
    stoppingApi = true
    stoppingMock = true
    await stopChildProcess(apiServer, 'api server')
    await stopChildProcess(mockServer, 'mock smtp')
  }
}

main().catch((err) => {
  console.error('[doctor-no-docker] FAIL:', err?.message || err)
  process.exit(1)
})
