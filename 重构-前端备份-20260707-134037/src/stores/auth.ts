/**
 * 认证状态管理
 * 
 * 注意：后端已改用 SuperTokens HTTP-only SameSite=strict Cookie 存储 session。
 * 此 store 不再存储 token，改为依赖后端 session 状态。
 * 
 * 登录状态由 SuperTokens SDK 通过 Cookie 自动管理。
 * 前端只需要存储用户信息（来自 API 返回）。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface User {
  id?: string;
  uuid: string;
  username: string;
  email?: string;
  role?: string;
  roles?: string[];
  totpEnabled?: boolean;
  verifiedMojang?: boolean;
  linkedMcUsername?: string;
  linkedMcUuid?: string;
}

export interface PermissionCapabilities {
  canViewReviewerCenter?: boolean;
  canReviewSubmissions?: boolean;
  canModerateReports?: boolean;
  canManageUsers?: boolean;
  canViewTelemetry?: boolean;
  canManageSecurityRules?: boolean;
  canReplayWebhooks?: boolean;
  canViewAuditLogs?: boolean;
  canManageTasks?: boolean;
  canRollbackSkinVersion?: boolean;
}

export interface UserPermissions {
  roles: string[];
  capabilities: PermissionCapabilities;
}

const TELEMETRY_IDENTITY_KEY = '__starmc_telemetry_identity__';
const PERMISSION_CACHE_MS = 30_000;

function persistTelemetryIdentity(user: User | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.sessionStorage.removeItem(TELEMETRY_IDENTITY_KEY);
      return;
    }
    const roles = [
      ...(Array.isArray(user.roles) ? user.roles : []),
      ...(user.role ? [user.role] : [])
    ]
      .map((r) => String(r || '').toLowerCase())
      .filter(Boolean);
    const primaryRole = roles[0] || 'member';
    const actor = String(user.id || user.uuid || user.username || '').slice(0, 64);
    window.sessionStorage.setItem(
      TELEMETRY_IDENTITY_KEY,
      JSON.stringify({ role: primaryRole, actor })
    );
  } catch {
    // ignore degraded mode
  }
}

export const useAuthStore = defineStore('auth', () => {
  // 注意：不再使用 localStorage 存储 token
  // SuperTokens session 通过 HTTP-only Cookie 管理
  const user = ref<User | null>(null);
  const permissions = ref<UserPermissions | null>(null);
  const permissionsFetchedAt = ref(0);
  
  // 登录状态由是否有 user 对象决定
  // 后续可通过 SuperTokens SDK 的 doesSessionExist() 增强检测
  const isLoggedIn = computed(() => !!user.value);

  function clearPermissions() {
    permissions.value = null;
    permissionsFetchedAt.value = 0;
  }

  function setPermissions(next: UserPermissions | null) {
    if (!next) {
      clearPermissions();
      return;
    }
    permissions.value = {
      roles: Array.isArray(next.roles)
        ? next.roles.map((r) => String(r || '').toLowerCase()).filter(Boolean)
        : [],
      capabilities: { ...(next.capabilities || {}) },
    };
    permissionsFetchedAt.value = Date.now();
  }

  async function refreshPermissions(force = false) {
    if (!user.value) {
      clearPermissions();
      return false;
    }
    const age = Date.now() - permissionsFetchedAt.value;
    if (!force && permissions.value && age <= PERMISSION_CACHE_MS) {
      return true;
    }
    try {
      const resp = await fetch('/api/user/permissions', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || typeof data !== 'object') {
        return false;
      }
      const payload = data as { roles?: unknown; capabilities?: unknown };
      const roles = Array.isArray(payload.roles)
        ? payload.roles.map((r) => String(r || '').toLowerCase()).filter(Boolean)
        : [];
      const rawCapabilities = payload.capabilities && typeof payload.capabilities === 'object'
        ? payload.capabilities as Record<string, unknown>
        : {};
      const normalizedCapabilities: PermissionCapabilities = {};
      for (const [key, value] of Object.entries(rawCapabilities)) {
        normalizedCapabilities[key as keyof PermissionCapabilities] = Boolean(value);
      }
      setPermissions({ roles, capabilities: normalizedCapabilities });
      return true;
    } catch {
      return false;
    }
  }

  function hasRoleFallback(target: string) {
    const current = user.value;
    if (!current) return false;
    const roleList = new Set<string>([
      ...(Array.isArray(current.roles) ? current.roles : []),
      ...(current.role ? [current.role] : [])
    ].map((r) => String(r).toLowerCase()));
    return roleList.has(target);
  }

  const canReviewSubmissions = computed(() => {
    if (!user.value) return false;
    const capability = permissions.value?.capabilities?.canReviewSubmissions;
    if (typeof capability === 'boolean') return capability;
    return hasRoleFallback('admin') || hasRoleFallback('reviewer') || hasRoleFallback('moderator') || hasRoleFallback('staff');
  });

  const canManageUsers = computed(() => {
    if (!user.value) return false;
    const capability = permissions.value?.capabilities?.canManageUsers;
    if (typeof capability === 'boolean') return capability;
    return hasRoleFallback('admin');
  });

  function setUser(newUser: User | null) {
    user.value = newUser;
    persistTelemetryIdentity(newUser);
    clearPermissions();
  }

  function logout() {
    user.value = null;
    persistTelemetryIdentity(null);
    clearPermissions();
  }

  // Session 恢复：在 Pinia store 首次创建时调用，
  // 用于页面刷新后从 HTTP-only Cookie 恢复登录态。
  let _hydrating: Promise<void> | null = null;
  async function init() {
    if (_hydrating) await _hydrating;
    _hydrating = (async () => {
      try {
        const r = await fetch('/api/user/me', { credentials: 'include', cache: 'no-store' });
        if (r.ok) {
          const data = await r.json().catch(() => null);
          if (data && typeof data === 'object' && 'user' in data) {
            setUser((data as { user?: User | null }).user ?? null);
          }
        } else if (r.status === 401) {
          // 显式清除，确保状态一致
          user.value = null;
        }
      } catch {
        // network error — degraded mode, stay logged out
      } finally {
        _hydrating = null;
      }
    })();
    await _hydrating;
  }

  return {
    user,
    permissions,
    isLoggedIn,
    canReviewSubmissions,
    canManageUsers,
    setPermissions,
    refreshPermissions,
    clearPermissions,
    setUser,
    logout,
    init
  };
});
