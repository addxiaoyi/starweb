import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToastStore } from '@/stores/toast';
import {
  applySkinAssets,
  fetchLibrarySyncStatus,
  searchSkinLibrary,
  syncSkinLibrary,
  type LibraryItem,
  type LibrarySyncSnapshot,
  type LibrarySyncTask,
} from '@/features/skin';

interface UseSkinLibraryOptions {
  isLoggedIn: () => boolean;
  userUuid: () => string | undefined;
}

export function useSkinLibrary(options: UseSkinLibraryOptions) {
  const router = useRouter();
  const toast = useToastStore();

  const keyword = ref('');
  const loading = ref(false);
  const syncing = ref(false);
  const applyingItemId = ref<string | null>(null);
  const applyErrorById = ref<Record<string, string>>({});
  const error = ref('');
  const items = ref<LibraryItem[]>([]);
  const syncStatusLoading = ref(false);
  const syncSnapshot = ref<LibrarySyncSnapshot | null>(null);
  const latestSyncTask = ref<LibrarySyncTask | null>(null);
  const realtimeEnabled = ref(false);
  const realtimeStreamPath = ref('/api/skins/library/stream');
  const realtimeConnected = ref(false);
  const lastRealtimeAt = ref('');

  const searchLibrary = async () => {
    loading.value = true;
    error.value = '';
    try {
      const { response, data } = await searchSkinLibrary(keyword.value);
      if (!response.ok) {
        error.value = data?.message || '检索失败，请稍后重试';
        items.value = [];
        return;
      }
      items.value = Array.isArray(data?.items) ? data.items : [];
    } catch {
      error.value = '检索请求失败，请检查服务连接';
      items.value = [];
    } finally {
      loading.value = false;
    }
  };

  const syncLibraryAction = async () => {
    syncing.value = true;
    try {
      const { response, data } = await syncSkinLibrary();
      if (!response.ok) {
        toast.addToast({ message: data?.message || '同步失败', type: 'error' });
        return;
      }
      toast.addToast({ message: data?.message || '已触发插件同步任务', type: 'success' });
      await Promise.allSettled([searchLibrary(), loadSyncStatus(true)]);
    } catch {
      toast.addToast({ message: '同步请求失败，请检查插件服务', type: 'error' });
    } finally {
      syncing.value = false;
    }
  };

  const loadSyncStatus = async (silent = false) => {
    if (!silent) syncStatusLoading.value = true;
    try {
      const data = await fetchLibrarySyncStatus();
      syncSnapshot.value = data.sync ?? null;
      latestSyncTask.value = data.latest ?? null;
      realtimeEnabled.value = Boolean(data.realtime?.enabled);
      realtimeStreamPath.value = String(data.realtime?.streamPath || '/api/skins/library/stream');
    } catch (err) {
      if (!silent) {
        toast.addToast({
          message: err instanceof Error ? err.message : '读取同步状态失败',
          type: 'warning'
        });
      }
    } finally {
      if (!silent) syncStatusLoading.value = false;
    }
  };

  function markRealtimeState(connected: boolean, atIso?: string) {
    realtimeConnected.value = connected;
    if (atIso) lastRealtimeAt.value = atIso;
    else if (connected) lastRealtimeAt.value = new Date().toISOString();
  }

  const applyLibraryItem = async (item: LibraryItem) => {
    if (!options.isLoggedIn() || !options.userUuid()) {
      toast.addToast({ message: '请先登录后再应用', type: 'info' });
      return;
    }

    applyErrorById.value[item.id] = '';
    applyingItemId.value = item.id;

    const skinAssetId = Number(item.skinAssetId || 0);
    const capeAssetId = Number(item.capeAssetId || 0);

    const tryApply = async () =>
      await applySkinAssets({
        uuid: options.userUuid() as string,
        skinAssetId,
        capeAssetId,
        slot: 'default'
      });

    try {
      let result = await tryApply();

      if (!result.response.ok && result.response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        result = await tryApply();
      }

      if (!result.response.ok) {
        const detail = result.data?.details || result.data?.error || result.data?.message || `应用失败（HTTP ${result.response.status}）`;
        applyErrorById.value[item.id] = detail;
        toast.addToast({ message: detail, type: 'error' });
        return;
      }

      const successMessage = result.data?.message || '已应用到当前角色';
      applyErrorById.value[item.id] = '';
      toast.addToast({ message: successMessage, type: 'success' });

      await router.push({
        path: '/skin',
        query: {
          applied: '1',
          from: 'library',
          appliedName: item.name || '未命名皮肤',
          msg: encodeURIComponent(successMessage)
        }
      });
    } catch (err) {
      const fallback = err instanceof Error ? err.message : '应用请求失败，请稍后重试';
      applyErrorById.value[item.id] = fallback;
      toast.addToast({ message: fallback, type: 'error' });
    } finally {
      applyingItemId.value = null;
    }
  };

  return {
    keyword,
    loading,
    syncing,
    applyingItemId,
    applyErrorById,
    error,
    items,
    syncStatusLoading,
    syncSnapshot,
    latestSyncTask,
    realtimeEnabled,
    realtimeStreamPath,
    realtimeConnected,
    lastRealtimeAt,
    searchLibrary,
    syncLibrary: syncLibraryAction,
    loadSyncStatus,
    markRealtimeState,
    applyLibraryItem
  };
}
