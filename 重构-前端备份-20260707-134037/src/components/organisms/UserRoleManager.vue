<template>
  <div class="role-manager">
    <header class="section-header">
      <h2 class="section-title">用户角色管理</h2>
      <span class="meta-pill">{{ state.total }} 个用户</span>
    </header>

    <!-- 搜索 -->
      <div class="filter-bar glass-panel">
        <div class="search-wrap">
          <AppIcon name="shield" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="ui-input search-input"
            placeholder="搜索用户名、邮箱..."
            @keyup.enter="() => loadUsers()"
          />
          <button v-if="keyword" class="clear-btn" @click="keyword = ''; loadUsers()">
            <AppIcon name="close" />
          </button>
        </div>
        <button class="ui-btn secondary" :disabled="state.loading" @click="() => loadUsers()">
        <AppIcon name="refresh" :spin="state.loading" />
        刷新
      </button>
    </div>

    <!-- 表格 -->
    <div class="glass-panel">
      <!-- 表头 -->
      <div class="table-head">
        <div class="col-username">用户名</div>
        <div class="col-email">邮箱</div>
        <div class="col-roles">角色</div>
        <div class="col-verified">已验证</div>
        <div class="col-date">注册时间</div>
        <div class="col-actions">操作</div>
      </div>

      <!-- 骨架屏 -->
      <template v-if="state.loading">
        <div v-for="n in 6" :key="n" class="table-row skeleton-row">
          <div class="col-username"><div class="skeleton skeleton-text" /></div>
          <div class="col-email"><div class="skeleton skeleton-text" /></div>
          <div class="col-roles"><div class="skeleton skeleton-chip" /></div>
          <div class="col-verified"><div class="skeleton skeleton-chip" /></div>
          <div class="col-date"><div class="skeleton skeleton-text" /></div>
          <div class="col-actions"><div class="skeleton skeleton-actions" /></div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else-if="state.items.length === 0" class="empty-state">
        <AppIcon name="shield" />
        <p>暂无用户</p>
      </div>

      <!-- 数据行 -->
      <div
        v-for="user in state.items"
        :key="user.id"
        class="table-row"
        :class="{ editing: editingId === user.id }"
      >
        <div class="col-username">
          <span class="username-text">{{ user.username }}</span>
          <span v-if="user.linkedMcUsername" class="mc-badge">
            <AppIcon name="userCircle" />
            {{ user.linkedMcUsername }}
          </span>
        </div>
        <div class="col-email">
          <span class="email-text">{{ user.email || '—' }}</span>
        </div>
        <div class="col-roles">
          <!-- 展示状态 -->
          <div v-if="editingId !== user.id" class="role-chips">
            <span v-if="user.roles.includes('admin')" class="chip admin-chip">管理员</span>
            <span v-else-if="user.roles.includes('reviewer')" class="chip reviewer-chip">审核员</span>
            <span v-else class="chip no-chip">无角色</span>
            <button class="edit-role-btn" @click="startEdit(user)" title="修改角色">
              <AppIcon name="gem" />
            </button>
          </div>
          <!-- 编辑状态 -->
          <div v-else class="role-edit">
            <label class="role-check">
              <input type="checkbox" v-model="editRoles" value="admin" />
              <span class="chip admin-chip" :class="{ active: editRoles.includes('admin') }">管理员</span>
            </label>
            <label class="role-check">
              <input type="checkbox" v-model="editRoles" value="reviewer" />
              <span class="chip reviewer-chip" :class="{ active: editRoles.includes('reviewer') }">审核员</span>
            </label>
            <button
              class="ui-btn primary small"
              :disabled="savingId === user.id"
              @click="saveRoles(user)"
            >
              <AppIcon v-if="savingId === user.id" name="spinner" :spin="true" />
              <AppIcon v-else name="checkCircle" />
              保存
            </button>
            <button class="ui-btn ghost small" @click="cancelEdit">
              <AppIcon name="close" />
              取消
            </button>
          </div>
        </div>
        <div class="col-verified">
          <span v-if="user.emailVerified" class="verified-badge">
            <AppIcon name="checkCircle" />
            已验证
          </span>
          <span v-else class="unverified-badge">
            <AppIcon name="warning" />
            未验证
          </span>
        </div>
        <div class="col-date">{{ formatDate(user.createdAt) }}</div>
        <div class="col-actions">
          <button class="icon-btn" title="查看详情" @click="openDetail(user)">
            <AppIcon name="eye" />
          </button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <footer v-if="totalPages > 1" class="pagination">
      <span class="page-info">
        第 {{ state.page }} / {{ totalPages }} 页，共 {{ state.total }} 个用户
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
          class="ui-btn secondary small"
          :disabled="state.page >= totalPages"
          @click="goToPage(state.page + 1)"
        >
          下一页 <AppIcon name="arrowRight" />
        </button>
      </div>
    </footer>

    <!-- 用户详情弹窗 -->
    <ConfirmDialog
      v-if="detailModal.visible"
      :visible="detailModal.visible"
      :title="`用户详情：${detailModal.user?.username ?? ''}`"
      :message="`邮箱：${detailModal.user?.email || '—'}\n角色：${detailModal.user?.roles?.join(', ') || '无角色'}\n注册时间：${formatDate(detailModal.user?.createdAt ?? '')}`"
      confirm-text="关闭"
      cancel-text=""
      :loading="false"
      @confirm="detailModal.visible = false"
      @cancel="detailModal.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref } from 'vue';
import { fetchAdminUserList, updateAdminUserRoles } from '@/features/skin/api-admin';
import type { AdminUserItem, UserRole } from '@/types/skin-admin';
import { useToastStore } from '@/stores/toast';
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';

const toast = useToastStore();
const PAGE_SIZE = 20;

const state = reactive({
  items: [] as AdminUserItem[],
  total: 0,
  page: 1,
  loading: false,
});

const totalPages = computed(() => Math.ceil(state.total / PAGE_SIZE));
const keyword = ref('');
const editingId = ref<string | null>(null);
const editRoles = ref<UserRole[]>([]);
const savingId = ref<string | null>(null);

const detailModal = reactive({
  visible: false,
  user: null as AdminUserItem | null,
});

async function loadUsers(page = state.page) {
  state.loading = true;
  try {
    const result = await fetchAdminUserList({ page, pageSize: PAGE_SIZE, keyword: keyword.value || undefined });
    state.items = result.items;
    state.total = result.total;
    state.page = result.page;
  } catch {
    toast.addToast({ type: 'error', message: '加载用户列表失败' });
  } finally {
    state.loading = false;
  }
}

async function goToPage(page: number) { await loadUsers(page); }

function startEdit(user: AdminUserItem) {
  editingId.value = user.id;
  editRoles.value = [...user.roles];
}

function cancelEdit() {
  editingId.value = null;
  editRoles.value = [];
}

async function saveRoles(user: AdminUserItem) {
  savingId.value = user.id;
  try {
    const result = await updateAdminUserRoles(user.id, { roles: editRoles.value });
    // 更新本地数据
    const idx = state.items.findIndex(u => u.id === user.id);
    if (idx >= 0) state.items[idx].roles = result.roles;
    toast.addToast({ type: 'success', message: result.message });
    cancelEdit();
  } catch {
    toast.addToast({ type: 'error', message: '角色更新失败' });
  } finally {
    savingId.value = null;
  }
}

function openDetail(user: AdminUserItem) {
  detailModal.user = user;
  detailModal.visible = true;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// 初始加载
loadUsers();
</script>

<style scoped>
.role-manager {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 99px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}

.search-wrap {
  position: relative;
  flex: 1;
  max-width: 360px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  padding-left: 36px !important;
  width: 100%;
}

.clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s;
}

.clear-btn:hover { color: var(--text-primary); }

/* 表格 */
.table-head {
  display: grid;
  grid-template-columns: 2fr 2fr 2fr 1fr 1.5fr 80px;
  gap: 8px;
  padding: 10px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--glass-border);
}

.table-row {
  display: grid;
  grid-template-columns: 2fr 2fr 2fr 1fr 1.5fr 80px;
  gap: 8px;
  padding: 12px 16px;
  align-items: center;
  border-bottom: 1px solid var(--glass-border);
  transition: background 0.1s;
}

.table-row:hover:not(.skeleton-row) { background: rgba(255, 255, 255, 0.03); }
.table-row:last-child { border-bottom: none; }
.table-row.editing { background: rgba(var(--accent-rgb, 99, 102, 241), 0.05); }

/* 骨架屏 */
.skeleton-row { cursor: default; }
.skeleton {
  height: 14px;
  background: linear-gradient(90deg, var(--glass-bg) 25%, rgba(255,255,255,0.08) 50%, var(--glass-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}
.skeleton-text { width: 80%; }
.skeleton-chip { width: 60px; height: 24px; }
.skeleton-actions { width: 40px; }
.skeleton-preview { width: 48px; height: 48px; border-radius: 8px; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--text-tertiary);
}
.empty-state p { font-size: 0.875rem; }

/* 列样式 */
.col-username, .col-email { min-width: 0; }
.username-text { font-weight: 500; color: var(--text-primary); }
.email-text { color: var(--text-secondary); font-size: 0.875rem; }

.mc-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 1px 6px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 4px;
  font-size: 0.7rem;
  color: var(--text-tertiary);
}

/* 角色 */
.role-chips {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid transparent;
}

.no-chip { background: rgba(255,255,255,0.06); color: var(--text-tertiary); }
.admin-chip { background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
.reviewer-chip { background: rgba(234, 179, 8, 0.15); color: #fbbf24; border-color: rgba(234,179,8,0.3); }

.edit-role-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s;
  opacity: 0;
}
.table-row:hover .edit-role-btn { opacity: 1; }
.edit-role-btn:hover { color: var(--accent-color, #818cf8); }

.role-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.role-check {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.role-check input[type="checkbox"] {
  display: none;
}

.role-check input:checked + .admin-chip,
.role-check input:checked + .reviewer-chip {
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.5);
}

/* 验证状态 */
.verified-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #4ade80;
  font-size: 0.8rem;
}
.unverified-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

.col-date { font-size: 0.8rem; color: var(--text-secondary); }

.col-actions { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  padding: 6px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.icon-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.08); }

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.page-info {
  font-size: 0.8rem;
  color: var(--text-tertiary);
}

.page-controls {
  display: flex;
  gap: 8px;
}

@media (max-width: 768px) {
  .table-head, .table-row {
    grid-template-columns: 1.5fr 2fr 1.5fr 1fr;
  }
  .col-email, .col-date { display: none; }
}
</style>
