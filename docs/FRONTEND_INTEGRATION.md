# 新前端对接指南

更新时间：2026-07-11

本文档面向前端开发者，说明如何对接 `重构/backend` 提供的 JSON API。通用响应格式与错误码详见 `docs/api-contract.md`。

## 1. 环境准备

### 1.1 Vite 代理配置

本地开发时，前端 `vite.config.ts` 需将 `/api` 代理到后端：

```ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
```

### 1.2 环境变量生成

运行以下命令自动生成前端 `.env` 文件：

```bash
npm run config:frontend-env
```

生成的变量包括 `VITE_API_BASE`、`VITE_PUBLIC_SITE_ORIGIN` 等。

## 2. 认证与会话

所有需登录的接口依赖 SuperTokens 会话 Cookie（`sAccessToken`），请求需携带 `credentials: 'include'`。

```ts
const res = await fetch('/api/user/me', {
  credentials: 'include',
});
```

### 2.1 认证状态检查

`GET /api/auth/status` — 检查 SuperTokens / SMTP 就绪状态。

### 2.2 登录流程

1. `POST /api/auth/verify-code/send` — 发送邮箱验证码
2. `POST /api/auth/verify-code/confirm` — 确认验证码并建立会话

## 3. SPA 启动引导

`GET /api/public/bootstrap` 返回功能开关、认证能力、实时通道与端点索引，建议作为 SPA 初始化时的首个请求。

```ts
const bootstrap = await fetch('/api/public/bootstrap').then(r => r.json());
// bootstrap.features — 功能开关
// bootstrap.auth — 认证配置
// bootstrap.endpoints — 后端端点索引
// bootstrap.realtime — SSE / 轮询配置
```

## 4. 统一响应处理

### 4.1 成功判定

```ts
if (data.ok === true) {
  // 成功
}
```

### 4.2 错误处理

```ts
if (!data.ok) {
  // data.code — 机器可判定错误码
  // data.message — 可展示提示文本
  // data.details — 可选结构化上下文
  switch (data.code) {
    case 'validation_error':
      // 参数错误
      break;
    case 'version_conflict':
      // 提示刷新后重试
      break;
    default:
      showToast(data.message);
  }
}
```

### 4.3 分页读取

```ts
// 推荐使用 pagination 对象
const { items, pagination } = data;
// pagination.total, pagination.page, pagination.pageSize
// pagination.totalPages, pagination.hasMore, pagination.hasPrev

// 兼容方式
const { items, total, page, pageSize } = data;
```

## 5. 模块端点速查

### 5.1 用户与权限

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/user/me` | 需登录 | 当前用户资料 |
| GET | `/api/user/permissions` | 需登录 | 角色与能力 |
| GET | `/api/user/center/summary` | 需登录 | 个人中心聚合 |

### 5.2 安全中心

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/security/center` | 需登录 | 安全中心仪表盘 |
| GET | `/api/user/sessions` | 需登录 | 活跃会话列表 |
| GET | `/api/security/login-history` | 需登录 | 登录历史（分页） |
| POST | `/api/security/sessions/:sessionId/revoke` | 需登录 | 撤销单个会话 |
| POST | `/api/security/sessions/revoke-all` | 需登录 | 撤销所有其他会话 |
| GET | `/api/security/alerts` | 需登录 | 安全告警列表（分页） |

### 5.3 玩家统计

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/server/player-stats` | 公开 | 服务器玩家统计 |

### 5.4 披风

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/cape/search` | 公开 | 披风搜索（分页） |
| POST | `/api/cape/apply` | 需登录 | 申请/取消披风 |

### 5.5 QQ 模块

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/qq/guild-info` | 公开 | QQ 频道信息 |
| POST | `/api/qq/verify` | 需登录 | 兼容占位，始终提示必须通过 NapCat 私聊验证；不写入账号 |
| GET | `/api/qq/profiles/:qq` | 需登录 | 查询 QQ 档案 |

### 5.6 皮肤库

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/skins/library/stream` | — | 皮肤库 SSE |
| GET | `/api/skins/library/sync-status` | — | 同步状态轮询 |
| GET | `/api/public/skin-profile/:mcSegment` | 公开 | 公开皮肤档案 |

### 5.7 管理端

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/admin/reports` | 需管理员 | 举报列表 |
| GET | `/api/admin/reports/:id` | 需管理员 | 举报详情 |
| PATCH | `/api/admin/reports/:id` | 需管理员 | 更新举报状态 |
| PATCH | `/api/admin/skins/reports/:id` | 需管理员 | 更新举报状态（兼容路径） |
| GET | `/api/skins/submissions/stats` | 需审核员/管理员 | 投稿审核统计 |
| POST | `/api/skins/submissions/:id/:action` | 需审核员/管理员 | 单条审核 |
| POST | `/api/skins/submissions/batch/:action` | 需审核员/管理员 | 批量审核 |
| GET | `/api/admin/authx/bridge-status` | X-Admin-Secret | 插件桥接诊断 |

### 5.8 遥测

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/metrics/web-vitals` | — | Core Web Vitals 上报 |
| POST | `/api/telemetry` | — | 路由/事件遥测 |

## 6. 实时数据

皮肤库使用 Server-Sent Events (SSE) 推送 `catalog_sync` 和 `heartbeat` 事件：

```ts
const es = new EventSource('/api/skins/library/stream');
es.addEventListener('catalog_sync', (e) => {
  const data = JSON.parse(e.data);
  // 刷新皮肤列表
});
```

降级轮询：`GET /api/skins/library/sync-status`，推荐间隔 15 秒（来自 `bootstrap.realtime.recommendedPollMs`）。

## 7. 常见错误码速查

| code | HTTP | 说明 |
|------|------|------|
| `validation_error` | 400 | 参数非法 |
| `forbidden` | 403 | 权限不足 |
| `not_found` | 404 | 资源不存在 |
| `too_many_requests` | 429 | 触发限流 |
| `session_conflict` | 409 | 验证会话冲突 |
| `version_conflict` | 409 | 审核版本冲突 |

完整错误码注册表见 `docs/api-contract.md` 第 5 节。
