<template>
  <div class="audit-admin page-shell">
    <header class="page-hero">
      <h1 class="page-hero__title">审计日志中心</h1>
      <p class="page-hero__subtitle">统一检索用户管理、投稿审核与安全模块审计记录。</p>
    </header>

    <AppStatePanel
      v-if="!hasSecret"
      variant="info"
      eyebrow="Audit"
      title="请输入管理员密钥后继续"
      message="审计日志属于敏感管理数据，需提供 X-Admin-Secret 才能访问。"
    />

    <section class="controls card glass-card ui-card">
      <label>
        管理员密钥
        <input v-model.trim="adminSecret" class="ui-input" type="password" placeholder="X-Admin-Secret" />
      </label>
      <label>
        模块
        <select v-model="moduleFilter" class="ui-input" @change="loadLogs(1)">
          <option value="">全部</option>
          <option value="user_admin">user_admin</option>
          <option value="skin_review">skin_review</option>
          <option value="security">security</option>
          <option value="ops">ops</option>
        </select>
      </label>
      <label>
        动作
        <input v-model.trim="actionFilter" class="ui-input" type="text" placeholder="如 ban / approve / role" @keyup.enter="loadLogs(1)" />
      </label>
      <label>
        关键词
        <input v-model.trim="keyword" class="ui-input" type="text" placeholder="用户名 / ID / detail 文本" @keyup.enter="loadLogs(1)" />
      </label>
      <label>
        每页条数
        <select v-model.number="pageSize" class="ui-input" @change="loadLogs(1)">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <div class="actions">
        <button class="ui-btn" type="button" @click="loadLogs(1)" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
        <button class="ui-btn secondary" type="button" @click="exportCsv" :disabled="exporting">
          {{ exporting ? '导出中...' : '导出 CSV' }}
        </button>
      </div>
    </section>

    <AppStatePanel
      v-if="error"
      variant="error"
      eyebrow="Audit"
      title="审计日志加载失败"
      :message="error"
      hint="请检查管理员密钥、服务状态和权限配置。"
    />

    <section class="card glass-card ui-card table-card">
      <div class="panel-head">
        <h3>审计记录</h3>
        <p class="muted">共 {{ total }} 条，当前第 {{ page }} / {{ totalPages }} 页</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>模块</th>
            <th>动作</th>
            <th>操作者</th>
            <th>目标</th>
            <th>差异</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in items" :key="log.id">
            <td>{{ fmt(log.at) }}</td>
            <td>{{ log.module || '-' }}</td>
            <td>{{ displayAction(log) }}</td>
            <td>{{ displayActor(log) }}</td>
            <td>{{ displayTarget(log) }}</td>
            <td>{{ log.diff ? '有 diff' : '-' }}</td>
            <td>
              <button class="ui-btn small" type="button" @click="openDetail(log)">查看</button>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="7" class="empty">暂无审计日志</td>
          </tr>
        </tbody>
      </table>
      <div class="pager">
        <button class="ui-btn secondary small" type="button" @click="loadLogs(page - 1)" :disabled="page <= 1 || loading">上一页</button>
        <button class="ui-btn secondary small" type="button" @click="loadLogs(page + 1)" :disabled="page >= totalPages || loading">下一页</button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="detailVisible" class="drawer-mask" @click.self="closeDetail">
        <div class="drawer ui-card">
          <div class="panel-head">
            <h3>审计详情</h3>
            <button class="ui-btn secondary small" type="button" @click="closeDetail">关闭</button>
          </div>
          <pre class="json-view">{{ detailText }}</pre>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import { useToastStore } from '@/stores/toast'
import { useAdminSecret } from '@/composables/useAdminSecret'
import { exportAdminAuditCsv, fetchAdminAuditLogs, type AuditLogItem } from '@/features/skin/api-ops'

const toast = useToastStore()
const { adminSecret, hasSecret } = useAdminSecret()
const moduleFilter = ref('')
const actionFilter = ref('')
const keyword = ref('')
const pageSize = ref(20)

const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const items = ref<AuditLogItem[]>([])
const total = ref(0)
const page = ref(1)

const detailVisible = ref(false)
const detailText = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

let secretLoadTimer: ReturnType<typeof setTimeout> | null = null

function fmt(v?: string) {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

function displayActor(log: AuditLogItem) {
  return log.actorUsername || log.actorUserId || '-'
}

function displayTarget(log: AuditLogItem) {
  return log.targetUsername || log.targetUserId || '-'
}

const actionLabelMap: Record<string, string> = {
  user_edit: '用户资料编辑',
  user_ban: '用户封禁',
  user_unban: '用户解封',
  user_delete: '用户删除',
  user_roles_update: '用户角色变更',
  approve: '投稿通过',
  reject: '投稿驳回',
  reopen: '投稿回退重审',
  task_retry: '任务重试',
  dead_letter_retry: '死信重放',
  session_revoke: '会话撤销',
  session_revoke_all: '全会话下线',
  totp_enable: '启用两步验证',
  totp_disable: '关闭两步验证',
  verify_init: '发起正版验证',
  verify_success: '正版验证成功',
  verify_failed: '正版验证失败',
  verify_cancel: '取消正版验证',
}

function displayAction(log: AuditLogItem) {
  const key = String(log.action || '').trim().toLowerCase()
  if (!key) return '-'
  return actionLabelMap[key] || key
}

async function loadLogs(nextPage = page.value) {
  if (!hasSecret.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await fetchAdminAuditLogs({
      page: nextPage,
      pageSize: pageSize.value,
      module: moduleFilter.value || undefined,
      action: actionFilter.value || undefined,
      q: keyword.value || undefined,
    }, adminSecret.value)
    items.value = result.items
    total.value = result.total
    page.value = result.page
  } catch (err) {
    error.value = err instanceof Error ? err.message : '审计日志加载失败'
  } finally {
    loading.value = false
  }
}

function openDetail(log: AuditLogItem) {
  detailText.value = JSON.stringify(log, null, 2)
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  detailText.value = ''
}

async function exportCsv() {
  if (!hasSecret.value) {
    toast.addToast({ type: 'warning', message: '请先输入管理员密钥' })
    return
  }
  exporting.value = true
  try {
    const blob = await exportAdminAuditCsv(adminSecret.value, moduleFilter.value || '')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.addToast({ type: 'success', message: '审计 CSV 已导出' })
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '审计导出失败' })
  } finally {
    exporting.value = false
  }
}

watch(adminSecret, (secret) => {
  if (secretLoadTimer) {
    clearTimeout(secretLoadTimer)
    secretLoadTimer = null
  }
  if (!String(secret || '').trim()) {
    items.value = []
    total.value = 0
    error.value = ''
    return
  }
  secretLoadTimer = setTimeout(() => {
    void loadLogs(1)
  }, 260)
})

onUnmounted(() => {
  if (secretLoadTimer) {
    clearTimeout(secretLoadTimer)
    secretLoadTimer = null
  }
})
</script>

<style scoped>
.audit-admin {
  display: grid;
  gap: 14px;
}

.controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.controls label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #9fb0cc;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.table-card {
  padding: 12px;
  overflow: auto;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.muted {
  color: #9fb0cc;
  font-size: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 880px;
}

th,
td {
  border-bottom: 1px solid #233046;
  padding: 8px;
  text-align: left;
  font-size: 12px;
}

.empty {
  text-align: center;
  color: #9fb0cc;
}

.pager {
  margin-top: 10px;
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
  width: min(920px, 96vw);
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
    grid-template-columns: 1fr 1fr;
  }
}
</style>
