# StarMC 项目健康报告

> 报告日期：2026-07-02
> 统计范围：StarMC 网站与皮肤站前端（`重构/`）+ 后端（`重构/backend`）+ VLA 插件联动

---

## 执行摘要

本次 P2 优化已完成事件总线解耦，将 VLA 插件入站回调与 `authxAdmin` 出站管理命令从直接服务调用迁移到进程内事件总线。所有 subscriber 集中注册，入站路由只负责验签与发布事件，业务副作用下沉到领域 subscriber。全仓库测试通过，无新增 lint 警告。

---

## 1. 架构健康度

### P2. 事件总线解耦 VLA 与 Web 后端

**状态**：已完成

**说明**：

- 新增 `重构/backend/src/modules/event-bus/` 模块，含类型化事件总线与 5 个领域 subscriber：
  - `vlaCommandSubscriber`：统一执行 VLA 出站命令并发布完成/失败事件
  - `authSubscriber`：处理插件回调中的登录、验证、安全告警
  - `bindEmailSubscriber`：处理插件邮箱绑定回调
  - `skinRefreshSubscriber`：处理皮肤刷新事件转发
  - `securitySubscriber`：消费领域事件写入安全审计、告警、通知
- `plugin-gateway` 验签后仅发布事件，不再直接调用业务服务。
- `authxAdmin` 管理端 POST 命令通过事件总线发布，由 `vlaCommandSubscriber` 统一转发 VLA。
- `server.js` 通过 `registerEventBusSubscribers` 集中注册所有 subscriber，避免 API/Plugin 应用创建顺序导致副作用缺失。
- 新增 event-bus 单元测试与集成 smoke 测试，全仓库 286 个测试通过。

---

## 2. 测试与质量

| 指标 | 状态 |
|------|------|
| 后端单元/集成测试 | 286 通过 / 0 失败 |
| ESLint | 0 error / 0 warning |
| 事件总线单元测试 | 覆盖 `subscribe/publish/once/publishAndWait`、超时、handler 错误 |
| 集成 smoke 测试 | 覆盖 callback → auth → security 链路、bind-email → VLA 命令、skin-refresh 转发、非 VLA 适配器跳过 |

---

## 3. 风险与后续建议

### 已缓解风险

- **行为等价性**：`bind-email` webhook 由 fire-and-forget 改为 `publishAndWait` request/reply，保留同步错误反馈，与原始服务行为一致。
- ** subscriber 注册顺序**：`registerEventBusSubscribers` 在 `main()` 中于 API/Plugin 应用创建前调用，消除隐式依赖。
- **错误可见性**：事件总线捕获 subscriber 错误并发布 `EVENT_HANDLER_FAILED`，日志与测试均已覆盖。

### 后续建议

1. **监控告警**：生产环境建议对 `EVENT_HANDLER_FAILED` 事件增加计数告警。
2. **长期演进**：若未来需要跨进程事件通信，可在此事件总线抽象上扩展 Redis/RabbitMQ 适配器，而不改动 subscriber 实现。
3. **文档维护**：OpenAPI 中 `/api/v1/plugin/bind-email` 已更新为同步返回绑定结果，前端与插件文档需同步确认。

---

## 4. 关键变更文件清单

- `重构/backend/src/modules/event-bus/`（新增）
- `重构/backend/src/modules/plugin-gateway/handlers.js`
- `重构/backend/src/modules/plugin-gateway/skinRefresh.js`
- `重构/backend/src/modules/authxAdmin/routes.js`
- `重构/backend/src/server.js`
- `重构/backend/tests/unit/modules/event-bus/subscribers/*.spec.js`
- `重构/backend/tests/integration/event-bus-subscribers.spec.js`
- `重构/backend/README.md`
- `重构/backend/docs/openapi/authx.yaml`
- `docs/PROJECT_HEALTH_REPORT_2026-07-02.md`
