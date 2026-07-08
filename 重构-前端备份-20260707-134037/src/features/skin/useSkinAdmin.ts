/**
 * 皮肤库管理后台 - 状态管理 Hook
 * 管理皮肤资源列表、CRUD 操作、批量选择
 */

import { computed, reactive } from 'vue';
import { useToastStore } from '@/stores/toast';
import {
  fetchAdminSkinList,
  fetchAdminSkinDetail,
  createAdminSkin as _createAdminSkin,
  updateAdminSkin,
  toggleAdminSkinStatus,
  deleteAdminSkin,
  batchToggleStatus,
  batchDeleteSkins,
} from './api-admin';
import type {
  AdminSkinResource,
  AdminSkinQuery,
  AdminSkinResourceForm,
  SkinResourceStatus,
  AdminSkinDetailResponse,
} from '@/types/skin-admin';

// ============ 状态定义 ============

interface SkinAdminState {
  /** 皮肤列表 */
  items: AdminSkinResource[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页大小 */
  pageSize: number;
  /** 加载中 */
  loading: boolean;
  /** 操作中（单个） */
  operating: boolean;
  /** 批量操作中 */
  batchOperating: boolean;
  /** 当前操作的资源 ID */
  operatingId: string | null;
  /** 选中的 ID 集合 */
  selectedIds: Set<string>;
  /** 当前编辑的资源详情 */
  editingItem: AdminSkinDetailResponse['item'] | null;
  /** 编辑弹窗可见性 */
  editModalVisible: boolean;
  /** 删除确认弹窗可见性 */
  deleteModalVisible: boolean;
  /** 待删除的 ID */
  pendingDeleteId: string | null;
}

export function useSkinAdmin() {
  const toast = useToastStore();

  // ============ 状态 ============
  const state = reactive<SkinAdminState>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
    operating: false,
    batchOperating: false,
    operatingId: null,
    selectedIds: new Set(),
    editingItem: null,
    editModalVisible: false,
    deleteModalVisible: false,
    pendingDeleteId: null,
  });

  // ============ 查询参数（响应式） ============
  const query = reactive<AdminSkinQuery>({
    page: 1,
    pageSize: 20,
    keyword: '',
    status: undefined,
    model: undefined,
  });

  // ============ 计算属性 ============

  /** 全选状态 */
  const isAllSelected = computed(() => {
    return state.items.length > 0 && state.items.every(item => state.selectedIds.has(item.id));
  });

  /** 选中的数量 */
  const selectedCount = computed(() => state.selectedIds.size);

  /** 是否有选中项 */
  const hasSelection = computed(() => state.selectedIds.size > 0);

  /** 总页数 */
  const totalPages = computed(() => Math.ceil(state.total / state.pageSize));

  // ============ 方法 ============

  /**
   * 加载列表
   */
  async function loadList() {
    state.loading = true;
    try {
      const result = await fetchAdminSkinList({ ...query });
      state.items = result.items;
      state.total = result.total;
      state.page = result.page;
      state.pageSize = result.pageSize;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      toast.addToast({ type: 'error', message: msg });
    } finally {
      state.loading = false;
    }
  }

  /**
   * 搜索（重置分页）
   */
  async function search(keyword: string) {
    query.keyword = keyword;
    query.page = 1;
    await loadList();
  }

  /**
   * 切换状态筛选
   */
  async function filterByStatus(status: SkinResourceStatus | undefined) {
    query.status = status;
    query.page = 1;
    await loadList();
  }

  /**
   * 切换模型筛选
   */
  async function filterByModel(model: AdminSkinQuery['model']) {
    query.model = model;
    query.page = 1;
    await loadList();
  }

  /**
   * 翻页
   */
  async function goToPage(page: number) {
    query.page = page;
    await loadList();
  }

  /**
   * 打开编辑弹窗
   */
  async function openEditModal(id: string) {
    state.operatingId = id;
    try {
      const result = await fetchAdminSkinDetail(id);
      state.editingItem = result.item;
      state.editModalVisible = true;
    } catch {
      toast.addToast({ type: 'error', message: '加载详情失败' });
    } finally {
      state.operatingId = null;
    }
  }

  /**
   * 关闭编辑弹窗
   */
  function closeEditModal() {
    state.editModalVisible = false;
    state.editingItem = null;
    state.operatingId = null;
  }

  /**
   * 保存编辑
   */
  async function saveEdit(form: Partial<AdminSkinResourceForm>) {
    if (!state.editingItem?.id) return;
    state.operating = true;
    try {
      await updateAdminSkin(state.editingItem.id, form);
      toast.addToast({ type: 'success', message: '更新成功' });
      closeEditModal();
      await loadList();
    } catch {
      toast.addToast({ type: 'error', message: '更新失败，请重试' });
    } finally {
      state.operating = false;
    }
  }

  /**
   * 切换单个资源状态
   */
  async function toggleStatus(id: string, currentStatus: SkinResourceStatus) {
    const newStatus: SkinResourceStatus = currentStatus === 'online' ? 'offline' : 'online';
    state.operatingId = id;

    // 乐观更新
    const idx = state.items.findIndex(item => item.id === id);
    if (idx !== -1) state.items[idx] = { ...state.items[idx], status: newStatus };

    try {
      await toggleAdminSkinStatus(id, newStatus);
      toast.addToast({ type: 'success', message: `已${newStatus === 'online' ? '上架' : '下架'}` });
    } catch {
      // 回滚
      if (idx !== -1) state.items[idx] = { ...state.items[idx], status: currentStatus };
      toast.addToast({ type: 'error', message: '状态更新失败' });
    } finally {
      state.operatingId = null;
    }
  }

  /**
   * 打开删除确认
   */
  function openDeleteConfirm(id: string) {
    state.pendingDeleteId = id;
    state.deleteModalVisible = true;
  }

  /**
   * 关闭删除确认
   */
  function closeDeleteConfirm() {
    state.deleteModalVisible = false;
    state.pendingDeleteId = null;
  }

  /**
   * 确认删除单个
   */
  async function confirmDelete() {
    if (!state.pendingDeleteId) return;
    const id = state.pendingDeleteId;
    state.operating = true;
    closeDeleteConfirm();

    // 乐观更新：先从列表移除
    const backup = [...state.items];
    state.items = state.items.filter(item => item.id !== id);
    state.total = Math.max(0, state.total - 1);

    try {
      await deleteAdminSkin(id);
      toast.addToast({ type: 'success', message: '删除成功' });
    } catch {
      // 回滚
      state.items = backup;
      state.total += 1;
      toast.addToast({ type: 'error', message: '删除失败，请重试' });
    } finally {
      state.operating = false;
      state.pendingDeleteId = null;
    }
  }

  // ============ 批量操作 ============

  /**
   * 切换全选
   */
  function toggleSelectAll() {
    if (isAllSelected.value) {
      state.selectedIds.clear();
    } else {
      state.items.forEach(item => state.selectedIds.add(item.id));
    }
  }

  /**
   * 切换单个选中
   */
  function toggleSelect(id: string) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
  }

  /**
   * 清空选择
   */
  function clearSelection() {
    state.selectedIds.clear();
  }

  /**
   * 批量上架
   */
  async function batchOnline() {
    if (!hasSelection.value) return;
    state.batchOperating = true;
    const ids = [...state.selectedIds];
    const backup = new Map(state.items.map(item => [item.id, item.status]));

    // 乐观更新
    state.items.forEach(item => {
      if (state.selectedIds.has(item.id)) item.status = 'online';
    });

    try {
      const result = await batchToggleStatus(ids, 'online');
      const { success } = result;
      if (success.length > 0) toast.addToast({ type: 'success', message: `已上架 ${success.length} 项` });
      if (result.failed.length > 0) toast.addToast({ type: 'warning', message: `${result.failed.length} 项上架失败` });
      clearSelection();
      await loadList();
    } catch {
      // 回滚
      state.items.forEach(item => {
        const original = backup.get(item.id);
        if (original) item.status = original;
      });
      toast.addToast({ type: 'error', message: '批量上架失败' });
    } finally {
      state.batchOperating = false;
    }
  }

  /**
   * 批量下架
   */
  async function batchOffline() {
    if (!hasSelection.value) return;
    state.batchOperating = true;
    const ids = [...state.selectedIds];
    const backup = new Map(state.items.map(item => [item.id, item.status]));

    state.items.forEach(item => {
      if (state.selectedIds.has(item.id)) item.status = 'offline';
    });

    try {
      const result = await batchToggleStatus(ids, 'offline');
      if (result.success.length > 0) toast.addToast({ type: 'success', message: `已下架 ${result.success.length} 项` });
      if (result.failed.length > 0) toast.addToast({ type: 'warning', message: `${result.failed.length} 项下架失败` });
      clearSelection();
      await loadList();
    } catch {
      state.items.forEach(item => {
        const original = backup.get(item.id);
        if (original) item.status = original;
      });
      toast.addToast({ type: 'error', message: '批量下架失败' });
    } finally {
      state.batchOperating = false;
    }
  }

  /**
   * 批量删除
   */
  async function batchDelete() {
    if (!hasSelection.value) return;
    state.batchOperating = true;
    const ids = [...state.selectedIds];
    const backup = [...state.items];

    state.items = state.items.filter(item => !state.selectedIds.has(item.id));
    state.total = Math.max(0, state.total - ids.length);

    try {
      const result = await batchDeleteSkins(ids);
      if (result.success.length > 0) toast.addToast({ type: 'success', message: `已删除 ${result.success.length} 项` });
      if (result.failed.length > 0) toast.addToast({ type: 'warning', message: `${result.failed.length} 项删除失败` });
      clearSelection();
      await loadList();
    } catch {
      state.items = backup;
      state.total += ids.length;
      toast.addToast({ type: 'error', message: '批量删除失败' });
    } finally {
      state.batchOperating = false;
    }
  }

  // ============ 初始化 ============

  loadList();

  return {
    // 状态
    state,
    query,
    // 计算属性
    isAllSelected,
    selectedCount,
    hasSelection,
    totalPages,
    // 方法
    loadList,
    search,
    filterByStatus,
    filterByModel,
    goToPage,
    openEditModal,
    closeEditModal,
    saveEdit,
    toggleStatus,
    openDeleteConfirm,
    closeDeleteConfirm,
    confirmDelete,
    toggleSelectAll,
    toggleSelect,
    clearSelection,
    batchOnline,
    batchOffline,
    batchDelete,
  };
}
