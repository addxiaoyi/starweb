# StarMC Backend API 契约（统一响应 / 分页 / 错误码）

更新时间：2026-04-27

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
| `already_pending` | 409 | 对已待审状态重复回退/重审 | `submissionId`, `currentStatus` |
| `plugin_health_failed` | 502 | 插件健康检查失败 | `reachable`, `status` |
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
