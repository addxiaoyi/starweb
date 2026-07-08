# StarVC 迁移 SQLite 续接说明

## 当前结论

这轮不是从零设计，仓库里已经有一半以上的迁移骨架：

1. `starx-common` 已有 `sourceSystem`、`migrationState`、`passwordMigratedAt` 三个迁移字段。
2. `JdbiUserRepository` 已支持迁移状态统计、来源系统统计、密码迁移时间更新。
3. `UniAuthBridge` 已实现“本地优先，UniAuth 回退，成功后落本地哈希”的主链路。
4. `MigrationModule` 与 `MigrationCommands` 已预留 `StarVC import-meta` 和 `migrate-status`。
5. `DatabaseManager` 已支持 SQLite，并且会在 SQLite 模式下启用 WAL / NORMAL / foreign_keys / busy_timeout。

也就是说，真正缺的不是“再写一版方案”，而是把现有实现从 `H2 + 示例导入` 收敛到 `SQLite + 可执行迁移`。

## 已落地部分

### 认证与桥接

- `starx-common/src/main/java/io/github/addxiaoyi/starx/common/auth/AuthService.java`
- `starx-common/src/main/java/io/github/addxiaoyi/starx/common/auth/uniauth/UniAuthBridge.java`
- `starx-common/src/main/java/io/github/addxiaoyi/starx/common/auth/uniauth/UniAuthClient.java`

### 数据模型与仓储

- `starx-common/src/main/java/io/github/addxiaoyi/starx/common/model/StarxUser.java`
- `starx-common/src/main/java/io/github/addxiaoyi/starx/common/database/JdbiUserRepository.java`
- `starx-common/src/main/resources/db/migration/V4__add_migration_fields.sql`

### Velocity 侧入口

- `starx-velocity/src/main/java/io/github/addxiaoyi/starx/velocity/module/auth/AuthModule.java`
- `starx-velocity/src/main/java/io/github/addxiaoyi/starx/velocity/module/auth/MigrationModule.java`
- `starx-velocity/src/main/java/io/github/addxiaoyi/starx/velocity/module/auth/MigrationCommands.java`

## 现状与设计的关键差距

### 1. 认证主库仍然是 H2，不是 SQLite

`AuthModule.initDatabase()` 目前直接写死：

- 数据库类型：`h2`
- 路径：`auth-db`
- URL：`jdbc:h2:file:...`

这与“SQLite 本地为主”的迁移目标直接冲突。`DatabaseManager` 已经支持 SQLite，但 `AuthModule` 还没有切过去。

### 2. StarVC 元数据导入还是示例 SQL

`MigrationModule.importStarVCMeta()` 当前使用的是示例查询：

```sql
SELECT uuid, username, email FROM starvc_users
```

这只能说明入口已经搭起来了，不能说明已经能迁真实 StarVC 数据。

### 3. UniAuth 迁移更新存在 UUID 选错风险

`UniAuthBridge.authenticateWithUniAuthAndMigrate(...)` 在“用户名已存在但未完成迁移”的分支里，用的是登录时传入的 `uuid` 去更新密码和迁移状态，而不是 `existingUser.uuid()`。

如果导入阶段保存的 UUID 与当前登录侧拿到的 UUID 不一致，更新可能落不到已导入那条记录上。这是当前最需要先修掉的逻辑点。

### 4. 迁移统计口径偏宽

`/authx migrate-status` 当前使用：

- 总用户数
- `pending`
- `completed`
- `source_system = starvc`

如果库里同时存在本地注册用户，`completed / total` 这个百分比会把非 StarVC 用户也算进去，迁移进度会被稀释。

### 5. 现有链路还是“用户名优先 + UUID 辅助”，UUID 归一规则未定稿

当前仓储里同时有：

- `findFullByUuid`
- `findFullByUsername`
- `existsByUuid`
- `existsByUsername`

但设计文档里原本区分过 `online_uuid` / `offline_uuid` / `current_uuid`。现有代码尚未真的进入这一步，说明第一阶段更适合先保持单 UUID 模型，把桥接跑通，再决定是否扩到三 UUID 结构。

## 建议的续接策略

先把目标收紧为：

1. 第一阶段不重构成三 UUID 复杂模型。
2. 先保留当前 `uuid + username + source_system + migration_state + password_migrated_at` 模型。
3. 优先完成“SQLite 化 + StarVC 元数据导入可用 + 首登迁移闭环”。
4. 等闭环稳定后，再评估是否升级为 `online_uuid/offline_uuid/current_uuid` 三字段模型。

这条路更贴合现有仓库，改动也最稳。

## 下一轮实现顺序

### P0：必须先做

1. 修复 `UniAuthBridge` 更新已导入用户时使用错误 UUID 的问题，更新目标改为 `existingUser.uuid()`。
2. 把 `AuthModule` 从写死 H2 改为读取统一数据库配置，默认落到 `plugins/starx/data.db`。
3. 确认 SQLite 默认连接池上限固定为 2，并复用 `DatabaseManager` 现有 WAL 配置。
4. 校正 `migrate-status` 的进度口径，改成 `completed_starvc / total_starvc`。
5. 明确 StarVC 实际表结构后，替换 `importStarVCMeta()` 的示例 SQL。

### P1：闭环可用

6. 导入元数据时把用户统一标记为 `source_system=starvc`、`migration_state=pending`。
7. 首次登录桥接成功后一次性写入 `password_hash`、`password_migrated_at`、`migration_state=completed`。
8. UniAuth 成功建档时补全 `email` 与 `premium` 映射规则。
9. 为“已导入 pending 用户首登成功”补集成测试。
10. 为“本地已完成迁移用户不再访问 UniAuth”补测试。
11. 为“UniAuth 不可用但本地已迁移用户仍可登录”补测试。
12. 为“SQLite WAL 已启用”补数据库测试。

### P2：运维与可回滚

13. 增加导入前源表探测与友好报错，避免表名不匹配时直接炸栈。
14. 给 `import-meta --dry-run` 增加样本统计输出。
15. 增加桥接状态查看命令，例如 `/authx bridge status`。
16. 增加桥接开关命令或配置热读取能力。
17. 增加迁移失败审计日志，至少包含用户名、来源、失败原因。
18. 增加 SQLite 备份/恢复说明和 checkpoint 运维文档。

### P3：第二阶段再考虑

19. 评估是否需要升级为 `online_uuid` / `offline_uuid` / `current_uuid` 三字段模型。
20. 如果确实需要，再单独设计 V5/V6 迁移脚本，避免第一阶段把链路复杂化。

## 我对下一步的明确建议

如果继续往下做，实现顺序就按下面三项开工：

1. 先修 `UniAuthBridge` 的 UUID 更新目标。
2. 再把 `AuthModule` 切到 SQLite 默认配置。
3. 然后根据真实 StarVC 表结构完成 `importStarVCMeta()`。

这样能最快得到一个真正可跑的“导入元数据 -> 首登桥接 -> 本地化完成”的最小闭环。
