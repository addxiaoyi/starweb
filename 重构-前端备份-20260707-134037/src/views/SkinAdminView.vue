<template>
  <div class="page-shell skin-admin-view">
    <!-- ========== 页面 Header ========== -->
    <header class="admin-header">
      <div class="header-left">
        <h1 class="page-title">皮肤库管理</h1>
        <span class="meta-pill">{{ state.total }} 个资源</span>
      </div>
      <div class="header-right">
        <button class="ui-btn secondary" @click="loadList" :disabled="state.loading">
          <AppIcon name="refresh" :spin="state.loading" />
          刷新
        </button>
        <button class="ui-btn primary" @click="openCreateModal">
          <AppIcon name="upload" />
          新增皮肤
        </button>
      </div>
    </header>

    <!-- ========== Tab 切换 ========== -->
    <div class="admin-tabs" role="tablist">
      <button
        v-for="tab in ADMIN_TABS"
        :key="tab.id"
        class="admin-tab"
        :class="{ active: activeTab === tab.id }"
        role="tab"
        :aria-selected="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        <AppIcon :name="tab.icon" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ========== 皮肤管理视图 ========== -->
    <template v-if="activeTab === 'skins'">
      <!-- ========== 搜索过滤栏 ========== -->
    <section class="filter-bar glass-panel">
      <!-- 关键词搜索 -->
      <div class="search-wrap">
        <AppIcon name="network" class="search-icon" />
        <input
          v-model="searchKeyword"
          type="text"
          class="ui-input search-input"
          placeholder="搜索名称、标签..."
          @keyup.enter="onSearch"
        />
        <button v-if="searchKeyword" class="clear-btn" @click="clearSearch">
          <AppIcon name="close" />
        </button>
      </div>

      <!-- 状态下拉 -->
      <select v-model="filterStatus" class="ui-input status-select" @change="onStatusChange">
        <option value="">全部状态</option>
        <option value="online">已上线</option>
        <option value="offline">已下架</option>
        <option value="pending">待审核</option>
      </select>

      <!-- 模型选择 -->
      <select v-model="filterModel" class="ui-input model-select" @change="onModelChange">
        <option value="">全部模型</option>
        <option value="default">Default</option>
        <option value="slim">Slim</option>
        <option value="auto">Auto</option>
      </select>
    </section>

    <!-- ========== 批量操作栏 ========== -->
    <Transition name="batch-bar">
      <section v-if="hasSelection" class="batch-bar glass-panel">
        <span class="batch-tip">已选中 {{ selectedCount }} 项</span>
          <button class="ui-btn secondary small" @click="batchOnline" :disabled="state.batchOperating">
          <AppIcon name="checkCircle" /> 批量上线
        </button>
        <button class="ui-btn secondary small" @click="batchOffline" :disabled="state.batchOperating">
          <AppIcon name="close" /> 批量下架
        </button>
        <button class="ui-btn danger small" @click="batchDelete" :disabled="state.batchOperating">
          <AppIcon name="skull" /> 批量删除
        </button>
        <button class="ui-btn ghost small" @click="clearSelection">取消选择</button>
      </section>
    </Transition>

    <!-- ========== 数据表格 ========== -->
    <section class="admin-table glass-panel">
      <!-- 表头 -->
      <div class="table-head">
        <div class="col-check">
          <input
            type="checkbox"
            class="row-checkbox"
            :checked="isAllSelected"
            @change="toggleSelectAll"
          />
        </div>
        <div class="col-id">ID</div>
        <div class="col-preview">预览</div>
        <div class="col-name">名称</div>
        <div class="col-model">模型</div>
        <div class="col-tags">标签</div>
        <div class="col-status">状态</div>
        <div class="col-date">更新时间</div>
        <div class="col-actions">操作</div>
      </div>

      <!-- 骨架屏 -->
      <template v-if="state.loading">
        <div v-for="n in 8" :key="n" class="table-row skeleton-row">
          <div class="col-check"><div class="skeleton skeleton-check" /></div>
          <div class="col-id"><div class="skeleton skeleton-text" /></div>
          <div class="col-preview"><div class="skeleton skeleton-preview" /></div>
          <div class="col-name"><div class="skeleton skeleton-text" /></div>
          <div class="col-model"><div class="skeleton skeleton-chip" /></div>
          <div class="col-tags"><div class="skeleton skeleton-tags" /></div>
          <div class="col-status"><div class="skeleton skeleton-chip" /></div>
          <div class="col-date"><div class="skeleton skeleton-text" /></div>
          <div class="col-actions"><div class="skeleton skeleton-actions" /></div>
        </div>
      </template>

      <!-- 空状态 -->
        <div v-else-if="state.items.length === 0" class="empty-state">
          <AppIcon name="cube" :size="48" />
        <p>暂无皮肤资源</p>
        <p class="hint">试试调整筛选条件，或新增一个皮肤</p>
      </div>

      <!-- 数据行 -->
      <div
        v-for="item in state.items"
        :key="item.id"
        class="table-row"
        :class="{ selected: state.selectedIds.has(item.id), operating: state.operatingId === item.id }"
      >
        <!-- Checkbox -->
        <div class="col-check">
          <input
            type="checkbox"
            class="row-checkbox"
            :checked="state.selectedIds.has(item.id)"
            @change="toggleSelect(item.id)"
          />
        </div>

        <!-- ID -->
        <div class="col-id">
          <span class="id-text">#{{ item.id }}</span>
        </div>

        <!-- 预览 -->
        <div class="col-preview">
          <img
            v-if="item.previewUrl"
            :src="item.previewUrl"
            :alt="item.name"
            class="preview-img"
            loading="lazy"
          />
          <div v-else class="preview-placeholder">
            <AppIcon name="fileImage" />
          </div>
        </div>

        <!-- 名称 -->
        <div class="col-name">
          <span class="name-text">{{ item.name }}</span>
          <span v-if="item.uploaderName" class="uploader-text">by {{ item.uploaderName }}</span>
        </div>

        <!-- 模型 -->
        <div class="col-model">
          <span class="model-chip" :class="`model-${item.model}`">{{ item.model }}</span>
        </div>

        <!-- 标签 -->
        <div class="col-tags">
          <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="tag-chip">{{ tag }}</span>
          <span v-if="item.tags.length > 3" class="tag-more">+{{ item.tags.length - 3 }}</span>
        </div>

        <!-- 状态 -->
        <div class="col-status">
          <span class="status-chip" :class="`status-${item.status}`">
            {{ statusLabel(item.status) }}
          </span>
        </div>

        <!-- 更新时间 -->
        <div class="col-date">
          <span class="date-text">{{ formatDate(item.updatedAt) }}</span>
        </div>

        <!-- 操作 -->
        <div class="col-actions">
          <button
            class="action-btn"
            :title="item.status === 'online' ? '下架' : '上线'"
            :disabled="state.operatingId === item.id"
            @click="toggleStatus(item.id, item.status)"
          >
            <AppIcon name="eye" />
          </button>
          <button
            class="action-btn"
            title="编辑"
            @click="openEditModal(item.id)"
          >
            <AppIcon name="settings" />
          </button>
          <button
            class="action-btn danger"
            title="删除"
            :disabled="state.operatingId === item.id"
            @click="openDeleteConfirm(item.id)"
          >
            <AppIcon name="skull" />
          </button>
        </div>
      </div>
    </section>

    <!-- ========== 分页 ========== -->
    <footer v-if="totalPages > 1" class="pagination">
      <span class="page-info">
        第 {{ state.page }} / {{ totalPages }} 页，共 {{ state.total }} 条
      </span>
      <div class="page-controls">
          <button
          class="ui-btn secondary small"
          :disabled="state.page <= 1"
          @click="goToPage(state.page - 1)"
        >
          <AppIcon name="arrowLeft" /> 上一页
        </button>
        <button
          v-for="p in visiblePages"
          :key="p"
          class="ui-btn small"
          :class="{ primary: p === state.page, ghost: p !== state.page }"
          @click="goToPage(p)"
        >
          {{ p }}
        </button>
          <button
          class="ui-btn secondary small"
          :disabled="state.page >= totalPages"
          @click="goToPage(state.page + 1)"
        >
          下一页 <AppIcon name="arrowRight" />
        </button>
      </div>
    </footer>

    <!-- ========== 编辑 / 新增弹窗 ========== -->
    <Transition name="modal">
      <div v-if="state.editModalVisible" class="modal-overlay" @click.self="closeEditModal">
        <div class="modal-panel glass-panel">
          <header class="modal-header">
            <h2>{{ isCreating ? '新增皮肤' : '编辑皮肤' }}</h2>
            <button class="close-btn" @click="closeEditModal">
              <AppIcon name="close" />
            </button>
          </header>

          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">名称</label>
              <input v-model="editForm.name" type="text" class="ui-input" placeholder="皮肤名称" />
            </div>

            <div class="form-group">
              <label class="form-label">模型</label>
              <select v-model="editForm.model" class="ui-input">
                <option value="auto">Auto</option>
                <option value="default">Default</option>
                <option value="slim">Slim</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">标签 <span class="label-hint">逗号分隔</span></label>
              <input
                v-model="editForm.tagsInput"
                type="text"
                class="ui-input"
                placeholder="pvp, medieval, hd"
              />
            </div>

            <div class="form-group">
              <label class="form-label">皮肤 URL</label>
              <input v-model="editForm.skinUrl" type="url" class="ui-input" placeholder="https://..." />
            </div>

            <div class="form-group">
              <label class="form-label">披风 URL <span class="label-hint">可选</span></label>
              <input v-model="editForm.capeUrl" type="url" class="ui-input" placeholder="https://..." />
            </div>

            <div class="form-group">
              <label class="form-label">预览图 URL</label>
              <input v-model="editForm.previewUrl" type="url" class="ui-input" placeholder="https://..." />
            </div>
          </div>

          <footer class="modal-footer">
            <button class="ui-btn ghost" @click="closeEditModal">取消</button>
            <button
              class="ui-btn primary"
              :disabled="state.operating"
              @click="isCreating ? onSaveCreate() : onSaveEdit()"
            >
              <AppIcon v-if="state.operating" name="spinner" :spin="true" />
              {{ state.operating ? '保存中...' : '保存' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- ========== 删除确认弹窗 ========== -->
    <ConfirmDialog
      :visible="state.deleteModalVisible"
      title="确认删除"
      :message="`确定要删除该皮肤资源吗？此操作不可撤销。`"
      confirm-text="删除"
      cancel-text="取消"
      variant="danger"
      :loading="state.operating"
      @confirm="confirmDelete"
      @cancel="closeDeleteConfirm"
    />
    </template>

    <!-- ========== 角色管理视图 ========== -->
    <template v-if="activeTab === 'roles'">
      <UserRoleManager />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useSkinAdmin } from '@/features/skin/useSkinAdmin';
import { createAdminSkin } from '@/features/skin/api-admin';
import type { SkinResourceStatus } from '@/types/skin-admin';
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import UserRoleManager from '@/components/organisms/UserRoleManager.vue';
import type { AppIconName } from '@/components/atoms/appIcons';
import { useToastStore } from '@/stores/toast';

const toast = useToastStore();

const ADMIN_TABS: Array<{ id: 'skins' | 'roles'; label: string; icon: AppIconName }> = [
  { id: 'skins', label: '皮肤管理', icon: 'network' },
  { id: 'roles', label: '用户角色', icon: 'shield' },
];
const activeTab = ref<'skins' | 'roles'>('skins');

const {
  state,
  isAllSelected,
  selectedCount,
  hasSelection,
  totalPages,
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
  loadList,
} = useSkinAdmin();

// ============ 搜索 & 筛选 ============
const searchKeyword = ref('');
const filterStatus = ref('');
const filterModel = ref('');

function onSearch() {
  search(searchKeyword.value);
}

function clearSearch() {
  searchKeyword.value = '';
  search('');
}

function onStatusChange() {
  filterByStatus((filterStatus.value || undefined) as SkinResourceStatus | undefined);
}

function onModelChange() {
  filterByModel((filterModel.value || undefined) as 'default' | 'slim' | 'auto' | undefined);
}

// ============ 分页页码 ============
const visiblePages = computed(() => {
  const total = totalPages.value;
  const current = state.page;
  const range: number[] = [];

  let start = Math.max(1, current - 2);
  let end = Math.min(total, current + 2);

  if (end - start < 4) {
    if (start === 1) end = Math.min(total, start + 4);
    if (end === total) start = Math.max(1, end - 4);
  }

  for (let i = start; i <= end; i++) range.push(i);
  return range;
});

// ============ 编辑表单 ============
const editForm = reactive({
  name: '',
  model: 'auto' as 'auto' | 'default' | 'slim',
  tagsInput: '',
  skinUrl: '',
  capeUrl: '',
  previewUrl: '',
});
const isCreating = ref(false);

watch(() => state.editingItem, (item) => {
  if (item) {
    isCreating.value = false;
    editForm.name = item.name;
    editForm.model = item.model;
    editForm.tagsInput = item.tags?.join(', ') ?? '';
    editForm.skinUrl = item.skinUrl;
    editForm.capeUrl = item.capeUrl ?? '';
    editForm.previewUrl = item.previewUrl ?? '';
  }
});

async function onSaveEdit() {
  const tags = editForm.tagsInput
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  await saveEdit({
    name: editForm.name,
    model: editForm.model,
    tags,
    skinUrl: editForm.skinUrl,
    capeUrl: editForm.capeUrl || null,
    previewUrl: editForm.previewUrl || null,
  });
}

async function onSaveCreate() {
  state.operating = true;
  try {
    const tags = editForm.tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    await createAdminSkin({
      name: editForm.name,
      model: editForm.model,
      tags,
      skinUrl: editForm.skinUrl,
      capeUrl: editForm.capeUrl || null,
      previewUrl: editForm.previewUrl || null,
    } as never);
    toast.addToast({ type: 'success', message: '创建成功' });
    closeEditModal();
    await loadList();
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '创建失败，请重试' });
  } finally {
    state.operating = false;
  }
}

function openCreateModal() {
  isCreating.value = true;
  editForm.name = '';
  editForm.model = 'auto';
  editForm.tagsInput = '';
  editForm.skinUrl = '';
  editForm.capeUrl = '';
  editForm.previewUrl = '';
  state.editingItem = null;
  state.editModalVisible = true;
}

// ============ 辅助函数 ============
function statusLabel(status: SkinResourceStatus): string {
  const map: Record<SkinResourceStatus, string> = {
    online: '已上线',
    offline: '已下架',
    pending: '待审核',
  };
  return map[status] ?? status;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
</script>

<style scoped>
/* ========== Tab 切换 ========== */
.admin-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  width: fit-content;
  backdrop-filter: blur(12px);
}

.admin-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.admin-tab:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
.admin-tab.active { background: rgba(255,255,255,0.12); color: var(--text-primary); }

/* ========== 布局 ========== */
.skin-admin-view {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ========== Header ========== */
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.header-right {
  display: flex;
  gap: 0.5rem;
}

/* ========== 过滤栏 ========== */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding-left: 2.25rem;
}

.clear-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
}

.clear-btn:hover { color: var(--text-primary); }

.status-select,
.model-select {
  min-width: 120px;
}

/* ========== 批量操作栏 ========== */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  background: var(--surface-1);
  border: 1px solid var(--brand-primary);
  border-radius: var(--radius-2);
}

.batch-tip {
  font-size: 0.875rem;
  color: var(--brand-primary);
  font-weight: 600;
  margin-right: 0.5rem;
}

.batch-bar-enter-active,
.batch-bar-leave-active { transition: all 0.2s ease; }
.batch-bar-enter-from,
.batch-bar-leave-to { opacity: 0; transform: translateY(-8px); }

/* ========== 数据表格 ========== */
.admin-table {
  overflow-x: auto;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: 40px 60px 72px 1fr 80px 1.5fr 90px 120px 100px;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  min-width: 900px;
}

.table-head {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle);
  font-weight: 600;
}

.table-row {
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.15s;
}

.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--surface-1); }
.table-row.selected { background: color-mix(in srgb, var(--brand-primary) 8%, transparent); }
.table-row.operating { opacity: 0.6; pointer-events: none; }

/* 列样式 */
.col-check { display: flex; justify-content: center; }
.row-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--brand-primary); }

.id-text {
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.preview-img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-1);
  border: 1px solid var(--border-subtle);
}

.preview-placeholder {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-1);
  border-radius: var(--radius-1);
  color: var(--text-muted);
}

.name-text {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uploader-text {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.model-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-1);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.model-default { background: color-mix(in srgb, var(--brand-primary) 15%, transparent); color: var(--brand-primary); }
.model-slim { background: color-mix(in srgb, #8b5cf6 15%, transparent); color: #8b5cf6; }
.model-auto { background: color-mix(in srgb, #10b981 15%, transparent); color: #10b981; }

.tag-chip {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-right: 0.25rem;
  margin-bottom: 0.125rem;
}

.tag-more {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.status-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-online { background: color-mix(in srgb, #22c55e 15%, transparent); color: #22c55e; }
.status-offline { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }
.status-pending { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #f59e0b; }

.date-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}

/* 操作按钮 */
.col-actions {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover { background: var(--surface-1); color: var(--text-primary); border-color: var(--text-muted); }
.action-btn.danger:hover { background: color-mix(in srgb, #ef4444 10%, transparent); color: #ef4444; border-color: #ef4444; }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: var(--text-muted);
  gap: 0.5rem;
}

.empty-state .hint { font-size: 0.875rem; }

/* ========== 骨架屏 ========== */
.skeleton-row { pointer-events: none; }

.skeleton {
  background: linear-gradient(90deg, var(--surface-1) 25%, var(--surface-2) 50%, var(--surface-1) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-1);
}

.skeleton-check { width: 16px; height: 16px; }
.skeleton-text { height: 1rem; width: 60%; }
.skeleton-preview { width: 56px; height: 56px; border-radius: var(--radius-1); }
.skeleton-chip { height: 1.25rem; width: 50px; border-radius: 99px; }
.skeleton-tags { height: 1.25rem; width: 80%; }
.skeleton-actions { height: 32px; width: 80px; margin: 0 auto; }

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}

/* ========== 分页 ========== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0 0.25rem;
}

.page-info { font-size: 0.875rem; color: var(--text-muted); }

.page-controls { display: flex; gap: 0.375rem; flex-wrap: wrap; }

/* ========== 弹窗 ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-panel {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-1);
  transition: all 0.15s;
}

.close-btn:hover { background: var(--surface-1); color: var(--text-primary); }

.modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-subtle);
}

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel { transform: scale(0.95) translateY(-10px); }

/* ========== 表单 ========== */
.form-group { display: flex; flex-direction: column; gap: 0.375rem; }

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label-hint {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 0.75rem;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .skin-admin-view { padding: 1rem; }
  .admin-header { flex-direction: column; align-items: flex-start; }
  .filter-bar { flex-direction: column; }
  .search-wrap { width: 100%; }
  .table-head, .table-row { grid-template-columns: 40px 50px 56px 1fr 70px 100px; min-width: 600px; }
  .col-tags, .col-date { display: none; }
}

@media (max-width: 480px) {
  .batch-bar { flex-wrap: wrap; }
  .pagination { flex-direction: column; align-items: stretch; }
  .page-controls { justify-content: center; }
}
</style>
