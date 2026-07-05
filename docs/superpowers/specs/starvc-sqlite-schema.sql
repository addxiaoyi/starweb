-- ========================================================
-- StarVC 迁移到 SQLite 数据库 Schema
-- Version: 1.0
-- ========================================================

-- ========================================================
-- starx_users - 用户主表
-- ========================================================
CREATE TABLE IF NOT EXISTS starx_users (
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

-- ========================================================
-- auth_identities - 认证身份关联表
-- ========================================================
CREATE TABLE IF NOT EXISTS auth_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id BIGINT NOT NULL,
    identity_type VARCHAR(20) NOT NULL,
    identity_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES starx_users(id)
);

-- ========================================================
-- migration_jobs - 迁移任务表
-- ========================================================
CREATE TABLE IF NOT EXISTS migration_jobs (
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

-- ========================================================
-- login_audit - 登录审计日志表
-- ========================================================
CREATE TABLE IF NOT EXISTS login_audit (
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

-- ========================================================
-- Indexes 索引
-- ========================================================
CREATE INDEX IF NOT EXISTS idx_users_name ON starx_users(player_name);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON starx_users(current_uuid);
CREATE INDEX IF NOT EXISTS idx_users_online_uuid ON starx_users(online_uuid);
CREATE INDEX IF NOT EXISTS idx_users_offline_uuid ON starx_users(offline_uuid);
CREATE INDEX IF NOT EXISTS idx_users_migration ON starx_users(migration_state);
CREATE INDEX IF NOT EXISTS idx_identities_user ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_identities_type ON auth_identities(identity_type, identity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON login_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON login_audit(user_id);

-- ========================================================
-- Triggers 触发器 - 自动更新 updated_at
-- ========================================================
CREATE TRIGGER IF NOT EXISTS update_starx_users_updated_at
AFTER UPDATE ON starx_users
BEGIN
    UPDATE starx_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ========================================================
-- View: 迁移进度概览
-- ========================================================
CREATE VIEW IF NOT EXISTS migration_overview AS
SELECT
    migration_state,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM starx_users), 2) as percentage
FROM starx_users
GROUP BY migration_state;

-- ========================================================
-- View: 最近登录统计
-- ========================================================
CREATE VIEW IF NOT EXISTS recent_login_stats AS
SELECT
    DATE(created_at) as login_date,
    COUNT(*) as total_logins,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_logins,
    SUM(CASE WHEN login_type = 'uniauth' THEN 1 ELSE 0 END) as uniauth_logins,
    SUM(CASE WHEN login_type = 'local' THEN 1 ELSE 0 END) as local_logins
FROM login_audit
WHERE created_at >= date('now', '-7 days')
GROUP BY DATE(created_at)
ORDER BY login_date DESC;
