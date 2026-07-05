# StarVC 迁移到 SQLite 设计方案

## 概述

本方案描述了如何将 StarVC (UniAuth) 认证系统迁移到本地化的 SQLite (WAL 模式) 认证系统。

---

## 核心原则

1. **SQLite 本地为主：所有用户数据存储在本地 SQLite 数据库
2. **UniAuth 仅作为迁移桥接：用户首次登录时验证并同步密码
3. **渐进式迁移：无需强制重置密码，平滑过渡
4. **高性能：使用 SQLite WAL 模式支持高并发读

---

## 架构总览

```plaintext
┌──────────────────────────────────────────────────────────────┐
│                        AuthModule                            │
│          (认证流程编排：PreLogin → Limbo → 登录/注册)         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │UniAuthBridge │  │YggdrasilModule│  │FloodgateModule│  │
│  │ 首次登录验证   │  │ REQUEST模式   │  │ 基岩版检测     │  │
│  │ 密码本地存储   │  │ 并行检查+缓存 │  │               │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                    │                    │         │
│         └────────────────────┼────────────────────┘         │
│                              │                              │
│                 ┌─────────────┴─────────────┐                    │
│                 │   AuthService         │                    │
│                 │ (BCrypt/TOTP/防爆破)   │                    │
│                 └─────────────┬─────────────┘                    │
│                              │                              │
│                 ┌─────────────┴─────────────┐                    │
│                 │  JdbiUserRepository     │                    │
│                 │  (starx_users 表       │                    │
│                 └─────────────┬─────────────┘                    │
│                              │                              │
│                 ┌─────────────┴─────────────┐                    │
│                 │   SQLite (WAL)          │                    │
│                 │  plugins/starx/data.db    │                    │
│                 └───────────────────────────┘                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              MigrationModule                        │  │
│  │  /authx migrate starvc → 导入 UUID + 认证方法     │  │
│  │  /authx migrate-status → 查看迁移进度              │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 数据库设计

### SQLite 配置

- **数据库文件**：`plugins/starx/data.db`
- **WAL 模式**：启用（默认）
- **PRAGMA 设置**：
  - `journal_mode=WAL`
  - `synchronous=NORMAL`
  - `cache_size=-2000`
  - `foreign_keys=ON`

### 表结构

#### starx_users（用户表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PRIMARY KEY AUTOINCREMENT | 用户ID |
| player_name | VARCHAR(16) | NOT NULL UNIQUE | 玩家名 |
| online_uuid | VARCHAR(36) | UNIQUE | 正版UUID |
| offline_uuid | VARCHAR(36) | UNIQUE | 离线UUID |
| current_uuid | VARCHAR(36) | NOT NULL UNIQUE | 当前使用UUID |
| password_hash | VARCHAR(255) | NULL | BCrypt密码哈希（本地认证） |
| password_migrated_at | TIMESTAMP | NULL | 密码迁移时间 |
| email | VARCHAR(255) | NULL | 邮箱 |
| premium | BOOLEAN | DEFAULT 0 | 是否正版 |
| bedrock | BOOLEAN | DEFAULT 0 | 是否基岩版 |
| totp_secret | VARCHAR(32) | NULL | TOTP密钥 |
| totp_enabled | BOOLEAN | DEFAULT 0 | TOTP启用状态 |
| failed_attempts | INT | DEFAULT 0 | 失败尝试次数 |
| locked_until | TIMESTAMP | NULL | 锁定到 |
| source_system | VARCHAR(50) | DEFAULT 'starvc' | 来源系统 |
| migration_state | VARCHAR(20) | DEFAULT 'pending' | 迁移状态（pending/migrated/completed） |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| last_login_at | TIMESTAMP | NULL | 最后登录时间 |

#### auth_identities（认证身份表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PRIMARY KEY AUTOINCREMENT | ID |
| user_id | BIGINT | NOT NULL, FOREIGN KEY | 关联用户 |
| identity_type | VARCHAR(20) | NOT NULL | 身份类型（uniauth/yggdrasil/floodgate） |
| identity_id | VARCHAR(255) | NOT NULL | 身份ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

#### migration_jobs（迁移任务表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PRIMARY KEY AUTOINCREMENT | ID |
| job_type | VARCHAR(50) | NOT NULL | 任务类型 |
| status | VARCHAR(20) | DEFAULT 'pending' | 状态 |
| total_count | INT | DEFAULT 0 | 总数 |
| success_count | INT | DEFAULT 0 | 成功数 |
| failed_count | INT | DEFAULT 0 | 失败数 |
| started_at | TIMESTAMP | NULL | 开始时间 |
| completed_at | TIMESTAMP | NULL | 完成时间 |
| error_message | TEXT | NULL | 错误信息 |

#### login_audit（登录审计表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PRIMARY KEY AUTOINCREMENT | ID |
| user_id | BIGINT | NULL, FOREIGN KEY | 用户ID |
| player_name | VARCHAR(16) | NOT NULL | 玩家名 |
| ip_address | VARCHAR(45) | NULL | IP地址 |
| login_type | VARCHAR(20) | NOT NULL | 登录类型 |
| success | BOOLEAN | NOT NULL | 是否成功 |
| error_message | VARCHAR(255) | NULL | 错误信息 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 时间 |

---

## 模块设计

### 1. AuthModule（认证模块）

**职责**：
- 处理 PreLogin 事件
- 检测 Floodgate
- 检测 Yggdrasil 验证
- 本地认证 / UniAuth 桥接
- 发送到 Limbo

**核心流程**：
1. 玩家连接 → PreLoginEvent
2. 检测 Floodgate → 如果是，跳过正版验证
3. 检测 Yggdrasil → 如果是正版，并行验证
4. 查询本地用户
   - 有本地密码 → 本地 BCrypt 验证
   - 无本地密码 → 走 UniAuthBridge
5. 验证通过 → 保存 BCrypt 到本地 → 设置 migration_state=completed
6. 进入 Limbo → 完成登录

### 2. UniAuthBridge（UniAuth 桥接模块）

**职责**：
- 连接 bmmc.cc:8500
- RSA 加密通信
- 首次登录验证
- 密码迁移到本地

**API 协议**：
```
POST /api/auth/login
  - username: String
  - password: String (RSA 加密)
  ↓
  Response:
    - success: Boolean
    - uuid: String
    - username: String
    - email: String?
    - premium: Boolean
```

**桥接流程**：
```
用户首次登录:
  ├─ 本地查询用户存在
  │   ├─ 有 password_hash → 本地验证
  │   └─ 无 password_hash → UniAuth 验证
  │       ├─ UniAuth 成功 → 本地 BCrypt 加密存储
  │       └─ UniAuth 失败 → 返回错误
  └─ 本地用户不存在
      ├─ UniAuth 验证
      ├─ 创建本地用户
      └─ 存储 BCrypt 哈希
```

### 3. MigrationModule（迁移模块）

**职责**：
- 从 StarVC 本地数据库导入 UUID 映射
- 导入 auth_methods
- 迁移进度查询

**命令**：
```
/authx migrate starvc import-meta
/authx migrate starvc import-uuid
/authx migrate-status
/authx bridge status
/authx bridge disable
```

**StarVC 数据库表**（假设）：
- `uuiddata`: UUID 映射
- `auth_methods`: 认证方法

### 4. YggdrasilModule（Yggdrasil 模块）

**职责**：
- Mojang / LittleSkin 外置认证
- REQUEST 模式并行检查
- 短期缓存（5分钟）

### 5. FloodgateModule（Floodgate 模块）

**职责**：
- 基岩版玩家自动检测
- 跳过正版验证
- Floodgate UUID 处理

### 6. TabIntegrationModule（TAB 集成模块）

**职责**：
- 注册占位符
- `%starx_auth_status%`
- `%starx_migration_state%`

---

## 迁移策略

### 阶段 1：准备阶段

1. 配置 SQLite (WAL) 数据库
2. 创建表结构
3. 配置 UniAuth 桥接

### 阶段 2：元数据迁移

1. 从 StarVC 本地数据库读取
2. 导入 uuiddata 和 auth_methods
3. 创建本地用户记录（无密码哈希）
4. 设置 migration_state=pending

### 阶段 3：渐进式密码迁移

1. 用户首次登录时走 UniAuth
2. 验证成功后，本地存储 BCrypt
3. 设置 migration_state=completed

### 阶段 4：完成迁移

1. 监控迁移进度
2. 大部分用户迁移完成后
3. 禁用 UniAuth 桥接
4. 完全本地认证

---

## 配置示例

```yaml
database:
  type: sqlite
  file: plugins/starx/data.db
  wal: true

auth:
  uniauth:
    enabled: true
    endpoint: http://bmmc.cc:8500
    rsa_public_key: |
      -----BEGIN PUBLIC KEY-----
      ...
      -----END PUBLIC KEY-----

  yggdrasil:
    enabled: true
    servers:
      - mojang
      - littleskin

  floodgate:
    enabled: true

modules:
  auth:
    enabled: true
  migration:
    enabled: true
```

---

## 风险与注意事项

1. **WAL 文件管理
   - 定期 checkpoint
   - 备份策略
2. **UniAuth 不可用时的处理
   - 本地已有密码的用户不受影响
   - 新用户或未迁移用户无法登录
3. **数据一致性
   - 迁移过程中元数据先导入
   - 密码渐进式迁移

---

## 实施步骤

详见 `2026-07-05-starvc-sqlite-migration-plan.md
