import mineflayer from 'mineflayer'
import {
  applyProbeEnv,
  buildProbeDiagnosisGuide,
  classifyAuthMessage,
  createPhaseTracker,
  ensureRealBackendReady,
  isConnectionRefused,
  isWorldPhasePacket,
  printPrerequisiteFailure,
  summarizeReason,
  truncateText
} from './probe-utils.mjs'

applyProbeEnv()
await ensureRealBackendReady('compat')

const host = process.env.VLA_MC_HOST || '127.0.0.1'
const port = Number(process.env.VLA_MC_PORT || 25579)
const fakeHost = String(process.env.VLA_MC_FAKE_HOST || '').trim() || undefined
const version = process.env.VLA_MC_VERSION || false
const username = process.env.VLA_MC_USERNAME || `Compat_${Date.now() % 100000}`
const password = process.env.VLA_MC_PASSWORD || 'Testpass123'
const timeoutMs = Number(process.env.VLA_COMPAT_TIMEOUT_MS || 20000)
const chatDelayMs = Number(process.env.VLA_COMPAT_CHAT_DELAY_MS || 1200)
const finalDelayMs = Number(process.env.VLA_COMPAT_FINAL_DELAY_MS || 3500)
const spawnSettleMs = Math.max(0, Number(process.env.VLA_COMPAT_SPAWN_SETTLE_MS || 750))
const gracefulQuitWaitMs = Math.max(250, Number(process.env.VLA_COMPAT_GRACEFUL_QUIT_WAIT_MS || 1500))

const tracker = createPhaseTracker({ initialPhase: 'connecting', eventLimit: 32 })
tracker.setMeta('username', username)
tracker.setMeta('host', host)
tracker.setMeta('port', port)
tracker.setMeta('fakeHost', fakeHost || '')
tracker.setMeta('timeoutMs', timeoutMs)

const bot = mineflayer.createBot({
  host,
  port,
  ...(fakeHost ? { fakeHost } : {}),
  username,
  auth: 'offline',
  version,
  hideErrors: true
})

let done = false
let sentFirstPassword = false
let sentConfirmPassword = false
let sentLoginPassword = false
let sentDeviceChoice = false
const started = Date.now()
let exitTimer = null

function exitAfterClientClose(code, terminalState) {
  if (terminalState === 'ended') {
    process.exit(code)
    return
  }

  let exited = false
  const exitNow = () => {
    if (exited) return
    exited = true
    if (exitTimer) {
      clearTimeout(exitTimer)
    }
    process.exit(code)
  }

  bot.once('end', exitNow)
  exitTimer = setTimeout(exitNow, gracefulQuitWaitMs)
}

function requestGracefulQuit(reasonText, terminalState) {
  if (terminalState === 'ended' || terminalState === 'kicked') {
    return
  }

  try {
    const quitResult = bot.quit(reasonText || terminalState || 'probe complete')
    if (quitResult && typeof quitResult.catch === 'function') {
      quitResult.catch(() => {})
    }
  } catch {
    try {
      bot.end(reasonText || terminalState || 'probe complete')
    } catch {}
  }
}

function disconnectScope(flags) {
  if (flags.sawSpawn) {
    return 'spawned'
  }
  if (flags.sawBackendPlayPackets) {
    return 'backend_play'
  }
  if (flags.sawBackendHandoff) {
    return 'backend_handoff'
  }
  if (flags.sawAnyAuthPrompt || flags.sawAuthSuccess || flags.sawDeviceBindPrompt) {
    return 'limbo_auth'
  }
  if (flags.sawPlayLoginPacket || flags.sawLimboWorldPackets) {
    return 'limbo_play'
  }
  return 'pre_play'
}

function buildDiagnosis(snapshot, terminalState) {
  const flags = snapshot.flags
  const scope = disconnectScope(flags)

  if (flags.sawSpawn) {
    return {
      category: 'spawned',
      disconnectScope: scope,
      summary: '已完成到后端的进入与 spawn。'
    }
  }

  if (flags.sawBackendPlayPackets) {
    return {
      category: 'backend_play_packets_seen_no_spawn',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '已经看到切后端后的 play 数据，但直到超时仍未触发 spawn。'
        : '已经看到切后端后的 play 数据，但在 spawn 前断开。'
    }
  }

  if (flags.sawBackendHandoff) {
    return {
      category: 'backend_handoff_started_no_backend_packets',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '认证已完成并开始切换后端，但直到超时仍未收到后端 play 数据。'
        : '认证已完成并开始切换后端，但在收到后端 play 数据前断开。'
    }
  }

  if (flags.sawAuthSuccess || flags.sawDeviceDecision) {
    return {
      category: 'auth_completed_no_handoff',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '注册/登录流程已经完成，但直到超时仍未开始切后端。'
        : '注册/登录流程已经完成，但在切后端前断开。'
    }
  }

  if (flags.sawDeviceBindPrompt) {
    return {
      category: 'waiting_device_bind_decision',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '已经到设备绑定提示阶段，但超时前没有完成绑定/跳过决策。'
        : '已经到设备绑定提示阶段，但在完成绑定/跳过决策前断开。'
    }
  }

  if (flags.sawRegisterConfirmPrompt) {
    return {
      category: 'waiting_register_confirmation',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '已经收到二次确认注册提示，但超时前没有完成确认。'
        : '已经收到二次确认注册提示，但在完成确认前断开。'
    }
  }

  if (flags.sawRegisterPrompt || flags.sawLoginPrompt) {
    return {
      category: 'waiting_auth_input',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '已经收到注册/登录提示，但超时前没有完成认证。'
        : '已经收到注册/登录提示，但在完成认证前断开。'
    }
  }

  if (flags.sawPlayLoginPacket || flags.sawLimboWorldPackets) {
    return {
      category: 'limbo_joined_no_auth_prompt',
      disconnectScope: scope,
      summary: terminalState === 'timeout'
        ? '已经进入 Limbo/play 阶段，但超时前没有看到注册/登录提示。'
        : '已经进入 Limbo/play 阶段，但在看到注册/登录提示前断开。'
    }
  }

  return {
    category: 'pre_play_failure',
    disconnectScope: scope,
    summary: terminalState === 'timeout'
      ? '连接尚未推进到 play 阶段就已经超时。'
      : '连接尚未推进到 play 阶段就已经断开。'
  }
}

function finish(code, reason, terminalState, detail = '') {
  if (done) return
  done = true
  clearTimeout(timer)
  const reasonText = detail || summarizeReason(reason)
  requestGracefulQuit(reasonText, terminalState)
  const elapsedMs = Date.now() - started
  const snapshot = tracker.snapshot({
    ok: code === 0,
    reason,
    reasonText,
    terminalState,
    elapsedMs
  })
  const diagnosisBase = buildDiagnosis(snapshot, terminalState)
  const diagnosis = {
    ...diagnosisBase,
    guide: buildProbeDiagnosisGuide('compat', diagnosisBase.category)
  }
  console.log(JSON.stringify({
    ok: code === 0,
    reason,
    reasonText,
    terminalState,
    elapsedMs,
    target: {
      host,
      port,
      fakeHost: fakeHost || ''
    },
    phase: snapshot.phase,
    diagnosis,
    messages: {
      sawAny: Boolean(snapshot.flags.sawMessage),
      last: snapshot.meta.lastMessage || ''
    },
    authFlow: {
      sawRegisterPrompt: Boolean(snapshot.flags.sawRegisterPrompt),
      sawRegisterConfirmPrompt: Boolean(snapshot.flags.sawRegisterConfirmPrompt),
      sawLoginPrompt: Boolean(snapshot.flags.sawLoginPrompt),
      sawAuthSuccess: Boolean(snapshot.flags.sawAuthSuccess),
      sawDeviceBindPrompt: Boolean(snapshot.flags.sawDeviceBindPrompt),
      sawDeviceDecision: Boolean(snapshot.flags.sawDeviceDecision)
    },
    transport: {
      sawPlayLoginPacket: Boolean(snapshot.flags.sawPlayLoginPacket),
      sawLimboWorldPackets: Boolean(snapshot.flags.sawLimboWorldPackets),
      sawBackendHandoff: Boolean(snapshot.flags.sawBackendHandoff),
      sawBackendPlayPackets: Boolean(snapshot.flags.sawBackendPlayPackets),
      sawSpawn: Boolean(snapshot.flags.sawSpawn)
    },
    phaseFirstSeenMs: snapshot.phaseFirstSeenMs,
    recentEvents: snapshot.recentEvents
  }, null, 2))
  exitAfterClientClose(code, terminalState)
}

function scheduleChat(text, delayMs, phase, kind) {
  tracker.note('client_chat_scheduled', { phase, kind, text: truncateText(text, 40), delayMs })
  setTimeout(() => {
    if (done) {
      return
    }
    tracker.note('client_chat_sent', { phase, kind, text: truncateText(text, 40) })
    bot.chat(text)
  }, delayMs)
}

const timer = setTimeout(() => finish(2, 'timeout', 'timeout'), timeoutMs)

bot._client.on('packet', (data, meta) => {
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

bot.once('login', () => {
  tracker.note('mineflayer', { event: 'login' })
  const fakeHostSuffix = fakeHost ? ` fakeHost=${fakeHost}` : ''
  console.log(`[compat] login username=${username} host=${host}:${port}${fakeHostSuffix}`)
})

bot.on('messagestr', (message) => {
  const kind = classifyAuthMessage(message)
  tracker.markFlag('sawMessage', true)
  tracker.setMeta('lastMessage', truncateText(message, 220))
  tracker.note('chat', { kind, message: truncateText(message, 180) })
  console.log(`[server] ${message}`)

  if (kind === 'device_bind_prompt') {
    tracker.markFlag('sawAnyAuthPrompt', true)
    tracker.markFlag('sawDeviceBindPrompt', true)
    tracker.markPhase('device_bind_prompt')
    if (!sentDeviceChoice) {
      sentDeviceChoice = true
      scheduleChat('不绑定', Math.max(chatDelayMs, finalDelayMs), 'device_bind_prompt', kind)
    }
    return
  }

  if (kind === 'register_prompt') {
    tracker.markFlag('sawAnyAuthPrompt', true)
    tracker.markFlag('sawRegisterPrompt', true)
    tracker.markPhase('register_prompt')
    if (!sentFirstPassword) {
      sentFirstPassword = true
      scheduleChat(password, chatDelayMs, 'register_prompt', kind)
    }
    return
  }

  if (kind === 'register_confirm_prompt') {
    tracker.markFlag('sawAnyAuthPrompt', true)
    tracker.markFlag('sawRegisterConfirmPrompt', true)
    tracker.markPhase('register_confirm_prompt')
    if (!sentConfirmPassword) {
      sentConfirmPassword = true
      scheduleChat(password, chatDelayMs, 'register_confirm_prompt', kind)
    }
    return
  }

  if (kind === 'login_prompt') {
    tracker.markFlag('sawAnyAuthPrompt', true)
    tracker.markFlag('sawLoginPrompt', true)
    tracker.markPhase('login_prompt')
    if (!sentLoginPassword) {
      sentLoginPassword = true
      scheduleChat(password, chatDelayMs, 'login_prompt', kind)
    }
    return
  }

  if (kind === 'register_success' || kind === 'login_success') {
    tracker.markFlag('sawAuthSuccess', true)
    tracker.markPhase('auth_success', { kind })
    return
  }

  if (kind === 'device_bind_skipped' || kind === 'device_bind_bound') {
    tracker.markFlag('sawDeviceDecision', true)
    tracker.markPhase('auth_complete', { kind })
  }
})

bot.once('spawn', () => {
  tracker.markFlag('sawSpawn', true)
  tracker.markPhase('spawned')
  setTimeout(() => finish(0, 'spawned', 'spawned'), spawnSettleMs)
})

bot.once('kicked', (reason) => {
  finish(3, `kicked:${summarizeReason(reason)}`, 'kicked', summarizeReason(reason))
})

bot.once('end', (reason) => {
  if (!done) {
    finish(4, `ended:${summarizeReason(reason)}`, 'ended', summarizeReason(reason || ''))
  }
})

bot.once('error', (err) => {
  if (isConnectionRefused(err)) {
    done = true
    clearTimeout(timer)
    printPrerequisiteFailure('velocity', `${host}:${port}`, err.message)
    process.exit(2)
  }
  finish(5, `error:${err?.message || err}`, 'error', summarizeReason(err?.message || err))
})
