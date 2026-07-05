# StarVC 迁移到 SQLite 实施计划

## 概述

本文档详细描述了从 StarVC (UniAuth) 迁移到本地化 SQLite 认证系统的实施步骤。

---

## 项目结构

```
starx-plugins/
├── starx-api/
│   └── src/main/java/io/github/addxiaoyi/starx/api/
│       ├── auth/
│       │   ├── User.java
│       │   ├── UserRepository.java
│       │   └── AuthService.java
│       ├── migration/
│       │   └── MigrationService.java
│       └── event/
├── starx-common/
│   └── src/main/java/io/github/addxiaoyi/starx/common/
│       ├── config/
│       │   ├── Config.java
│       │   └── DatabaseConfig.java
│       ├── database/
│       │   ├── SQLiteDataSource.java
│       │   ├── MigrationManager.java
│       │   └── JdbiUserRepository.java
│       ├── crypto/
│       │   ├── PasswordHasher.java (BCrypt)
│       │   └── RSAUtils.java
│       └── uniauth/
│           ├── UniAuthClient.java
│           └── UniAuthBridge.java
└── starx-velocity/
    └── src/main/java/io/github/addxiaoyi/starx/velocity/
        ├── StarxVelocityPlugin.java
        ├── module/
        │   ├── auth/
        │   │   ├── AuthModule.java
        │   │   ├── LimboAuthListener.java
        │   │   └── PremiumAutoLoginListener.java
        │   ├── migration/
        │   │   ├── MigrationModule.java
        │   │   └── commands/
        │   │       ├── MigrateCommand.java
        │   │       └── MigrateStatusCommand.java
        │   ├── uniauth/
        │   │   └── UniAuthModule.java
        │   ├── yggdrasil/
        │   │   └── YggdrasilModule.java
        │   └── floodgate/
        │       └── FloodgateModule.java
        └── listener/
```

---

## 实施阶段

### 阶段 1: 基础设施（第 1-2 天）

- [ ] 项目初始化
- [ ] 配置 Gradle 多模块
- [ ] 依赖配置
- [ ] SQLite (WAL) 数据源实现

### 阶段 2: 数据库层（第 3-4 天）

- [ ] 表结构 SQL
- [ ] Flyway 迁移脚本
- [ ] Jdbi UserRepository 实现
- [ ] 数据库测试

### 阶段 3: 核心服务（第 5-6 天）

- [ ] AuthService 实现
- [ ] PasswordHasher (BCrypt)
- [ ] UniAuthClient (RSA 加密)
- [ ] UniAuthBridge 桥接逻辑

### 阶段 4: Velocity 模块（第 7-9 天）

- [ ] AuthModule 事件监听
- [ ] MigrationModule 命令
- [ ] UniAuthModule 配置
- [ ] YggdrasilModule
- [ ] FloodgateModule 集成

### 阶段 5: 测试与部署（第 10 天）

- [ ] 单元测试
- [ ] 集成测试
- [ ] 文档
- [ ] 打包与发布

---

## 详细任务分解

### 任务 1.1: Gradle 项目配置

**文件**：
- `settings.gradle.kts`
- `build.gradle.kts`
- `gradle/libs.versions.toml`
- `build-logic/`

**依赖**：
```
Velocity API 3.5.0
LimboAPI
Jdbi 3
SQLite JDBC
Flyway
BCrypt
Configurate
JUnit 5
Mockito
```

### 任务 1.2: SQLite 数据源

**文件**：`starx-common/src/main/java/.../database/SQLiteDataSource.java`

**功能**：
- 配置连接池 (HikariCP)
- 启用 WAL 模式
- PRAGMA 设置
```java
public class SQLiteDataSource {
    public DataSource create(Config config) {
        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl("jdbc:sqlite:" + config.getDatabaseFile());
        hikariConfig.setMaximumPoolSize(10);
        hikariConfig.setConnectionInitSql("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
        return new HikariDataSource(hikariConfig);
    }
}
```

### 任务 2.1: 数据库表结构

**文件**：`starx-common/src/main/resources/db/migration/V1__create_tables.sql`

```sql
-- starx_users
CREATE TABLE starx_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name VARCHAR(16) NOT NULL UNIQUE,
    online_uuid VARCHAR(36) UNIQUE,
    offline_uuid VARCHAR(36) UNIQUE,
    current_uuid VARCHAR(36) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    password_migrated_at TIMESTAMP,
    email VARCHAR(255),
    premium BOOLEAN DEFAULT 0,
    bedrock BOOLEAN DEFAULT 0,
    totp_secret VARCHAR(32),
    totp_enabled BOOLEAN DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    source_system VARCHAR(50) DEFAULT 'starvc',
    migration_state VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

-- auth_identities
CREATE TABLE auth_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id BIGINT NOT NULL,
    identity_type VARCHAR(20) NOT NULL,
    identity_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES starx_users(id)
);

-- migration_jobs
CREATE TABLE migration_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- login_audit
CREATE TABLE login_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id BIGINT,
    player_name VARCHAR(16) NOT NULL,
    ip_address VARCHAR(45),
    login_type VARCHAR(20) NOT NULL,
    success BOOLEAN NOT NULL,
    error_message VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES starx_users(id)
);

-- Indexes
CREATE INDEX idx_users_name ON starx_users(player_name);
CREATE INDEX idx_users_uuid ON starx_users(current_uuid);
CREATE INDEX idx_users_migration ON starx_users(migration_state);
CREATE INDEX idx_audit_time ON login_audit(created_at DESC);
```

### 任务 2.2: Jdbi UserRepository

**文件**：`starx-common/src/main/java/.../database/JdbiUserRepository.java`

```java
public interface UserRepository {
    Optional<User> findById(Long id);
    Optional<User> findByName(String name);
    Optional<User> findByUuid(String uuid);
    User create(User user);
    User update(User user);
    List<User> findByMigrationState(String state);
    int countByMigrationState(String state);
}
```

### 任务 3.1: AuthService

**文件**：`starx-common/src/main/java/.../auth/AuthService.java`

```java
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final UniAuthBridge uniAuthBridge;

    public AuthResult authenticate(String username, String password, String ip) {
        Optional<User> userOpt = userRepository.findByName(username);

        if (userOpt.isEmpty()) {
            return tryUniAuthAndCreateUser(username, password, ip);
        }

        User user = userOpt.get();

        if (user.getPasswordHash() != null) {
            return authenticateLocally(user, password, ip);
        }

        if (uniAuthBridge.isEnabled() && "pending".equals(user.getMigrationState())) {
            return authenticateViaUniAuthAndMigrate(user, password, ip);
        }

        return AuthResult.failed("No valid authentication method");
    }

    private AuthResult authenticateViaUniAuthAndMigrate(User user, String password, String ip) {
        UniAuthResult result = uniAuthBridge.authenticate(user.getPlayerName(), password);
        if (!result.isSuccess()) {
            return AuthResult.failed("Invalid credentials");
        }

        String hashed = passwordHasher.hash(password);
        user.setPasswordHash(hashed);
        user.setPasswordMigratedAt(Instant.now());
        user.setMigrationState("completed");
        userRepository.update(user);

        return AuthResult.success(user);
    }
}
```

### 任务 3.2: UniAuthBridge

**文件**：`starx-common/src/main/java/.../uniauth/UniAuthBridge.java`

```java
public class UniAuthBridge {
    private final UniAuthClient client;
    private final boolean enabled;

    public UniAuthResult authenticate(String username, String password) {
        if (!enabled) {
            throw new IllegalStateException("UniAuth bridge disabled");
        }

        String encrypted = rsaEncrypt(password);
        return client.login(username, encrypted);
    }
}
```

### 任务 4.1: AuthModule

**文件**：`starx-velocity/src/main/java/.../auth/AuthModule.java`

```java
public class AuthModule implements Listener {
    @Subscribe
    public void onPreLogin(LoginEvent event) {
        // Detect Floodgate
        // Check Yggdrasil
        // Route to Limbo
    }

    @Subscribe
    public void onLimboLogin(LimboLoginEvent event) {
        // Handle password input
        // Call AuthService
        // Route to server
    }
}
```

### 任务 4.2: MigrationModule

**文件**：`starx-velocity/src/main/java/.../migration/MigrationModule.java`

```java
public class MigrationModule {
    @Command("authx migrate starvc import-meta")
    public void importMeta(CommandSource source) {
        // Import UUID mappings and meta data from StarVC DB
    }

    @Command("authx migrate-status")
    public void status(CommandSource source) {
        // Show migration stats
    }
}
```

---

## 测试计划

### 单元测试

- PasswordHasherTest
- UserRepositoryTest (H2 内存数据库)
- AuthServiceTest
- UniAuthBridgeTest (Mock)

### 集成测试

- SQLiteDataSourceTest (WAL 模式验证)
- AuthFlowIntegrationTest
- MigrationIntegrationTest

---

## 配置文件示例

### config.yml

```yaml
database:
  type: sqlite
  file: plugins/starx/data.db
  wal: true
  pool-size: 10

auth:
  uniauth:
    enabled: true
    endpoint: "http://bmmc.cc:8500"
    rsa-public-key: |
      -----BEGIN PUBLIC KEY-----
      ...
      -----END PUBLIC KEY-----
  yggdrasil:
    enabled: true
    cache-ttl: 300
  floodgate:
    enabled: true

modules:
  auth:
    enabled: true
  migration:
    enabled: true
```

---

## 部署检查清单

- [ ] 数据库文件权限
- [ ] WAL 文件定期 checkpoint
- [ ] UniAuth 连接测试
- [ ] 备份策略
- [ ] 回滚计划

---

## 回滚计划

如果迁移出现问题：

1. 禁用 UniAuthBridge
2. 恢复 StarVC 认证
3. 保留本地已迁移用户
4. 排查问题后重试

---

## 成功标准

- [ ] 95% 活跃用户完成密码迁移
- [ ] 本地认证响应时间 < 100ms
- [ ] 零认证失败（非密码错误）
- [ ] 完整的审计日志
