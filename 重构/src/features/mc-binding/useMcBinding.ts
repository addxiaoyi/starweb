/**
 * Minecraft 超级联合登录 - 状态管理 Hook
 *
 * 统一管理：
 *  - 绑定状态（已绑定 / 未绑定）
 *  - 正版验证流程（init → polling → complete）
 *  - 解绑操作
 */

import { computed, reactive } from 'vue';
import { useToastStore } from '@/stores/toast';
import {
  fetchMcBindingStatus,
  fetchMcBindingHistory,
  fetchMcVerifyHistory,
  initMcVerify,
  cancelMcVerify,
  linkMcUsername,
  unlinkMcUsername,
} from './api-mc-binding';
import type {
  McBindingHistoryItem,
  McBindingStatus,
  McVerifyHistoryItem,
} from '@/types/minecraft';

type BindingApiError = Error & {
  code?: string;
  details?: unknown;
  status?: number;
};

interface State {
  binding: McBindingStatus;
  loading: boolean;
  historyLoading: boolean;
  verifying: boolean;
  linking: boolean;
  unlinking: boolean;
  bindingHistory: McBindingHistoryItem[];
  verifyHistory: McVerifyHistoryItem[];
  /** 验证步骤：idle | waiting | success | expired | failed | cancelled */
  verifyStep: 'idle' | 'waiting' | 'success' | 'expired' | 'failed' | 'cancelled';
}

export function useMcBinding() {
  const toast = useToastStore();

  const state = reactive<State>({
    binding: {
      linked: false,
      mcUsername: null,
      mcUuid: null,
      verifiedMojang: false,
      vlaLinked: false,
      verifySession: null,
      verifyState: null,
    },
    loading: false,
    historyLoading: false,
    verifying: false,
    linking: false,
    unlinking: false,
    bindingHistory: [],
    verifyHistory: [],
    verifyStep: 'idle',
  });

  // ============ 计算属性 ============

  const isLinked = computed(() => state.binding.linked);
  const isVerified = computed(() => state.binding.verifiedMojang);
  const mcUsername = computed(() => state.binding.mcUsername);

  /** 是否正在进行正版验证（有会话且未过期） */
  const isWaitingVerify = computed(
    () =>
      state.verifyStep === 'waiting' &&
      state.binding.verifySession != null &&
      !state.binding.verifySession.expired
  );
  const verifyState = computed(() => state.binding.verifyState ?? null);
  const verifyFailureReason = computed(
    () => verifyState.value?.failureReason || verifyState.value?.lastState?.failureReason || null
  );
  const verifyConflictCode = computed(
    () => verifyState.value?.conflictCode || verifyState.value?.lastState?.conflictCode || null
  );
  const verifyRetryMeta = computed(() => ({
    retryCount: Number(verifyState.value?.retryCount || 0),
    maxRetries: Number(verifyState.value?.maxRetries || 0),
  }));

  // ============ 加载状态 ============

  async function loadBinding() {
    state.loading = true;
    state.historyLoading = true;
    try {
      const [bindingResult, bindingHistoryResult, verifyHistoryResult] = await Promise.allSettled([
        fetchMcBindingStatus(),
        fetchMcBindingHistory({ page: 1, pageSize: 12 }),
        fetchMcVerifyHistory({ page: 1, pageSize: 8 }),
      ]);
      if (bindingResult.status !== 'fulfilled') {
        throw bindingResult.reason;
      }
      state.binding = bindingResult.value;
      state.bindingHistory =
        bindingHistoryResult.status === 'fulfilled' ? bindingHistoryResult.value.items : [];
      state.verifyHistory =
        verifyHistoryResult.status === 'fulfilled' ? verifyHistoryResult.value.items : [];
      _updateVerifyStep();
    } catch (err) {
      toast.addToast({
        type: 'error',
        message: err instanceof Error ? err.message : '获取绑定状态失败',
      });
      throw err;
    } finally {
      state.loading = false;
      state.historyLoading = false;
    }
  }

  function _updateVerifyStep() {
    const status = String(state.binding.verifyState?.status || '').toLowerCase();
    if (status === 'pending') {
      state.verifyStep = 'waiting';
      return;
    }
    if (status === 'succeeded') {
      state.verifyStep = 'success';
      return;
    }
    if (status === 'expired') {
      state.verifyStep = 'expired';
      return;
    }
    if (status === 'failed') {
      state.verifyStep = 'failed';
      return;
    }
    if (status === 'cancelled') {
      state.verifyStep = 'cancelled';
      return;
    }
    const sess = state.binding.verifySession;
    if (sess?.verified) state.verifyStep = 'success';
    else if (sess?.expired) state.verifyStep = 'expired';
    else if (sess) state.verifyStep = 'waiting';
    else state.verifyStep = 'idle';
  }

  // ============ 绑定 MC 用户名 ============

  async function linkMc(mcUsername: string, inviteCode?: string, totpCode?: string) {
    state.linking = true;
    try {
      await linkMcUsername(mcUsername, inviteCode, totpCode);
      toast.addToast({ type: 'success', message: `已绑定游戏角色「${mcUsername}」` });
      await loadBinding();
    } catch (err) {
      toast.addToast({
        type: 'error',
        message: err instanceof Error ? err.message : '绑定失败',
      });
      throw err;
    } finally {
      state.linking = false;
    }
  }

  // ============ 解绑 ============

  async function unlinkMc(reason?: string) {
    state.unlinking = true;
    try {
      await unlinkMcUsername(undefined, reason);
      toast.addToast({ type: 'success', message: '已解除游戏角色绑定' });
      await loadBinding();
    } catch (err) {
      toast.addToast({
        type: 'error',
        message: err instanceof Error ? err.message : '解绑失败',
      });
      throw err;
    } finally {
      state.unlinking = false;
    }
  }

  // ============ 正版验证流程 ============

  /**
   * 发起正版验证
   * @param mcUsername 要验证的角色名（省略则用当前绑定的）
   */
  async function startVerify(mcUsername?: string) {
    state.verifying = true;
    try {
      await initMcVerify({ mcUsername });
      await loadBinding();
      toast.addToast({
        type: 'info',
        message: '验证已发起，请在游戏内连接服务器完成验证（10 分钟内）',
        duration: 4000,
      });
    } catch (err) {
      const apiErr = err as BindingApiError;
      toast.addToast({
        type: 'error',
        message: apiErr?.message || '发起验证失败',
      });
      throw err;
    } finally {
      state.verifying = false;
    }
  }

  async function restartVerifyWithForce(mcUsername?: string) {
    state.verifying = true;
    try {
      await initMcVerify({ mcUsername, force: true });
      await loadBinding();
      toast.addToast({
        type: 'info',
        message: '已替换旧验证会话，请在游戏内重新完成验证',
        duration: 4500,
      });
    } catch (err) {
      const apiErr = err as BindingApiError;
      toast.addToast({
        type: 'error',
        message: apiErr?.message || '重新发起验证失败',
      });
      throw err;
    } finally {
      state.verifying = false;
    }
  }

  /** 取消验证 */
  async function abortVerify() {
    try {
      await cancelMcVerify();
      await loadBinding();
      toast.addToast({ type: 'info', message: '已取消验证' });
    } catch (err) {
      toast.addToast({
        type: 'error',
        message: err instanceof Error ? err.message : '取消失败',
      });
    }
  }

  return {
    state,
    isLinked,
    isVerified,
    mcUsername,
    isWaitingVerify,
    verifyState,
    verifyFailureReason,
    verifyConflictCode,
    verifyRetryMeta,
    loadBinding,
    linkMc,
    unlinkMc,
    startVerify,
    restartVerifyWithForce,
    abortVerify,
  };
}
