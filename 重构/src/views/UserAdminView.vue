<template>
  <div class="user-admin-view page-shell">
    <header class="page-hero admin-hero">
      <h1 class="page-hero__title starmc-brand-glow">
        <AppIcon name="userCircle" :size="28" class="heading-icon" />
        用户管理
      </h1>
      <p class="page-hero__subtitle subtitle" data-typography="prose">
        查看用户信息、搜索账户，并执行编辑、角色分配、封禁、解封、删除与审计追踪。
      </p>
    </header>

    <section class="toolbar glass-card ui-card">
      <div class="toolbar__search">
        <input
          v-model.trim="keyword"
          class="ui-input"
          type="text"
          placeholder="搜索用户名 / 邮箱 / UUID"
          @keyup.enter="loadUsers(1)"
        />
        <button type="button" class="ui-btn" @click="loadUsers(1)" :disabled="loading">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button type="button" class="ui-btn secondary" @click="resetSearch" :disabled="loading">重置</button>
      </div>

      <div class="toolbar__filters">
        <select v-model="statusFilter" class="ui-select" :disabled="loading" @change="loadUsers(1)">
          <option value="all">全部状态</option>
          <option value="active">正常</option>
          <option value="banned">已封禁</option>
        </select>
        <select v-model="roleFilter" class="ui-select" :disabled="loading" @change="loadUsers(1)">
          <option value="all">全部角色</option>
          <option value="admin">管理员</option>
          <option value="reviewer">审核员</option>
          <option value="moderator">版主</option>
        </select>
      </div>

      <div class="toolbar__meta">
        <span class="meta-pill">共 {{ total }} 位用户</span>
        <span class="meta-pill">当前第 {{ page }} / {{ totalPages }} 页</span>
      </div>
    </section>

    <AppStatePanel
      v-if="error"
      variant="error"
      eyebrow="User Admin"
      title="用户列表加载失败"
      :message="error"
      hint="请稍后重试，或检查后端用户接口。"
      class="state-panel"
    >
      <template #actions>
        <button type="button" class="ui-btn primary" @click="loadUsers(page)">重试</button>
      </template>
    </AppStatePanel>

    <section class="glass-card ui-card list-card">
      <div v-if="loading" class="loading-state">
        <AppIcon name="loader" :size="20" class="spin" />
        <p>正在加载用户列表...</p>
      </div>

      <div v-else-if="users.length === 0" class="empty-state">
        <AppIcon name="userCircle" :size="48" />
        <p>暂无用户数据</p>
      </div>

      <div v-else class="user-list">
        <article v-for="user in users" :key="user.id" class="user-card">
          <div class="user-card__main">
            <div class="user-avatar">
              <AppIcon name="userCircle" :size="20" />
            </div>
            <div class="user-meta">
              <h3>{{ user.username }}</h3>
              <p>{{ user.email || '未设置邮箱' }}</p>
              <small>{{ user.uuid || 'UUID 暂无' }}</small>
              <small class="verify-badge" :class="user.emailVerified ? 'is-verified' : 'is-unverified'">
                {{ user.emailVerified ? '邮箱已验证' : '邮箱未验证' }}
              </small>
              <small v-if="user.note" class="user-note">备注：{{ user.note }}</small>
              <small :class="['status-badge', user.isBanned ? 'is-banned' : 'is-active']">
                {{ user.isBanned ? `已封禁${user.banReason ? `：${user.banReason}` : ''}` : '状态正常' }}
              </small>
            </div>
          </div>

          <div class="user-card__roles">
            <label><input v-model="ensureRoleDraft(user.id).admin" type="checkbox" :disabled="savingUserId === user.id"> 管理员</label>
            <label><input v-model="ensureRoleDraft(user.id).reviewer" type="checkbox" :disabled="savingUserId === user.id"> 审核员</label>
            <label><input v-model="ensureRoleDraft(user.id).moderator" type="checkbox" :disabled="savingUserId === user.id"> 版主</label>
          </div>

          <div class="user-card__actions">
            <button type="button" class="ui-btn secondary" @click="syncRolesFromUser(user.id)">还原</button>
            <button type="button" class="ui-btn primary" @click="saveRoles(user.id)" :disabled="savingUserId === user.id">
              {{ savingUserId === user.id ? '保存中...' : '保存角色' }}
            </button>
            <button type="button" class="ui-btn secondary" @click="openEditModal(user)">编辑</button>
            <button type="button" class="ui-btn secondary" @click="openAuditModal(user)">审计</button>
            <button
              type="button"
              class="ui-btn warning"
              @click="toggleBan(user)"
              :disabled="actionUserId === user.id"
            >
              {{ actionUserId === user.id ? '处理中...' : user.isBanned ? '解封' : '封禁' }}
            </button>
            <button type="button" class="ui-btn danger" @click="removeUser(user)" :disabled="actionUserId === user.id">
              删除
            </button>
          </div>
        </article>
      </div>

      <footer v-if="totalPages > 1" class="pagination">
        <button type="button" class="ui-btn secondary" @click="goPage(page - 1)" :disabled="page <= 1 || loading">上一页</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button type="button" class="ui-btn secondary" @click="goPage(page + 1)" :disabled="page >= totalPages || loading">下一页</button>
      </footer>
    </section>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="editingUser" class="modal-overlay" @click.self="closeEditModal">
          <div class="modal">
            <h2>编辑用户</h2>
            <p class="modal-subtitle">可修改用户名、邮箱、邮箱验证状态与备注。</p>

            <form class="edit-form" @submit.prevent="saveUserProfile">
              <label class="field">
                <span>用户名</span>
                <input v-model.trim="editForm.username" class="ui-input" type="text" minlength="2" maxlength="32" required>
              </label>
              <label class="field">
                <span>邮箱</span>
                <input v-model.trim="editForm.email" class="ui-input" type="email" placeholder="可留空">
              </label>
              <label class="field checkbox-line">
                <input v-model="editForm.emailVerified" type="checkbox">
                <span>邮箱已验证</span>
              </label>
              <label class="field">
                <span>备注（最多 200 字）</span>
                <textarea v-model.trim="editForm.note" class="ui-input" rows="3" maxlength="200" />
              </label>

              <p v-if="editError" class="inline-error">{{ editError }}</p>

              <div class="form-actions">
                <button type="button" class="ui-btn secondary" @click="closeEditModal" :disabled="editSaving">取消</button>
                <button type="submit" class="ui-btn primary" :disabled="editSaving">
                  {{ editSaving ? '保存中...' : '保存' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="auditUser" class="modal-overlay" @click.self="closeAuditModal">
          <div class="modal audit-modal">
            <h2>用户审计记录</h2>
            <p class="modal-subtitle">{{ auditUser.username }}（{{ auditUser.id }}）</p>

            <div v-if="auditLoading" class="loading-state compact">
              <AppIcon name="loader" :size="18" class="spin" />
              <p>正在加载审计记录...</p>
            </div>
            <div v-else-if="auditError" class="inline-error">{{ auditError }}</div>
            <div v-else-if="auditLogs.length === 0" class="empty-state compact">
              <p>暂无审计记录</p>
            </div>
            <div v-else class="audit-list">
              <article v-for="log in auditLogs" :key="log.id" class="audit-item">
                <header>
                  <strong>{{ log.action }}</strong>
                  <time>{{ formatTime(log.at) }}</time>
                </header>
                <p>操作者：{{ log.actorUsername || log.actorUserId || '-' }}</p>
                <pre v-if="log.detail" class="audit-detail">{{ formatAuditDetail(log.detail) }}</pre>
              </article>
            </div>

            <footer v-if="auditTotalPages > 1" class="pagination">
              <button type="button" class="ui-btn secondary" @click="loadAuditLogs(auditPage - 1)" :disabled="auditPage <= 1 || auditLoading">上一页</button>
              <span class="page-info">{{ auditPage }} / {{ auditTotalPages }}</span>
              <button type="button" class="ui-btn secondary" @click="loadAuditLogs(auditPage + 1)" :disabled="auditPage >= auditTotalPages || auditLoading">下一页</button>
            </footer>

            <div class="form-actions">
              <button type="button" class="ui-btn secondary" @click="closeAuditModal">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import {
  banAdminUser,
  deleteAdminUser,
  fetchAdminUserAuditLogs,
  fetchAdminUserList,
  unbanAdminUser,
  updateAdminUser,
  updateAdminUserRoles
} from '@/features/skin/api-admin';
import type { AdminUserAuditLogItem, UserRole } from '@/types/skin-admin';

interface UserRow {
  id: string;
  username: string;
  email?: string;
  uuid: string;
  roles?: UserRole[];
  isBanned?: boolean;
  banReason?: string;
  emailVerified?: boolean;
  note?: string;
}

const loading = ref(false);
const savingUserId = ref('');
const actionUserId = ref('');
const error = ref('');
const users = ref<UserRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const keyword = ref('');
const statusFilter = ref<'all' | 'active' | 'banned'>('all');
const roleFilter = ref<'all' | UserRole>('all');
const roleDrafts = reactive<Record<string, { admin: boolean; reviewer: boolean; moderator: boolean }>>({});

const editingUser = ref<UserRow | null>(null);
const editSaving = ref(false);
const editError = ref('');
const editForm = reactive({
  username: '',
  email: '',
  emailVerified: true,
  note: '',
});

const auditUser = ref<UserRow | null>(null);
const auditLogs = ref<AdminUserAuditLogItem[]>([]);
const auditLoading = ref(false);
const auditError = ref('');
const auditPage = ref(1);
const auditPageSize = 10;
const auditTotal = ref(0);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const auditTotalPages = computed(() => Math.max(1, Math.ceil(auditTotal.value / auditPageSize)));

onMounted(() => {
  void loadUsers(1);
});

function ensureRoleDraft(userId: string) {
  if (!roleDrafts[userId]) {
    roleDrafts[userId] = { admin: false, reviewer: false, moderator: false };
  }
  return roleDrafts[userId];
}

async function loadUsers(nextPage = page.value) {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchAdminUserList({
      page: nextPage,
      pageSize,
      keyword: keyword.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      role: roleFilter.value === 'all' ? undefined : roleFilter.value,
    });
    users.value = (result.items as UserRow[]) || [];
    total.value = result.total || 0;
    page.value = result.page || nextPage;
    syncAllDrafts();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载用户失败';
  } finally {
    loading.value = false;
  }
}

function syncAllDrafts() {
  const existingIds = new Set(users.value.map((item) => item.id));
  for (const id of Object.keys(roleDrafts)) {
    if (!existingIds.has(id)) {
      delete roleDrafts[id];
    }
  }
  for (const user of users.value) {
    roleDrafts[user.id] = {
      admin: !!user.roles?.includes('admin'),
      reviewer: !!user.roles?.includes('reviewer'),
      moderator: !!user.roles?.includes('moderator')
    };
  }
}

function syncRolesFromUser(userId: string) {
  const user = users.value.find((item) => item.id === userId);
  if (!user) return;
  roleDrafts[user.id] = {
    admin: !!user.roles?.includes('admin'),
    reviewer: !!user.roles?.includes('reviewer'),
    moderator: !!user.roles?.includes('moderator')
  };
}

async function saveRoles(userId: string) {
  const draft = roleDrafts[userId];
  if (!draft) return;

  savingUserId.value = userId;
  error.value = '';
  try {
    const roles: UserRole[] = [];
    if (draft.admin) roles.push('admin');
    if (draft.reviewer) roles.push('reviewer');
    if (draft.moderator) roles.push('moderator');
    await updateAdminUserRoles(userId, { roles });
    await loadUsers(page.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存角色失败';
  } finally {
    savingUserId.value = '';
  }
}

function goPage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value) return;
  void loadUsers(nextPage);
}

function resetSearch() {
  keyword.value = '';
  statusFilter.value = 'all';
  roleFilter.value = 'all';
  void loadUsers(1);
}

async function toggleBan(user: UserRow) {
  actionUserId.value = user.id;
  error.value = '';
  try {
    if (user.isBanned) {
      await unbanAdminUser(user.id);
    } else {
      const reason = window.prompt('请输入封禁原因（可留空）', '') ?? '';
      const durationInput = window.prompt('请输入封禁时长（小时，留空=永久）', '') ?? '';
      const duration = durationInput.trim() ? Number(durationInput) : undefined;
      if (durationInput.trim() && (!Number.isFinite(duration) || duration <= 0)) {
        throw new Error('封禁时长必须是正数小时');
      }
      await banAdminUser(user.id, { reason: reason.trim() || undefined, durationHours: duration });
    }
    await loadUsers(page.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '用户封禁状态更新失败';
  } finally {
    actionUserId.value = '';
  }
}

async function removeUser(user: UserRow) {
  const ok = window.confirm(`确认删除用户 ${user.username} 吗？该操作不可恢复。`);
  if (!ok) return;
  actionUserId.value = user.id;
  error.value = '';
  try {
    await deleteAdminUser(user.id);
    const nextPage = users.value.length === 1 ? Math.max(1, page.value - 1) : page.value;
    await loadUsers(nextPage);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除用户失败';
  } finally {
    actionUserId.value = '';
  }
}

function openEditModal(user: UserRow) {
  editingUser.value = user;
  editError.value = '';
  editForm.username = String(user.username || '');
  editForm.email = String(user.email || '');
  editForm.emailVerified = Boolean(user.emailVerified);
  editForm.note = String(user.note || '');
}

function closeEditModal() {
  editingUser.value = null;
  editSaving.value = false;
  editError.value = '';
}

async function saveUserProfile() {
  if (!editingUser.value) return;
  const username = editForm.username.trim();
  const note = editForm.note.trim();
  if (username.length < 2 || username.length > 32) {
    editError.value = '用户名长度需在 2 到 32 之间';
    return;
  }
  if (note.length > 200) {
    editError.value = '备注长度不能超过 200 字';
    return;
  }

  editSaving.value = true;
  editError.value = '';
  try {
    await updateAdminUser(editingUser.value.id, {
      username,
      email: editForm.email.trim(),
      emailVerified: Boolean(editForm.emailVerified),
      note
    });
    closeEditModal();
    await loadUsers(page.value);
  } catch (err) {
    editError.value = err instanceof Error ? err.message : '保存用户资料失败';
  } finally {
    editSaving.value = false;
  }
}

function openAuditModal(user: UserRow) {
  auditUser.value = user;
  auditPage.value = 1;
  auditLogs.value = [];
  auditTotal.value = 0;
  auditError.value = '';
  void loadAuditLogs(1);
}

function closeAuditModal() {
  auditUser.value = null;
  auditLogs.value = [];
  auditError.value = '';
  auditLoading.value = false;
}

async function loadAuditLogs(nextPage = auditPage.value) {
  if (!auditUser.value) return;
  if (nextPage < 1) return;
  auditLoading.value = true;
  auditError.value = '';
  try {
    const result = await fetchAdminUserAuditLogs(auditUser.value.id, {
      page: nextPage,
      pageSize: auditPageSize
    });
    auditLogs.value = result.items || [];
    auditTotal.value = result.total || 0;
    auditPage.value = result.page || nextPage;
  } catch (err) {
    auditError.value = err instanceof Error ? err.message : '加载审计日志失败';
  } finally {
    auditLoading.value = false;
  }
}

function formatTime(iso: string) {
  const ts = Date.parse(String(iso || ''));
  if (!Number.isFinite(ts)) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function formatAuditDetail(detail: unknown) {
  if (detail == null) return '-';
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}
</script>

<style scoped>
.user-admin-view {
  display: grid;
  gap: 16px;
}

.admin-hero p {
  color: #9fb0cc;
}

.toolbar {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar__search {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}

.toolbar__search .ui-input {
  min-width: 280px;
}

.toolbar__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ui-select {
  min-width: 130px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #dbeafe;
  border-radius: 10px;
  padding: 8px 10px;
}

.toolbar__meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.state-panel {
  margin: 0;
}

.list-card {
  padding: 16px;
}

.loading-state,
.empty-state {
  min-height: 260px;
  display: grid;
  place-items: center;
  color: #9fb0cc;
  gap: 8px;
}

.loading-state.compact,
.empty-state.compact {
  min-height: 120px;
}

.user-list {
  display: grid;
  gap: 12px;
}

.user-card {
  display: grid;
  grid-template-columns: 1.4fr 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba(35, 48, 70, 0.9);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.72);
}

.user-card__main {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.user-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
}

.user-meta h3,
.user-meta p,
.user-meta small {
  margin: 0;
}

.user-meta h3 {
  font-size: 16px;
}

.user-meta p,
.user-meta small {
  color: #9fb0cc;
}

.user-note {
  margin-top: 3px;
  color: #f5d0fe;
}

.verify-badge {
  display: inline-flex;
  width: fit-content;
  margin-top: 3px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}

.verify-badge.is-verified {
  color: #8de6b4;
  border-color: rgba(141, 230, 180, 0.35);
  background: rgba(18, 72, 45, 0.25);
}

.verify-badge.is-unverified {
  color: #ffe7a4;
  border-color: rgba(255, 214, 102, 0.4);
  background: rgba(101, 70, 7, 0.25);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-top: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}

.status-badge.is-active {
  color: #8de6b4;
  border-color: rgba(141, 230, 180, 0.35);
  background: rgba(18, 72, 45, 0.25);
}

.status-badge.is-banned {
  color: #ffb4b4;
  border-color: rgba(255, 107, 107, 0.45);
  background: rgba(114, 30, 30, 0.3);
}

.user-card__roles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #dbeafe;
}

.user-card__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

.page-info {
  color: #9fb0cc;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  padding: 16px;
  background: rgba(5, 10, 20, 0.72);
  display: grid;
  place-items: center;
}

.modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(59, 130, 246, 0.26);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(8, 16, 32, 0.98));
  padding: 16px;
}

.modal-subtitle {
  margin: 0;
  color: #9fb0cc;
}

.edit-form {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  color: #dbeafe;
  font-size: 13px;
}

.checkbox-line {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 6px;
}

.inline-error {
  margin: 0;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.38);
  border-radius: 10px;
  padding: 8px 10px;
}

.audit-modal {
  width: min(900px, 100%);
}

.audit-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.audit-item {
  border: 1px solid rgba(51, 65, 85, 0.9);
  border-radius: 12px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.58);
}

.audit-item header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.audit-item strong {
  color: #c7d2fe;
}

.audit-item time,
.audit-item p {
  color: #9fb0cc;
  margin: 0;
}

.audit-detail {
  margin: 8px 0 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 8px;
  border-radius: 8px;
  background: rgba(8, 15, 28, 0.88);
  color: #dbeafe;
  border: 1px solid rgba(51, 65, 85, 0.8);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .user-card {
    grid-template-columns: 1fr;
  }

  .toolbar__search .ui-input {
    min-width: 0;
    width: 100%;
  }
}
</style>
