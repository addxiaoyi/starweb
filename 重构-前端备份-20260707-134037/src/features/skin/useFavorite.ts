import { ref, computed } from 'vue';
import { addFavorite, removeFavorite, checkFavorite, getFavorites } from './api-favorite';
import type { FavoriteItem } from './api-favorite';
import { useToastStore } from '@/stores/toast';

const favoriteIds = ref<Set<string>>(new Set());
const favoriteList = ref<FavoriteItem[]>([]);
const loading = ref(false);
const totalFavorites = ref(0);

// 从 localStorage 加载收藏状态
function loadFavoritesFromStorage() {
  try {
    const stored = localStorage.getItem('skinFavorites');
    if (stored) {
      const ids = JSON.parse(stored);
      favoriteIds.value = new Set(ids);
    }
  } catch {
    favoriteIds.value = new Set();
  }
}

// 保存收藏状态到 localStorage
function saveFavoritesToStorage() {
  try {
    localStorage.setItem('skinFavorites', JSON.stringify([...favoriteIds.value]));
  } catch {
    // ignore
  }
}

// 初始化加载
loadFavoritesFromStorage();

export function useFavorite() {
  const toast = useToastStore();

  const isFavorite = computed(() => (skinId: string) => favoriteIds.value.has(skinId));
  const favoriteCount = computed(() => favoriteIds.value.size);

  /**
   * 切换收藏状态
   */
  async function toggleFavorite(skinId: string) {
    const currentlyFavorite = favoriteIds.value.has(skinId);
    
    // 乐观更新
    if (currentlyFavorite) {
      favoriteIds.value.delete(skinId);
    } else {
      favoriteIds.value.add(skinId);
    }
    saveFavoritesToStorage();

    try {
      if (currentlyFavorite) {
        await removeFavorite(skinId);
        toast.addToast({
          type: 'success',
          message: '已取消收藏',
        });
      } else {
        await addFavorite(skinId);
        toast.addToast({
          type: 'success',
          message: '收藏成功',
        });
      }
    } catch (error) {
      // 回滚
      if (currentlyFavorite) {
        favoriteIds.value.add(skinId);
      } else {
        favoriteIds.value.delete(skinId);
      }
      saveFavoritesToStorage();
      
      toast.addToast({
        type: 'error',
        message: '操作失败，请重试',
      });
      throw error;
    }
  }

  /**
   * 检查收藏状态（从服务器同步）
   */
  async function syncFavoriteStatus(skinId: string) {
    try {
      const { isFavorite: status } = await checkFavorite(skinId);
      if (status) {
        favoriteIds.value.add(skinId);
      } else {
        favoriteIds.value.delete(skinId);
      }
      saveFavoritesToStorage();
      return status;
    } catch {
      return favoriteIds.value.has(skinId);
    }
  }

  /**
   * 获取收藏列表
   */
  async function fetchFavorites(page = 1, pageSize = 20) {
    loading.value = true;
    try {
      const result = await getFavorites(page, pageSize);
      favoriteList.value = result.items;
      totalFavorites.value = result.total;
      
      // 同步收藏 ID 集合
      result.items.forEach(item => {
        favoriteIds.value.add(item.skinId);
      });
      saveFavoritesToStorage();
      
      return result;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 批量同步收藏状态
   */
  async function syncMultipleFavorites(skinIds: string[]) {
    const results = await Promise.allSettled(
      skinIds.map(id => syncFavoriteStatus(id))
    );
    return results;
  }

  return {
    // State
    favoriteIds,
    favoriteList,
    loading,
    totalFavorites,
    
    // Computed
    isFavorite,
    favoriteCount,
    
    // Actions
    toggleFavorite,
    syncFavoriteStatus,
    fetchFavorites,
    syncMultipleFavorites,
  };
}
