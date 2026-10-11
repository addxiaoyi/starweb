import crypto from 'node:crypto'
import { Events } from '../event-bus/events.js'
import { verifyPluginWebhookAuth } from './adapter.js'
import { ensureCorrelationId } from './traceContext.js'

const MAX_PLUGIN_EVENT_IDS = 5000
const EVENT_ALIASES = new Map([
  ['player:login:success', 'login_success'],
  ['player:login:failed', 'login_failed'],
  ['player:brute-force', 'security_alert'],
])

function normalizeEventValue(value) {
  const event = String(value || '').trim().toLowerCase()
  return EVENT_ALIASES.get(event) || event
}

function normalizeEventName(body) {
  return normalizeEventValue(body?.event || body?.type || body?.eventType)
}

export function normalizePluginCallbackBody(envelope) {
  const source = envelope && typeof envelope === 'object' ? envelope : {}
  const payload = source.data && typeof source.data === 'object' && !Array.isArray(source.data)
    ? source.data
    : source
  return {
    ...payload,
    eventId: String(source.eventId || payload.eventId || '').trim() || null,
    event: normalizeEventValue(source.eventType || payload.event || payload.type),
    timestamp: source.timestamp || payload.timestamp || null,
  }
}

function claimPluginEvent(store, eventId) {
  if (!eventId) return true
  if (!Array.isArray(store.pluginWebhookEventIds)) store.pluginWebhookEventIds = []
  if (store.pluginWebhookEventIds.includes(eventId)) return false
  store.pluginWebhookEventIds.unshift(eventId)
  if (store.pluginWebhookEventIds.length > MAX_PLUGIN_EVENT_IDS) {
    store.pluginWebhookEventIds.length = MAX_PLUGIN_EVENT_IDS
  }
  return true
}

function appendAuthxEvent(store, body) {
  if (!Array.isArray(store.authxEvents)) store.authxEvents = []
  store.authxEvents.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    event: normalizeEventName(body),
    externalUserId: String(body?.external_user_id || body?.externalUserId || '').trim() || null,
    username: String(body?.username || '').trim() || null,
    payload: body,
  })
  if (store.authxEvents.length > 5000) store.authxEvents.length = 5000
}

function handleLoginSuccess(bus, deps, store, body) {
  const { appendLoginEvent } = deps
  const correlationId = ensureCorrelationId(body)
  const loginRow = appendLoginEvent(store, { ...body, correlationId })
  bus.publish(Events.AUTH_LOGIN_SUCCESS, {
    store,
    loginRow,
    event: body,
    correlationId,
    source: 'plugin_callback',
  })
}

function handleLoginFailed(bus, deps, store, body) {
  const { appendLoginEvent } = deps
  const correlationId = ensureCorrelationId(body)
  const loginRow = appendLoginEvent(store, {
    ...body,
    correlationId,
    outcome: 'failed',
    reason: body.reason || body.error || 'login_failed',
  })
  bus.publish(Events.AUTH_LOGIN_FAILED, {
    store,
    loginRow,
    event: body,
    correlationId,
    source: 'plugin_callback',
  })
}

async function handleVerifyPremium(bus, deps, store, body) {
  const { completeMcVerifySession, findUserByExternalUserId, markUserProfileDirty, scheduleSave, vlaLinkExternalUser } = deps
  const externalUserId = String(body?.external_user_id || body?.externalUserId || '').trim()
  const user = externalUserId ? findUserByExternalUserId(store, externalUserId) : null
  if (user) {
    user.verifiedMojang = true
    markUserProfileDirty?.(user.id)
    completeMcVerifySession?.(user.id, {
      mcUsername: String(body?.username || user.linkedMcUsername || '').trim().toLowerCase() || null,
      verifiedBy: 'plugin_callback',
    })
    bus.publish(Events.AUTH_VERIFY_COMPLETED, {
      store,
      userId: user.id,
      event: body,
      source: 'plugin_callback',
    })
    const username = String(body?.username || user.linkedMcUsername || '').trim()
    const playerUuid = String(body?.player_uuid || body?.playerUuid || user.linkedMcUuid || '').trim()
    if (username && playerUuid && typeof vlaLinkExternalUser === 'function') {
      const linked = await vlaLinkExternalUser(username, user.id, playerUuid, true)
      if (!linked?.ok) throw new Error(`同步网站免密绑定失败: HTTP ${linked?.status || 502}`)
    }
  }
  scheduleSave?.()
}

function handleVerifyFailed(bus, deps, store, body) {
  const { failMcVerifySession, findUserByExternalUserId, scheduleSave } = deps
  const externalUserId = String(body?.external_user_id || body?.externalUserId || '').trim()
  const user = externalUserId ? findUserByExternalUserId(store, externalUserId) : null
  if (user) {
    failMcVerifySession?.(user.id, body?.reason || body?.error || 'verify_failed', {
      conflictCode: body?.conflict_code || body?.conflictCode || null,
    })
    bus.publish(Events.AUTH_VERIFY_FAILED, {
      store,
      userId: user.id,
      detail: body,
      source: 'plugin_callback',
    })
  }
  scheduleSave?.()
}

function handleSecurityAlert(bus, deps, store, body) {
  const { appendSecurityAlert } = deps
  const externalUserId = String(body?.external_user_id || body?.externalUserId || '').trim() || 'anonymous'
  const level = String(body?.level || 'high').toLowerCase()
  const title = String(body?.title || body?.event || 'security_alert')
  appendSecurityAlert?.(store, externalUserId, level, title, body)
  bus.publish(Events.SECURITY_ALERT_RAISED, {
    store,
    alert: body,
    source: 'plugin_callback',
  })
}

/**
 * @param {import('../event-bus/bus.js').EventBus} eventBus
 * @param {import('express').Request} req
 * @param {object} deps
 */
export async function handlePluginCallback(eventBus, req, deps) {
  const { config, getStore } = deps
  const rawBody = req.rawBody || JSON.stringify(req.body || {})
  const auth = verifyPluginWebhookAuth(req, config, rawBody)
  if (config.isProd && !auth.ok) {
    return { status: auth.status || 401, json: jsonErrBody('webhook_auth_failed', auth.message || 'Webhook 验签失败') }
  }

  const store = getStore()
  const body = normalizePluginCallbackBody(req.body)
  const correlationId = ensureCorrelationId(body)
  const event = normalizeEventName(body)
  if (auth.method === 'hmac_v2'
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.eventId || '')) {
    return { status: 400, json: jsonErrBody('invalid_event_id', 'StarX eventId 无效') }
  }
  if (!claimPluginEvent(store, body.eventId)) {
    return { status: 200, json: { ok: true, success: true, event: event || null, duplicate: true } }
  }
  appendAuthxEvent(store, { ...body, correlationId })

  if (event === 'login_success') {
    handleLoginSuccess(eventBus, deps, store, body)
  } else if (event === 'login_failed') {
    handleLoginFailed(eventBus, deps, store, body)
  } else if (event === 'verify_premium' || event === 'verify_success') {
    await handleVerifyPremium(eventBus, deps, store, body)
  } else if (event === 'verify_failed' || event === 'verify_premium_failed') {
    handleVerifyFailed(eventBus, deps, store, body)
  } else if (event === 'security_alert') {
    handleSecurityAlert(eventBus, deps, store, body)
  }

  deps.scheduleSave?.()
  return { status: 200, json: { ok: true, success: true, event: event || null } }
}

function jsonErrBody(code, message) {
  return { ok: false, success: false, message, code, error: code }
}
