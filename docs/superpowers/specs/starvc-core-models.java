// ========================================================
// StarVC 迁移到 SQLite - 核心模型类
// ========================================================

package io.github.addxiaoyi.starx.api.auth;

import java.time.Instant;
import java.util.Optional;

/**
 * 用户实体类
 */
public class User {
    private Long id;
    private String playerName;
    private String onlineUuid;
    private String offlineUuid;
    private String currentUuid;
    private String passwordHash;
    private Instant passwordMigratedAt;
    private String email;
    private boolean premium;
    private boolean bedrock;
    private String totpSecret;
    private boolean totpEnabled;
    private int failedAttempts;
    private Instant lockedUntil;
    private String sourceSystem;
    private String migrationState;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant lastLoginAt;

    public User() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPlayerName() { return playerName; }
    public void setPlayerName(String playerName) { this.playerName = playerName; }

    public String getOnlineUuid() { return onlineUuid; }
    public void setOnlineUuid(String onlineUuid) { this.onlineUuid = onlineUuid; }

    public String getOfflineUuid() { return offlineUuid; }
    public void setOfflineUuid(String offlineUuid) { this.offlineUuid = offlineUuid; }

    public String getCurrentUuid() { return currentUuid; }
    public void setCurrentUuid(String currentUuid) { this.currentUuid = currentUuid; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public Instant getPasswordMigratedAt() { return passwordMigratedAt; }
    public void setPasswordMigratedAt(Instant passwordMigratedAt) { this.passwordMigratedAt = passwordMigratedAt; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public boolean isPremium() { return premium; }
    public void setPremium(boolean premium) { this.premium = premium; }

    public boolean isBedrock() { return bedrock; }
    public void setBedrock(boolean bedrock) { this.bedrock = bedrock; }

    public String getTotpSecret() { return totpSecret; }
    public void setTotpSecret(String totpSecret) { this.totpSecret = totpSecret; }

    public boolean isTotpEnabled() { return totpEnabled; }
    public void setTotpEnabled(boolean totpEnabled) { this.totpEnabled = totpEnabled; }

    public int getFailedAttempts() { return failedAttempts; }
    public void setFailedAttempts(int failedAttempts) { this.failedAttempts = failedAttempts; }

    public Instant getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(Instant lockedUntil) { this.lockedUntil = lockedUntil; }

    public String getSourceSystem() { return sourceSystem; }
    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }

    public String getMigrationState() { return migrationState; }
    public void setMigrationState(String migrationState) { this.migrationState = migrationState; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(Instant lastLoginAt) { this.lastLoginAt = lastLoginAt; }

    public boolean isPasswordMigrated() {
        return passwordHash != null && "completed".equals(migrationState);
    }
}

// ========================================================

package io.github.addxiaoyi.starx.api.auth;

public class AuthResult {
    private final boolean success;
    private final User user;
    private final String errorMessage;

    private AuthResult(boolean success, User user, String errorMessage) {
        this.success = success;
        this.user = user;
        this.errorMessage = errorMessage;
    }

    public static AuthResult success(User user) {
        return new AuthResult(true, user, null);
    }

    public static AuthResult failed(String errorMessage) {
        return new AuthResult(false, null, errorMessage);
    }

    public boolean isSuccess() { return success; }
    public User getUser() { return user; }
    public String getErrorMessage() { return errorMessage; }
}

// ========================================================

package io.github.addxiaoyi.starx.api.migration;

public class MigrationJob {
    private Long id;
    private String jobType;
    private String status;
    private int totalCount;
    private int successCount;
    private int failedCount;
    private Instant startedAt;
    private Instant completedAt;
    private String errorMessage;
    private Instant createdAt;

    public MigrationJob() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getJobType() { return jobType; }
    public void setJobType(String jobType) { this.jobType = jobType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getTotalCount() { return totalCount; }
    public void setTotalCount(int totalCount) { this.totalCount = totalCount; }

    public int getSuccessCount() { return successCount; }
    public void setSuccessCount(int successCount) { this.successCount = successCount; }

    public int getFailedCount() { return failedCount; }
    public void setFailedCount(int failedCount) { this.failedCount = failedCount; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public boolean isRunning() {
        return "running".equals(status) || "pending".equals(status);
    }

    public double getProgress() {
        if (totalCount == 0) return 0;
        return (successCount + failedCount) * 100.0 / totalCount;
    }
}
