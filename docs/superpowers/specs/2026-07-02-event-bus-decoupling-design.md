# P2 事件总线解耦 VLA 与 Web 后端设计文档

> **目标**：通过进程内类型化事件总线，把 VLA 插件入站事件、出站命令与网站后端各业务模块解耦，使 `plugin-gateway`、`authxAdmin`、安全中心、皮肤站等模块通过事件契约通信，而非直接调用 HTTP 或互相依赖。

## 背景

当前耦合点：

- `plugin-gateway/handlers.js` 验签后直接调用 `callbackService.js`、`bindEmailService.js` 处理业务。
- `plugin-gateway/skinRefresh.js` 直接调用 `pluginFetchJson` 转发 VLA。
- `authxAdmin/routes.js` 每个路由都直接调用 `pluginFetchJson` / `pluginFetchGet` 访问 VLA。
- 安全审计、通知、用户资料更新等副作用散落在 `callbackService.js` 的 `deps` 注入中。

这些耦合导致：

- 新增一种 VLA 事件需要在 `callbackService.js` 里加分支，并同步修改 `server.js` 的 `callbackDeps`。
- `authxAdmin` 路由与 VLA HTTP 路径强绑定，测试时需要 mock `pluginFetchJson`。
- 一处事件需要多处消费时（如登录成功既写审计又更新安全中心），只能在 `callbackService.js` 里顺序调用，难以扩展。

## 架构

### 事件总线模块

新增 `重构/backend/src/modules/event-bus/`：

- `bus.js`：基于 Node.js `EventEmitter` 的进程内总线。提供 `publish(eventName, payload)`、`subscribe(eventName, handler)`、`unsubscribe(eventName, handler)`、`once(eventName, handler)`。每个 handler 失败只影响自己，不会阻断其他 subscriber。
- `events.js`：集中声明所有事件名与 payload schema（仅文档化注释，运行时仍用普通对象）。
- `index.js`：统一导出 bus、事件名、subscriber 注册器。

### 事件分类

#### 1. 入站事件（由 plugin-gateway 发布）

| 事件名 | 来源 | 说明 |
|--------|------|------|
| `plugin:callback:received` | `POST /api/v1/plugin/callback` | VLA/AuthX 通用回调，payload 含 event、username、uuid、remoteAddress 等 |
| `plugin:bind-email:received` | `POST /api/v1/plugin/bind-email` | 插件邮箱绑定回调 |
| `plugin:skin-refresh:received` | `POST /plugin/skin/refresh` | 皮肤站/插件桥刷新通知 |

#### 2. 业务事件（由 subscriber 发布，供其他模块消费）

| 事件名 | 发布者 | 消费者 |
|--------|--------|--------|
| `auth:verify:completed` | auth-subscriber | 安全中心、用户资料 |
| `auth:verify:failed` | auth-subscriber | 安全中心、通知中心 |
| `auth:login:success` | auth-subscriber | 安全审计、安全中心 |
| `security:alert:raised` | auth-subscriber / 安全中心 | 通知中心、安全审计 |
| `user:bind-email:completed` | bind-email-subscriber | 安全审计、通知中心 |
| `skin:refresh:requested` | skin-refresh-subscriber | VLA 命令执行器 |

#### 3. 出站命令（由路由或 subscriber 发布，由 vla-command-subscriber 执行）

| 事件名 | 触发场景 |
|--------|----------|
| `vla:command:kick-online` | 管理端踢人 |
| `vla:command:ban` | 管理端封禁/解封 |
| `vla:command:delete-user` | 管理端注销游戏账号 |
| `vla:command:skin-refresh` | 管理端或皮肤刷新入口 |
| `vla:command:link-external-user` | 管理端绑定/解绑网站主键 |
| `vla:command:reset-password` | 管理端重置游戏密码 |
| `vla:command:bind-email` | 管理端绑定邮箱 |
| `vla:command:unbind-device` | 管理端解绑设备 |
| `vla:command:notify-bind-email` | bind-email 流程中通知 VLA 绑定邮箱 |
| `vla:command:link-external-user` | bind-email 流程中通知 VLA link external_user_id |

### Subscriber 模块

新增 `重构/backend/src/modules/event-bus/subscribers/`：

- `authSubscriber.js`：订阅 `plugin:callback:received`，根据 event 字段分发到 `auth:verify:*`、`auth:login:success`、`security:alert:raised` 等。
- `bindEmailSubscriber.js`：订阅 `plugin:bind-email:received`，处理本地用户创建/绑定，并发布 `vla:command:*` 同步 VLA，最后发布 `user:bind-email:completed`。
- `skinRefreshSubscriber.js`：订阅 `plugin:skin-refresh:received` 和 `vla:command:skin-refresh`，转发或本地桩响应。
- `securitySubscriber.js`：订阅 `security:alert:raised`、`auth:login:success`、`auth:verify:*`，写入安全审计、安全中心、通知中心。
- `vlaCommandSubscriber.js`：订阅所有 `vla:command:*`，统一调用 `pluginFetchJson` / `pluginFetchGet`，并发布 `vla:command:completed` / `vla:command:failed`。

### 调整现有模块

- `plugin-gateway/handlers.js`：验签通过后只调用 `eventBus.publish(...)`，返回 `{ ok: true }`。
- `plugin-gateway/callbackService.js`：核心逻辑迁移到 `authSubscriber.js`，原文件保留为 subscriber 内部可复用的纯函数或删除（视实现而定）。
- `plugin-gateway/bindEmailService.js`：核心逻辑迁移到 `bindEmailSubscriber.js`。
- `plugin-gateway/skinRefresh.js`：handler 改为发布事件，实际转发逻辑移到 `skinRefreshSubscriber.js`。
- `authxAdmin/routes.js`：所有 `pluginFetch*` 调用改为 `eventBus.publish('vla:command:*', { ... })`，并返回 `202 Accepted` 或等待 `vla:command:completed` 后返回结果（保持同步响应兼容）。
- `server.js`：装配 `eventBus`，注册所有 subscriber， subscriber 依赖通过 `deps` 注入。

## 数据流示例

### 入站：VLA 登录成功

```
VLA POST /api/v1/plugin/callback
  → plugin-gateway/handlers.js 验签
    → eventBus.publish('plugin:callback:received', payload)
      → authSubscriber.js
        → eventBus.publish('auth:login:success', ...)
          → securitySubscriber.js 写审计 + 安全中心
      → （未来可扩展：telemetry、通知中心等）
  → 返回 { ok: true }
```

### 出站：管理端踢人

```
POST /api/admin/authx/kick-online
  → authxAdmin/routes.js 鉴权
    → eventBus.publish('vla:command:kick-online', { body, replyTo: req.id })
      → vlaCommandSubscriber.js 调用 pluginFetchJson
        → eventBus.publish('vla:command:completed', { ... })
  → routes.js 监听 completed 事件后 respondPluginJson
```

## 错误处理

- 事件总线 handler 异常只记录日志并发布 `event:handler:failed`，不影响其他 subscriber。
- `vla:command:failed` 由 `vlaCommandSubscriber` 发布，路由层可选择重试或返回错误。
- 保留现有失败闭环：生产环境未配置 webhook 密钥时仍返回 503。

## 测试策略

- 单元测试：mock `EventEmitter`，验证 publish/subscribe、handler 隔离、错误捕获。
- 集成 smoke：启动 Express 应用后向 plugin-gateway 发回调，验证 subscriber 被执行且副作用发生。
- 回归测试：确保 `authxAdmin` 路由行为与之前一致（返回码、响应体结构）。

## 收益与风险

**收益**：

- VLA HTTP 细节与业务逻辑解耦。
- 新增事件/消费者无需修改 `callbackService.js`。
- 测试更容易：subscriber 可独立单元测试，handler 只 mock eventBus。

**风险**：

- 进程内总线不支持横向扩展；如需多实例需后续引入 Redis/RabbitMQ。
- 增加一层间接调用，调试时需要追踪事件名。

## 后续可扩展

- 引入持久化事件存储与重放（dead letter）。
- 将 `vlaCommandSubscriber` 拆分为独立 worker 进程。
- 用 Redis pub/sub 替换 EventEmitter 以支持多节点。
