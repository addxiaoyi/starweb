# StarMC Local Backend

后端为 **Node（Express）**，与 **SuperTokens Core**（独立进程，可为 Docker 或官方安装包）通过 HTTP 通信；**PostgreSQL** 为可选（不设 `DATABASE_URL` 时仅用 `data/store.json`）。以上组合在 **Linux 与 Windows** 上行为一致，仅启动依赖的方式不同。

## 最短配置路径

优先使用仓库根的简约配置生成器：

```bash
npm run config:doctor
```

它会生成 `backend/.env.generated`。后端现在明确区分两条路径：

- `.env.generated`
- 可选 `.env`

对应规则：

- `npm run dev` / `npm run start`（默认）：只读 `.env.generated`，忽略 `backend/.env`
- `npm run dev:overlay` / `npm run start:overlay`：兼容 overlay 流程，读 `.env.generated`，再让 `.env` 覆盖

建议把 `.env.generated` 视为本地默认层，把 `backend/.env` 仅保留给手工覆盖、临时联调或生产拷贝。

若你只想检查配置风险而不启动服务：

```bash
npm run config:lint
```

## 依赖自检（Linux / Windows 通用）

在 `backend` 目录：

```bash
npm run doctor
```

将请求 `SUPERTOKENS_CONNECTION_URI/hello` 检测 Core；若配置了 `DATABASE_URL` 则再执行 `SELECT 1` 检测 PG。失败时脚本会优先提示裸机方案，并附带可选的 Docker 说明。

### 无容器一键闭环（登录 + 邮箱门禁）

当你暂时不启 Docker 时，可直接运行：

```bash
npm run doctor:no-docker
```

该脚本会：
- 默认使用当前环境层中的 `SUPERTOKENS_CONNECTION_URI`（`doctor:no-docker` 默认 simple -> `.env.generated`；`doctor:no-docker:overlay` 才会叠加 `backend/.env`）
- 自动启动本机 SMTP Mock（默认 `127.0.0.1:2525`）并注入 `SUPERTOKENS_SMTP_*`
- 顺序执行 `doctor:auth-closure`、`doctor`、`doctor:e2e-auth-mail-gate`

常用覆盖变量：
- `DOCTOR_SUPERTOKENS_CONNECTION_URI`
- `DOCTOR_MOCK_SMTP_HOST`
- `DOCTOR_MOCK_SMTP_PORT`
- `DOCTOR_MOCK_SMTP_USER`
- `DOCTOR_MOCK_SMTP_PASS`

### 本地 Core 进程控制（无容器）

在 `backend` 目录可直接控制本地 SuperTokens Core：

```bash
npm run supertokens:local:start
npm run supertokens:local:status
npm run supertokens:local:stop
```

默认从 `backend/.cache/supertokens-layer/l6_full/usr/lib/supertokens` 启动（可用 `SUPERTOKENS_LOCAL_CORE_HOME` 覆盖）；日志写入 `backend/.runtime/supertokens-core-local.{out,err}.log`。

## SuperTokens Core：裸机（推荐）/ Docker（可选）

| 方式 | 说明 |
|------|------|
| **裸机（无容器）** | 从 [SuperTokens 文档](https://supertokens.com/docs) 进入 **Self-host / Deployment**，下载对应系统的 **SuperTokens Core**，按官方说明配置元数据库并启动，默认监听 `3567`。`backend/.env` 中 `SUPERTOKENS_CONNECTION_URI=http://127.0.0.1:3567`（若改端口则同步修改 URI）。 |
| **Docker（可选）** | 在 **`重构`** 目录：`docker compose up -d supertokens-db supertokens`，连接串同上。 |

`supertokens-node` 已集成在本仓库后端内；**不可**把 Core 合并进单个 Node 进程，但必须保证 Core 在运行且 URI 正确。

## 可选 PostgreSQL（网站扩展表）

| 方式 | `DATABASE_URL` 示例 |
|------|---------------------|
| **裸机** | 本机安装 PostgreSQL 并建库后，例如 `postgres://用户:密码@127.0.0.1:5432/starmc_site` |
| **Docker（可选）** | `docker compose up -d site-postgres` 后示例：`postgres://starmc:starmc@127.0.0.1:5433/starmc_site` |

迁移：`npm run db:migrate`（或在 `PG_MIGRATE_ON_START` 开启时随 `npm run start` 自动执行）。

## Linux Quick Start

```bash
cd backend
npm install
npm run start
```

Default ports:
- API: `8787`
- Plugin stub: `8788`

Health endpoints:
- `GET https://www.star-web.top/api/health`
- `GET https://www.star-web.top/healthz` (compat)
- `GET http://127.0.0.1:8788/healthz`

If ports are occupied on Linux:

```bash
PORT=8797 PLUGIN_PORT=8798 npm run start
```

## Windows Quick Start（PowerShell）

```powershell
cd backend
npm install
npm run start
```

若你明确需要手工覆盖：

```powershell
Copy-Item .env.example .env
# 按需编辑 .env（SuperTokens、可选 DATABASE_URL、VLA 等）
npm run start
```

端口被占用时：

```powershell
$env:PORT=8797; $env:PLUGIN_PORT=8798; npm run start
```

`npm run doctor` 现在默认检查 simple flow；若你要排查覆盖层，使用 `npm run doctor:overlay`。

## Frontend Proxy（Linux / Windows）

在 `重构` 根目录复制 `.env.development.local.example` 为 `.env.development.local`，按需调整：

```bash
VITE_LOCAL_API_TARGET=https://www.star-web.top
VITE_LOCAL_PLUGIN_TARGET=https://www.star-web.top
```

然后在前端根目录启动：

```bash
cd ..   # 回到 重构（与 backend 同级）
npm install
npm run dev
```

## API 契约文档

- 统一响应、分页兼容、错误码注册表：`docs/api-contract.md`
- AuthX/VLA 管理代理 OpenAPI：`docs/openapi/authx.yaml`

## Velocity-Limbo-Auth（VLA）联调

插件能力、HTTP 路径、Java/Velocity 版本与 `velocity35` profile 说明见仓库内 **`velocity-limbo-auth/src/main/resources/config.yml` 顶部注释（中英对照）**。  
**English:** See the **config.yml header (CN/EN)** under `velocity-limbo-auth/src/main/resources/` for runtime pairing and API routes.

与本仓库 `velocity-test` 示例一致时，可设：

- `AUTHX_PLUGIN_ADAPTER=vla`
- `AUTHX_PLUGIN_BASE=http://127.0.0.1:8090`（与 VLA `http-api.port` 一致）
- `AUTHX_VLA_API_KEY` = VLA `http-api.api-key`

插件 `outbound-webhooks` 可指向以下 endpoint（推荐使用版本化路径）：

- `https://www.star-web.top/api/v1/plugin/callback`（推荐）
- `https://www.star-web.top/api/plugin/authx/callback`（兼容，已弃用，将返回 `Sunset` / `Deprecation` 头）

绑定邮箱 webhook 同理：

- `https://www.star-web.top/api/v1/plugin/bind-email`（推荐）
- `https://www.star-web.top/api/plugin/authx/bind-email`（兼容，已弃用）

单 endpoint 用 `AUTHX_VLA_WEBHOOK_SECRET`；多个 endpoint 使用不同 `secret` 时，用 `AUTHX_VLA_WEBHOOK_SECRETS`（每行一个，或一行内 `secret1|secret2`），验签时**任一条**匹配即可（密钥若含 `|` 请只用换行分隔）。`8787` 是后端默认 `PORT`；若临时测试改用其它端口（如 doctor/no-docker 脚本），插件回调 URL 与 `skin.custom-profile-url` 必须同步改回实际监听端口。

若 VLA 开启 `write-security.require-hmac`，另设 `AUTHX_VLA_HMAC_SECRET`（与插件 `hmac-secret` 一致），后端转发 POST 时会自动加 `X-VLA-Timestamp` / `X-VLA-Signature`。

管理端代理：`GET /api/admin/authx/plugin-metrics`（Prometheus）、`POST /api/admin/authx/kick-online`（踢当前在线）。`GET /api/admin/authx/plugin-health` 在 VLA 返回 JSON 时附带 `plugin.parsed`（如 `database_ok`、`version`）。

已登录用户（Bearer + 已验证邮箱）：`GET /api/user/mc-account`、`/api/user/mc-profiles`、`/api/user/mc-security-events` 代理 VLA 只读接口，`external_user_id` 固定为网站用户 id，无需浏览器持有插件 API Key；限流见环境变量 `RATE_LIMIT_MC_USER`。

管理端（`X-Admin-Secret`）：`ban-check` / `user-exists` / `ban`；另支持 `delete-user`、`skin-refresh`、`link-external-user`（对应 VLA 注销、皮肤同步、网站主键绑定）。只读 GET 限流 `RATE_LIMIT_ADMIN_PLUGIN_GET`。详见 `docs/openapi/authx.yaml`。

### Minecraft 绑定验证会话（前后端闭环契约）

- `GET /api/user/minecraft/status` 同时返回：
  - 兼容字段：`verifySession`（旧前端可继续使用）
  - 增强字段：`verifyState = { status, failureReason, conflictCode, retryCount, maxRetries, createdAt, expiresAt, hasActiveSession, lastState }`
- `POST /api/user/minecraft/verify/init`：
  - 活跃会话冲突：`409` + `code=session_conflict`
  - 超出重试链上限：`429` + `code=verify_max_retries_exceeded`，并附带 `details.retryAfterSeconds/retryCount/maxRetries`
  - 支持 `force=true` 强制替换旧会话（旧会话归档为 `cancelled`，`conflictCode=session_replaced`）
- `POST /api/user/minecraft/verify/cancel`：返回最新状态快照 `state`（含 `status/failureReason/conflictCode/retryCount/maxRetries/hasActiveSession/lastState`）
- `GET /api/user/minecraft/binding-history`：返回绑定与验证相关审计历史（支持 `page/pageSize/action/q`）
- `GET /api/user/minecraft/verify-history`：返回验证会话状态机历史（支持 `page/pageSize/status`）
- `POST /api/user/unlink-minecraft` 支持可选 `reason` 字段并持久化到审计记录（`maxLength=180`）

状态机：`pending -> succeeded | failed | expired | cancelled`，并通过 `failureReason` + `conflictCode` 细分失败与冲突原因（用于前端精细提示与重试策略）。

### 皮肤目录实时刷新（推送 + 轮询兜底）

- `GET /api/skins/library/stream`：SSE 实时推送目录版本变化（`hello` / `catalog_sync` / `heartbeat`）
- `GET /api/skins/library/sync-status`：新增 `sync={syncedAt,version,etag,lastModified,totalItems}` 与 `realtime={enabled,streamPath,activeClients}`
- 前端建议策略：优先订阅 SSE，收到 `catalog_sync` 后再拉取 `/api/skins/library/search`；SSE 断开时回退到既有定时轮询。

### 权限错误响应统一

- 角色权限拦截统一返回 `403` + `code=forbidden`，并在 `details` 中携带：
  - `requiredRoles`: 当前接口要求的角色列表
  - `actualRoles`: 当前登录用户实际角色
  - `requiredCapability`: 可选，标识接口能力（如 `manage_admin`、`review_submissions`）
- 这样前端可以按能力展示更明确的“缺少权限”提示，而不仅是通用报错文案。

### 投稿审核闭环（状态机与回传）

- 审核相关接口：
  - `POST /api/skins/submissions/:id/:action(approve|reject)`
  - `POST /api/skins/submissions/:id/reopen`
  - `POST /api/skins/player/submissions/:id/resubmit`
  - `GET /api/skins/submissions/audit-logs`（审核日志分页查询）
  - `GET /api/skins/submissions/audit-logs/export`（审核日志 CSV 导出）
- 统一约束：
  - `expectedVersion` 如传入，必须是 `>= 0` 的整数；非法时返回 `400 validation_error`（`details.field=expectedVersion`）
  - 版本冲突统一返回 `409 version_conflict`，并附带 `details.expectedVersion/actualVersion/submissionId`
  - 状态不允许转换时返回 `409`（如 `already_reviewed`/`already_pending`），并附带 `details.currentStatus/requestedAction`（以及必要的 `requiredStatus`/`allowedFrom`）
- 审核成功返回中附带：
  - `transition = { from, to, action }`
  - `notify = { queued, notificationId }`（用于前端确认通知是否已入站内消息队列）
- 审核历史字段标准化持久化：`action/statusBefore/statusAfter/operatorId/operatorName/note/at`
- 审核审计日志统一字段：`submissionId/title/action/operator/note/statusBefore/statusAfter/before/after/time/ip`
- 通知中心补充：
  - `GET /api/user/notifications/types` 返回通知类型聚合（`type/label/total/unread`），用于前端“按类型筛选”与未读角标展示

## Notes

- Server listens on `0.0.0.0`, so it works in containers and remote Linux hosts.
- Plugin refresh route accepts both header names for compatibility:
  - `X-Skin-Bridge-Secret`
  - `X-SkinBridge-Secret`

## 生产部署（Linux）

见 **`../deploy/linux/README.md`**（`systemd`、Nginx、`rsync`、生产环境变量示例）。

## Lint 与自检

```bash
npm run lint
npm run verify   # lint + 单元测试
```

## 模块结构（重构后）

当前后端已按业务域拆分模块，`server.js` 主要负责中间件装配与路由注册：

- `src/modules/security/`
  - `routes.js`：安全中心 HTTP 路由
  - `service.js`：告警统计、趋势、会话/告警状态变更等逻辑
  - `index.js`：模块统一导出
- `src/modules/authxAdmin/`
  - `routes.js`：AuthX 管理代理路由
  - `service.js`：代理响应归一化（JSON/Text 与状态码）
  - `index.js`：模块统一导出
- `src/modules/skin/`
  - `routes.js`：皮肤大厅/投稿/玩家面板与上传应用接口
  - `service.js`：投稿标准化、审核审计辅助逻辑
  - `index.js`：模块统一导出

设计约定：
- `routes` 层只做参数解析、鉴权、HTTP 响应；
- 业务计算与可复用逻辑下沉到 `service`；
- 避免在 `server.js` 再次内联同类逻辑，防止重复实现。

## 测试策略（最小回归护栏）

在既有测试基础上，新增了模块相关 smoke 测试：

- `tests/security-module-smoke.test.js`
- `tests/skin-module-smoke.test.js`
- `tests/authx-admin-module-smoke.test.js`
- `tests/module-routes-register-smoke.test.js`

脚本说明：
- `npm test`：自动发现并运行 `tests/*.test.js`
- `npm run test:modules`：仅运行模块相关 smoke（重构时快速回归）

目标：在持续重构阶段，优先保证“模块核心函数行为与路由装配不回归”。

建议流程：
1. 模块改动先跑 `npm run test:modules`；
2. 提交前跑 `npm run verify`；
3. 继续拆分时先补 smoke，再迁移路由，降低回归风险。

## 下一轮重构优先级（建议）

1. 提取通用代理层（AuthX/Plugin）
   - 把重复的 `pluginFetch* + status mapping` 进一步抽为可复用 helper。
2. 清理 `server.js` 剩余可迁移路由块
   - 保持入口文件专注于装配，减少业务分支。
3. 为高风险路径补集成级测试
   - 优先：`/api/security/center`、`/api/public/skin-profile/:mcSegment`、管理端审核流。
4. 引入模块边界约束（lint 规则或目录约定）
   - 明确禁止跨域直接读写内部实现，仅通过模块导出访问。
