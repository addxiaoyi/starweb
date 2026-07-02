import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import mc from 'minecraft-protocol'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const velocityRoot = path.resolve(__dirname, '../..')

export function isConnectionRefused(err) {
  return err?.code === 'ECONNREFUSED' || String(err?.message || err).includes('ECONNREFUSED')
}

export function truncateText(value, maxLen = 200) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLen) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`
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

function normalizeHost(rawHost) {
  const host = String(rawHost || '').trim()
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return '127.0.0.1'
  }
  return host.replace(/^\[|\]$/g, '')
}

function readVelocityTomlBind() {
  const velocityToml = path.join(velocityRoot, 'velocity.toml')
  if (!fs.existsSync(velocityToml)) {
    return null
  }
  const text = fs.readFileSync(velocityToml, 'utf8')
  const match = text.match(/^\s*bind\s*=\s*"([^"]+)"/m)
  if (!match) {
    return null
  }
  const raw = match[1].trim()
  const lastColon = raw.lastIndexOf(':')
  if (lastColon < 0) {
    return null
  }
  const host = raw.slice(0, lastColon)
  const port = Number(raw.slice(lastColon + 1))
  if (!Number.isFinite(port)) {
    return null
  }
  return { host: normalizeHost(host), port: String(port) }
}

function parseTarget(target) {
  const raw = String(target || '').trim()
  if (!raw) {
    return null
  }
  const lastColon = raw.lastIndexOf(':')
  if (lastColon <= 0 || lastColon === raw.length - 1) {
    return null
  }
  const host = normalizeHost(raw.slice(0, lastColon))
  const port = Number(raw.slice(lastColon + 1))
  if (!host || !Number.isFinite(port)) {
    return null
  }
  return { host, port, target: `${host}:${port}` }
}

function readVelocityTomlServers() {
  const velocityToml = path.join(velocityRoot, 'velocity.toml')
  if (!fs.existsSync(velocityToml)) {
    return []
  }
  const text = fs.readFileSync(velocityToml, 'utf8')
  const lines = text.split(/\r?\n/)
  const targets = []
  let inServers = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
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
    if (parsed) {
      targets.push({ name: match[1], ...parsed })
    }
  }

  return targets
}

function parseBackendTargetsFromEnv() {
  const raw = String(process.env.VLA_REAL_BACKEND_TARGETS || '').trim()
  if (!raw) {
    return []
  }
  return raw
    .split(/[\s,;]+/)
    .map((target) => parseTarget(target))
    .filter(Boolean)
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function extractDescriptionText(description) {
  if (!description) {
    return ''
  }
  return extractTextComponent(description)
}

function extractTextParts(value, depth = 0) {
  if (value == null || depth > 12) {
    return []
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextParts(item, depth + 1))
  }
  if (typeof value !== 'object') {
    return []
  }

  if (typeof value.type === 'string' && 'value' in value) {
    if (value.type === 'string') {
      return extractTextParts(value.value, depth + 1)
    }
    if (value.type === 'list') {
      return extractTextParts(value.value?.value ?? value.value, depth + 1)
    }
    if (value.type === 'compound') {
      const compound = value.value || {}
      return [
        ...extractTextParts(compound.text, depth + 1),
        ...extractTextParts(compound.translate, depth + 1),
        ...extractTextParts(compound.with, depth + 1),
        ...extractTextParts(compound.extra?.value ?? compound.extra, depth + 1),
        ...extractTextParts(compound.content, depth + 1)
      ]
    }
    return extractTextParts(value.value, depth + 1)
  }

  return [
    ...extractTextParts(value.text, depth + 1),
    ...extractTextParts(value.translate, depth + 1),
    ...extractTextParts(value.with, depth + 1),
    ...extractTextParts(value.extra, depth + 1),
    ...extractTextParts(value.content, depth + 1),
    ...extractTextParts(value.reason, depth + 1),
    ...extractTextParts(value.message, depth + 1)
  ]
}

export function extractTextComponent(value) {
  return extractTextParts(value)
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractPacketText(packet) {
  return extractTextComponent(packet?.content ?? packet?.reason ?? packet?.message ?? packet)
}

function getVelocityLogPath() {
  return path.join(velocityRoot, 'logs', 'latest.log')
}

function getManagedBackendLogs() {
  return readVelocityTomlServers().map((server) => ({
    side: 'paper',
    server: server.name,
    target: server.target,
    path: path.join(velocityRoot, '.paper-runtime', 'instances', server.name, 'logs', 'latest.log'),
    note: '如果目标后端是通过 velocity-test/start-paper-backends.* 拉起的，可直接看这个日志；否则改看你自己的 Paper 实例日志。'
  }))
}

function velocityLogEntry(focus) {
  return {
    side: 'velocity',
    path: getVelocityLogPath(),
    focus
  }
}

function backendLogEntries(focus) {
  const backendLogs = getManagedBackendLogs()
  if (backendLogs.length > 0) {
    return backendLogs.map((entry) => ({ ...entry, focus }))
  }
  return [{
    side: 'paper',
    target: '<from velocity.toml [servers] or VLA_REAL_BACKEND_TARGETS>',
    path: '',
    focus,
    note: '当前未解析到受管 Paper 日志路径；请查看你自己配置的目标后端日志。'
  }]
}

export function buildProbeDiagnosisGuide(probeName, category) {
  switch (category) {
    case 'authenticated_backend_reached':
      return {
        meaning: 'load 自动认证模式已经完成注册/登录输入，并至少有客户端进入真实后端 play 阶段。',
        inspectOrder: [
          velocityLogEntry('按 sampleClients 用户名抽查是否都有 auth handoff 与后端连接记录。'),
          ...backendLogEntries('确认目标 Paper 日志没有 KnownPacks、configuration、forwarding 或 unexpected packet 异常。')
        ],
        nextChecks: [
          '如果 backendPlayPackets 数量低于 clients，先看 stageCounts.prePlayClosed 与 terminalCounts，判断是否被 Velocity 登录节流或本机 ramp 影响。',
          '需要更强压力时逐步增加 VLA_LOAD_CLIENTS，并把 VLA_LOAD_RAMP_MS 调到不触发本机/代理登录节流的范围。'
        ]
      }
    case 'authenticated_backend_partial':
      return {
        meaning: 'load 自动认证模式已有客户端完整进入后端，但成功数量低于当前要求，不能视作压测全通过。',
        inspectOrder: [
          velocityLogEntry('按失败用户名查是否是登录节流、握手阶段断开、连接过快或真实异常。'),
          ...backendLogEntries('对已成功用户名确认 Paper 日志是否干净；若成功用户干净，失败多半发生在进入 Limbo 前。')
        ],
        nextChecks: [
          '先提高 VLA_LOAD_RAMP_MS 到 5000 或更高，避免本机同 IP 触发 Velocity 登录节流。',
          '如果仍然只有部分成功，再看 sampleClients.reasonText 和 terminalCounts。',
          '如果想把部分成功视作 smoke，可降低 VLA_LOAD_MIN_BACKEND_RATIO；默认认证压测要求 100% 成功。'
        ]
      }
    case 'backend_reached':
      return {
        meaning: 'load 烟测至少已有客户端进入真实后端 play 阶段；默认模式不保证每个客户端完成认证。',
        inspectOrder: [
          velocityLogEntry('抽查是否有异常踢出、限流或连接过快记录。'),
          ...backendLogEntries('确认真实后端没有协议异常。')
        ],
        nextChecks: [
          '若要验证并发注册/登录到真实后端的完整链路，设置 VLA_LOAD_AUTH=true 后重跑 probe:load。',
          '默认 load 更适合看 Limbo 接入、连接节流和基础承载，不等同于完整认证压测。'
        ]
      }
    case 'load_smoke_limbo_reached':
      return {
        meaning: 'load 默认烟测已有客户端进入 Limbo/play；它不会自动提交密码，所以停在 Limbo 不是认证链路失败。',
        inspectOrder: [
          velocityLogEntry('看是否有连接过快、限流或异常断开；若只是 probe_stopped，通常是烟测结束时主动断开。')
        ],
        nextChecks: [
          '要压完整认证链路，设置 VLA_LOAD_AUTH=true。',
          '如果 stageCounts.prePlayClosed 很高，优先增大 VLA_LOAD_RAMP_MS 或调整 Velocity 登录节流配置。'
        ]
      }
    case 'prelogin_throttled_or_closed':
      return {
        meaning: '一批客户端在进入 Limbo/play 前断开。常见原因是同 IP 登录节流、版本握手未完成、ramp 太快，或探针主动结束时仍处在登录阶段。',
        inspectOrder: [
          velocityLogEntry('先看是否有连接过于频繁、initial connection disconnected、协议握手或版本相关日志。')
        ],
        nextChecks: [
          '本机压测先把 VLA_LOAD_RAMP_MS 提高到 3000-5000，再观察 connected/stageCounts.limboPlayJoined 是否提升。',
          '如果 Velocity 配置显式设置了登录节流，测试环境可临时放宽；生产环境不要为了压测关闭防护。',
          '若 terminalCounts 里 error/kicked 很高，再看 sampleClients.reasonText。'
        ]
      }
    case 'backend_handoff_started_no_backend_packets':
      return {
        meaning: '探针已经看到 start_configuration，说明 Limbo 认证流程至少已走到“准备切真实后端”；但后续没有任何后端 play 数据包返回。',
        inspectOrder: [
          velocityLogEntry('先按 probe 用户名检索，确认 Velocity 是否记录了“已连接到后端/已开始切服/被后端踢出”等事件。'),
          ...backendLogEntries('再看目标 Paper 是否真的收到连接。若 Paper 完全没有该用户名的加入记录，优先排查 [servers] 目标、后端存活、转发链路；若 Paper 已记录加入但紧接着报 configuration / protocol / forwarding 相关异常，问题更可能在 Limbo -> Paper 交接。')
        ],
        nextChecks: [
          '先对照 recentEvents 与 phaseFirstSeenMs，确认卡点确实发生在 backend_handoff_started 之后。',
          '运行 velocity-test/real-backend-check.ps1 或 .sh，确认 velocity.toml [servers] 指向的真实后端端口仍然可达。',
          '若 Velocity 日志显示已连上后端，而 Paper 日志出现 configuration、KnownPacks、forwarding、unexpected packet 等错误，继续看插件/代理与后端版本兼容或转发配置。'
        ]
      }
    case 'backend_play_packets_seen_no_spawn':
      return {
        meaning: '已经收到真实后端返回的 play 数据，但客户端仍未走到 spawn。',
        inspectOrder: [
          ...backendLogEntries('优先看目标 Paper 日志，确认是否在登录后初始化世界、维度、权限或插件链路时报错。'),
          velocityLogEntry('再看 Velocity 是否记录了后端踢出、转发失败或玩家会话提前结束。')
        ],
        nextChecks: [
          '对照 recentEvents 确认最后一个 world/play 相关包名。',
          '如果 Paper 侧已有玩家加入又立刻异常退出，优先查后端插件、转发模式、注册表/配置阶段异常。'
        ]
      }
    case 'auth_completed_no_handoff':
      return {
        meaning: '注册/登录以及设备绑定决策已经完成，但代理侧没有开始切真实后端。',
        inspectOrder: [
          velocityLogEntry('优先看 Velocity/插件日志，确认认证成功后的后端选择、fallback、disconnect 或 handoff 回调是否执行。')
        ],
        nextChecks: [
          '对照 recentEvents 看最后一个成功事件是 auth_success 还是 auth_complete。',
          '如果日志里完全没有开始切服的记录，问题通常还在插件/代理侧，而不是 Paper。'
        ]
      }
    case 'joined_limbo_without_auth_progress':
    case 'limbo_joined_no_auth_prompt':
      return {
        meaning: probeName === 'load'
          ? '客户端已经进入 Limbo/play，但既没有看到注册/登录提示，也没有推进到认证成功或后端切换。'
          : '客户端已经进入 Limbo/play，但没有收到可识别的注册/登录提示。',
        inspectOrder: [
          velocityLogEntry('先看 Velocity/插件日志，确认该用户名进入 Limbo 后是否发送了认证提示、是否被限流、是否被会话保护或其它前置逻辑拦住。')
        ],
        nextChecks: [
          '先看 recentEvents 和 lastMessage：如果没有任何 chat 事件，优先排查插件消息发送、消息模板变化、探针分类规则是否已落后于当前文案。',
          '这类问题通常还没真正开始切真实后端，Paper 日志一般不是首要入口。',
          '若 load 里大批客户端都停在这个类别，同时 terminalCounts 里 kicked/error 很高，顺带检查限流、连接频率和前置风控。'
        ]
      }
    case 'stalled_in_auth_prompts':
      return {
        meaning: '客户端已经收到了 Limbo 里的注册/登录提示，但 load 模式默认不会自动提交密码，所以它更偏向接入与承载烟测，不代表认证链路一定有问题。',
        inspectOrder: [
          velocityLogEntry('需要确认是否确实收到了认证提示，以及是否伴随限流、踢出或其它风控信息。')
        ],
        nextChecks: [
          '如果你要验证完整注册/登录/转服链路，请跑 compat，或设置 VLA_LOAD_AUTH=true 后重跑 load。',
          '只有在应该看到提示却迟迟没有后续消息、或者伴随异常踢出时，才继续深挖插件日志。'
        ]
      }
    case 'waiting_auth_input':
    case 'waiting_register_confirmation':
    case 'waiting_device_bind_decision':
      return {
        meaning: '当前卡点仍在 Limbo 认证交互阶段，探针已经看到提示，但对应输入/确认没有完成。',
        inspectOrder: [
          velocityLogEntry('优先看插件日志和 recentEvents，确认服务端提示是否符合当前探针识别规则。')
        ],
        nextChecks: [
          'compat 会自动发密码和“不绑定”；如果还卡在这里，优先比对 lastMessage 与 classifyAuthMessage 规则是否匹配。',
          '这类问题通常还没到真实后端，Paper 日志不是第一入口。'
        ]
      }
    case 'spawned':
      return {
        meaning: '探针已完成认证、切服并真正进入后端世界。',
        inspectOrder: [],
        nextChecks: []
      }
    default:
      return {
        meaning: '当前诊断只说明连接没有按预期推进，需要结合 phase、recentEvents 和两侧日志继续定位。',
        inspectOrder: [
          velocityLogEntry('先从 Velocity 侧确认连接有没有进入 Limbo、是否被提前断开。'),
          ...backendLogEntries('如果已经出现后端切换迹象，再补看真实后端日志。')
        ],
        nextChecks: [
          '先按 phase 和 recentEvents 判断故障落在哪一段，再决定优先看代理还是后端。'
        ]
      }
  }
}

export function summarizeReason(reason, maxLen = 300) {
  const extracted = extractTextComponent(reason)
  if (extracted) {
    return truncateText(extracted, maxLen)
  }
  try {
    return truncateText(JSON.stringify(reason), maxLen)
  } catch {
    return truncateText(String(reason ?? ''), maxLen)
  }
}

export function classifyAuthMessage(message) {
  const raw = String(message ?? '').trim()
  const lower = raw.toLowerCase()

  if (raw.includes('是否') && raw.includes('绑定') && raw.includes('不绑定')) {
    return 'device_bind_prompt'
  }
  if (raw.includes('已跳过绑定')) {
    return 'device_bind_skipped'
  }
  if (raw.includes('已绑定本设备')) {
    return 'device_bind_bound'
  }
  if (raw.includes('请输入：绑定') || raw.includes('device-bind-invalid')) {
    return 'device_bind_invalid'
  }
  if (raw.includes('注册成功')) {
    return 'register_success'
  }
  if (raw.includes('登录成功')) {
    return 'login_success'
  }
  if (raw.includes('请再次') || raw.includes('确认注册')) {
    return 'register_confirm_prompt'
  }
  if (raw.includes('登录密码') || lower.includes(' /login ') || lower.includes('login')) {
    return 'login_prompt'
  }
  if (raw.includes('完成注册') || lower.includes('register')) {
    return 'register_prompt'
  }
  if (raw.includes('已接收输入')) {
    return 'input_ack'
  }
  if (raw.includes('连接过于频繁') || lower.includes('rate limit') || lower.includes('too many')) {
    return 'rate_limited'
  }
  return 'other'
}

export function isWorldPhasePacket(packetName) {
  return new Set([
    'login',
    'respawn',
    'spawn_position',
    'position',
    'update_view_position',
    'map_chunk',
    'abilities'
  ]).has(packetName)
}

export function createPhaseTracker({ initialPhase = 'connecting', eventLimit = 24 } = {}) {
  const startedAt = Date.now()
  const flags = Object.create(null)
  const meta = Object.create(null)
  const phaseFirstSeenMs = { [initialPhase]: 0 }
  const recentEvents = [{ atMs: 0, type: 'phase', phase: initialPhase }]
  let currentPhase = initialPhase

  function atMs() {
    return Date.now() - startedAt
  }

  function pushEvent(type, details = {}) {
    recentEvents.push({ atMs: atMs(), type, ...details })
    while (recentEvents.length > eventLimit) {
      recentEvents.shift()
    }
  }

  return {
    markFlag(name, value = true) {
      flags[name] = value
    },
    getFlag(name) {
      return flags[name]
    },
    setMeta(name, value) {
      meta[name] = value
    },
    getMeta(name) {
      return meta[name]
    },
    note(type, details = {}) {
      pushEvent(type, details)
    },
    markPhase(phase, details = {}) {
      if (!(phase in phaseFirstSeenMs)) {
        phaseFirstSeenMs[phase] = atMs()
      }
      if (currentPhase === phase) {
        return
      }
      currentPhase = phase
      pushEvent('phase', { phase, ...details })
    },
    currentPhase() {
      return currentPhase
    },
    snapshot(extra = {}) {
      return {
        phase: currentPhase,
        phaseFirstSeenMs: { ...phaseFirstSeenMs },
        recentEvents: [...recentEvents],
        flags: { ...flags },
        meta: { ...meta },
        ...extra
      }
    }
  }
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

async function pingBackendDescription(host, port, timeoutMs) {
  return await new Promise((resolve) => {
    mc.ping({
      host,
      port,
      version: process.env.VLA_MC_VERSION || false,
      timeout: timeoutMs
    }, (err, result) => {
      if (err) {
        resolve({ ok: false, error: err.message || String(err) })
        return
      }
      const description = extractDescriptionText(result?.description).trim()
      resolve({ ok: true, description })
    })
  })
}

function getRealBackendTargets() {
  const fromEnv = parseBackendTargetsFromEnv()
  if (fromEnv.length > 0) {
    return fromEnv
  }
  return readVelocityTomlServers()
}

function checkRealBackendTargets(targets, timeoutMs) {
  return Promise.all(targets.map(async (target) => {
    try {
      await checkTcpReachable(target.host, target.port, timeoutMs)
      const ping = await pingBackendDescription(target.host, target.port, timeoutMs)
      return {
        target: target.target,
        reachable: true,
        description: ping.ok ? ping.description : '',
        pingError: ping.ok ? '' : ping.error
      }
    } catch (err) {
      return {
        target: target.target,
        reachable: false,
        error: err?.message || String(err)
      }
    }
  }))
}

function autoStartManagedBackends(timeoutMs) {
  const helperPath = path.join(velocityRoot, 'tools', 'paper-backend-helper.mjs')
  if (!fs.existsSync(helperPath)) {
    return {
      ok: false,
      reason: 'helper_missing',
      message: `Managed backend helper not found: ${helperPath}`
    }
  }

  const cmdArgs = [helperPath, 'up', '--json', '--wait-ms', String(timeoutMs)]
  const result = spawnSync(process.execPath, cmdArgs, {
    cwd: velocityRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })

  const stdout = String(result.stdout || '').trim()
  const stderr = String(result.stderr || '').trim()
  const summary = {
    status: result.status,
    signal: result.signal || null,
    stdout: truncateText(stdout, 1200),
    stderr: truncateText(stderr, 1200)
  }

  if (result.error) {
    return {
      ok: false,
      reason: 'helper_spawn_failed',
      message: String(result.error?.message || result.error),
      summary
    }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: 'helper_nonzero_exit',
      message: `paper-backend-helper exited with code ${result.status}`,
      summary
    }
  }
  return {
    ok: true,
    summary
  }
}

export function applyProbeEnv() {
  const merged = {}
  for (const fileName of ['.env.velocity.generated', '.env.velocity']) {
    Object.assign(merged, parseEnvFile(path.join(velocityRoot, fileName)))
  }
  Object.assign(process.env, merged)

  if (!process.env.VLA_HTTP_BASE && process.env.VLA_HTTP_PORT) {
    const host = normalizeHost(process.env.VLA_HTTP_BIND)
    process.env.VLA_HTTP_BASE = `http://${host}:${process.env.VLA_HTTP_PORT}`
  }

  const bind = readVelocityTomlBind()
  if (bind) {
    if (!process.env.VLA_MC_HOST) {
      process.env.VLA_MC_HOST = bind.host
    }
    if (!process.env.VLA_MC_PORT) {
      process.env.VLA_MC_PORT = bind.port
    }
  }
}

export function printPrerequisiteFailure(kind, target, details) {
  console.error(JSON.stringify({
    ok: false,
    reason: 'target_unreachable',
    kind,
    target,
    details: String(details || ''),
    hint: kind === 'http-api'
      ? 'Start Velocity with StarVelocity HTTP API enabled, or set VLA_HTTP_BASE to the correct local/owned endpoint.'
      : 'Start the local/owned Velocity test server, or set VLA_MC_HOST and VLA_MC_PORT to the correct endpoint.'
  }, null, 2))
}

export function printRealBackendPrerequisiteFailure(reason, details) {
  console.error(JSON.stringify({
    ok: false,
    reason,
    kind: 'real-backend',
    details,
    hint: 'Start a real Paper backend for the configured Velocity [servers] targets with velocity-test/start-paper-backends.ps1 or .sh, run velocity-test/real-backend-check.ps1 or .sh until it passes, then rerun compat/load. Set VLA_SKIP_REAL_BACKEND_CHECK=1 only when you intentionally accept stub-only smoke behavior.'
  }, null, 2))
}

export async function ensureRealBackendReady(probeName) {
  if (isTruthy(process.env.VLA_SKIP_REAL_BACKEND_CHECK)) {
    console.warn(`[${probeName}] skipping real backend readiness check because VLA_SKIP_REAL_BACKEND_CHECK is enabled`)
    return
  }

  const targets = getRealBackendTargets()
  if (targets.length === 0) {
    printRealBackendPrerequisiteFailure('real_backend_targets_missing', {
      probe: probeName,
      env: 'VLA_REAL_BACKEND_TARGETS',
      source: path.join(velocityRoot, 'velocity.toml'),
      message: 'No backend targets were resolved from VLA_REAL_BACKEND_TARGETS or velocity.toml [servers].'
    })
    process.exit(2)
  }

  const timeoutMs = Math.max(250, Number(process.env.VLA_REAL_BACKEND_TIMEOUT_MS || 1500))
  let results = await checkRealBackendTargets(targets, timeoutMs)

  let unreachable = results.filter((result) => !result.reachable)
  if (unreachable.length > 0) {
    const autoUpEnabled = !/^(0|false|no|off)$/i.test(String(process.env.VLA_REAL_BACKEND_AUTO_UP || '1').trim())
    if (autoUpEnabled) {
      const autoUpWaitMs = Math.max(3000, Number(process.env.VLA_REAL_BACKEND_AUTO_UP_WAIT_MS || 120000))
      console.warn(`[${probeName}] real backends not reachable, attempting managed auto-start via paper-backend-helper ...`)
      const autoUp = autoStartManagedBackends(autoUpWaitMs)
      if (!autoUp.ok) {
        printRealBackendPrerequisiteFailure('real_backend_autostart_failed', {
          probe: probeName,
          timeoutMs,
          checkedTargets: results,
          autoStart: autoUp
        })
        process.exit(2)
      }

      results = await checkRealBackendTargets(targets, timeoutMs)
      unreachable = results.filter((result) => !result.reachable)
    }
  }

  if (unreachable.length > 0) {
    printRealBackendPrerequisiteFailure('real_backend_unreachable', {
      probe: probeName,
      timeoutMs,
      checkedTargets: results,
      autoStartEnabled: !/^(0|false|no|off)$/i.test(String(process.env.VLA_REAL_BACKEND_AUTO_UP || '1').trim())
    })
    process.exit(2)
  }

  const mockTargets = results.filter((result) => String(result.description || '').toLowerCase().includes('vla mock lobby'))
  if (mockTargets.length > 0) {
    printRealBackendPrerequisiteFailure('mock_backend_detected', {
      probe: probeName,
      checkedTargets: results,
      message: 'A configured Velocity backend responded as "VLA mock lobby". compat/load require a real Paper backend for meaningful compatibility results.'
    })
    process.exit(2)
  }
}
