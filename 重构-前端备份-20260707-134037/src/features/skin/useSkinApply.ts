import { useToastStore } from '@/stores/toast';
import { applySkinAssets } from './api';

interface UseSkinApplyOptions {
  isLoggedIn: () => boolean;
  userUuid: () => string | undefined;
  getAppliedAssetIds: () => { skinAssetId: number; capeAssetId: number };
  setAppliedAssetIds: (ids: { skinAssetId: number; capeAssetId: number }) => void;
  onApplied?: () => Promise<void> | void;
  onAuthInvalid?: () => void;
}

interface ApplyAssetsOptions {
  skinAssetId?: number;
  capeAssetId?: number;
}

interface ApplyUiOptions {
  quiet?: boolean;
}

export function useSkinApply(options: UseSkinApplyOptions) {
  const toast = useToastStore();

  const applyAssetsToPlayer = async (opts: ApplyAssetsOptions, uiOptions?: ApplyUiOptions) => {
    const uuid = options.userUuid();
    if (!options.isLoggedIn() || !uuid) return false;

    const previous = options.getAppliedAssetIds();
    const skinAssetId = opts.skinAssetId ?? previous.skinAssetId;
    const capeAssetId = opts.capeAssetId ?? previous.capeAssetId;

    // 乐观更新：先更新本地生效状态，失败再回滚。
    options.setAppliedAssetIds({ skinAssetId, capeAssetId });

    try {
      const { response, data } = await applySkinAssets({
        uuid,
        skinAssetId,
        capeAssetId,
        slot: 'default'
      });

      if (response.status === 401) {
        options.setAppliedAssetIds(previous);
        options.onAuthInvalid?.();
        return false;
      }

      if (!response.ok) {
        options.setAppliedAssetIds(previous);
        toast.addToast({
          message: data?.message || '应用外观到当前角色失败',
          type: 'error'
        });
        return false;
      }

      await options.onApplied?.();
      if (!uiOptions?.quiet) {
        toast.addToast({ message: data?.message || '已应用到当前角色', type: 'success' });
      }
      return true;
    } catch {
      options.setAppliedAssetIds(previous);
      toast.addToast({ message: '应用外观请求失败', type: 'error' });
      return false;
    }
  };

  return {
    applyAssetsToPlayer
  };
}
