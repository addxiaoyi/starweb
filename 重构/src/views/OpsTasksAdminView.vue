<template>
  <div class="ops-admin page-shell">
    <header class="page-hero">
      <h1 class="page-hero__title">任务与死信中心</h1>
      <p class="page-hero__subtitle">统一查看异步任务、同步任务状态与死信重试结果。</p>
    </header>

    <AppStatePanel
      v-if="!hasSecret"
      variant="info"
      eyebrow="Ops"
      title="请输入管理员密钥后继续"
      message="任务与死信属于运维管理信息，首次进入需要填写 X-Admin-Secret。"
      hint="密钥仅保存在当前浏览器会话。"
    />

    <section class="controls card glass-card ui-card">
      <label>
        管理员密钥
        <input v-model.trim="adminSecret" class="ui-input" type="password" placeholder="X-Admin-Secret" />
      </label>
      <label>
        任务状态
        <select v-model="taskStatusFilter" class="ui-input" @change="loadTasks(1)">
          <option value="">全部</option>
          <option value="pending">pending</option>
          <option value="running">running</option>
          <option value="sent">sent</option>
          <option value="replayed">replayed</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="unknown">unknown</option>
        </select>
      </label>
      <label>
        任务类型
        <input v-model.trim="taskTypeFilter" class="ui-input" type="text" placeholder="如 catalog_sync / webhook" @keyup.enter="loadTasks(1)" />
      </label>
      <label>
        死信类型
        <input v-model.trim="deadTypeFilter" class="ui-input" type="text" placeholder="如 security_webhook" @keyup.enter="loadDeadLetters(1)" />
      </label>
      <label>
        死信状态
        <select v-model="deadResolvedFilter" class="ui-input" @change="loadDeadLetters(1)">
          <option value="">全部</option>
          <option value="false">未处理</option>
          <option value="true">已处理</option>
        </select>
      </label>
      <label>
        每页条数
        <select v-model.number="pageSize" class="ui-input" @change="reloadAll">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <div class="actions">
        <button class="ui-btn" type="button" @click="reloadAll" :disabled="loadingTasks || loadingDead">
          {{ loadingTasks || loadingDead ? '刷新中...' : '刷新数据' }}
        </button>
      </div>
    </section>

    <section class="card glass-card ui-card create-panel">
      <h3>新建异步任务</h3>
      <div class="create-grid">
        <label>
          类型
          <input v-model.trim="createType" class="ui-input" type="text" placeholder="dead_letter_retry / custom_task" />
        </label>
        <label>
          初始状态
          <select v-model="createStatus" class="ui-input">
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
        </label>
      </div>
      <label>
        payload(JSON，可选)
        <textarea
          v-model="createPayloadText"
          class="ui-input payload-input"
          rows="3"
          placeholder='{"source":"manual","note":"from ops console"}'
        />
      </label>
      <button class="ui-btn" type="button" @click="createTask" :disabled="creatingTask">
        {{ creatingTask ? '创建中...' : '创建任务' }}
      </button>
    </section>

    <AppStatePanel
      v-if="taskError"
      variant="error"
      eyebrow="Ops Tasks"
      title="任务列表加载失败"
      :message="taskError"
      hint="请确认管理员密钥与后端状态。"
    />

    <section class="card glass-card ui-card table-card">
      <div class="panel-head">
        <h3>任务列表</h3>
        <p class="muted">共 {{ taskTotal }} 条，当前第 {{ taskPage }} / {{ taskTotalPages }} 页</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>来源</th>
            <th>类型</th>
            <th>状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.id">
            <td class="mono">{{ task.id }}</td>
            <td>{{ task.source }}</td>
            <td>{{ task.type }}</td>
            <td>
              <select v-model="statusDrafts[task.id]" class="ui-input small-input" :disabled="task.source !== 'async_tasks' || updatingTaskId === task.id">
                <option value="pending">pending</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
                <option value="unknown">unknown</option>
              </select>
            </td>
            <td>{{ fmt(task.updatedAt || task.createdAt) }}</td>
            <td class="actions">
              <button
                class="ui-btn small"
                type="button"
                @click="saveTaskStatus(task)"
                :disabled="task.source !== 'async_tasks' || updatingTaskId === task.id"
              >
                {{ updatingTaskId === task.id ? '保存中...' : '保存状态' }}
              </button>
              <button
                class="ui-btn warning small"
                type="button"
                @click="retryTask(task)"
                :disabled="!['security_webhook_queue', 'skin_sync_tasks'].includes(task.source) || retryingTaskId === task.id"
              >
                {{ retryingTaskId === task.id ? '重试中...' : '重试任务' }}
              </button>
              <button class="ui-btn secondary small" type="button" @click="openPayload(task.payload)">查看 payload</button>
            </td>
          </tr>
          <tr v-if="tasks.length === 0">
            <td colspan="6" class="empty">暂无任务数据</td>
          </tr>
        </tbody>
      </table>
      <div class="pager">
        <button class="ui-btn secondary small" type="button" @click="loadTasks(taskPage - 1)" :disabled="taskPage <= 1 || loadingTasks">上一页</button>
        <button class="ui-btn secondary small" type="button" @click="loadTasks(taskPage + 1)" :disabled="taskPage >= taskTotalPages || loadingTasks">下一页</button>
      </div>
    </section>

    <AppStatePanel
      v-if="deadError"
      variant="error"
      eyebrow="Dead Letters"
      title="死信列表加载失败"
      :message="deadError"
      hint="请确认死信队列接口是否可用。"
    />

    <section class="card glass-card ui-card table-card">
      <div class="panel-head">
        <h3>死信队列</h3>
        <p class="muted">共 {{ deadTotal }} 条，当前第 {{ deadPage }} / {{ deadTotalPages }} 页</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>类型</th>
            <th>来源ID</th>
            <th>原因</th>
            <th>状态</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in deadLetters" :key="item.id">
            <td class="mono">{{ item.id }}</td>
            <td>{{ item.type || '-' }}</td>
            <td class="mono">{{ item.sourceId || '-' }}</td>
            <td>{{ item.reason || '-' }}</td>
            <td>
              <span :class="item.resolvedAt ? 'ok' : 'warn'">{{ item.resolvedAt ? '已处理' : '未处理' }}</span>
            </td>
            <td>{{ fmt(item.at) }}</td>
            <td class="actions">
              <button
                class="ui-btn small"
                type="button"
                @click="retryDeadLetter(item)"
                :disabled="retryingDeadId === item.id"
              >
                {{ retryingDeadId === item.id ? '重试中...' : '重试' }}
              </button>
              <button class="ui-btn secondary small" type="button" @click="openPayload(item.payload)">查看 payload</button>
            </td>
          </tr>
          <tr v-if="deadLetters.length === 0">
            <td colspan="7" class="empty">暂无死信数据</td>
          </tr>
        </tbody>
      </table>
      <div class="pager">
        <button class="ui-btn secondary small" type="button" @click="loadDeadLetters(deadPage - 1)" :disabled="deadPage <= 1 || loadingDead">上一页</button>
        <button class="ui-btn secondary small" type="button" @click="loadDeadLetters(deadPage + 1)" :disabled="deadPage >= deadTotalPages || loadingDead">下一页</button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="payloadVisible" class="drawer-mask" @click.self="closePayload">
        <div class="drawer ui-card">
          <div class="panel-head">
            <h3>payload 详情</h3>
            <button class="ui-btn secondary small" type="button" @click="closePayload">关闭</button>
          </div>
          <pre class="json-view">{{ payloadText }}</pre>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import { useToastStore } from '@/stores/toast'
import { useAdminSecret } from '@/composables/useAdminSecret'
import {
  createAdminOpsTask,
  fetchAdminDeadLetters,
  fetchAdminOpsTasks,
  patchAdminOpsTask,
  retryAdminOpsTask,
  retryAdminDeadLetter,
  type DeadLetterItem,
  type OpsTaskItem,
} from '@/features/skin/api-ops'

const toast = useToastStore()
const { adminSecret, hasSecret } = useAdminSecret()
const loadingTasks = ref(false)
const loadingDead = ref(false)
const creatingTask = ref(false)
const updatingTaskId = ref('')
const retryingDeadId = ref('')
const retryingTaskId = ref('')
const taskError = ref('')
const deadError = ref('')

const taskStatusFilter = ref('')
const taskTypeFilter = ref('')
const deadTypeFilter = ref('')
const deadResolvedFilter = ref<'true' | 'false' | ''>('')
const pageSize = ref(20)

const tasks = ref<OpsTaskItem[]>([])
const taskTotal = ref(0)
const taskPage = ref(1)

const deadLetters = ref<DeadLetterItem[]>([])
const deadTotal = ref(0)
const deadPage = ref(1)

const statusDrafts = reactive<Record<string, string>>({})

const createType = ref('')
const createStatus = ref('pending')
const createPayloadText = ref('')

const payloadVisible = ref(false)
const payloadText = ref('')

const taskTotalPages = computed(() => Math.max(1, Math.ceil(taskTotal.value / pageSize.value)))
const deadTotalPages = computed(() => Math.max(1, Math.ceil(deadTotal.value / pageSize.value)))

let secretLoadTimer: ReturnType<typeof setTimeout> | null = null

function fmt(v?: string) {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

function parseJsonOrThrow(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('payload 必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

function openPayload(payload: Record<string, unknown> | undefined) {
  payloadText.value = JSON.stringify(payload || {}, null, 2)
  payloadVisible.value = true
}

function closePayload() {
  payloadVisible.value = false
  payloadText.value = ''
}

function syncStatusDrafts(rows: OpsTaskItem[]) {
  for (const row of rows) {
    statusDrafts[row.id] = String(row.status || 'pending')
  }
}

async function loadTasks(page = taskPage.value) {
  if (!hasSecret.value) return
  loadingTasks.value = true
  taskError.value = ''
  try {
    const result = await fetchAdminOpsTasks({
      page,
      pageSize: pageSize.value,
      status: taskStatusFilter.value || undefined,
      type: taskTypeFilter.value || undefined,
    }, adminSecret.value)
    tasks.value = result.items
    taskTotal.value = result.total
    taskPage.value = result.page
    syncStatusDrafts(result.items)
  } catch (err) {
    taskError.value = err instanceof Error ? err.message : '任务列表加载失败'
  } finally {
    loadingTasks.value = false
  }
}

async function loadDeadLetters(page = deadPage.value) {
  if (!hasSecret.value) return
  loadingDead.value = true
  deadError.value = ''
  try {
    const result = await fetchAdminDeadLetters({
      page,
      pageSize: pageSize.value,
      type: deadTypeFilter.value || undefined,
      resolved: deadResolvedFilter.value,
    }, adminSecret.value)
    deadLetters.value = result.items
    deadTotal.value = result.total
    deadPage.value = result.page
  } catch (err) {
    deadError.value = err instanceof Error ? err.message : '死信列表加载失败'
  } finally {
    loadingDead.value = false
  }
}

function reloadAll() {
  void Promise.all([loadTasks(1), loadDeadLetters(1)])
}

async function createTask() {
  if (!hasSecret.value) {
    toast.addToast({ type: 'warning', message: '请先输入管理员密钥' })
    return
  }
  if (!createType.value.trim()) {
    toast.addToast({ type: 'warning', message: '请输入任务类型' })
    return
  }
  creatingTask.value = true
  try {
    const payload = parseJsonOrThrow(createPayloadText.value)
    await createAdminOpsTask({
      type: createType.value.trim(),
      status: createStatus.value,
      payload,
      createdBy: 'ops_console',
    }, adminSecret.value)
    createType.value = ''
    createPayloadText.value = ''
    toast.addToast({ type: 'success', message: '任务已创建' })
    await loadTasks(1)
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '任务创建失败' })
  } finally {
    creatingTask.value = false
  }
}

async function saveTaskStatus(task: OpsTaskItem) {
  if (task.source !== 'async_tasks') return
  updatingTaskId.value = task.id
  try {
    const status = statusDrafts[task.id] || task.status
    const finishedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : undefined
    await patchAdminOpsTask(task.id, { status, finishedAt }, adminSecret.value)
    toast.addToast({ type: 'success', message: `任务 ${task.id.slice(0, 8)} 状态已更新` })
    await loadTasks(taskPage.value)
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '任务状态更新失败' })
  } finally {
    updatingTaskId.value = ''
  }
}

async function retryTask(task: OpsTaskItem) {
  if (!['security_webhook_queue', 'skin_sync_tasks'].includes(task.source)) return
  retryingTaskId.value = task.id
  try {
    const result = await retryAdminOpsTask(task.id, adminSecret.value)
    toast.addToast({
      type: result.replayed ? 'success' : 'warning',
      message: result.replayed
        ? `任务 ${task.id.slice(0, 8)} 已重试`
        : `任务 ${task.id.slice(0, 8)} 未重试成功`
    })
    await Promise.all([loadTasks(taskPage.value), loadDeadLetters(deadPage.value)])
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '任务重试失败' })
  } finally {
    retryingTaskId.value = ''
  }
}

async function retryDeadLetter(item: DeadLetterItem) {
  retryingDeadId.value = item.id
  try {
    const result = await retryAdminDeadLetter(item.id, adminSecret.value)
    toast.addToast({
      type: result.replayed ? 'success' : 'warning',
      message: result.replayed ? '死信已回放到目标队列' : '死信已标记重试，但未匹配到可回放目标'
    })
    await Promise.all([loadDeadLetters(deadPage.value), loadTasks(1)])
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '死信重试失败' })
  } finally {
    retryingDeadId.value = ''
  }
}

watch(adminSecret, (secret) => {
  if (secretLoadTimer) {
    clearTimeout(secretLoadTimer)
    secretLoadTimer = null
  }
  if (!String(secret || '').trim()) {
    tasks.value = []
    deadLetters.value = []
    taskTotal.value = 0
    deadTotal.value = 0
    taskError.value = ''
    deadError.value = ''
    return
  }
  secretLoadTimer = setTimeout(() => {
    reloadAll()
  }, 280)
})

onUnmounted(() => {
  if (secretLoadTimer) {
    clearTimeout(secretLoadTimer)
    secretLoadTimer = null
  }
})
</script>

<style scoped>
.ops-admin {
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

.create-panel {
  display: grid;
  gap: 10px;
}

.create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.create-grid label {
  display: grid;
  gap: 6px;
  color: #9fb0cc;
  font-size: 12px;
}

.payload-input {
  min-height: 76px;
  resize: vertical;
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
  font-size: 12px;
  color: #9fb0cc;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
}

th,
td {
  border-bottom: 1px solid #233046;
  padding: 8px;
  text-align: left;
  font-size: 12px;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.small-input {
  min-width: 120px;
}

.pager {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.empty {
  text-align: center;
  color: #9fb0cc;
}

.ok {
  color: #86efac;
}

.warn {
  color: #fbbf24;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.42);
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

  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>
