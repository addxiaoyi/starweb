<template>
  <div class="notification-center page-shell">
    <header class="page-hero">
      <h1 class="page-hero__title">通知中心</h1>
      <p class="page-hero__subtitle">查看审核结果、安全告警与绑定状态变化通知。</p>
      <div class="summary-pills">
        <span class="summary-pill">总通知 {{ total }}</span>
        <span class="summary-pill">未读 {{ unreadCount }}</span>
      </div>
    </header>

    <section class="controls card glass-card ui-card">
      <label>
        类型筛选
        <select v-model="selectedType" class="ui-input" @change="loadNotifications(1)">
          <option value="all">全部类型</option>
          <option v-for="opt in typeOptions" :key="opt.type" :value="opt.type">
            {{ opt.label || opt.type }}（总{{ opt.total }} / 未读{{ opt.unread }}）
          </option>
        </select>
      </label>
      <label>
        自定义类型
        <input
          v-model.trim="customType"
          class="ui-input"
          type="text"
          placeholder="例如 submission_review"
          @keyup.enter="loadNotifications(1)"
        />
      </label>
      <label class="toggle-label">
        <span>仅看未读</span>
        <input v-model="unreadOnly" type="checkbox" @change="loadNotifications(1)" />
      </label>
      <label>
        每页条数
        <select v-model.number="pageSize" class="ui-input" @change="loadNotifications(1)">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
      <div class="actions">
        <button class="ui-btn" type="button" @click="loadNotifications(1)" :disabled="loading">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
        <button class="ui-btn secondary" type="button" @click="readAll" :disabled="readingAll || unreadCount <= 0">
          {{ readingAll ? '处理中...' : '全部已读' }}
        </button>
      </div>
    </section>

    <section class="type-chips card glass-card ui-card" v-if="typeOptions.length > 0">
      <button
        class="chip"
        type="button"
        :class="{ active: selectedType === 'all' && !customType }"
        @click="applyType('all')"
      >
        全部类型
      </button>
      <button
        v-for="opt in typeOptions"
        :key="`chip-${opt.type}`"
        class="chip"
        type="button"
        :class="{ active: selectedType === opt.type && !customType }"
        @click="applyType(opt.type)"
      >
        {{ opt.label || opt.type }}
        <span class="chip-count">{{ opt.unread }}/{{ opt.total }}</span>
      </button>
    </section>

    <AppStatePanel
      v-if="error"
      variant="error"
      eyebrow="Notifications"
      title="通知加载失败"
      :message="error"
      hint="请检查登录状态或稍后重试。"
    />

    <section class="card glass-card ui-card list-card">
      <div class="panel-head">
        <h3>通知列表</h3>
        <p class="muted">第 {{ page }} / {{ totalPages }} 页</p>
      </div>

      <ul class="notice-list" v-if="items.length > 0">
        <li v-for="item in items" :key="item.id" class="notice-item" :class="{ unread: !item.readAt }">
          <div class="notice-main">
            <div class="notice-title-row">
              <strong>{{ item.title || '系统通知' }}</strong>
              <span class="badge" :class="item.readAt ? 'is-read' : 'is-unread'">{{ item.readAt ? '已读' : '未读' }}</span>
            </div>
            <p class="notice-message">{{ item.message || '暂无内容' }}</p>
            <p v-if="notificationHint(item)" class="notice-hint">{{ notificationHint(item) }}</p>
            <p class="notice-meta">
              <span>类型：{{ typeLabel(item.type) }}</span>
              <span>时间：{{ fmt(item.createdAt) }}</span>
            </p>
          </div>
          <div class="notice-actions">
            <button class="ui-btn secondary small" type="button" @click="openDetail(item)">详情</button>
            <button class="ui-btn small" type="button" @click="readOne(item.id)" :disabled="!!item.readAt || readingId === item.id">
              {{ readingId === item.id ? '处理中...' : item.readAt ? '已读' : '标记已读' }}
            </button>
          </div>
        </li>
      </ul>

      <div v-else class="empty">暂无通知</div>

      <div class="pager">
        <button class="ui-btn secondary small" type="button" @click="loadNotifications(page - 1)" :disabled="page <= 1 || loading">上一页</button>
        <button class="ui-btn secondary small" type="button" @click="loadNotifications(page + 1)" :disabled="page >= totalPages || loading">下一页</button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="detailVisible" class="drawer-mask" @click.self="closeDetail">
        <div class="drawer ui-card">
          <div class="panel-head">
            <h3>通知详情</h3>
            <button class="ui-btn secondary small" type="button" @click="closeDetail">关闭</button>
          </div>
          <pre class="json-view">{{ detailText }}</pre>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import { useToastStore } from '@/stores/toast'
import {
  fetchUserNotificationTypes,
  fetchUserNotificationUnreadCount,
  fetchUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  type NotificationTypeSummary,
  type UserNotification,
} from '@/features/skin/api-notifications'

const toast = useToastStore()

const selectedType = ref('all')
const customType = ref('')
const unreadOnly = ref(false)
const pageSize = ref(20)

const loading = ref(false)
const readingId = ref('')
const readingAll = ref(false)
const error = ref('')
const items = ref<UserNotification[]>([])
const typeOptions = ref<NotificationTypeSummary[]>([])
const total = ref(0)
const page = ref(1)
const unreadCount = ref(0)

const detailVisible = ref(false)
const detailText = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const effectiveTypeFilter = computed(() => {
  const custom = customType.value.trim().toLowerCase()
  if (custom) return custom
  const selected = String(selectedType.value || '').trim().toLowerCase()
  if (!selected || selected === 'all') return undefined
  return selected
})

const DEFAULT_TYPE_LABELS: Record<string, string> = {
  submission_review: '投稿审核结果',
  submission_reopen: '投稿回退待审',
  security_alert: '安全告警',
  binding_changed: '绑定状态变更',
  report_result: '举报处理结果',
  skin_comment: '皮肤评论通知',
  webhook_failed: 'Webhook 失败',
  system: '系统通知',
}

function fmt(v?: string) {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

function typeLabel(type?: string) {
  const key = String(type || '').trim().toLowerCase()
  if (!key) return '未知类型'
  const found = typeOptions.value.find((row) => String(row.type || '').toLowerCase() === key)
  return String(found?.label || DEFAULT_TYPE_LABELS[key] || key)
}

function applyType(type: string) {
  selectedType.value = type
  customType.value = ''
  void loadNotifications(1)
}

function notificationHint(item: UserNotification) {
  const type = String(item.type || '').trim().toLowerCase()
  const detail = item.detail && typeof item.detail === 'object' ? item.detail : null
  if (!detail) return ''
  if (type === 'submission_review') {
    const status = String((detail as Record<string, unknown>).status || '').trim()
    const submissionId = String((detail as Record<string, unknown>).submissionId || '').trim()
    const reviewNote = String((detail as Record<string, unknown>).reviewNote || '').trim()
    const statusText = status === 'approved' ? '通过' : status === 'rejected' ? '驳回' : status || '-'
    const noteText = reviewNote ? `，备注：${reviewNote}` : ''
    return `审核状态：${statusText}${submissionId ? `，投稿ID：${submissionId}` : ''}${noteText}`
  }
  if (type === 'submission_reopen') {
    const submissionId = String((detail as Record<string, unknown>).submissionId || '').trim()
    return submissionId ? `已回退待审，投稿ID：${submissionId}` : '投稿已回退待审'
  }
  if (type === 'security_alert') {
    const level = String((detail as Record<string, unknown>).level || '').trim().toUpperCase()
    return level ? `告警等级：${level}` : '安全告警'
  }
  return ''
}

function openDetail(item: UserNotification) {
  detailText.value = JSON.stringify(item, null, 2)
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  detailText.value = ''
}

async function loadUnreadCount() {
  try {
    unreadCount.value = await fetchUserNotificationUnreadCount()
  } catch {
    unreadCount.value = 0
  }
}

async function loadTypeSummary() {
  try {
    typeOptions.value = await fetchUserNotificationTypes(true)
  } catch {
    typeOptions.value = []
  }
}

async function loadNotifications(nextPage = page.value) {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchUserNotifications({
      page: nextPage,
      pageSize: pageSize.value,
      type: effectiveTypeFilter.value,
      unreadOnly: unreadOnly.value,
    })
    items.value = result.items
    total.value = result.total
    page.value = result.page
    await Promise.all([loadUnreadCount(), loadTypeSummary()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : '通知列表加载失败'
  } finally {
    loading.value = false
  }
}

async function readOne(id: string) {
  readingId.value = id
  try {
    await markUserNotificationRead(id)
    const row = items.value.find((x) => x.id === id)
    if (row && !row.readAt) {
      row.readAt = new Date().toISOString()
    }
    await Promise.all([loadUnreadCount(), loadTypeSummary()])
    toast.addToast({ type: 'success', message: '通知已标记为已读' })
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '通知已读失败' })
  } finally {
    readingId.value = ''
  }
}

async function readAll() {
  readingAll.value = true
  try {
    const updated = await markAllUserNotificationsRead()
    for (const item of items.value) {
      if (!item.readAt) item.readAt = new Date().toISOString()
    }
    await Promise.all([loadUnreadCount(), loadTypeSummary()])
    toast.addToast({ type: 'success', message: updated > 0 ? `已批量已读 ${updated} 条通知` : '当前没有未读通知' })
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '批量已读失败' })
  } finally {
    readingAll.value = false
  }
}

onMounted(() => {
  void loadNotifications(1)
})
</script>

<style scoped>
.notification-center {
  display: grid;
  gap: 14px;
}

.summary-pills {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(159, 176, 204, 0.2);
  background: rgba(15, 23, 42, 0.65);
  color: #e5eefc;
  font-size: 12px;
}

.controls {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.controls label {
  display: grid;
  gap: 6px;
  color: #9fb0cc;
  font-size: 12px;
}

.toggle-label {
  align-self: end;
  grid-template-columns: 1fr auto;
  align-items: center;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.type-chips {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  border: 1px solid rgba(159, 176, 204, 0.3);
  background: rgba(15, 23, 42, 0.6);
  color: #dbeafe;
  border-radius: 999px;
  font-size: 12px;
  padding: 4px 10px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}

.chip.active {
  border-color: rgba(56, 189, 248, 0.7);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.28);
}

.chip-count {
  color: #93c5fd;
}

.list-card {
  padding: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.muted {
  color: #9fb0cc;
  font-size: 12px;
}

.notice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notice-item {
  border: 1px solid rgba(35, 48, 70, 0.9);
  border-radius: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.68);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.notice-item.unread {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.2);
}

.notice-main {
  min-width: 0;
}

.notice-title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
}

.badge.is-read {
  color: #93c5fd;
  border-color: rgba(147, 197, 253, 0.35);
}

.badge.is-unread {
  color: #86efac;
  border-color: rgba(134, 239, 172, 0.35);
}

.notice-message {
  margin: 8px 0 0;
  color: #dbeafe;
}

.notice-hint {
  margin: 8px 0 0;
  color: #93c5fd;
  font-size: 12px;
}

.notice-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9fb0cc;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.notice-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.empty {
  color: #9fb0cc;
  min-height: 180px;
  display: grid;
  place-items: center;
}

.pager {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 12px;
}

.drawer {
  width: min(860px, 96vw);
  max-height: 82vh;
  overflow: auto;
  padding: 12px;
}

.json-view {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 980px) {
  .controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .notice-item {
    flex-direction: column;
  }
}
</style>
