// ========================================================
// StarVC 迁移到 SQLite - 认证服务与 Repository
// ========================================================

package io.github.addxiaoyi.starx.api.auth;

import java.util.List;
import java.util.Optional;

/**
 * 用户 Repository 接口
 */
public interface UserRepository {
    Optional<User> findById(Long id);
    Optional<User> findByName(String name);
    Optional<User> findByUuid(String uuid);
    Optional<User> findByOnlineUuid(String uuid);
    Optional<User> findByOfflineUuid(String uuid);
    User create(User user);
    User update(User user);
    List<User> findByMigrationState(String state);
    int countByMigrationState(String state);
    int countTotal();
}

// ========================================================

package io.github.addxiaoyi.starx.common.database;

import io.github.addxiaoyi.starx.api.auth.User;
import io.github.addxiaoyi.starx.api.auth.UserRepository;
import org.jdbi.v3.sqlobject.config.RegisterRowMapper;
import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.customizer.BindBean;
import org.jdbi.v3.sqlobject.statement.GetGeneratedKeys;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;

import java.util.List;
import java.util.Optional;

/**
 * Jdbi User Repository 实现
 */
@RegisterRowMapper(UserMapper.class)
public interface JdbiUserRepository extends UserRepository {

    @Override
    @SqlQuery("SELECT * FROM starx_users WHERE id = :id")
    Optional<User> findById(@Bind("id") Long id);

    @Override
    @SqlQuery("SELECT * FROM starx_users WHERE player_name = :name")
    Optional<User> findByName(@Bind("name") String name);

    @Override
    @SqlQuery("SELECT * FROM starx_users WHERE current_uuid = :uuid")
    Optional<User> findByUuid(@Bind("uuid") String uuid);

    @Override
    @SqlQuery("SELECT * FROM starx_users WHERE online_uuid = :uuid")
    Optional<User> findByOnlineUuid(@Bind("uuid") String uuid);

    @Override
    @SqlQuery("SELECT * FROM starx_users WHERE offline_uuid = :uuid")
    Optional<User> findByOfflineUuid(@Bind("uuid") String uuid);

    @Override
    @SqlUpdate("""
        INSERT INTO starx_users (
            player_name, online_uuid, offline_uuid, current_uuid,
            password_hash, email, premium, bedrock, source_system, migration_state
        ) VALUES (
            :playerName, :onlineUuid, :offlineUuid, :currentUuid,
            :passwordHash, :email, :premium, :bedrock, :sourceSystem, :migrationState
        )
        """)
    @GetGeneratedKeys
    Long insert(@BindBean User user);

    @Override
    default User create(User user) {
        Long id = insert(user);
        user.setId(id);
        return user;
    }

    @Override
    @SqlUpdate("""
        UPDATE starx_users SET
            player_name = :playerName,
            online_uuid = :onlineUuid,
            offline_uuid = :offlineUuid,
            current_uuid = :currentUuid,
            password_hash = :passwordHash,
            password_migrated_at = :passwordMigratedAt,
            email = :email,
            premium = :premium,
            bedrock = :bedrock,
            totp_secret = :totpSecret,
            totp_enabled = :totpEnabled,
            failed_attempts = :failedAttempts,
            locked_until = :lockedUntil,
            source_system = :sourceSystem,
            migration_state = :migrationState,
            last_login_at = :lastLoginAt
        WHERE id = :id
        """)
    void updateInternal(@BindBean User user);

    @Override
    default User update(User user) {
        updateInternal(user);
        return user;
    }

    @Override
    @SqlQuery("SELECT * FROM starx_users WHERE migration_state = :state")
    List<User> findByMigrationState(@Bind("state") String state);

    @Override
    @SqlQuery("SELECT COUNT(*) FROM starx_users WHERE migration_state = :state")
    int countByMigrationState(@Bind("state") String state);

    @Override
    @SqlQuery("SELECT COUNT(*) FROM starx_users")
    int countTotal();
}

// ========================================================

package io.github.addxiaoyi.starx.api.auth;

import io.github.addxiaoyi.starx.common.uniauth.UniAuthBridge;
import io.github.addxiaoyi.starx.common.crypto.PasswordHasher;

import java.time.Instant;

/**
 * 认证服务核心类
 */
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final UniAuthBridge uniAuthBridge;

    public AuthService(UserRepository userRepository, PasswordHasher passwordHasher, UniAuthBridge uniAuthBridge) {
        this.userRepository = userRepository;
        this.passwordHasher = passwordHasher;
        this.uniAuthBridge = uniAuthBridge;
    }

    public AuthResult authenticate(String username, String password, String ip) {
        var userOpt = userRepository.findByName(username);

        if (userOpt.isEmpty()) {
            return tryUniAuthAndCreateUser(username, password, ip);
        }

        User user = userOpt.get();

        if (isLocked(user)) {
            return AuthResult.failed("Account locked");
        }

        if (user.isPasswordMigrated()) {
            return authenticateLocally(user, password, ip);
        }

        if (uniAuthBridge.isEnabled() && "pending".equals(user.getMigrationState())) {
            return authenticateViaUniAuthAndMigrate(user, password, ip);
        }

        return AuthResult.failed("No valid authentication method");
    }

    private AuthResult authenticateLocally(User user, String password, String ip) {
        boolean valid = passwordHasher.verify(password, user.getPasswordHash());

        if (valid) {
            user.setFailedAttempts(0);
            user.setLastLoginAt(Instant.now());
            userRepository.update(user);
            logLogin(user, "local", true, null, ip);
            return AuthResult.success(user);
        } else {
            incrementFailedAttempts(user);
            logLogin(user, "local", false, "Invalid password", ip);
            return AuthResult.failed("Invalid credentials");
        }
    }

    private AuthResult authenticateViaUniAuthAndMigrate(User user, String password, String ip) {
        var bridgeResult = uniAuthBridge.authenticateAndMigrate(user, password);

        if (bridgeResult.isDisabled()) {
            return AuthResult.failed("UniAuth bridge is disabled");
        }

        if (bridgeResult.isSuccess()) {
            user.setFailedAttempts(0);
            user.setLastLoginAt(Instant.now());
            userRepository.update(user);
            logLogin(user, "uniauth-migrated", true, null, ip);
            return AuthResult.success(bridgeResult.getUser());
        } else {
            incrementFailedAttempts(user);
            logLogin(user, "uniauth", false, bridgeResult.getErrorMessage(), ip);
            return AuthResult.failed(bridgeResult.getErrorMessage());
        }
    }

    private AuthResult tryUniAuthAndCreateUser(String username, String password, String ip) {
        if (!uniAuthBridge.isEnabled()) {
            return AuthResult.failed("User not found");
        }

        var bridgeResult = uniAuthBridge.authenticateAndCreateNew(username, password);

        if (bridgeResult.isSuccess()) {
            logLogin(bridgeResult.getUser(), "uniauth-new", true, null, ip);
            return AuthResult.success(bridgeResult.getUser());
        }

        return AuthResult.failed(bridgeResult.getErrorMessage());
    }

    private void incrementFailedAttempts(User user) {
        user.setFailedAttempts(user.getFailedAttempts() + 1);
        if (user.getFailedAttempts() >= 5) {
            user.setLockedUntil(Instant.now().plusSeconds(300));
        }
        userRepository.update(user);
    }

    private boolean isLocked(User user) {
        return user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now());
    }

    private void logLogin(User user, String type, boolean success, String error, String ip) {
    }
}
