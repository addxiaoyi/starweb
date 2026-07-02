import mc from 'minecraft-protocol'
import mineflayer from 'mineflayer'
import {
  applyProbeEnv,
  buildProbeDiagnosisGuide,
  classifyAuthMessage,
  createPhaseTracker,
  ensureRealBackendReady,
  extractPacketText,
  isConnectionRefused,
  isWorldPhasePacket,
  printPrerequisiteFailure,
  summarizeReason,
  truncateText
} from './probe-utils.mjs'

applyProbeEnv()
await ensureRealBackendReady('load')

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

const host = process.env.VLA_MC_HOST || '127.0.0.1'
const port = Number(process.env.VLA_MC_PORT || 25579)
const fakeHost = String(process.env.VLA_MC_FAKE_HOST || '').trim() || undefined
const authMode = isTruthy(process.env.VLA_LOAD_AUTH)
const clients = Math.max(1, Number(process.env.VLA_LOAD_CLIENTS || 25))
const rampMs = Math.max(0, Number(process.env.VLA_LOAD_RAMP_MS || (authMode ? 3500 : 1000)))
const holdMs = Math.max(1000, Number(process.env.VLA_LOAD_HOLD_MS || 10000))
const version = process.env.VLA_MC_VERSION || false
const sampleLimit = Math.max(1, Number(process.env.VLA_LOAD_SAMPLE_LIMIT || 5))
const password = process.env.VLA_LOAD_PASSWORD || process.env.VLA_MC_PASSWORD || 'Testpass123'
const chatDelayMs = Math.max(0, Number(process.env.VLA_LOAD_CHAT_DELAY_MS || 1200))
const deviceChoiceDelayMs = Math.max(chatDelayMs, Number(process.env.VLA_LOAD_DEVICE_CHOICE_DELAY_MS || 3500))
const minBackendRatio = Math.min(1, Math.max(0, Number(process.env.VLA_LOAD_MIN_BACKEND_RATIO || (authMode ? 1 : 0))))

let tcpConnected = 0
let connected = 0
let ended = 0
let errors = 0
let refused = 0
let denied = 0
const active = []
const contexts = []
const started = Date.now()

function countBy(items, getter) {
  const counts = {}
  for (const item of items) {
    const key = getter(item)
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

function buildLoadDiagnosis(snapshots) {
  const phaseCounts = countBy(snapshots, (snapshot) => snapshot.phase || 'unknown')
  const terminalCounts = countBy(snapshots, (snapshot) => snapshot.terminalState || 'unknown')
  const total = Math.max(1, snapshots.length)
  const backendPlay = phaseCounts.backend_play_packets || 0
  const authSuccess = phaseCounts.auth_success || 0
  const authComplete = phaseCounts.auth_complete || 0
  const authPrompts = (phaseCounts.register_prompt || 0) + (phaseCounts.register_confirm_prompt || 0) + (phaseCounts.login_prompt || 0)
  const limboJoined = phaseCounts.limbo_play_joined || 0
  const requiredBackend = Math.ceil(total * minBackendRatio)
  const prePlayClosed = snapshots.filter((snapshot) =>
    (snapshot.phase === 'connecting' || snapshot.phase === 'tcp_connected') &&
    snapshot.terminalState !== 'active' &&
    snapshot.terminalState !== 'probe_stopped'
  ).length

  if (authMode && backendPlay > 0 && backendPlay < requiredBackend) {
    return {
      category: 'authenticated_backend_partial',
      summary: `自动认证压测只有 ${backendPlay}/${total} 个客户端进入真实后端 play 阶段，低于当前要求 ${requiredBackend}/${total}。`
    }
  }

  if (backendPlay > 0) {
    return {
      category: authMode ? 'authenticated_backend_reached' : 'backend_reached',
      summary: authMode
        ? `自动认证压测已有 ${backendPlay}/${total} 个客户端进入真实后端 play 阶段。`
        : `已有 ${backendPlay}/${total} 个客户端进入真实后端 play 阶段；默认 load 仍主要作为接入烟测。`
    }
  }

  if ((phaseCounts.spawned || 0) > 0) {
    return {
      category: 'spawned',
      summary: `已有 ${phaseCounts.spawned}/${total} 个客户端完成 spawn。`
    }
  }

  if ((phaseCounts.backend_handoff_started || 0) > 0 && (phaseCounts.backend_play_packets || 0) === 0) {
    return {
      category: 'backend_handoff_started_no_backend_packets',
      summary: '至少有客户端已经开始切后端，但没有收到后端 play 数据。'
    }
  }

  if ((authSuccess + authComplete) > 0 && (phaseCounts.backend_handoff_started || 0) === 0) {
    return {
      category: 'auth_completed_no_handoff',
      summary: '至少有客户端已经完成认证，但没有开始切后端。'
    }
  }

  if (authPrompts > 0 && !authMode) {
    return {
      category: 'stalled_in_auth_prompts',
      summary: '大多数客户端停在 Limbo 注册/登录提示阶段；当前 load 默认不自动提交密码，主要验证接入、限流与 Limbo 承载。'
    }
  }

  if (authPrompts > 0 && authMode) {
    return {
      category: 'waiting_auth_input',
      summary: '自动认证压测已看到注册/登录提示，但尚未完成认证；需看 sampleClients 的最近聊天发送事件。'
    }
  }

  if (prePlayClosed > Math.ceil(total * 0.2) && limboJoined > 0) {
    return {
      category: 'prelogin_throttled_or_closed',
      summary: `有 ${prePlayClosed}/${total} 个客户端在进入 Limbo 前断开，同时已有 ${limboJoined}/${total} 个进入 Limbo；常见原因是 Velocity 按 IP 登录节流或本机压测 ramp 过快。`
    }
  }

  if (limboJoined > 0) {
    return {
      category: authMode ? 'joined_limbo_without_auth_progress' : 'load_smoke_limbo_reached',
      summary: authMode
        ? '客户端已经进入 Limbo/play 阶段，但没有继续推进到认证成功或后端切换。'
        : `承载烟测已有 ${limboJoined}/${total} 个客户端进入 Limbo/play；默认 load 不提交密码。`
    }
  }

  if ((terminalCounts.ended || 0) > 0 || (terminalCounts.disconnected || 0) > 0 || (terminalCounts.kicked || 0) > 0) {
    return {
      category: 'prelogin_throttled_or_closed',
      summary: '客户端在进入 Limbo/play 前断开；优先检查 Velocity 登录节流、版本握手和本机连接 ramp。'
    }
  }

  return {
    category: 'pre_play_failure',
    summary: '客户端没有稳定推进到 play 阶段。'
  }
}

function snapshotContext(ctx) {
  const snapshot = ctx.tracker.snapshot({
    terminalState: ctx.terminalState || 'active',
    reasonText: ctx.reasonText || ''
  })
  return {
    username: ctx.username,
    phase: snapshot.phase,
    terminalState: snapshot.terminalState,
    reasonText: snapshot.reasonText,
    lastMessage: snapshot.meta.lastMessage || '',
    connectionState: snapshot.meta.connectionState || '',
    flags: snapshot.flags,
    phaseFirstSeenMs: snapshot.phaseFirstSeenMs,
    recentEvents: snapshot.recentEvents
  }
}

function scheduleClientChat(ctx, text, delayMs, phase, kind) {
  ctx.tracker.note('client_chat_scheduled', { phase, kind, text: truncateText(text, 40), delayMs })
  setTimeout(() => {
    if (ctx.terminalState !== 'active' && ctx.terminalState !== 'probe_stopped') {
      return
    }
    if (typeof ctx.client.chat !== 'function') {
      ctx.tracker.note('client_chat_skipped', { phase, kind, reason: 'chat_not_ready' })
      return
    }
    ctx.tracker.note('client_chat_sent', { phase, kind, text: truncateText(text, 40) })
    try {
      ctx.client.chat(text)
    } catch (err) {
      ctx.reasonText = summarizeReason(err?.message || err)
      ctx.tracker.note('client_chat_error', { phase, kind, reason: ctx.reasonText })
    }
  }, delayMs)
}

function makeClient(i) {
  if (authMode) {
    return makeMineflayerClient(i)
  }

  const username = `Load_${Date.now() % 100000}_${i}`
  const tracker = createPhaseTracker({ initialPhase: 'connecting', eventLimit: 18 })
  tracker.setMeta('username', username)
  tracker.setMeta('index', i)
  tracker.setMeta('fakeHost', fakeHost || '')

  const client = mc.createClient({
    host,
    port,
    ...(fakeHost ? { fakeHost } : {}),
    username,
    auth: 'offline',
    version
  })

  const ctx = {
    client,
    tracker,
    username,
    terminalState: 'active',
    reasonText: '',
    sentFirstPassword: false,
    sentConfirmPassword: false,
    sentLoginPassword: false,
    sentDeviceChoice: false
  }

  contexts.push(ctx)
  active.push(client)

  client.once('connect', () => {
    tcpConnected++
    tracker.setMeta('connectionState', 'tcp_connected')
    tracker.markPhase('tcp_connected')
  })

  client.once('playerJoin', () => {
    tracker.setMeta('connectionState', 'player_join_ready')
    tracker.note('client_ready', { event: 'playerJoin' })
  })

  client.once('login', () => {
    connected++
    tracker.setMeta('connectionState', 'play_login')
    tracker.markFlag('sawPlayLoginPacket', true)
    tracker.markPhase('limbo_play_joined')
  })

  client.on('packet', (data, meta) => {
    if (meta?.state !== 'play') {
      return
    }

    if (meta.name === 'login') {
      tracker.markFlag('sawPlayLoginPacket', true)
      tracker.markPhase('limbo_play_joined', { packet: meta.name })
      return
    }

    if (meta.name === 'start_configuration') {
      tracker.markFlag('sawBackendHandoff', true)
      tracker.markPhase('backend_handoff_started', { packet: meta.name })
      return
    }

    if (meta.name === 'system_chat') {
      const message = extractPacketText(data)
      if (message) {
        const kind = classifyAuthMessage(message)
        tracker.markFlag('sawMessage', true)
        tracker.setMeta('lastMessage', truncateText(message, 220))
        tracker.note('chat', { kind, message: truncateText(message, 120) })

        if (kind === 'register_prompt') {
          tracker.markFlag('sawAnyAuthPrompt', true)
          tracker.markFlag('sawRegisterPrompt', true)
          tracker.markPhase('register_prompt')
          if (authMode && !ctx.sentFirstPassword) {
            ctx.sentFirstPassword = true
            scheduleClientChat(ctx, password, chatDelayMs, 'register_prompt', kind)
          }
        } else if (kind === 'register_confirm_prompt') {
          tracker.markFlag('sawAnyAuthPrompt', true)
          tracker.markFlag('sawRegisterConfirmPrompt', true)
          tracker.markPhase('register_confirm_prompt')
          if (authMode && !ctx.sentConfirmPassword) {
            ctx.sentConfirmPassword = true
            scheduleClientChat(ctx, password, chatDelayMs, 'register_confirm_prompt', kind)
          }
        } else if (kind === 'login_prompt') {
          tracker.markFlag('sawAnyAuthPrompt', true)
          tracker.markFlag('sawLoginPrompt', true)
          tracker.markPhase('login_prompt')
          if (authMode && !ctx.sentLoginPassword) {
            ctx.sentLoginPassword = true
            scheduleClientChat(ctx, password, chatDelayMs, 'login_prompt', kind)
          }
        } else if (kind === 'register_success' || kind === 'login_success') {
          tracker.markFlag('sawAuthSuccess', true)
          tracker.markPhase('auth_success', { kind })
        } else if (kind === 'device_bind_prompt') {
          tracker.markFlag('sawAnyAuthPrompt', true)
          tracker.markFlag('sawDeviceBindPrompt', true)
          tracker.markPhase('device_bind_prompt')
          if (authMode && !ctx.sentDeviceChoice) {
            ctx.sentDeviceChoice = true
            scheduleClientChat(ctx, '不绑定', deviceChoiceDelayMs, 'device_bind_prompt', kind)
          }
        } else if (kind === 'device_bind_skipped' || kind === 'device_bind_bound') {
          tracker.markFlag('sawDeviceDecision', true)
          tracker.markPhase('auth_complete', { kind })
        }
      }
      return
    }

    if (!isWorldPhasePacket(meta.name)) {
      return
    }

    if (tracker.getFlag('sawBackendHandoff')) {
      tracker.markFlag('sawBackendPlayPackets', true)
      tracker.markPhase('backend_play_packets', { packet: meta.name })
      return
    }

    tracker.markFlag('sawLimboWorldPackets', true)
  })

  client.on('error', (err) => {
    errors++
    if (isConnectionRefused(err)) {
      refused++
    }
    ctx.reasonText = summarizeReason(err?.message || err)
    ctx.terminalState = 'error'
    tracker.setMeta('connectionState', 'error')
    tracker.note('error', { reason: ctx.reasonText })
  })

  client.on('kick_disconnect', (packet) => {
    const reasonText = summarizeReason(packet)
    ctx.reasonText = reasonText
    ctx.terminalState = 'kicked'
    tracker.setMeta('connectionState', 'kicked')
    tracker.note('kick', { reason: reasonText })
    if (reasonText.includes('连接过于频繁') || reasonText.toLowerCase().includes('rate')) {
      denied++
    }
  })

  client.once('end', () => {
    ended++
    if (ctx.terminalState === 'active') {
      ctx.terminalState = 'ended'
    }
    tracker.setMeta('connectionState', ctx.terminalState)
  })
}

function makeMineflayerClient(i) {
  const username = `LoadAuth_${Date.now() % 100000}_${i}`
  const tracker = createPhaseTracker({ initialPhase: 'connecting', eventLimit: 24 })
  tracker.setMeta('username', username)
  tracker.setMeta('index', i)
  tracker.setMeta('fakeHost', fakeHost || '')

  const bot = mineflayer.createBot({
    host,
    port,
    ...(fakeHost ? { fakeHost } : {}),
    username,
    auth: 'offline',
    version,
    hideErrors: true
  })

  const ctx = {
    client: bot,
    tracker,
    username,
    terminalState: 'active',
    reasonText: '',
    sentFirstPassword: false,
    sentConfirmPassword: false,
    sentLoginPassword: false,
    sentDeviceChoice: false
  }

  contexts.push(ctx)
  active.push(bot)

  bot._client?.once('connect', () => {
    tcpConnected++
    tracker.setMeta('connectionState', 'tcp_connected')
    tracker.markPhase('tcp_connected')
  })

  bot.once('login', () => {
    connected++
    tracker.setMeta('connectionState', 'play_login')
    tracker.markFlag('sawPlayLoginPacket', true)
    tracker.markPhase('limbo_play_joined')
  })

  bot._client?.on('packet', (data, meta) => {
    if (meta?.state !== 'play') {
      return
    }

    if (meta.name === 'login') {
      tracker.markFlag('sawPlayLoginPacket', true)
      if (tracker.getFlag('sawBackendHandoff')) {
        tracker.markFlag('sawBackendPlayPackets', true)
        tracker.markPhase('backend_play_packets', { packet: meta.name })
      } else {
        tracker.markPhase('limbo_play_joined', { packet: meta.name })
      }
      return
    }

    if (meta.name === 'start_configuration') {
      tracker.markFlag('sawBackendHandoff', true)
      tracker.markPhase('backend_handoff_started', { packet: meta.name })
      return
    }

    if (!isWorldPhasePacket(meta.name)) {
      return
    }

    if (tracker.getFlag('sawBackendHandoff')) {
      tracker.markFlag('sawBackendPlayPackets', true)
      tracker.markPhase('backend_play_packets', { packet: meta.name })
      return
    }

    tracker.markFlag('sawLimboWorldPackets', true)
  })

  bot.on('messagestr', (message) => {
    const kind = classifyAuthMessage(message)
    tracker.markFlag('sawMessage', true)
    tracker.setMeta('lastMessage', truncateText(message, 220))
    tracker.note('chat', { kind, message: truncateText(message, 120) })

    if (kind === 'register_prompt') {
      tracker.markFlag('sawAnyAuthPrompt', true)
      tracker.markFlag('sawRegisterPrompt', true)
      tracker.markPhase('register_prompt')
      if (!ctx.sentFirstPassword) {
        ctx.sentFirstPassword = true
        scheduleClientChat(ctx, password, chatDelayMs, 'register_prompt', kind)
      }
    } else if (kind === 'register_confirm_prompt') {
      tracker.markFlag('sawAnyAuthPrompt', true)
      tracker.markFlag('sawRegisterConfirmPrompt', true)
      tracker.markPhase('register_confirm_prompt')
      if (!ctx.sentConfirmPassword) {
        ctx.sentConfirmPassword = true
        scheduleClientChat(ctx, password, chatDelayMs, 'register_confirm_prompt', kind)
      }
    } else if (kind === 'login_prompt') {
      tracker.markFlag('sawAnyAuthPrompt', true)
      tracker.markFlag('sawLoginPrompt', true)
      tracker.markPhase('login_prompt')
      if (!ctx.sentLoginPassword) {
        ctx.sentLoginPassword = true
        scheduleClientChat(ctx, password, chatDelayMs, 'login_prompt', kind)
      }
    } else if (kind === 'register_success' || kind === 'login_success') {
      tracker.markFlag('sawAuthSuccess', true)
      tracker.markPhase('auth_success', { kind })
    } else if (kind === 'device_bind_prompt') {
      tracker.markFlag('sawAnyAuthPrompt', true)
      tracker.markFlag('sawDeviceBindPrompt', true)
      tracker.markPhase('device_bind_prompt')
      if (!ctx.sentDeviceChoice) {
        ctx.sentDeviceChoice = true
        scheduleClientChat(ctx, '不绑定', deviceChoiceDelayMs, 'device_bind_prompt', kind)
      }
    } else if (kind === 'device_bind_skipped' || kind === 'device_bind_bound') {
      tracker.markFlag('sawDeviceDecision', true)
      tracker.markPhase('auth_complete', { kind })
    }
  })

  bot.once('spawn', () => {
    tracker.markFlag('sawSpawn', true)
    tracker.markFlag('sawBackendPlayPackets', true)
    tracker.markPhase('spawned')
  })

  bot.once('kicked', (reason) => {
    const reasonText = summarizeReason(reason)
    ctx.reasonText = reasonText
    ctx.terminalState = 'kicked'
    tracker.setMeta('connectionState', 'kicked')
    tracker.note('kick', { reason: reasonText })
    if (reasonText.includes('连接过于频繁') || reasonText.toLowerCase().includes('rate')) {
      denied++
    }
  })

  bot.once('end', (reason) => {
    ended++
    if (ctx.terminalState === 'active') {
      ctx.terminalState = 'ended'
    }
    if (!ctx.reasonText) {
      ctx.reasonText = summarizeReason(reason || '')
    }
    tracker.setMeta('connectionState', ctx.terminalState)
  })

  bot.once('error', (err) => {
    errors++
    if (isConnectionRefused(err)) {
      refused++
    }
    ctx.reasonText = summarizeReason(err?.message || err)
    ctx.terminalState = 'error'
    tracker.setMeta('connectionState', 'error')
    tracker.note('error', { reason: ctx.reasonText })
  })
}

for (let i = 0; i < clients; i++) {
  setTimeout(() => makeClient(i), i * rampMs)
}

setTimeout(() => {
  for (const ctx of contexts) {
    if (ctx.terminalState === 'active') {
      ctx.terminalState = 'probe_stopped'
      ctx.tracker.note('probe_stop', { reason: 'load probe complete' })
    }
  }

  for (const c of active) {
    try {
      if (typeof c.quit === 'function') {
        c.quit('load probe complete')
      } else {
        c.end('load probe complete')
      }
    } catch {}
  }
}, clients * rampMs + holdMs)

setTimeout(() => {
  const elapsedMs = Date.now() - started
  const snapshots = contexts.map(snapshotContext)
  const phaseCounts = countBy(snapshots, (snapshot) => snapshot.phase || 'unknown')
  const terminalCounts = countBy(snapshots, (snapshot) => snapshot.terminalState || 'unknown')
  const stageCounts = {
    tcpConnected: snapshots.filter((snapshot) => snapshot.phaseFirstSeenMs.tcp_connected != null).length,
    limboPlayJoined: snapshots.filter((snapshot) => snapshot.flags.sawPlayLoginPacket).length,
    authPromptSeen: snapshots.filter((snapshot) => snapshot.flags.sawAnyAuthPrompt).length,
    authSuccess: snapshots.filter((snapshot) => snapshot.flags.sawAuthSuccess).length,
    authComplete: snapshots.filter((snapshot) => snapshot.flags.sawDeviceDecision || snapshot.flags.sawAuthSuccess).length,
    deviceBindPrompt: snapshots.filter((snapshot) => snapshot.flags.sawDeviceBindPrompt).length,
    backendHandoff: snapshots.filter((snapshot) => snapshot.flags.sawBackendHandoff).length,
    backendPlayPackets: snapshots.filter((snapshot) => snapshot.flags.sawBackendPlayPackets).length,
    prePlayClosed: snapshots.filter((snapshot) =>
      (snapshot.phase === 'connecting' || snapshot.phase === 'tcp_connected') &&
      snapshot.terminalState !== 'active' &&
      snapshot.terminalState !== 'probe_stopped'
    ).length
  }
  const interestingSamples = snapshots
    .filter((snapshot) =>
      snapshot.terminalState !== 'probe_stopped' ||
      snapshot.phase === 'backend_handoff_started' ||
      snapshot.phase === 'backend_play_packets' ||
      snapshot.phase === 'auth_success')
    .slice(0, sampleLimit)
  const fallbackSamples = interestingSamples.length > 0 ? interestingSamples : snapshots.slice(0, sampleLimit)

  const result = {
    host,
    port,
    fakeHost: fakeHost || '',
    authMode,
    clients,
    minBackendRatio,
    rampMs,
    holdMs,
    tcpConnected,
    connected,
    ended,
    errors,
    refused,
    denied,
    elapsedMs,
    diagnosis: (() => {
      const diagnosisBase = buildLoadDiagnosis(snapshots)
      return {
        ...diagnosisBase,
        guide: buildProbeDiagnosisGuide('load', diagnosisBase.category)
      }
    })(),
    stageCounts,
    phaseCounts,
    terminalCounts,
    sampleClients: fallbackSamples.map((snapshot) => ({
      username: snapshot.username,
      phase: snapshot.phase,
      terminalState: snapshot.terminalState,
      reasonText: snapshot.reasonText,
      connectionState: snapshot.connectionState,
      lastMessage: snapshot.lastMessage,
      phaseFirstSeenMs: snapshot.phaseFirstSeenMs,
      recentEvents: snapshot.recentEvents
    }))
  }

  if (connected === 0 && refused > 0) {
    printPrerequisiteFailure('velocity', `${host}:${port}`, `connection refused for ${refused}/${errors} error events`)
    process.exit(2)
  }

  console.log(JSON.stringify(result, null, 2))
  const tooManyErrors = errors > Math.ceil(clients * 0.2)
  const noClientReachedPlay = connected === 0
  const authModeBelowBackendTarget = authMode && stageCounts.backendPlayPackets < Math.ceil(clients * minBackendRatio)
  process.exit(tooManyErrors || noClientReachedPlay || authModeBelowBackendTarget ? 1 : 0)
}, clients * rampMs + holdMs + 3000)
