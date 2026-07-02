import fs from 'node:fs'
import fsp from 'node:fs/promises'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const velocityRoot = path.resolve(__dirname, '..')
const runtimeRoot = path.join(velocityRoot, '.paper-runtime')
const cacheRoot = path.join(velocityRoot, '.paper-cache')
const instancesRoot = path.join(runtimeRoot, 'instances')
const logsRoot = path.join(runtimeRoot, 'logs')
const manifestPath = path.join(runtimeRoot, 'manifest.json')
const velocityTomlPath = path.join(velocityRoot, 'velocity.toml')
const forwardingSecretPath = path.join(velocityRoot, 'forwarding.secret')
const defaultUserAgent = process.env.VLA_PAPER_USER_AGENT || 'starmc-website-velocity-test/1.0 ([email protected])'

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function stripQuotes(value) {
  const raw = String(value ?? '').trim()
  if (raw.length >= 2) {
    const first = raw[0]
    const last = raw[raw.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return raw
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }
  }
  return raw
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }
  const out = {}
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const idx = line.indexOf('=')
    if (idx <= 0) {
      continue
    }
    const key = line.slice(0, idx).trim()
    const value = stripQuotes(line.slice(idx + 1))
    if (key) {
      out[key] = value
    }
  }
  return out
}

function loadHelperEnv() {
  for (const fileName of ['.env.velocity.generated', '.env.velocity']) {
    Object.assign(process.env, parseEnvFile(path.join(velocityRoot, fileName)))
  }
}

function normalizeHost(rawHost) {
  const host = String(rawHost || '').trim()
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return '127.0.0.1'
  }
  return host.replace(/^\[|\]$/g, '')
}

function isLocalHost(host) {
  const value = String(host || '').trim().toLowerCase()
  return value === '127.0.0.1' || value === 'localhost' || value === '::1'
}

function parseTarget(target) {
  const raw = String(target || '').trim()
  if (!raw) {
    return null
  }
  const lastColon = raw.lastIndexOf(':')
  if (lastColon <= 0 || lastColon >= raw.length - 1) {
    return null
  }
  const host = normalizeHost(raw.slice(0, lastColon))
  const port = Number(raw.slice(lastColon + 1))
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
    return null
  }
  return { host, port, target: `${host}:${port}` }
}

function parseVelocityConfig() {
  if (!fs.existsSync(velocityTomlPath)) {
    throw new Error(`Missing velocity.toml: ${velocityTomlPath}`)
  }

  const text = fs.readFileSync(velocityTomlPath, 'utf8')
  const lines = text.split(/\r?\n/)
  const servers = []
  let inServers = false
  let forwardingMode = 'NONE'

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const forwardingMatch = line.match(/^player-info-forwarding-mode\s*=\s*"([^"]+)"/i)
    if (forwardingMatch) {
      forwardingMode = forwardingMatch[1].trim().toUpperCase()
    }

    if (/^\[servers\]\s*$/i.test(line)) {
      inServers = true
      continue
    }
    if (inServers && /^\[.+\]\s*$/.test(line)) {
      break
    }
    if (!inServers) {
      continue
    }

    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/)
    if (!match) {
      continue
    }

    const parsed = parseTarget(match[2])
    if (!parsed) {
      throw new Error(`Invalid Velocity backend target for "${match[1]}": ${match[2]}`)
    }
    servers.push({
      name: match[1],
      host: parsed.host,
      port: parsed.port,
      target: parsed.target,
      local: isLocalHost(parsed.host)
    })
  }

  return { forwardingMode, servers }
}

function flattenStableVersions(projectJson) {
  const stable = new Set()
  for (const versions of Object.values(projectJson?.versions || {})) {
    for (const version of versions || []) {
      if (!String(version).includes('-')) {
        stable.add(String(version))
      }
    }
  }
  return Array.from(stable)
}

function compareVersionsDescending(a, b) {
  const aParts = String(a).split('.').map((part) => Number(part))
  const bParts = String(b).split('.').map((part) => Number(part))
  const max = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < max; i++) {
    const left = Number.isFinite(aParts[i]) ? aParts[i] : 0
    const right = Number.isFinite(bParts[i]) ? bParts[i] : 0
    if (left !== right) {
      return right - left
    }
  }
  return 0
}

function inferRequiredJavaMajor(version) {
  const value = String(version || '').trim()
  if (/^26\./.test(value)) {
    return 25
  }
  if (/^1\.(21|20)(?:\.|$)/.test(value)) {
    return 21
  }
  if (/^1\.(19|18|17)(?:\.|$)/.test(value)) {
    return 17
  }
  return null
}

function getJavaCompatibilityPattern(javaMajor) {
  if (javaMajor >= 25) {
    return /.*/
  }
  if (javaMajor >= 21) {
    return /^1\.(21|20|19|18|17)(?:\.|$)/
  }
  if (javaMajor >= 17) {
    return /^1\.(19|18|17)(?:\.|$)/
  }
  return null
}

function selectPaperVersion(stableVersions, javaMajor, requestedVersion) {
  const sorted = [...stableVersions].sort(compareVersionsDescending)
  const requested = String(requestedVersion || '').trim()

  if (requested && requested.toLowerCase() !== 'latest') {
    if (!sorted.includes(requested)) {
      throw new Error(`Requested Paper version not found in official index: ${requested}`)
    }
    return requested
  }

  if (requested.toLowerCase() === 'latest') {
    return sorted[0]
  }

  const pattern = getJavaCompatibilityPattern(javaMajor)
  if (!pattern) {
    throw new Error(`Java ${javaMajor} is too old for this helper. Use Java 17+.`)
  }

  const compatible = sorted.find((version) => pattern.test(version))
  if (!compatible) {
    throw new Error(`No Paper version matched the helper's Java ${javaMajor} compatibility rule.`)
  }
  return compatible
}

function selectStableBuild(builds, requestedBuild) {
  const stableBuilds = (Array.isArray(builds) ? builds : []).filter((build) => String(build?.channel || '').toUpperCase() === 'STABLE')
  if (stableBuilds.length === 0) {
    throw new Error('No stable Paper builds were returned by the official API.')
  }

  if (requestedBuild != null && requestedBuild !== '') {
    const id = Number(requestedBuild)
    const explicit = stableBuilds.find((build) => Number(build?.id) === id)
    if (!explicit) {
      throw new Error(`Requested Paper build ${requestedBuild} was not found among stable builds.`)
    }
    return explicit
  }

  return stableBuilds.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0]
}

function parseArgs(argv) {
  const out = {
    command: 'status',
    json: false,
    allowNonLocal: false,
    forceDownload: false,
    servers: [],
    version: process.env.VLA_PAPER_VERSION || '',
    build: process.env.VLA_PAPER_BUILD || '',
    xms: process.env.VLA_PAPER_XMS || '512M',
    xmx: process.env.VLA_PAPER_XMX || '512M',
    waitMs: Number(process.env.VLA_PAPER_WAIT_MS || 90000)
  }

  let index = 0
  if (argv[0] && !argv[0].startsWith('-')) {
    out.command = String(argv[0]).trim().toLowerCase()
    index = 1
  }

  const readValue = (flag) => {
    index += 1
    if (index >= argv.length) {
      throw new Error(`Missing value for ${flag}`)
    }
    return argv[index]
  }

  for (; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case '--json':
        out.json = true
        break
      case '--allow-nonlocal':
        out.allowNonLocal = true
        break
      case '--force-download':
        out.forceDownload = true
        break
      case '--server':
        out.servers.push(readValue(arg))
        break
      case '--version':
        out.version = readValue(arg)
        break
      case '--build':
        out.build = readValue(arg)
        break
      case '--xms':
        out.xms = readValue(arg)
        break
      case '--xmx':
        out.xmx = readValue(arg)
        break
      case '--wait-ms':
        out.waitMs = Number(readValue(arg))
        break
      default:
        if (arg.startsWith('--version=')) {
          out.version = arg.slice('--version='.length)
        } else if (arg.startsWith('--build=')) {
          out.build = arg.slice('--build='.length)
        } else if (arg.startsWith('--xms=')) {
          out.xms = arg.slice('--xms='.length)
        } else if (arg.startsWith('--xmx=')) {
          out.xmx = arg.slice('--xmx='.length)
        } else if (arg.startsWith('--wait-ms=')) {
          out.waitMs = Number(arg.slice('--wait-ms='.length))
        } else if (arg.startsWith('--server=')) {
          out.servers.push(arg.slice('--server='.length))
        } else {
          throw new Error(`Unknown argument: ${arg}`)
        }
        break
    }
  }

  if (isTruthy(process.env.VLA_PAPER_ALLOW_NONLOCAL)) {
    out.allowNonLocal = true
  }
  if (isTruthy(process.env.VLA_PAPER_FORCE_DOWNLOAD)) {
    out.forceDownload = true
  }
  if (!Number.isFinite(out.waitMs) || out.waitMs < 1000) {
    out.waitMs = 90000
  }

  return out
}

function renderJson(data) {
  console.log(JSON.stringify(data, null, 2))
}

function getCurlCommand() {
  const candidate = process.platform === 'win32' ? 'curl.exe' : 'curl'
  const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
  return result.status === 0 ? candidate : null
}

function requestViaCurl(url, expectedType = 'json') {
  const curl = getCurlCommand()
  if (!curl) {
    return null
  }

  const result = spawnSync(curl, [
    '-fsSL',
    '-A',
    defaultUserAgent,
    '-H',
    expectedType === 'json' ? 'Accept: application/json' : 'Accept: */*',
    String(url)
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })

  if (result.status !== 0) {
    return null
  }

  if (expectedType === 'json') {
    return JSON.parse(result.stdout)
  }
  return Buffer.from(result.stdout, 'utf8')
}

function request(url, expectedType = 'json') {
  try {
    const viaCurl = requestViaCurl(url, expectedType)
    if (viaCurl != null) {
      return Promise.resolve(viaCurl)
    }
  } catch {}

  const maxRedirects = 5

  return new Promise((resolve, reject) => {
    const doRequest = (targetUrl, redirectsLeft) => {
      const req = https.request(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': defaultUserAgent,
          Accept: expectedType === 'json' ? 'application/json' : '*/*'
        }
      }, (res) => {
        const status = Number(res.statusCode || 0)
        const location = res.headers.location

        if (status >= 300 && status < 400 && location) {
          res.resume()
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects while requesting ${targetUrl}`))
            return
          }
          doRequest(new URL(location, targetUrl), redirectsLeft - 1)
          return
        }

        if (status < 200 || status >= 300) {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            reject(new Error(`HTTP ${status} from ${targetUrl}: ${Buffer.concat(chunks).toString('utf8').slice(0, 400)}`))
          })
          return
        }

        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          if (expectedType === 'json') {
            try {
              resolve(JSON.parse(body.toString('utf8')))
            } catch (err) {
              reject(new Error(`Failed to parse JSON from ${targetUrl}: ${err?.message || err}`))
            }
            return
          }
          resolve(body)
        })
      })

      req.on('error', reject)
      req.end()
    }

    doRequest(url, maxRedirects)
  })
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true })
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

async function downloadFile(url, destinationPath, expectedSha256) {
  await ensureDir(path.dirname(destinationPath))
  const tempPath = `${destinationPath}.part`

  const curl = getCurlCommand()
  if (curl) {
    const result = spawnSync(curl, [
      '-fsSL',
      '-A',
      defaultUserAgent,
      '-H',
      'Accept: */*',
      '-o',
      tempPath,
      String(url)
    ], { stdio: 'inherit' })

    if (result.status === 0) {
      const actualSha = await sha256File(tempPath)
      if (expectedSha256 && actualSha !== expectedSha256) {
        throw new Error(`SHA256 mismatch for ${destinationPath}: expected ${expectedSha256}, got ${actualSha}`)
      }
      await fsp.rename(tempPath, destinationPath)
      return
    }
  }

  await new Promise((resolve, reject) => {
    const doDownload = (targetUrl, redirectsLeft) => {
      const req = https.request(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': defaultUserAgent,
          Accept: '*/*'
        }
      }, (res) => {
        const status = Number(res.statusCode || 0)
        const location = res.headers.location

        if (status >= 300 && status < 400 && location) {
          res.resume()
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects while downloading ${targetUrl}`))
            return
          }
          doDownload(new URL(location, targetUrl), redirectsLeft - 1)
          return
        }

        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status} while downloading ${targetUrl}`))
          res.resume()
          return
        }

        const hash = createHash('sha256')
        const file = fs.createWriteStream(tempPath)
        res.on('data', (chunk) => hash.update(chunk))
        res.pipe(file)
        file.on('finish', () => {
          file.close(async () => {
            try {
              const actualSha = hash.digest('hex')
              if (expectedSha256 && actualSha !== expectedSha256) {
                reject(new Error(`SHA256 mismatch for ${destinationPath}: expected ${expectedSha256}, got ${actualSha}`))
                return
              }
              await fsp.rename(tempPath, destinationPath)
              resolve()
            } catch (err) {
              reject(err)
            }
          })
        })
        file.on('error', reject)
      })

      req.on('error', reject)
      req.end()
    }

    doDownload(url, 5)
  }).finally(async () => {
    if (fs.existsSync(tempPath)) {
      try {
        await fsp.rm(tempPath, { force: true })
      } catch {}
    }
  })
}

function getJavaInfo() {
  const javaCommand = process.env.VLA_PAPER_JAVA || 'java'
  const result = spawnSync(javaCommand, ['-version'], { encoding: 'utf8' })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  if (result.error) {
    throw new Error(`Failed to run "${javaCommand} -version": ${result.error.message}`)
  }

  const match = output.match(/version "([^"]+)"/i)
  if (!match) {
    throw new Error(`Unable to parse Java version from output:\n${output}`)
  }

  const rawVersion = match[1]
  const major = rawVersion.startsWith('1.')
    ? Number(rawVersion.split('.')[1])
    : Number(rawVersion.split(/[.+-]/)[0])

  if (!Number.isFinite(major)) {
    throw new Error(`Unable to determine Java major version from "${rawVersion}"`)
  }

  return { command: javaCommand, major, rawVersion }
}

async function resolvePaperRuntime(options) {
  const java = getJavaInfo()
  const projectJson = await request('https://fill.papermc.io/v3/projects/paper', 'json')
  const stableVersions = flattenStableVersions(projectJson)
  const version = selectPaperVersion(stableVersions, java.major, options.version || process.env.VLA_MC_VERSION || '')
  const requiredJava = inferRequiredJavaMajor(version)
  if (requiredJava && java.major < requiredJava) {
    throw new Error(`Paper ${version} requires Java ${requiredJava}+ but local java is ${java.rawVersion}.`)
  }

  const builds = await request(`https://fill.papermc.io/v3/projects/paper/versions/${version}/builds`, 'json')
  const build = selectStableBuild(builds, options.build)
  const download = build?.downloads?.['server:default']
  if (!download?.url || !download?.name || !download?.checksums?.sha256) {
    throw new Error(`Official API response for Paper ${version} build ${build?.id} did not include a usable server download.`)
  }

  const jarPath = path.join(cacheRoot, download.name)
  const sha256 = String(download.checksums.sha256)
  const needsDownload = options.forceDownload
    || !fs.existsSync(jarPath)
    || (await sha256File(jarPath)) !== sha256

  if (needsDownload) {
    if (fs.existsSync(jarPath)) {
      await fsp.rm(jarPath, { force: true })
    }
    console.log(`Downloading ${download.name} from Paper official API ...`)
    await downloadFile(download.url, jarPath, sha256)
  }

  return {
    java,
    version,
    buildId: Number(build.id),
    channel: String(build.channel || ''),
    jarName: download.name,
    jarPath,
    sha256,
    downloadUrl: download.url,
    size: Number(download.size || 0)
  }
}

function filterServers(servers, selectedNames) {
  if (!selectedNames || selectedNames.length === 0) {
    return servers
  }

  const wanted = new Set(selectedNames.map((name) => String(name).trim()).filter(Boolean))
  const filtered = servers.filter((server) => wanted.has(server.name))
  if (filtered.length !== wanted.size) {
    const missing = [...wanted].filter((name) => !filtered.some((server) => server.name === name))
    throw new Error(`Unknown Velocity backend name(s): ${missing.join(', ')}`)
  }
  return filtered
}

function maybeWriteFile(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) {
    return false
  }
  fs.writeFileSync(filePath, content, 'utf8')
  return true
}

function buildServerProperties(instance) {
  return [
    '# Generated by velocity-test/tools/paper-backend-helper.mjs',
    'allow-flight=true',
    'difficulty=peaceful',
    'enable-command-block=false',
    'enable-jmx-monitoring=false',
    'enable-query=false',
    'enable-rcon=false',
    'enforce-secure-profile=false',
    'gamemode=creative',
    'generate-structures=false',
    'hardcore=false',
    'level-name=world',
    'level-type=minecraft:flat',
    'max-players=20',
    `motd=StarMC local backend (${instance.name})`,
    'network-compression-threshold=256',
    'online-mode=false',
    'player-idle-timeout=0',
    'pvp=false',
    `server-ip=${instance.host}`,
    `server-port=${instance.port}`,
    'simulation-distance=4',
    'spawn-animals=false',
    'spawn-monsters=false',
    'spawn-npcs=false',
    'spawn-protection=0',
    'sync-chunk-writes=false',
    'view-distance=6',
    'white-list=false',
    ''
  ].join('\n')
}

function buildPaperGlobalYaml(forwardingMode, secret) {
  if (forwardingMode !== 'MODERN' || !secret) {
    return null
  }

  const safeSecret = String(secret).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return [
    '# Generated by velocity-test/tools/paper-backend-helper.mjs',
    'proxies:',
    '  velocity:',
    '    enabled: true',
    '    online-mode: false',
    `    secret: "${safeSecret}"`,
    ''
  ].join('\n')
}

function buildManifest(runtime, velocityConfig) {
  const forwardingSecret = fs.existsSync(forwardingSecretPath)
    ? fs.readFileSync(forwardingSecretPath, 'utf8').trim()
    : ''

  const instances = velocityConfig.servers.map((server) => {
    const dir = path.join(instancesRoot, server.name)
    return {
      name: server.name,
      host: server.host,
      port: server.port,
      target: server.target,
      dir,
      pidFile: path.join(dir, '.paper.pid.json'),
      outLog: path.join(logsRoot, `${server.name}.out.log`),
      errLog: path.join(logsRoot, `${server.name}.err.log`),
      propertiesFile: path.join(dir, 'server.properties'),
      paperGlobalFile: path.join(dir, 'config', 'paper-global.yml'),
      eulaFile: path.join(dir, 'eula.txt')
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    paper: runtime,
    velocity: {
      configFile: velocityTomlPath,
      forwardingMode: velocityConfig.forwardingMode,
      forwardingSecretPresent: Boolean(forwardingSecret),
      servers: velocityConfig.servers
    },
    instances,
    _forwardingSecret: forwardingSecret
  }
}

async function writeManifestFiles(manifest) {
  await ensureDir(runtimeRoot)
  await ensureDir(cacheRoot)
  await ensureDir(instancesRoot)
  await ensureDir(logsRoot)

  for (const instance of manifest.instances) {
    await ensureDir(instance.dir)
    await ensureDir(path.dirname(instance.paperGlobalFile))
    maybeWriteFile(instance.eulaFile, 'eula=true\n')
    maybeWriteFile(instance.propertiesFile, buildServerProperties(instance))

    const paperGlobal = buildPaperGlobalYaml(manifest.velocity.forwardingMode, manifest._forwardingSecret)
    if (paperGlobal) {
      maybeWriteFile(instance.paperGlobalFile, paperGlobal)
    }
  }

  const serializable = {
    generatedAt: manifest.generatedAt,
    paper: manifest.paper,
    velocity: manifest.velocity,
    instances: manifest.instances
  }
  fs.writeFileSync(manifestPath, JSON.stringify(serializable, null, 2), 'utf8')
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

function tryResolveRuntimeFromManifest(manifest, args) {
  const paper = manifest?.paper
  if (!paper?.jarPath || !fs.existsSync(paper.jarPath)) {
    return null
  }

  const requestedVersion = String(args.version || '').trim()
  if (requestedVersion && requestedVersion !== String(paper.version || '')) {
    return null
  }

  const requestedBuild = Number.parseInt(String(args.build || '').trim(), 10)
  if (Number.isFinite(requestedBuild) && requestedBuild > 0 && requestedBuild !== Number(paper.buildId || 0)) {
    return null
  }

  const java = getJavaInfo()
  const version = String(paper.version || '')
  const requiredJava = inferRequiredJavaMajor(version)
  if (requiredJava && java.major < requiredJava) {
    throw new Error(`Cached Paper ${version} requires Java ${requiredJava}+ but local java is ${java.rawVersion}.`)
  }

  return {
    java,
    version,
    buildId: Number(paper.buildId || 0),
    channel: String(paper.channel || ''),
    jarName: String(paper.jarName || path.basename(String(paper.jarPath))),
    jarPath: String(paper.jarPath),
    sha256: String(paper.sha256 || ''),
    downloadUrl: String(paper.downloadUrl || ''),
    size: Number(paper.size || 0)
  }
}

function readPidFile(pidFile) {
  if (!fs.existsSync(pidFile)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(pidFile, 'utf8'))
  } catch {
    return null
  }
}

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) {
    return false
  }
  try {
    process.kill(Number(pid), 0)
    return true
  } catch {
    return false
  }
}

function normalizeForMatch(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
}

function readProcessCommandLine(pid) {
  const targetPid = Number(pid)
  if (!Number.isFinite(targetPid) || targetPid <= 0) {
    return null
  }
  if (process.platform === 'win32') {
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${targetPid}" -ErrorAction SilentlyContinue; if ($null -eq $p) { exit 3 }; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $p.CommandLine`
    ], { encoding: 'utf8' })
    if (ps.status !== 0) {
      return null
    }
    return String(ps.stdout || '').trim()
  }
  const procCmdlinePath = `/proc/${targetPid}/cmdline`
  if (!fs.existsSync(procCmdlinePath)) {
    return null
  }
  try {
    return fs.readFileSync(procCmdlinePath, 'utf8').replace(/\u0000/g, ' ').trim()
  } catch {
    return null
  }
}

function isManagedPaperProcessAlive(pidRecord, expectedJarPath) {
  if (!pidRecord || !isProcessAlive(pidRecord.pid)) {
    return false
  }
  const expectedJar = normalizeForMatch(pidRecord.jarPath || expectedJarPath || '')
  if (!expectedJar) {
    return true
  }
  const cmdline = normalizeForMatch(readProcessCommandLine(pidRecord.pid))
  return Boolean(cmdline) && cmdline.includes(expectedJar)
}

async function checkTcpReachable(host, port, timeoutMs) {
  await new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const cleanup = () => {
      socket.removeAllListeners()
      socket.destroy()
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      cleanup()
      resolve()
    })
    socket.once('timeout', () => {
      cleanup()
      reject(new Error(`connect timeout after ${timeoutMs}ms`))
    })
    socket.once('error', (err) => {
      cleanup()
      reject(err)
    })
    socket.connect(port, host)
  })
}

async function prepareCommand(args) {
  const velocityConfig = parseVelocityConfig()
  if (velocityConfig.servers.length === 0) {
    throw new Error(`No backend targets were found in ${velocityTomlPath}`)
  }

  const nonLocal = velocityConfig.servers.filter((server) => !server.local)
  if (nonLocal.length > 0 && !args.allowNonLocal) {
    throw new Error(`Refusing to generate local Paper instances for non-local targets: ${nonLocal.map((server) => server.target).join(', ')}. Re-run with --allow-nonlocal only if you intentionally want that.`)
  }

  if (!['NONE', 'MODERN', 'LEGACY', 'BUNGEECORD'].includes(velocityConfig.forwardingMode)) {
    console.warn(`[paper-helper] unrecognized forwarding mode "${velocityConfig.forwardingMode}", proceeding with minimal local backend config`)
  }
  if ((velocityConfig.forwardingMode === 'LEGACY' || velocityConfig.forwardingMode === 'BUNGEECORD')) {
    console.warn('[paper-helper] LEGACY/BUNGEECORD forwarding was detected. This helper does not rewrite spigot.yml; local backend prep still works for reachability, but legacy forwarding remains a manual backend concern.')
  }

  let runtime
  try {
    runtime = await resolvePaperRuntime(args)
  } catch (error) {
    if (args.forceDownload) {
      throw error
    }
    const cached = readManifest()
    const fallback = tryResolveRuntimeFromManifest(cached, args)
    if (!fallback) {
      throw error
    }
    console.warn(
      `[paper-helper] Failed to query Paper official API (${error?.message || error}); reusing cached runtime ${fallback.jarName} (version ${fallback.version}, build ${fallback.buildId}).`
    )
    runtime = fallback
  }
  const manifest = buildManifest(runtime, velocityConfig)
  await writeManifestFiles(manifest)

  const output = {
    ok: true,
    prepared: manifest.instances.map((instance) => ({
      name: instance.name,
      target: instance.target,
      dir: instance.dir,
      propertiesFile: instance.propertiesFile
    })),
    paper: manifest.paper,
    velocity: manifest.velocity
  }

  if (args.json) {
    renderJson(output)
  } else {
    console.log(`Prepared ${manifest.instances.length} Paper backend instance(s) using ${manifest.paper.jarName}`)
    for (const instance of manifest.instances) {
      console.log(`- ${instance.name}: ${instance.target} -> ${instance.dir}`)
    }
  }

  return manifest
}

function openLogStream(filePath) {
  return fs.openSync(filePath, 'a')
}

async function waitForInstancesReady(instances, timeoutMs) {
  const pending = new Map(instances.map((instance) => [instance.name, instance]))
  const started = Date.now()

  while (pending.size > 0) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for Paper backend(s): ${[...pending.keys()].join(', ')}`)
    }

    for (const [name, instance] of pending) {
      const pidRecord = readPidFile(instance.pidFile)
      if (pidRecord && !isManagedPaperProcessAlive(pidRecord, instance.jarPath)) {
        try {
          await fsp.rm(instance.pidFile, { force: true })
        } catch {}
      }
      try {
        await checkTcpReachable(instance.host, instance.port, 1200)
        pending.delete(name)
      } catch {}
    }

    if (pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
}

async function upCommand(args) {
  const manifest = await prepareCommand({ ...args, json: false })
  const selected = filterServers(manifest.instances, args.servers)
  const selectedWithJar = selected.map((instance) => ({
    ...instance,
    jarPath: manifest.paper.jarPath
  }))
  const launched = []
  const skipped = []

  for (const instance of selectedWithJar) {
    const pidRecord = readPidFile(instance.pidFile)
    if (pidRecord && isManagedPaperProcessAlive(pidRecord, manifest.paper.jarPath)) {
      skipped.push({ name: instance.name, pid: pidRecord.pid })
      continue
    }
    if (pidRecord) {
      try {
        await fsp.rm(instance.pidFile, { force: true })
      } catch {}
    }

    await ensureDir(path.dirname(instance.outLog))
    const outFd = openLogStream(instance.outLog)
    const errFd = openLogStream(instance.errLog)

    const child = spawn(manifest.paper.java.command, [
      `-Xms${args.xms}`,
      `-Xmx${args.xmx}`,
      '-Dpaper.disableStartupVersionCheck=true',
      '-jar',
      manifest.paper.jarPath,
      'nogui'
    ], {
      cwd: instance.dir,
      detached: true,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true
    })

    child.unref()
    fs.closeSync(outFd)
    fs.closeSync(errFd)

    const pidInfo = {
      pid: child.pid,
      startedAt: new Date().toISOString(),
      java: manifest.paper.java.command,
      jarPath: manifest.paper.jarPath
    }
    fs.writeFileSync(instance.pidFile, JSON.stringify(pidInfo, null, 2), 'utf8')
    launched.push({ name: instance.name, pid: child.pid })
  }

  await waitForInstancesReady(selectedWithJar, args.waitMs)

  if (args.json) {
    renderJson({
      ok: true,
      launched,
      skipped,
      instances: selectedWithJar.map((instance) => ({
        name: instance.name,
        target: instance.target,
        pidFile: instance.pidFile,
        outLog: instance.outLog,
        errLog: instance.errLog
      }))
    })
  } else {
    for (const item of launched) {
      console.log(`[ OK ] started ${item.name} (pid ${item.pid})`)
    }
    for (const item of skipped) {
      console.log(`[ OK ] already running ${item.name} (pid ${item.pid})`)
    }
    console.log('Paper backend targets are reachable.')
  }
}

function stopProcessByPid(pid) {
  if (!pid || !Number.isFinite(Number(pid))) {
    return false
  }

  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return result.status === 0
  }

  try {
    process.kill(Number(pid), 'SIGTERM')
  } catch {
    return false
  }
  return true
}

async function downCommand(args) {
  const manifest = readManifest()
  if (!manifest) {
    if (args.json) {
      renderJson({ ok: true, stopped: [], skipped: [], reason: 'manifest_missing' })
    } else {
      console.log('No prepared Paper backend manifest was found.')
    }
    return
  }

  const selected = filterServers(manifest.instances, args.servers)
  const stopped = []
  const skipped = []

  for (const instance of selected) {
    const pidRecord = readPidFile(instance.pidFile)
    if (!pidRecord || !isManagedPaperProcessAlive(pidRecord, manifest.paper?.jarPath)) {
      skipped.push({ name: instance.name, reason: 'not_running' })
      try {
        await fsp.rm(instance.pidFile, { force: true })
      } catch {}
      continue
    }

    const ok = stopProcessByPid(pidRecord.pid)
    if (ok) {
      stopped.push({ name: instance.name, pid: pidRecord.pid })
      try {
        await fsp.rm(instance.pidFile, { force: true })
      } catch {}
    } else {
      skipped.push({ name: instance.name, reason: 'stop_failed', pid: pidRecord.pid })
    }
  }

  if (args.json) {
    renderJson({ ok: true, stopped, skipped })
  } else {
    for (const item of stopped) {
      console.log(`[ OK ] stopped ${item.name} (pid ${item.pid})`)
    }
    for (const item of skipped) {
      console.log(`[ -- ] ${item.name}: ${item.reason}`)
    }
  }
}

async function statusCommand(args) {
  const manifest = readManifest()
  if (!manifest) {
    if (args.json) {
      renderJson({ ok: true, prepared: false, manifest: null })
    } else {
      console.log('No prepared Paper backend manifest was found.')
    }
    return
  }

  const selected = filterServers(manifest.instances, args.servers)
  const statuses = []
  for (const instance of selected) {
    const pidRecord = readPidFile(instance.pidFile)
    let running = false
    let pid = null
    let pidState = 'missing'
    let stalePid = null
    if (pidRecord) {
      running = isManagedPaperProcessAlive(pidRecord, manifest.paper?.jarPath)
      if (running) {
        pid = pidRecord.pid
        pidState = 'running'
      } else {
        stalePid = pidRecord.pid
        pidState = isProcessAlive(pidRecord.pid) ? 'stale_mismatch' : 'stale_dead'
        try {
          await fsp.rm(instance.pidFile, { force: true })
        } catch {}
      }
    }

    let reachable = false
    try {
      await checkTcpReachable(instance.host, instance.port, 800)
      reachable = true
    } catch {}

    statuses.push({
      name: instance.name,
      target: instance.target,
      running,
      reachable,
      pid,
      pidState,
      stalePid,
      dir: instance.dir,
      outLog: instance.outLog,
      errLog: instance.errLog
    })
  }

  if (args.json) {
    renderJson({
      ok: true,
      prepared: true,
      paper: manifest.paper,
      velocity: manifest.velocity,
      instances: statuses
    })
  } else {
    console.log(`Paper jar: ${manifest.paper.jarName}`)
    for (const item of statuses) {
      const suffix = item.pidState === 'running' ? '' : ` pidState=${item.pidState}`
      console.log(`- ${item.name}: running=${item.running} reachable=${item.reachable} target=${item.target}${suffix}`)
    }
  }
}

async function checkCommand(args) {
  const velocityConfig = parseVelocityConfig()
  const selected = filterServers(velocityConfig.servers, args.servers)
  const results = []
  let failed = 0

  for (const server of selected) {
    try {
      await checkTcpReachable(server.host, server.port, 1500)
      results.push({ name: server.name, target: server.target, reachable: true })
      if (!args.json) {
        console.log(`[ OK ] backend reachable: ${server.name} -> ${server.target}`)
      }
    } catch (err) {
      failed += 1
      results.push({ name: server.name, target: server.target, reachable: false, error: err?.message || String(err) })
      if (!args.json) {
        console.log(`[FAIL] backend unreachable: ${server.name} -> ${server.target} (${err?.message || err})`)
      }
    }
  }

  if (args.json) {
    renderJson({ ok: failed === 0, checked: results, velocityToml: velocityTomlPath })
  } else if (failed === 0) {
    console.log('')
    console.log('All configured backend targets are reachable.')
  } else {
    console.log('')
    console.log(`Backend readiness failed: ${failed} target(s). Run velocity-test/start-paper-backends.ps1 or .sh, then retry.`)
  }

  if (failed > 0) {
    process.exitCode = 1
  }
}

async function main() {
  loadHelperEnv()
  const args = parseArgs(process.argv.slice(2))

  switch (args.command) {
    case 'prepare':
      await prepareCommand(args)
      return
    case 'up':
    case 'start':
      await upCommand(args)
      return
    case 'down':
    case 'stop':
      await downCommand(args)
      return
    case 'status':
      await statusCommand(args)
      return
    case 'check':
      await checkCommand(args)
      return
    default:
      throw new Error(`Unknown command: ${args.command}`)
  }
}

await main()
