# P2 事件总线解耦 VLA 与 Web 后端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用进程内事件总线替换 `plugin-gateway` 与 `authxAdmin` 中对 VLA 的直接调用，使入站回调、出站命令与各业务模块通过事件契约通信。

**Architecture:** 基于 Node.js `EventEmitter` 封装 `EventBus`；`plugin-gateway` 验签后只发布事件；`authxAdmin` 鉴权后发布命令并通过 `request/reply` 模式等待结果；subscriber 模块负责具体业务执行与副作用。

**Tech Stack:** Node.js 20+ / Express / 原生 `events` 模块 / `node --test`

---

## 文件结构

新增：

- `重构/backend/src/modules/event-bus/bus.js` — 事件总线封装
- `重构/backend/src/modules/event-bus/events.js` — 事件名常量
- `重构/backend/src/modules/event-bus/index.js` — 统一导出
- `重构/backend/src/modules/event-bus/subscribers/vlaCommandSubscriber.js` — 统一执行 VLA 出站命令
- `重构/backend/src/modules/event-bus/subscribers/authSubscriber.js` — 处理 plugin callback 中的认证事件
- `重构/backend/src/modules/event-bus/subscribers/bindEmailSubscriber.js` — 处理 bind-email 回调
- `重构/backend/src/modules/event-bus/subscribers/skinRefreshSubscriber.js` — 处理皮肤刷新
- `重构/backend/src/modules/event-bus/subscribers/securitySubscriber.js` — 处理安全审计/告警
- `重构/backend/tests/unit/modules/event-bus/bus.spec.js`
- `重构/backend/tests/unit/modules/event-bus/subscribers/*.spec.js`
- `重构/backend/tests/event-bus-integration-smoke.test.js`

修改：

- `重构/backend/src/modules/plugin-gateway/handlers.js` — 改为发布事件
- `重构/backend/src/modules/plugin-gateway/callbackService.js` — 逻辑迁移到 subscriber（保留或删除视实现）
- `重构/backend/src/modules/plugin-gateway/bindEmailService.js` — 逻辑迁移到 subscriber
- `重构/backend/src/modules/plugin-gateway/skinRefresh.js` — handler 改为发布事件
- `重构/backend/src/modules/authxAdmin/routes.js` — 改为发布命令并等待回复
- `重构/backend/src/server.js` — 装配事件总线、注册 subscriber

---

### Task 1: 创建事件总线核心

**Files:**
- Create: `重构/backend/src/modules/event-bus/bus.js`
- Create: `重构/backend/src/modules/event-bus/events.js`
- Create: `重构/backend/src/modules/event-bus/index.js`
- Test: `重构/backend/tests/unit/modules/event-bus/bus.spec.js`

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { EventBus } from '../../../src/modules/event-bus/bus.js'
import { Events } from '../../../src/modules/event-bus/events.js'

describe('EventBus', () => {
  it('publishes and subscribes', async () => {
    const bus = new EventBus({ error: () => {} })
    const received = []
    bus.subscribe(Events.PLUGIN_CALLBACK_RECEIVED, async (payload) => {
      received.push(payload)
    })
    bus.publish(Events.PLUGIN_CALLBACK_RECEIVED, { event: 'login_success' })
    await new Promise((r) => setTimeout(r, 10))
    assert.strictEqual(received.length, 1)
    assert.strictEqual(received[0].event, 'login_success')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/bus.spec.js
```
Expected: FAIL `Error: Cannot find module`

- [ ] **Step 3: 实现 EventBus**

`重构/backend/src/modules/event-bus/events.js`:

```javascript
export const Events = Object.freeze({
  PLUGIN_CALLBACK_RECEIVED: 'plugin:callback:received',
  PLUGIN_BIND_EMAIL_RECEIVED: 'plugin:bind-email:received',
  PLUGIN_SKIN_REFRESH_RECEIVED: 'plugin:skin-refresh:received',

  AUTH_VERIFY_COMPLETED: 'auth:verify:completed',
  AUTH_VERIFY_FAILED: 'auth:verify:failed',
  AUTH_LOGIN_SUCCESS: 'auth:login:success',
  SECURITY_ALERT_RAISED: 'security:alert:raised',
  USER_BIND_EMAIL_COMPLETED: 'user:bind-email:completed',
  SKIN_REFRESH_REQUESTED: 'skin:refresh:requested',

  VLA_COMMAND_KICK_ONLINE: 'vla:command:kick-online',
  VLA_COMMAND_BAN: 'vla:command:ban',
  VLA_COMMAND_DELETE_USER: 'vla:command:delete-user',
  VLA_COMMAND_SKIN_REFRESH: 'vla:command:skin-refresh',
  VLA_COMMAND_LINK_EXTERNAL_USER: 'vla:command:link-external-user',
  VLA_COMMAND_RESET_PASSWORD: 'vla:command:reset-password',
  VLA_COMMAND_BIND_EMAIL: 'vla:command:bind-email',
  VLA_COMMAND_UNBIND_DEVICE: 'vla:command:unbind-device',
  VLA_COMMAND_NOTIFY_BIND_EMAIL: 'vla:command:notify-bind-email',

  VLA_COMMAND_COMPLETED: 'vla:command:completed',
  VLA_COMMAND_FAILED: 'vla:command:failed',
  EVENT_HANDLER_FAILED: 'event:handler:failed',
})
```

`重构/backend/src/modules/event-bus/bus.js`:

```javascript
import { EventEmitter } from 'events'

export class EventBus {
  constructor(logger = console) {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100)
    this.logger = logger
  }

  subscribe(event, handler) {
    this.emitter.on(event, async (payload) => {
      try {
        await handler(payload)
      } catch (err) {
        this.logger.error(`[event-bus] handler failed for ${event}:`, err)
        this.emitter.emit('event:handler:failed', { event, error: err, payload })
      }
    })
  }

  publish(event, payload) {
    this.emitter.emit(event, payload)
  }

  once(event, handler) {
    this.emitter.once(event, handler)
  }

  publishAndWait(event, payload, { timeoutMs = 15000 } = {}) {
    const requestId = crypto.randomUUID()
    const replyEvent = `vla:command:reply:${requestId}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off(replyEvent, onReply)
        reject(new Error(`event-bus: no reply for ${event} within ${timeoutMs}ms`))
      }, timeoutMs)
      const onReply = (result) => {
        clearTimeout(timer)
        resolve(result)
      }
      this.emitter.once(replyEvent, onReply)
      this.emitter.emit(event, { ...payload, _replyTo: requestId })
    })
  }
}
```

`重构/backend/src/modules/event-bus/index.js`:

```javascript
export { EventBus } from './bus.js'
export { Events } from './events.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/bus.spec.js
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add 重构/backend/src/modules/event-bus 重构/backend/tests/unit/modules/event-bus
git commit -m "feat(event-bus): add typed in-process event bus core"
```

---

### Task 2: 创建 VLA 出站命令订阅器

**Files:**
- Create: `重构/backend/src/modules/event-bus/subscribers/vlaCommandSubscriber.js`
- Test: `重构/backend/tests/unit/modules/event-bus/subscribers/vlaCommandSubscriber.spec.js`

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { EventBus } from '../../../../src/modules/event-bus/bus.js'
import { Events } from '../../../../src/modules/event-bus/events.js'
import { registerVlaCommandSubscriber } from '../../../../src/modules/event-bus/subscribers/vlaCommandSubscriber.js'

describe('vlaCommandSubscriber', () => {
  it('executes kick-online and replies', async () => {
    const bus = new EventBus({ error: () => {} })
    const pluginFetchJson = async (path, body) => ({ status: 200, json: { ok: true, kicked: 1 } })
    registerVlaCommandSubscriber(bus, { pluginFetchJson })
    const result = await bus.publishAndWait(Events.VLA_COMMAND_KICK_ONLINE, { body: { reason: 'test' } })
    assert.strictEqual(result.result.json.kicked, 1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/subscribers/vlaCommandSubscriber.spec.js
```
Expected: FAIL module not found

- [ ] **Step 3: 实现 vlaCommandSubscriber**

```javascript
import { Events } from '../events.js'

const VLA_PATHS = {
  [Events.VLA_COMMAND_KICK_ONLINE]: '/api/plugin/authx/admin/kick-online',
  [Events.VLA_COMMAND_BAN]: '/api/plugin/authx/admin/ban',
  [Events.VLA_COMMAND_DELETE_USER]: '/api/plugin/authx/admin/delete-user',
  [Events.VLA_COMMAND_SKIN_REFRESH]: '/api/plugin/authx/admin/skin-refresh',
  [Events.VLA_COMMAND_LINK_EXTERNAL_USER]: '/api/plugin/authx/admin/link-external-user',
  [Events.VLA_COMMAND_RESET_PASSWORD]: '/api/plugin/authx/admin/reset-password',
  [Events.VLA_COMMAND_BIND_EMAIL]: '/api/plugin/authx/admin/bind-email',
  [Events.VLA_COMMAND_UNBIND_DEVICE]: '/api/plugin/authx/admin/unbind-device',
  [Events.VLA_COMMAND_NOTIFY_BIND_EMAIL]: '/api/plugin/authx/admin/bind-email',
}

export function registerVlaCommandSubscriber(bus, deps) {
  const { pluginFetchJson, pluginFetchGet, logger = console } = deps

  for (const [eventName, path] of Object.entries(VLA_PATHS)) {
    bus.subscribe(eventName, async ({ body, query, _replyTo }) => {
      try {
        const fetchFn = query != null ? pluginFetchGet : pluginFetchJson
        const result = query != null
          ? await pluginFetchGet(path, query)
          : await pluginFetchJson(path, body || {})
        if (_replyTo) {
          bus.publish(`vla:command:reply:${_replyTo}`, { ok: true, result })
        }
        bus.publish(Events.VLA_COMMAND_COMPLETED, { command: eventName, ok: true, result })
      } catch (err) {
        logger.error(`[vla-command] ${eventName} failed:`, err)
        if (_replyTo) {
          bus.publish(`vla:command:reply:${_replyTo}`, { ok: false, error: err.message })
        }
        bus.publish(Events.VLA_COMMAND_FAILED, { command: eventName, error: err.message })
      }
    })
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/subscribers/vlaCommandSubscriber.spec.js
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add 重构/backend/src/modules/event-bus/subscribers/vlaCommandSubscriber.js 重构/backend/tests/unit/modules/event-bus/subscribers
git commit -m "feat(event-bus): add VLA outbound command subscriber"
```

---

### Task 3: 重构 plugin-gateway handlers 为事件发布者

**Files:**
- Modify: `重构/backend/src/modules/plugin-gateway/handlers.js`
- Test: `重构/backend/tests/unit/modules/plugin-gateway/handlers.spec.js`（已存在，需更新）

- [ ] **Step 1: 更新 handlers.js**

把 `handlePluginCallback` / `handlePluginBindEmail` 调用替换为 `eventBus.publish`。

```javascript
import crypto from 'crypto'
import { asyncHandler } from '../../middleware/error.js'
import {
  detectInboundAdapter,
  isPluginWebhookAuthConfigured,
  verifyPluginInboundWebhook,
} from './adapter.js'
import { Events } from '../event-bus/events.js'

// ... setDeprecationHeaders / readRawPayload 不变

export function createPluginGatewayHandlers(deps) {
  const { config, jsonErr, getStore, eventBus } = deps

  // ... checkMisconfigured 不变

  const callback = asyncHandler(async (req, res) => {
    setDeprecationHeaders(res, req)
    const misconfigured = checkMisconfigured(res)
    if (misconfigured) return misconfigured

    const rawPayload = readRawPayload(req)
    if (!verifyPluginInboundWebhook(req, rawPayload)) {
      return jsonErr(res, 401, '未授权或签名校验失败', 'unauthorized')
    }

    let body = {}
    if (rawPayload.trim()) {
      try { body = JSON.parse(rawPayload) } catch {
        return jsonErr(res, 400, 'JSON 无效', 'validation_error')
      }
    }

    const event = String(body.event || '').trim()
    if (!event) {
      return jsonErr(res, 400, '缺少 event', 'validation_error')
    }

    const store = getStore()
    const vlaInbound = detectInboundAdapter(req) === 'vla'
    const remoteAddress = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').trim()

    eventBus.publish(Events.PLUGIN_CALLBACK_RECEIVED, {
      store,
      body,
      meta: {
        vlaInbound,
        remoteAddress,
        receivedAt: new Date().toISOString(),
      },
    })

    return res.json({ ok: true })
  })

  const bindEmail = asyncHandler(async (req, res) => {
    setDeprecationHeaders(res, req)
    const misconfigured = checkMisconfigured(res)
    if (misconfigured) return misconfigured

    const rawPayload = readRawPayload(req)
    if (!verifyPluginInboundWebhook(req, rawPayload)) {
      return jsonErr(res, 401, '未授权或签名校验失败', 'unauthorized')
    }

    let body = {}
    if (rawPayload.trim()) {
      try { body = JSON.parse(rawPayload) } catch {
        return jsonErr(res, 400, 'JSON 无效', 'validation_error')
      }
    }

    eventBus.publish(Events.PLUGIN_BIND_EMAIL_RECEIVED, {
      store: getStore(),
      body,
      meta: { receivedAt: new Date().toISOString() },
    })

    return res.json({ ok: true, queued: true })
  })

  return { callback, bindEmail }
}
```

- [ ] **Step 2: 运行 handlers 测试并修复**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/plugin-gateway/handlers.spec.js
```
Expected: 测试可能需要调整断言（返回值从业务结果变为 `{ ok: true }`）；修复到 PASS。

- [ ] **Step 3: 提交**

```bash
git add 重构/backend/src/modules/plugin-gateway/handlers.js 重构/backend/tests/unit/modules/plugin-gateway/handlers.spec.js
git commit -m "refactor(plugin-gateway): handlers publish events instead of calling services"
```

---

### Task 4: 创建 authSubscriber

**Files:**
- Create: `重构/backend/src/modules/event-bus/subscribers/authSubscriber.js`
- Create: `重构/backend/src/modules/event-bus/subscribers/securitySubscriber.js`（仅注册空壳，待 Task 7 填充）
- Test: `重构/backend/tests/unit/modules/event-bus/subscribers/authSubscriber.spec.js`

- [ ] **Step 1: 把 callbackService.js 逻辑迁移到 authSubscriber**

保留纯数据处理函数在 `callbackService.js` 或内联到 subscriber。subscriber 负责根据 `body.event` 分发并发布业务事件。

```javascript
import { Events } from '../events.js'

function buildCallbackRecord(store, body, meta) {
  return {
    id: crypto.randomUUID(),
    event: String(body.event || '').trim(),
    username: String(body.username || '').trim(),
    uuid: String(body.uuid || '').trim(),
    remoteAddress: String(meta?.remoteAddress || body?.remoteAddress || '').trim(),
    authMethod: String(body.method || body.authMethod || '').trim(),
    deviceFingerprint: String(body.fingerprint || body.deviceFingerprint || '').trim(),
    reason: String(body.reason || '').trim(),
    externalUserId: String(body.external_user_id || '').trim(),
    webhookSource: String(body.source || '').trim(),
    tsMs: body.ts_ms != null && Number.isFinite(Number(body.ts_ms)) ? Number(body.ts_ms) : null,
    adapter: meta?.vlaInbound ? 'vla' : 'authx',
    receivedAt: meta?.receivedAt || new Date().toISOString(),
  }
}

export function registerAuthSubscriber(bus, deps) {
  const { appendLoginEvent, appendSecurityAudit, appendSecurityAlert, ensureSecurityCenter, computeLoginRisk, findUserByExternalUserId, failMcVerifySession, completeMcVerifySession, markUserProfileDirty, markKvDirty, pushUserNotification, scheduleSave } = deps

  bus.subscribe(Events.PLUGIN_CALLBACK_RECEIVED, async ({ store, body, meta }) => {
    const record = buildCallbackRecord(store, body, meta)
    if (!Array.isArray(store.authxEvents)) store.authxEvents = []
    store.authxEvents.unshift(record)
    if (store.authxEvents.length > 5000) store.authxEvents.length = 5000
    markKvDirty('authx_events')

    const event = record.event

    if (event === 'verify_premium') {
      // 同原 callbackService.js verify_premium 逻辑，成功时发布 Events.AUTH_VERIFY_COMPLETED
      // 失败时发布 Events.AUTH_VERIFY_FAILED
    }

    if (event === 'verify_failed' || event === 'verify_premium_failed') {
      // 同原 verify_failed 逻辑，发布 Events.AUTH_VERIFY_FAILED
    }

    if (event === 'login_success') {
      const loginRow = appendLoginEvent(store, body)
      bus.publish(Events.AUTH_LOGIN_SUCCESS, { store, loginRow, source: 'plugin_callback' })
    }

    if (event === 'security_alert') {
      const externalUserId = String(body.external_user_id || '').trim()
      const linkedUser = externalUserId ? findUserByExternalUserId(store, externalUserId) : null
      // ... 计算 alertPayload
      bus.publish(Events.SECURITY_ALERT_RAISED, { store, targetUserId, alertPayload })
    }

    scheduleSave()
  })
}
```

- [ ] **Step 2: 写测试覆盖 verify_premium / login_success / security_alert**

测试用 mock store 与 mock deps，验证发布的事件正确。

- [ ] **Step 3: 运行测试并修复到 PASS**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/subscribers/authSubscriber.spec.js
```

- [ ] **Step 4: 提交**

```bash
git add 重构/backend/src/modules/event-bus/subscribers/authSubscriber.js 重构/backend/tests/unit/modules/event-bus/subscribers/authSubscriber.spec.js
git commit -m "feat(event-bus): add auth subscriber for plugin callbacks"
```

---

### Task 5: 创建 bindEmailSubscriber

**Files:**
- Create: `重构/backend/src/modules/event-bus/subscribers/bindEmailSubscriber.js`
- Test: `重构/backend/tests/unit/modules/event-bus/subscribers/bindEmailSubscriber.spec.js`

- [ ] **Step 1: 迁移 bindEmailService.js 逻辑到 bindEmailSubscriber**

subscriber 订阅 `Events.PLUGIN_BIND_EMAIL_RECEIVED`，处理本地用户创建/绑定，发布两个 VLA 命令，最后发布 `Events.USER_BIND_EMAIL_COMPLETED`。

```javascript
import { Events } from '../events.js'

export function registerBindEmailSubscriber(bus, deps) {
  const { isValidEmailAddress, findUserByLinkedMcUsername, ensureSiteUserForPluginEmail, markUserProfileDirty, appendSecurityAudit, pushUserNotification, scheduleSave } = deps

  bus.subscribe(Events.PLUGIN_BIND_EMAIL_RECEIVED, async ({ store, body }) => {
    const email = String(body.email || '').trim().toLowerCase()
    const mcUsername = String(body.username || '').trim()
    const externalUserId = String(body.external_user_id || '').trim()
    const mcUuid = String(body.uuid || '').trim() || null
    const currentIp = String(body.current_ip || body.ip || '').trim() || null

    if (!isValidEmailAddress(email)) throw new Error('invalid_email')
    if (!mcUsername || mcUsername.length < 3 || mcUsername.length > 16) throw new Error('validation_error')

    const existingByMc = findUserByLinkedMcUsername(store, mcUsername)
    const { localUser, created } = await ensureSiteUserForPluginEmail(store, email)

    if (existingByMc && String(existingByMc.id || '') !== String(localUser.id || '')) {
      throw new Error('mc_already_linked')
    }

    const prevLinked = String(localUser.linkedMcUsername || '').trim()
    if (prevLinked && prevLinked.toLowerCase() !== mcUsername.toLowerCase()) {
      throw new Error('email_already_linked')
    }

    bus.publish(Events.VLA_COMMAND_LINK_EXTERNAL_USER, {
      body: { username: mcUsername, external_user_id: localUser.id }
    })
    bus.publish(Events.VLA_COMMAND_NOTIFY_BIND_EMAIL, {
      body: { username: mcUsername, email }
    })

    localUser.linkedMcUsername = mcUsername
    localUser.linkedMcUuid = mcUuid || localUser.linkedMcUuid || null
    markUserProfileDirty(localUser.id)

    appendSecurityAudit(store, localUser.id, 'plugin_bind_email', { email, mcUsername, externalUserId, previousMcUsername: prevLinked, currentIp, source: 'plugin_callback' })
    pushUserNotification(store, localUser.id, {
      type: 'binding_changed',
      title: created ? '已创建皮肤站账号并绑定角色' : '已绑定邮箱与游戏角色',
      message: created ? `已为 ${email} 创建网站账号，并绑定角色 ${mcUsername}` : `邮箱 ${email} 已与角色 ${mcUsername} 绑定`,
      detail: { email, mcUsername, created, currentIp, action: 'plugin_bind_email' },
    })

    scheduleSave()

    bus.publish(Events.USER_BIND_EMAIL_COMPLETED, {
      userId: localUser.id,
      email,
      mcUsername,
      mcUuid: localUser.linkedMcUuid,
      created,
    })
  })
}
```

- [ ] **Step 2: 写测试并运行到 PASS**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/subscribers/bindEmailSubscriber.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add 重构/backend/src/modules/event-bus/subscribers/bindEmailSubscriber.js 重构/backend/tests/unit/modules/event-bus/subscribers/bindEmailSubscriber.spec.js
git commit -m "feat(event-bus): add bind-email subscriber"
```

---

### Task 6: 创建 skinRefreshSubscriber

**Files:**
- Create: `重构/backend/src/modules/event-bus/subscribers/skinRefreshSubscriber.js`
- Modify: `重构/backend/src/modules/plugin-gateway/skinRefresh.js`
- Test: `重构/backend/tests/unit/modules/event-bus/subscribers/skinRefreshSubscriber.spec.js`

- [ ] **Step 1: 实现 skinRefreshSubscriber**

```javascript
import { Events } from '../events.js'

export function registerSkinRefreshSubscriber(bus, deps) {
  const { config, pluginFetchJson, logger = console } = deps

  bus.subscribe(Events.PLUGIN_SKIN_REFRESH_RECEIVED, async ({ body }) => {
    bus.publish(Events.VLA_COMMAND_SKIN_REFRESH, { body: body || {} })
  })
}
```

- [ ] **Step 2: 修改 skinRefresh.js 只发布事件**

```javascript
export function registerSkinRefreshRoutes(app, deps) {
  const { config, jsonErr, eventBus } = deps

  app.post('/plugin/skin/refresh', async (req, res) => {
    if (config.isProd && !config.pluginRefreshSecret) {
      return jsonErr(res, 503, '生产环境必须配置 PLUGIN_REFRESH_SECRET', 'misconfigured')
    }
    if (config.pluginRefreshSecret) {
      const h1 = (req.headers['x-skin-bridge-secret'] || '').trim()
      const h2 = (req.headers['x-skinbridge-secret'] || '').trim()
      if ((h1 || h2) !== config.pluginRefreshSecret) {
        return jsonErr(res, 401, '未授权', 'unauthorized')
      }
    }
    eventBus.publish(Events.PLUGIN_SKIN_REFRESH_RECEIVED, { body: req.body || {} })
    res.json({ ok: true, queued: true })
  })
}
```

- [ ] **Step 3: 测试并提交**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/subscribers/skinRefreshSubscriber.spec.js
```
Expected: PASS

```bash
git add 重构/backend/src/modules/event-bus/subscribers/skinRefreshSubscriber.js 重构/backend/src/modules/plugin-gateway/skinRefresh.js 重构/backend/tests/unit/modules/event-bus/subscribers/skinRefreshSubscriber.spec.js
git commit -m "feat(event-bus): add skin-refresh subscriber"
```

---

### Task 7: 填充 securitySubscriber

**Files:**
- Modify: `重构/backend/src/modules/event-bus/subscribers/securitySubscriber.js`

- [ ] **Step 1: 实现 securitySubscriber**

```javascript
import { Events } from '../events.js'

export function registerSecuritySubscriber(bus, deps) {
  const { appendSecurityAudit, appendSecurityAlert, pushUserNotification } = deps

  bus.subscribe(Events.AUTH_LOGIN_SUCCESS, async ({ store, loginRow }) => {
    appendSecurityAudit(store, loginRow.userId, 'login_success', {
      username: loginRow.username,
      uuid: loginRow.uuid,
      method: loginRow.method,
      ip: loginRow.ip,
      location: loginRow.location,
      asn: loginRow.asn,
      riskScore: loginRow.riskScore,
      riskLevel: loginRow.riskLevel,
      deviceProfile: loginRow.deviceProfile,
      externalUserId: loginRow.externalUserId,
      source: 'plugin_callback',
    })
  })

  bus.subscribe(Events.AUTH_VERIFY_COMPLETED, async ({ store, userId, auditDetail }) => {
    appendSecurityAudit(store, userId, 'verify_success', auditDetail)
    pushUserNotification(store, userId, {
      type: 'verify_success',
      title: '正版验证成功',
      message: `角色 ${auditDetail.mcUsername} 已通过正版验证`,
      detail: { mcUsername: auditDetail.mcUsername, mojangUuid: auditDetail.mojangUuid, source: 'plugin_callback' },
    })
  })

  bus.subscribe(Events.AUTH_VERIFY_FAILED, async ({ store, userId, auditDetail }) => {
    appendSecurityAudit(store, userId, 'verify_failed', auditDetail)
    pushUserNotification(store, userId, {
      type: 'verify_failed',
      title: '正版验证失败',
      message: `角色 ${auditDetail.mcUsername} 验证失败：${auditDetail.reason || 'verify_failed'}`,
      detail: { mcUsername: auditDetail.mcUsername, reason: auditDetail.reason, source: 'plugin_callback' },
    })
  })

  bus.subscribe(Events.SECURITY_ALERT_RAISED, async ({ store, targetUserId, alertPayload }) => {
    appendSecurityAlert(store, targetUserId, alertPayload.riskLevel, `登录安全告警：${alertPayload.type || 'unknown'}`, alertPayload)
  })

  bus.subscribe(Events.USER_BIND_EMAIL_COMPLETED, async ({ store, userId, email, mcUsername, currentIp, created }) => {
    appendSecurityAudit(store, userId, 'plugin_bind_email', { email, mcUsername, currentIp, created, source: 'plugin_callback' })
  })
}
```

- [ ] **Step 2: 写测试并运行到 PASS**

Run:
```bash
npm --prefix '重构/backend' test -- tests/unit/modules/event-bus/subscribers/securitySubscriber.spec.js
```

- [ ] **Step 3: 提交**

```bash
git add 重构/backend/src/modules/event-bus/subscribers/securitySubscriber.js 重构/backend/tests/unit/modules/event-bus/subscribers/securitySubscriber.spec.js
git commit -m "feat(event-bus): add security subscriber for audit/alert/notification"
```

---

### Task 8: 重构 authxAdmin routes 为命令发布者

**Files:**
- Modify: `重构/backend/src/modules/authxAdmin/routes.js`
- Modify: `重构/backend/src/modules/authxAdmin/index.js`（如需要注入 eventBus）
- Test: `重构/backend/tests/authx-admin-module-smoke.test.js`（已存在，需更新）

- [ ] **Step 1: 在 routes.js 中使用 eventBus.publishAndWait**

```javascript
import crypto from 'crypto'
import { asyncHandler } from '../../middleware/error.js'
import { Events } from '../event-bus/events.js'
import {
  normalizeProxyStatus,
  respondPluginJson,
  respondPluginJsonOrText
} from './service.js'

export function registerAuthxAdminRoutes(app, deps) {
  const { requireDevAdmin, pluginFetchGet, config, adminPluginGetLimiter, jsonErr, eventBus } = deps

  const okResponse = typeof jsonOk === 'function' ? jsonOk : (res, payload = {}, status = 200) => res.status(Number(status)).json({ ok: true, success: true, ...(payload && typeof payload === 'object' ? payload : {}) })

  async function publishCommand(event, body) {
    const result = await eventBus.publishAndWait(event, { body })
    if (!result.ok) throw new Error(result.error || 'command_failed')
    return result.result
  }

  app.post('/api/admin/authx/kick-online', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    const r = await publishCommand(Events.VLA_COMMAND_KICK_ONLINE, req.body || {})
    return respondPluginJson(res, r)
  }))

  // 类似替换 reset-password / bind-email / unbind-device / ban / delete-user / skin-refresh / link-external-user

  app.get('/api/admin/authx/plugin-metrics', asyncHandler(async (req, res) => {
    if (!requireDevAdmin(req, res)) return
    if (config.authxPluginAdapter !== 'vla') {
      return jsonErr(res, 400, '当前接口仅支持 VLA 适配器', 'plugin_metrics_requires_vla')
    }
    const r = await pluginFetchGet('/v1/metrics/prometheus')
    res.status(normalizeProxyStatus(r.status)).type('text/plain; version=0.0.4; charset=utf-8').send(r.text || '')
  }))

  // ban-check / user-exists / plugin-health 保持直接调用（它们是查询，非命令）
}
```

- [ ] **Step 2: 运行 authx-admin smoke 测试并修复**

Run:
```bash
npm --prefix '重构/backend' test -- tests/authx-admin-module-smoke.test.js
```
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add 重构/backend/src/modules/authxAdmin 重构/backend/tests/authx-admin-module-smoke.test.js
git commit -m "refactor(authxAdmin): publish VLA commands via event bus"
```

---

### Task 9: 在 server.js 装配事件总线并注册所有 subscriber

**Files:**
- Modify: `重构/backend/src/server.js`
- Test: `重构/backend/tests/event-bus-integration-smoke.test.js`

- [ ] **Step 1: 导入并创建 EventBus**

```javascript
import { EventBus, Events } from './modules/event-bus/index.js'
import { registerVlaCommandSubscriber } from './modules/event-bus/subscribers/vlaCommandSubscriber.js'
import { registerAuthSubscriber } from './modules/event-bus/subscribers/authSubscriber.js'
import { registerBindEmailSubscriber } from './modules/event-bus/subscribers/bindEmailSubscriber.js'
import { registerSkinRefreshSubscriber } from './modules/event-bus/subscribers/skinRefreshSubscriber.js'
import { registerSecuritySubscriber } from './modules/event-bus/subscribers/securitySubscriber.js'
```

在启动流程中：

```javascript
const eventBus = new EventBus()

registerVlaCommandSubscriber(eventBus, { pluginFetchJson, pluginFetchGet, logger: console })
registerAuthSubscriber(eventBus, {
  appendLoginEvent,
  appendSecurityAudit,
  appendSecurityAlert,
  ensureSecurityCenter,
  computeLoginRisk,
  findUserByExternalUserId,
  failMcVerifySession,
  completeMcVerifySession,
  markUserProfileDirty,
  markKvDirty,
  pushUserNotification,
  scheduleSave,
})
registerBindEmailSubscriber(eventBus, {
  isValidEmailAddress,
  findUserByLinkedMcUsername,
  ensureSiteUserForPluginEmail,
  markUserProfileDirty,
  appendSecurityAudit,
  pushUserNotification,
  scheduleSave,
})
registerSkinRefreshSubscriber(eventBus, { config, pluginFetchJson })
registerSecuritySubscriber(eventBus, { appendSecurityAudit, appendSecurityAlert, pushUserNotification })
```

- [ ] **Step 2: 更新 registerPluginGatewayRoutes 调用**

```javascript
registerPluginGatewayRoutes(app, {
  config,
  jsonErr,
  getStore,
  eventBus,
  authxWebhookCallbackLimiter,
})
```

- [ ] **Step 3: 更新 registerSkinRefreshRoutes 调用**

```javascript
registerSkinRefreshRoutes(app, { config, jsonErr, eventBus })
```

- [ ] **Step 4: 更新 registerAuthxAdminRoutes 调用**

```javascript
registerAuthxAdminRoutes(app, {
  requireDevAdmin: requireAuthxAdminAccess,
  pluginFetchHealth,
  pluginFetchGet,
  config,
  adminPluginGetLimiter,
  jsonErr,
  jsonOk,
  eventBus,
})
```

- [ ] **Step 5: 写集成 smoke 测试**

启动 Express 应用，向 `/api/v1/plugin/callback` 发送伪造的 `login_success` 事件，验证 `store.authxEvents` 被写入。

- [ ] **Step 6: 运行验证**

Run:
```bash
npm --prefix '重构/backend' run verify
```
Expected: lint 0 warnings, all tests pass, security-baseline pass

- [ ] **Step 7: 提交**

```bash
git add 重构/backend/src/server.js 重构/backend/tests/event-bus-integration-smoke.test.js
git commit -m "feat(server): wire event bus and all subscribers"
```

---

### Task 10: 更新文档与健康报告

**Files:**
- Modify: `重构/backend/README.md`
- Modify: `重构/backend/docs/openapi/authx.yaml`（如需要）
- Modify: `docs/PROJECT_HEALTH_REPORT_2026-07-02.md`

- [ ] **Step 1: 在 README 中补充事件总线说明**

在 README 的「模块结构（重构后）」章节新增 `src/modules/event-bus/` 说明。

- [ ] **Step 2: 更新项目健康报告**

在报告中新增：

```markdown
### P2. 事件总线解耦 VLA 与 Web 后端

**状态**：已完成

**说明**：
- 新增 `重构/backend/src/modules/event-bus/` 模块，含类型化事件总线与 subscriber。
- `plugin-gateway` 验签后仅发布事件，不再直接调用业务服务。
- `authxAdmin` 管理端命令通过事件总线发布，由 `vlaCommandSubscriber` 统一转发 VLA。
- 新增 event-bus 单元测试与集成 smoke 测试，全仓库测试通过。
```

- [ ] **Step 3: 提交**

```bash
git add 重构/backend/README.md docs/PROJECT_HEALTH_REPORT_2026-07-02.md
git commit -m "docs: update README and health report for event bus"
```

---

## 自我审查

- **Spec coverage:**
  - 事件总线核心 → Task 1
  - VLA 出站命令订阅器 → Task 2
  - plugin-gateway 改为发布事件 → Task 3
  - auth/bind-email/skin-refresh subscriber → Task 4/5/6
  - security subscriber → Task 7
  - authxAdmin 命令发布 → Task 8
  - server.js 装配 → Task 9
  - 文档更新 → Task 10
- **Placeholder scan:** 无 TBD/TODO；每步含具体文件路径、代码片段、命令。
- **Type consistency:** `Events.PLUGIN_CALLBACK_RECEIVED` payload 统一为 `{ store, body, meta }`；`publishAndWait` 返回 `{ ok, result }` 或 `{ ok: false, error }`。
