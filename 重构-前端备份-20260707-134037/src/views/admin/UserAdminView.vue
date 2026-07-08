<template>
  <div class="user-admin-view">
    <header class="admin-header page-hero">
      <h1 class="page-hero__title">{{ $t('admin.user.title') || '用户管理' }}</h1>
      <div class="header-actions">
        <div class="search-box starmc-list-group">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="$t('admin.user.search') || '搜索用户...'"
            @keyup.enter="handleSearch"
          >
          <button class="starmc-badge is-info" @click="handleSearch">
            {{ $t('common.search') }}
          </button>
        </div>
      </div>
    </header>

    <!-- 统计卡片 -->
    <div class="stats-grid starmc-list-group">
      <div class="starmc-list-item stat-card">
        <span class="starmc-badge is-info stat-value">{{ stats.total }}</span>
        <span class="stat-label">{{ $t('admin.user.total') || '总用户数' }}</span>
      </div>
      <div class="starmc-list-item stat-card active">
        <span class="starmc-badge is-success stat-value">{{ stats.active }}</span>
        <span class="stat-label">{{ $t('admin.user.active') || '活跃用户' }}</span>
      </div>
      <div class="starmc-list-item stat-card online">
        <span class="starmc-badge is-info stat-value">{{ stats.online }}</span>
        <span class="stat-label">{{ $t('admin.user.online') || '在线用户' }}</span>
      </div>
      <div class="starmc-list-item stat-card banned">
        <span class="starmc-badge is-error stat-value">{{ stats.banned }}</span>
        <span class="stat-label">{{ $t('admin.user.banned') || '已封禁' }}</span>
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="filters starmc-list-group">
      <select v-model="filterRole" class="starmc-list-item">
        <option value="">{{ $t('admin.user.allRoles') || '所有角色' }}</option>
        <option value="admin">{{ $t('admin.user.admin') || '管理员' }}</option>
        <option value="reviewer">{{ $t('admin.user.reviewer') || '审核员' }}</option>
        <option value="moderator">{{ $t('admin.user.moderator') || '版主' }}</option>
        <option value="user">{{ $t('admin.user.normal') || '普通用户' }}</option>
      </select>

      <select v-model="filterStatus" class="starmc-list-item">
        <option value="">{{ $t('admin.user.allStatus') || '所有状态' }}</option>
        <option value="active">{{ $t('admin.user.active') || '正常' }}</option>
        <option value="inactive">{{ $t('admin.user.inactive') || '未激活' }}</option>
        <option value="banned">{{ $t('admin.user.banned') || '已封禁' }}</option>
      </select>

      <select v-model="sortBy" class="starmc-list-item">
        <option value="newest">{{ $t('admin.user.newest') || '最新注册' }}</option>
        <option value="oldest">{{ $t('admin.user.oldest') || '最早注册' }}</option>
        <option value="name">{{ $t('admin.user.name') || '用户名' }}</option>
        <option value="activity">{{ $t('admin.user.activity') || '最近活跃' }}</option>
      </select>
    </div>

    <!-- 用户列表 -->
    <div class="user-list starmc-list-group">
      <table>
        <thead>
          <tr>
            <th>{{ $t('admin.user.avatar') || '头像' }}</th>
            <th>{{ $t('admin.user.username') || '用户名' }}</th>
            <th>{{ $t('admin.user.email') || '邮箱' }}</th>
            <th>{{ $t('admin.user.roles') || '角色' }}</th>
            <th>{{ $t('admin.user.status') || '状态' }}</th>
            <th>{{ $t('admin.user.stats') || '统计' }}</th>
            <th>{{ $t('admin.user.actions') || '操作' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in paginatedUsers"
            :key="user.id"
          >
            <td class="avatar-cell">
              <img
                :src="user.avatar || '/default-avatar.png'"
                :alt="user.username"
                class="user-avatar"
              >
            </td>
            <td>
              <strong>{{ user.username }}</strong>
              <p class="user-id">ID: {{ user.id }}</p>
            </td>
            <td>{{ user.email }}</td>
            <td>
              <div class="role-list starmc-list-group">
                <span
                  v-for="role in user.roles"
                  :key="role"
                  class="starmc-badge role-badge"
                  :class="role"
                >
                  {{ getRoleLabel(role) }}
                </span>
              </div>
            </td>
            <td>
              <span
                class="starmc-badge status-badge"
                :class="user.status"
              >
                {{ getStatusLabel(user.status) }}
              </span>
            </td>
            <td>
              <div class="stats starmc-list-group">
                <span class="starmc-badge is-info">📤 {{ user.uploadCount || 0 }}</span>
                <span class="starmc-badge is-info">⭐ {{ user.favoriteCount || 0 }}</span>
                <span class="starmc-badge is-info">📅 {{ formatDate(user.lastActiveAt) }}</span>
              </div>
            </td>
            <td>
              <div class="action-btns">
                <button
                  class="edit-btn"
                  :title="$t('admin.user.edit') || '编辑'"
                  @click="editUser(user)"
                >
                  ✏️
                </button>
                <button
                  v-if="user.status !== 'banned'"
                  class="ban-btn"
                  :title="$t('admin.user.ban') || '封禁'"
                  @click="confirmBan(user)"
                >
                  🚫
                </button>
                <button
                  v-else
                  class="unban-btn"
                  :title="$t('admin.user.unban') || '解封'"
                  @click="unbanUser(user.id)"
                >
                  ✅
                </button>
                <button
                  class="delete-btn"
                  :title="$t('admin.user.delete') || '删除'"
                  @click="confirmDelete(user)"
                >
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 分页 -->
      <div class="pagination starmc-list-group">
        <button
          :disabled="currentPage <= 1"
          @click="currentPage--"
        >
          ←
        </button>
        <span>{{ $t('admin.user.page', { current: currentPage, total: totalPages }) }}</span>
        <button
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
        >
          →
        </button>
      </div>
    </div>

    <!-- 编辑用户模态框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="editingUser"
          class="modal-overlay"
          @click.self="closeModal"
        >
          <div class="modal">
            <h2>{{ $t('admin.user.edit') || '编辑用户' }}</h2>
            
            <form @submit.prevent="saveUser">
              <div class="form-group">
                <label>{{ $t('admin.user.username') || '用户名' }}</label>
                <input
                  v-model="form.username"
                  type="text"
                  disabled
                >
              </div>

              <div class="form-group">
                <label>{{ $t('admin.user.email') || '邮箱' }}</label>
                <input
                  v-model="form.email"
                  type="email"
                >
              </div>

              <div class="form-group">
                <label>{{ $t('admin.user.roles') || '角色' }}</label>
                <div class="checkbox-group">
                  <label
                    v-for="role in availableRoles"
                    :key="role"
                    class="checkbox-label"
                  >
                    <input
                      v-model="form.roles"
                      type="checkbox"
                      :value="role"
                    >
                    {{ getRoleLabel(role) }}
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label>{{ $t('admin.user.status') || '状态' }}</label>
                <select v-model="form.status">
                  <option value="active">{{ $t('admin.user.active') || '正常' }}</option>
                  <option value="inactive">{{ $t('admin.user.inactive') || '未激活' }}</option>
                  <option value="banned">{{ $t('admin.user.banned') || '已封禁' }}</option>
                </select>
              </div>

              <div class="form-group">
                <label>{{ $t('admin.user.notes') || '备注' }}</label>
                <textarea
                  v-model="form.notes"
                  rows="3"
                />
              </div>

              <div class="form-actions">
                <button
                  type="button"
                  class="cancel-btn"
                  @click="closeModal"
                >
                  {{ $t('common.cancel') }}
                </button>
                <button
                  type="submit"
                  class="save-btn"
                  :disabled="saving"
                >
                  {{ saving ? ($t('common.saving') || '保存中...') : ($t('common.save') || '保存') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 封禁确认 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="userToBan"
          class="modal-overlay"
          @click.self="userToBan = null"
        >
          <div class="modal confirm-modal">
            <h3>{{ $t('admin.user.confirmBan') || '确认封禁' }}</h3>
            <p>{{ $t('admin.user.banWarning', { name: userToBan.username }) }}</p>
            <div class="form-group">
              <label>{{ $t('admin.user.banReason') || '封禁原因' }}</label>
              <select v-model="banReason">
                <option value="spam">{{ $t('admin.user.reason.spam') || '垃圾信息' }}</option>
                <option value="abuse">{{ $t('admin.user.reason.abuse') || '滥用行为' }}</option>
                <option value="cheating">{{ $t('admin.user.reason.cheating') || '作弊' }}</option>
                <option value="other">{{ $t('admin.user.reason.other') || '其他' }}</option>
              </select>
            </div>
            <div class="form-actions">
              <button
                class="cancel-btn"
                @click="userToBan = null"
              >
                {{ $t('common.cancel') }}
              </button>
              <button
                class="ban-confirm-btn"
                @click="banUser(userToBan.id)"
              >
                {{ $t('admin.user.ban') || '封禁' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="userToDelete"
          class="modal-overlay"
          @click.self="userToDelete = null"
        >
          <div class="modal confirm-modal">
            <h3>{{ $t('admin.user.confirmDelete') || '确认删除' }}</h3>
            <p>{{ $t('admin.user.deleteWarning', { name: userToDelete.username }) }}</p>
            <div class="form-actions">
              <button
                class="cancel-btn"
                @click="userToDelete = null"
              >
                {{ $t('common.cancel') }}
              </button>
              <button
                class="delete-confirm-btn"
                @click="deleteUser(userToDelete.id)"
              >
                {{ $t('admin.user.delete') || '删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'

interface User {
  id: string
  username: string
  email: string
  avatar?: string
  roles: string[]
  status: 'active' | 'inactive' | 'banned'
  uploadCount?: number
  favoriteCount?: number
  lastActiveAt?: string
  createdAt?: string
  notes?: string
}

// 模拟数据
const mockUsers: User[] = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@starmc.cn',
    avatar: '/avatars/admin.png',
    roles: ['admin'],
    status: 'active',
    uploadCount: 156,
    favoriteCount: 23,
    lastActiveAt: new Date().toISOString(),
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    username: 'reviewer01',
    email: 'reviewer@starmc.cn',
    roles: ['reviewer'],
    status: 'active',
    uploadCount: 45,
    favoriteCount: 89,
    lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: '2024-02-15T00:00:00Z',
  },
  {
    id: '3',
    username: 'player123',
    email: 'player@example.com',
    roles: ['user'],
    status: 'active',
    uploadCount: 12,
    favoriteCount: 156,
    lastActiveAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: '2024-03-01T00:00:00Z',
  },
  {
    id: '4',
    username: 'spammer',
    email: 'spam@example.com',
    roles: ['user'],
    status: 'banned',
    uploadCount: 0,
    favoriteCount: 0,
    lastActiveAt: new Date(Date.now() - 604800000).toISOString(),
    createdAt: '2024-03-10T00:00:00Z',
    notes: '发送垃圾信息',
  },
  {
    id: '5',
    username: 'moderator',
    email: 'mod@starmc.cn',
    roles: ['moderator', 'reviewer'],
    status: 'active',
    uploadCount: 78,
    favoriteCount: 234,
    lastActiveAt: new Date().toISOString(),
    createdAt: '2024-01-15T00:00:00Z',
  },
]

const users = ref<User[]>(mockUsers)
const searchQuery = ref('')
const filterRole = ref('')
const filterStatus = ref('')
const sortBy = ref('newest')
const currentPage = ref(1)
const pageSize = 10

const editingUser = ref<User | null>(null)
const userToBan = ref<User | null>(null)
const userToDelete = ref<User | null>(null)
const banReason = ref('spam')
const saving = ref(false)

const availableRoles = ['admin', 'reviewer', 'moderator', 'user']

const form = reactive<{ username: string; email: string; roles: string[]; status: User['status']; notes: string }>({
  username: '',
  email: '',
  roles: [],
  status: 'active',
  notes: '',
})

const filteredUsers = computed(() => {
  let result = [...users.value]
  
  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(u => 
      u.username.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.id.includes(query)
    )
  }
  
  // 角色过滤
  if (filterRole.value) {
    result = result.filter(u => u.roles.includes(filterRole.value))
  }
  
  // 状态过滤
  if (filterStatus.value) {
    result = result.filter(u => u.status === filterStatus.value)
  }
  
  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'newest':
        return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1
      case 'oldest':
        return (a.createdAt || '') > (b.createdAt || '') ? 1 : -1
      case 'name':
        return a.username.localeCompare(b.username)
      case 'activity':
        return (b.lastActiveAt || '') > (a.lastActiveAt || '') ? 1 : -1
      default:
        return 0
    }
  })
  
  return result
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize)))
const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredUsers.value.slice(start, start + pageSize)
})

const stats = computed(() => {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 86400000)
  
  return users.value.reduce((acc, user) => {
    acc.total++
    if (user.status === 'active') acc.active++
    if (user.status === 'banned') acc.banned++
    if (user.lastActiveAt && new Date(user.lastActiveAt) > oneDayAgo) {
      acc.online++
    }
    return acc
  }, { total: 0, active: 0, online: 0, banned: 0 })
})

const handleSearch = () => {
  currentPage.value = 1
}

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    admin: '管理员',
    reviewer: '审核员',
    moderator: '版主',
    user: '用户',
  }
  return labels[role] || role
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    active: '正常',
    inactive: '未激活',
    banned: '已封禁',
  }
  return labels[status] || status
}

const formatDate = (date?: string) => {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  
  return d.toLocaleDateString('zh-CN')
}

const editUser = (user: User) => {
  editingUser.value = user
  form.username = user.username
  form.email = user.email
  form.roles = [...user.roles]
  form.status = user.status
  form.notes = user.notes || ''
}

const closeModal = () => {
  editingUser.value = null
  userToBan.value = null
  userToDelete.value = null
}

const saveUser = async () => {
  saving.value = true
  
  if (editingUser.value) {
    const index = users.value.findIndex(u => u.id === editingUser.value!.id)
    if (index !== -1) {
      users.value[index] = {
        ...users.value[index],
        email: form.email,
        roles: [...form.roles],
        status: form.status,
        notes: form.notes,
      }
    }
  }
  
  await new Promise(r => setTimeout(r, 500))
  saving.value = false
  closeModal()
}

const confirmBan = (user: User) => {
  userToBan.value = user
}

const banUser = (id: string) => {
  const user = users.value.find(u => u.id === id)
  if (user) {
    user.status = 'banned'
    user.notes = `封禁原因: ${banReason.value}`
  }
  userToBan.value = null
}

const unbanUser = (id: string) => {
  const user = users.value.find(u => u.id === id)
  if (user) {
    user.status = 'active'
    user.notes = ''
  }
}

const confirmDelete = (user: User) => {
  userToDelete.value = user
}

const deleteUser = (id: string) => {
  users.value = users.value.filter(u => u.id !== id)
  userToDelete.value = null
}
</script>

<style scoped>
.user-admin-view {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.admin-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary, #fff);
}

.header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-box {
  display: flex;
  gap: 0.5rem;
}

.search-box input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  min-width: 200px;
}

.search-box input:focus {
  outline: none;
  border-color: #3b82f6;
}

.search-box button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 1.25rem;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-card.active {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
}

.stat-card.online {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.05);
}

.stat-card.banned {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
}

.stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.stat-label {
  display: block;
  font-size: 0.8125rem;
  color: var(--text-secondary, #9ca3af);
  margin-top: 0.25rem;
}

.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filters select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
}

.user-list {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  overflow: hidden;
}

.user-list table {
  width: 100%;
  border-collapse: collapse;
}

.user-list th,
.user-list td {
  padding: 0.875rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.user-list th {
  background: rgba(255, 255, 255, 0.03);
  font-weight: 500;
  font-size: 0.8125rem;
  color: var(--text-secondary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.avatar-cell {
  width: 60px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.3);
}

.user-id {
  margin: 0.25rem 0 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary, #9ca3af);
}

.role-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.role-badge.admin {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.role-badge.reviewer {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.role-badge.moderator {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}

.role-badge.user {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.status-badge.active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-badge.inactive {
  background: rgba(156, 163, 175, 0.2);
  color: #9ca3af;
}

.status-badge.banned {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--text-secondary, #9ca3af);
}

.action-btns {
  display: flex;
  gap: 0.375rem;
}

.action-btns button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary, #9ca3af);
  padding: 0.375rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btns button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.pagination button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal {
  background: var(--surface-1, #1e1e23);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.25rem;
  color: var(--text-primary, #fff);
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.875rem;
  color: var(--text-secondary, #9ca3af);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
  padding: 0.625rem 0.875rem;
  border-radius: 6px;
  font-size: 0.9375rem;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-primary, #fff);
}

.checkbox-label input {
  width: auto;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.form-actions button {
  flex: 1;
  padding: 0.625rem 1rem;
  border-radius: 6px;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary, #9ca3af);
}

.save-btn {
  background: #3b82f6;
  border: none;
  color: white;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ban-confirm-btn {
  background: #f59e0b;
  border: none;
  color: white;
}

.delete-confirm-btn {
  background: #ef4444;
  border: none;
  color: white;
}

.confirm-modal {
  text-align: center;
}

.confirm-modal h3 {
  margin: 0 0 0.75rem 0;
}

.confirm-modal p {
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 1.5rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .admin-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .header-actions {
    width: 100%;
  }
  
  .search-box {
    width: 100%;
  }
  
  .search-box input {
    flex: 1;
  }
  
  .user-list {
    overflow-x: auto;
  }
  
  .user-list table {
    min-width: 900px;
  }
}
</style>
