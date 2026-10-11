# StarMC Backend API 契约（统一响应 / 分页 / 错误码）

更新时间：2026-07-11

本文档定义后端通用响应契约，适用于 `重构/backend` 下大多数 JSON API（文本透传接口如 Prometheus metrics 例外）。

## 1. 成功响应（统一 Envelope）

### 1.1 普通成功响应

```json
{
  "ok": true,
  "success": true
}
```

业务字段直接平铺在同一层，例如：

```json
{
  "ok": true,
  "success": true,
  "user": {
    "id": "u_1"
  }
}
```

### 1.2 分页成功响应（`jsonPage`）

```json
{
  "ok": true,
  "success": true,
  "items": [],
  "total": 128,
  "page": 2,
  "pageSize": 20,
  "pagination": {
    "total": 128,
    "page": 2,
    "pageSize": 20,
    "totalPages": 7,
    "hasMore": true,
    "hasPrev": true
  }
}
```

说明：
- `items` 始终为数组（空列表返回 `[]`）。
- `total/page/pageSize` 继续保留，兼容旧前端读取方式。
- `pagination.*` 为新增标准化分页对象，建议新前端优先使用。
- 允许在分页响应中附加业务字段，例如 `sync`、`changedSince`。

## 2. 错误响应（统一 Envelope）

```json
{
  "ok": false,
  "success": false,
  "message": "参数错误",
  "code": "validation_error",
  "error": "validation_error",
  "details": {
    "field": "expectedVersion"
  }
}
```

字段约束：
- `message`：面向前端展示或日志提示。
- `code`：机器可判定错误码。
- `error`：与 `code` 等值，兼容旧客户端。
- `details`：可选结构化上下文（推荐用于精细化提示与自动化处理）。

## 3. 分页查询参数兼容规则

统一解析函数：`resolvePaginationQuery(query, options)`。

规则如下：
- 若请求携带 `page` 或 `pageSize`，优先按 page 模式解析。
- 否则若携带 `offset` 或 `limit`，按 offset 模式解析并折算出 `page/pageSize`。
- `pageSize` 受 `maxPageSize` 约束（防止超大页）。

因此管理端接口可同时兼容：
- 新参数：`?page=2&pageSize=20`
- 旧参数：`?offset=20&limit=20`

## 4. 代理接口兼容策略（AuthX / VLA）

对于插件代理返回的 JSON：
- 不破坏原有字段；
- 若缺失 `ok/success`，后端补齐标准字段；
- 文本透传接口（例如 metrics）保持原始文本，不强行改造成 JSON。

## 5. 错误码注册表（首批）

| code | HTTP | 场景 | 推荐 details |
|------|------|------|--------------|
| `validation_error` | 400 | 参数非法、缺字段、格式错误 | `field`, `reason`, `expected` |
| `forbidden` | 403 | 权限不足 | `requiredRoles`, `actualRoles`, `requiredCapability` |
| `not_found` | 404 | 资源不存在 | `resource`, `id` |
| `too_many_requests` | 429 | 触发限流 | `retryAfterSeconds`, `limit` |
| `session_conflict` | 409 | 验证会话冲突 | `activeSessionId`, `conflictCode` |
| `verify_max_retries_exceeded` | 429 | 验证链重试超限 | `retryAfterSeconds`, `retryCount`, `maxRetries` |
| `version_conflict` | 409 | 审核版本冲突 | `submissionId`, `expectedVersion`, `actualVersion` |
| `invalid_review_transition` | 409 | 投稿状态机不允许迁移 | `submissionId`, `currentStatus`, `requestedAction`, `allowedFrom` |
| `already_reviewed` | 409 | 重复审核已终态投稿 | `submissionId`, `currentStatus` |
| `review_entry_disabled` | 404 | 审核入口未启用 | — |
| `already_pending` | 409 | 对已待审状态重复回退/重审 | `submissionId`, `currentStatus` |
| `plugin_health_failed` | 502 | 插件健康检查失败 | `reachable`, `status`（响应体同时含 `plugin` 对象，与成功时结构一致） |
| `plugin_metrics_requires_vla` | 400 | 非 VLA 适配器访问 metrics | `adapter` |
| `vla_adapter_required` | 400 | 仅 VLA 支持的接口被调用 | `adapter` |
| `username_exists` | 409 | 管理端修改用户重名 | `username` |
| `cannot_delete_self` | 400 | 管理员删除自己 | `actorUserId` |
| `no_texture` | 400 | 皮肤缺资源无法上线 | `id`, `status` |

## 6. 前端接入建议

- 成功判定：优先判断 `ok === true`，兼容 `success === true`。
- 错误提示：优先依据 `code` 分支处理，再兜底显示 `message`。
- 分页：读取 `pagination`，并兼容 `total/page/pageSize`。
- 对 409 冲突类错误（如 `version_conflict`、`session_conflict`）优先提供“刷新后重试”或“继续替换旧会话”等明确动作按钮。

## 7. 适配器废弃说明

authx 适配器已废弃，仅 VLA 受支持。新部署请直接使用 `AUTHX_PLUGIN_ADAPTER=vla`，并配置 `AUTHX_VLA_API_KEY` 与 `AUTHX_VLA_WEBHOOK_SECRET(S)`；旧 AuthX 相关环境变量（`AUTHX_CALLBACK_SECRET`、`AUTHX_ADMIN_SECRET`）已不再需要。

## 8. 审核流与管理端扩展（2026-07）

### 8.1 投稿审核统计

`GET /api/skins/submissions/stats`（需 `reviewer|admin` + `REVIEW_ENTRY_ENABLED=true`）

```json
{
  "ok": true,
  "success": true,
  "pending": 2,
  "approved": 10,
  "rejected": 1,
  "total": 13,
  "latestSubmittedAt": "2026-07-02T10:00:00.000Z"
}
```

### 8.2 单条审核

`POST /api/skins/submissions/:id/:action`（`action` = `approve` | `reject`）

- 请求体：`{ note?, expectedVersion? }`
- 请求头：可选 `Idempotency-Key`（幂等重试）
- 驳回时 `note` 必填

### 8.3 批量审核

`POST /api/skins/submissions/batch/:action`（`action` = `approve` | `reject`）

- 请求体：

```json
{
  "note": "全局驳回原因（reject 时可作默认备注）",
  "items": [
    { "id": "sub-1", "expectedVersion": 0, "note": "可选逐条备注" }
  ]
}
```

- 单次最多 50 条；部分失败不影响其他条目
- 响应：

```json
{
  "ok": true,
  "action": "approve",
  "processed": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "ok": true, "id": "sub-1", "status": "approved", "reviewVersion": 1 },
    { "ok": false, "id": "sub-2", "code": "already_reviewed", "message": "..." }
  ]
}
```

单条路由在冲突时返回 HTTP 409；批量路由对每条记录在 `results[]` 中返回 `code/message/details`，HTTP 始终 200（除非请求级校验失败）。

### 8.4 插件桥接诊断

`GET /api/admin/authx/bridge-status`（Header: `X-Admin-Secret`）

返回适配器、密钥配置摘要、断路器、健康探测与 `ready` 就绪标志。CLI 探针：

```bash
npm run plugin:probe   # 仓库根；需 API 进程已启动
```

## 9. 新前端启动引导（2026-07）

`GET /api/public/bootstrap`（无需登录）返回 SPA 启动所需的功能开关、认证能力、实时通道与端点索引。

```json
{
  "ok": true,
  "contractVersion": "2026-07-11",
  "site": { "name": "StarMC", "publicSiteOrigin": "...", "publicApiOrigin": "..." },
  "features": { "reviewEntryEnabled": false, "telemetryEnabled": true, "pluginBridge": {} },
  "auth": { "apiBasePath": "/auth", "oauthProviders": ["github"], "supertokensConfigured": true },
  "realtime": { "skinLibrarySse": "/api/skins/library/stream", "recommendedPollMs": 15000 },
  "endpoints": { "userMe": "/api/user/me", "securityCenter": "/api/security/center" },
  "docs": { "apiContract": "/api/docs/api-contract", "openapiFrontend": "/api/docs/openapi/frontend-public" }
}
```

扁平兼容：`GET /api/public/site-features` 仍返回原字段并新增 `telemetryEnabled`、`mojangSkinSyncEnabled`、`skinBridgePublicProfile`、`vlaNotifyOnSkinChange`。

对接教程与 Vite env 生成：`docs/FRONTEND_INTEGRATION.md`、`npm run config:frontend-env`。

## 10. 安全中心模块（`security/routes.js`）

### 10.1 获取活跃会话列表

`GET /api/user/sessions`（需登录）

```json
{
  "ok": true,
  "sessions": [
    {
      "id": "sess_abc123",
      "ip": "1.2.3.4",
      "location": "北京",
      "device": "Chrome 126 / Windows",
      "createdAt": "2026-07-10T08:00:00.000Z",
      "lastActiveAt": "2026-07-11T02:30:00.000Z",
      "current": true
    }
  ]
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| — | 401 | 未登录 |

### 10.2 登录历史

`GET /api/security/login-history?page=&pageSize=`（需登录）

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页条数，默认 20 |

```json
{
  "ok": true,
  "items": [
    {
      "id": "lh_001",
      "method": "email_code",
      "ip": "1.2.3.4",
      "location": "北京",
      "device": "Chrome 126 / Windows",
      "outcome": "success",
      "riskLevel": "low",
      "riskScore": 12,
      "createdAt": "2026-07-10T08:00:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "pageSize": 20
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| — | 401 | 未登录 |

### 10.3 撤销单个会话

`POST /api/security/sessions/:sessionId/revoke`（需登录）

路径参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | string | 是 | 目标会话 ID |

```json
{
  "ok": true,
  "revoked": true
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `not_found` | 404 | 会话不存在 |
| — | 401 | 未登录 |

### 10.4 撤销所有其他会话

`POST /api/security/sessions/revoke-all`（需登录）

```json
{
  "ok": true,
  "revoked": 3
}
```

`revoked` 为实际被撤销的会话数量（不含当前会话）。

| 错误码 | HTTP | 场景 |
|--------|------|------|
| — | 401 | 未登录 |

### 10.5 安全告警列表

`GET /api/security/alerts?page=&pageSize=`（需登录）

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页条数，默认 20 |

```json
{
  "ok": true,
  "items": [],
  "total": 5,
  "unread": 2,
  "page": 1,
  "pageSize": 20
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| — | 401 | 未登录 |

## 11. 玩家统计（`server.js`）

### 11.1 服务器玩家统计

`GET /api/server/player-stats?days=`（公开，无需登录）

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `days` | number | 否 | 历史天数，默认 7 |

```json
{
  "ok": true,
  "online": 0,
  "max": 100,
  "servers": [
    {
      "name": "factions",
      "online": 0,
      "max": 20,
      "status": "linked",
      "transport": "heartbeat-http",
      "platform": "paper",
      "capabilities": ["bridge.http-exchange", "bridge.v1", "server.status"],
      "httpCommandsAccepted": 1,
      "httpCommandsDelivered": 1,
      "httpCommandsRejected": 0,
      "httpCommandsQueued": 0
    }
  ],
  "history": [
    {
      "date": "2026-07-10",
      "players": 38,
      "logins": 120
    }
  ],
  "source": "starx",
  "metrics": {
    "sampleCount": 5,
    "lastCollectedAt": "2026-07-18T14:02:54Z"
  },
  "collectedAt": "2026-07-18T14:03:43Z",
  "updatedAt": "2026-07-18T14:03:43Z"
}
```

`source=starx` 时，`online/max` 是网络总数，`servers` 包含每个 Velocity 注册服的实时人数、容量、bridge 状态、皮肤能力、运行平台和能力声明。四个 `httpCommands*` 字段为不含玩家身份的 HTTP mailbox 传输计数；`metrics` 是 StarX 内置 Plan 采样摘要，不依赖外置 Plan 插件。StarX API 密钥只存在于服务端适配器配置中，不会返回浏览器。

## 12. 披风模块（`cape/routes.js`）

### 12.1 披风搜索

`GET /api/cape/search?q=&page=&pageSize=`（公开，无需登录）

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | string | 否 | 搜索关键词 |
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页条数，默认 20 |

```json
{
  "ok": true,
  "items": [
    {
      "id": "cape_001",
      "name": "星辰披风",
      "description": "限定活动披风",
      "author": "StarMC",
      "cover": "https://cdn.example.com/cape_001.png",
      "type": "event"
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20
}
```

### 12.2 申请/取消披风

`POST /api/cape/apply`（需登录）

请求体：

```json
{
  "capeId": "cape_001",
  "action": "apply"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `capeId` | string | 是 | 披风 ID |
| `action` | string | 否 | `apply`（默认）或 `remove` |

成功响应：

```json
{
  "ok": true,
  "action": "apply",
  "source": "cape_001",
  "capeId": "cape_001"
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `not_found` | 404 | 披风不存在 |
| — | 401 | 未登录 |

## 13. QQ 模块（`qq/routes.js`）

### 13.1 频道信息

`GET /api/qq/guild-info`（公开，无需登录）

```json
{
  "ok": true,
  "configured": true,
  "guild": {
    "id": "guild_123",
    "name": "StarMC 官方频道"
  },
  "message": "频道已配置"
}
```

当未配置时：

```json
{
  "ok": true,
  "configured": false,
  "message": "QQ 频道功能未启用"
}
```

### 13.2 QQ 绑定入口（仅 NapCat）

`POST /api/qq/verify`（需登录）

该网站路由保留用于兼容旧客户端，但不会接受 QQ 号、不会写入用户资料，始终返回 `410 napcat_required`。QQ 绑定只能由 NapCat 私聊验证码完成，再由插件服务写入绑定记录。

请求体（仅用于兼容，不会处理）：

```json
{
  "qqNumber": "123456789"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `qqNumber` | string | 否 | 已废弃；请在游戏内发起 NapCat 绑定 |

响应：`410 { "ok": false, "code": "napcat_required" }`

成功响应：

```json
{
  "ok": true,
  "qqNumber": "123456789",
  "verified": true,
  "message": "绑定成功"
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `validation_error` | 400 | QQ 号格式非法 |
| `session_conflict` | 409 | 已绑定其他 QQ 号 |
| — | 501 | QQ 模块未配置 |
| — | 401 | 未登录 |

### 13.3 查询 QQ 档案

`GET /api/qq/profiles/:qq`（需登录）

路径参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `qq` | string | 是 | QQ 号码 |

```json
{
  "ok": true,
  "found": true,
  "qq": "123456789",
  "profile": {
    "nickname": "玩家A",
    "bindTime": "2026-07-01T00:00:00.000Z"
  }
}
```

未找到时 `found: false`，`profile` 为 `null`。

| 错误码 | HTTP | 场景 |
|--------|------|------|
| — | 401 | 未登录 |

## 14. 管理模块 — 举报管理（`skinAdmin/index.js`）

### 14.1 举报列表

`GET /api/admin/reports?status=`（需管理员）

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 否 | 筛选状态：`pending` / `resolved` / `dismissed` 等 |

```json
{
  "ok": true,
  "items": [],
  "total": 8
}
```

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `forbidden` | 403 | 非管理员 |
| — | 401 | 未登录 |

### 14.2 举报详情

`GET /api/admin/reports/:id`（需管理员）

路径参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 举报 ID |

返回单条举报详情对象。

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `not_found` | 404 | 举报不存在 |
| `forbidden` | 403 | 非管理员 |
| — | 401 | 未登录 |

### 14.3 更新举报状态

`PATCH /api/admin/reports/:id`（需管理员）

兼容路径：`PATCH /api/admin/skins/reports/:id`（行为一致）

请求体：

```json
{
  "status": "resolved",
  "resolution": "已封禁相关皮肤",
  "note": "管理员处理备注"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 是 | 目标状态 |
| `resolution` | string | 否 | 处理结论 |
| `note` | string | 否 | 管理员备注 |

返回更新后的举报对象。

| 错误码 | HTTP | 场景 |
|--------|------|------|
| `not_found` | 404 | 举报不存在 |
| `forbidden` | 403 | 非管理员 |
| — | 401 | 未登录 |
