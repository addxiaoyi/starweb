// ========================================================
// StarVC 迁移到 SQLite - 核心服务类
// ========================================================

package io.github.addxiaoyi.starx.common.crypto;

import at.favre.lib.crypto.bcrypt.BCrypt;

/**
 * BCrypt 密码哈希器
 */
public class PasswordHasher {
    private static final int COST = 12;

    public String hash(String plainText) {
        return BCrypt.withDefaults().hashToString(COST, plainText.toCharArray());
    }

    public boolean verify(String plainText, String hashed) {
        BCrypt.Result result = BCrypt.verifyer().verify(plainText.toCharArray(), hashed);
        return result.verified;
    }
}

// ========================================================

package io.github.addxiaoyi.starx.common.crypto;

import javax.crypto.Cipher;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * RSA 加密工具类（用于 UniAuth 通信）
 */
public class RSAUtils {
    private final PublicKey publicKey;

    public RSAUtils(String publicKeyPem) throws Exception {
        String publicKeyContent = publicKeyPem
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");

        byte[] decoded = Base64.getDecoder().decode(publicKeyContent);
        X509EncodedKeySpec spec = new X509EncodedKeySpec(decoded);
        KeyFactory kf = KeyFactory.getInstance("RSA");
        this.publicKey = kf.generatePublic(spec);
    }

    public String encrypt(String plainText) throws Exception {
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, publicKey);
        byte[] encrypted = cipher.doFinal(plainText.getBytes("UTF-8"));
        return Base64.getEncoder().encodeToString(encrypted);
    }
}

// ========================================================

package io.github.addxiaoyi.starx.common.uniauth;

/**
 * UniAuth 认证结果
 */
public class UniAuthResult {
    private final boolean success;
    private final String uuid;
    private final String username;
    private final String email;
    private final boolean premium;
    private final String errorMessage;

    private UniAuthResult(boolean success, String uuid, String username, String email, boolean premium, String errorMessage) {
        this.success = success;
        this.uuid = uuid;
        this.username = username;
        this.email = email;
        this.premium = premium;
        this.errorMessage = errorMessage;
    }

    public static UniAuthResult success(String uuid, String username, String email, boolean premium) {
        return new UniAuthResult(true, uuid, username, email, premium, null);
    }

    public static UniAuthResult failed(String errorMessage) {
        return new UniAuthResult(false, null, null, null, false, errorMessage);
    }

    public boolean isSuccess() { return success; }
    public String getUuid() { return uuid; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public boolean isPremium() { return premium; }
    public String getErrorMessage() { return errorMessage; }
}

// ========================================================

package io.github.addxiaoyi.starx.common.uniauth;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/**
 * UniAuth HTTP 客户端
 */
public class UniAuthClient {
    private final String endpoint;
    private final RSAUtils rsaUtils;
    private final HttpClient httpClient;
    private final Gson gson;

    public UniAuthClient(String endpoint, RSAUtils rsaUtils) {
        this.endpoint = endpoint;
        this.rsaUtils = rsaUtils;
        this.httpClient = HttpClient.newHttpClient();
        this.gson = new Gson();
    }

    public UniAuthResult authenticate(String username, String password) {
        try {
            String encryptedPassword = rsaUtils.encrypt(password);

            JsonObject requestBody = new JsonObject();
            requestBody.addProperty("username", username);
            requestBody.addProperty("password", encryptedPassword);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint + "/api/auth/login"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(requestBody)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonObject json = gson.fromJson(response.body(), JsonObject.class);
                boolean success = json.get("success").getAsBoolean();

                if (success) {
                    return UniAuthResult.success(
                            json.get("uuid").getAsString(),
                            json.get("username").getAsString(),
                            json.has("email") ? json.get("email").getAsString() : null,
                            json.has("premium") && json.get("premium").getAsBoolean()
                    );
                } else {
                    String error = json.has("error") ? json.get("error").getAsString() : "Authentication failed";
                    return UniAuthResult.failed(error);
                }
            }

            return UniAuthResult.failed("HTTP " + response.statusCode());
        } catch (Exception e) {
            return UniAuthResult.failed(e.getMessage());
        }
    }
}

// ========================================================

package io.github.addxiaoyi.starx.common.uniauth;

import io.github.addxiaoyi.starx.api.auth.User;
import io.github.addxiaoyi.starx.api.auth.UserRepository;
import io.github.addxiaoyi.starx.common.crypto.PasswordHasher;

import java.time.Instant;

/**
 * UniAuth 桥接服务
 * 负责首次登录验证及密码迁移
 */
public class UniAuthBridge {
    private final UniAuthClient client;
    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final boolean enabled;

    public UniAuthBridge(UniAuthClient client, UserRepository userRepository, PasswordHasher passwordHasher, boolean enabled) {
        this.client = client;
        this.userRepository = userRepository;
        this.passwordHasher = passwordHasher;
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public BridgeResult authenticateAndMigrate(User user, String password) {
        if (!enabled) {
            return BridgeResult.disabled();
        }

        UniAuthResult result = client.authenticate(user.getPlayerName(), password);

        if (!result.isSuccess()) {
            return BridgeResult.failed(result.getErrorMessage());
        }

        String hashedPassword = passwordHasher.hash(password);
        user.setPasswordHash(hashedPassword);
        user.setPasswordMigratedAt(Instant.now());
        user.setMigrationState("completed");
        if (result.getEmail() != null) {
            user.setEmail(result.getEmail());
        }
        user.setPremium(result.isPremium());

        userRepository.update(user);

        return BridgeResult.success(user);
    }

    public BridgeResult authenticateAndCreateNew(String username, String password) {
        if (!enabled) {
            return BridgeResult.disabled();
        }

        UniAuthResult result = client.authenticate(username, password);

        if (!result.isSuccess()) {
            return BridgeResult.failed(result.getErrorMessage());
        }

        User user = new User();
        user.setPlayerName(username);
        user.setCurrentUuid(result.getUuid());
        user.setEmail(result.getEmail());
        user.setPremium(result.isPremium());
        user.setSourceSystem("starvc");
        user.setMigrationState("completed");
        user.setPasswordHash(passwordHasher.hash(password));
        user.setPasswordMigratedAt(Instant.now());

        User saved = userRepository.create(user);

        return BridgeResult.success(saved);
    }

    public static class BridgeResult {
        private final boolean success;
        private final boolean disabled;
        private final User user;
        private final String errorMessage;

        private BridgeResult(boolean success, boolean disabled, User user, String errorMessage) {
            this.success = success;
            this.disabled = disabled;
            this.user = user;
            this.errorMessage = errorMessage;
        }

        public static BridgeResult success(User user) {
            return new BridgeResult(true, false, user, null);
        }

        public static BridgeResult failed(String errorMessage) {
            return new BridgeResult(false, false, null, errorMessage);
        }

        public static BridgeResult disabled() {
            return new BridgeResult(false, true, null, "UniAuth bridge disabled");
        }

        public boolean isSuccess() { return success; }
        public boolean isDisabled() { return disabled; }
        public User getUser() { return user; }
        public String getErrorMessage() { return errorMessage; }
    }
}
