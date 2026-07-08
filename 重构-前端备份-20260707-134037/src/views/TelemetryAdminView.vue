<template>
  <div class="telemetry-admin page-shell">
    <header class="head">
      <h1>路由访问遥测</h1>
      <p>查看页面访问分区、热门路径、漏斗与最近事件（需管理员密钥）。</p>
      <div class="header-summary">
        <span class="summary-pill">总事件 {{ stats.total }}</span>
        <span class="summary-pill">Top 路径 {{ stats.topPaths.length }}</span>
        <span class="summary-pill">漏斗 {{ funnelText }}</span>
      </div>
    </header>

    <AppStatePanel
      v-if="!hasSecret"
      variant="info"
      eyebrow="Telemetry"
      title="请输入管理员密钥后继续"
      message="遥测数据属于管理信息，首次进入需要提供密钥后才能加载。"
      hint="密钥仅用于当前请求，不会被持久保存。"
      class="telemetry-state-panel"
    />

    <section class="controls card glass-card ui-card">
      <label>
        管理员密钥
        <input class="ui-input" v-model.trim="adminSecret" type="password" placeholder="X-Admin-Secret" />
      </label>
      <div class="actions quick-actions">
        <button type="button" class="ui-btn" @click="goFirstPageAndLoad" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
        <button type="button" class="secondary" @click="clearFilters" :disabled="loading">清空筛选</button>
        <button type="button" class="secondary" @click="exportCsv(items)" :disabled="items.length === 0">导出当前页 CSV</button>
      </div>
      <label>
        时间范围
        <select class="ui-input" v-model="rangeFilter" @change="goFirstPageAndLoad">
          <option value="all">全部</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="24h">24h</option>
        </select>
      </label>
      <label>
        分区筛选
        <select class="ui-input" v-model="sectionFilter" @change="goFirstPageAndLoad">
          <option value="">全部</option>
          <option value="core">core</option>
          <option value="explore">explore</option>
          <option value="operation">operation</option>
          <option value="account">account</option>
          <option value="developer">developer</option>
        </select>
      </label>
      <label>
        路径搜索
        <input class="ui-input" v-model.trim="pathFilter" type="text" placeholder="如 /skin" @keyup.enter="goFirstPageAndLoad" />
      </label>
      <label>
        每页条数
        <select class="ui-input" v-model.number="pageSize" @change="goFirstPageAndLoad">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <label class="auto-refresh">
        <span>自动刷新（30秒）</span>
        <input v-model="autoRefresh" type="checkbox" />
      </label>

    </section>

    <AppStatePanel
      v-if="error"
      variant="error"
      eyebrow="Telemetry"
      title="遥测数据加载失败"
      :message="error"
      hint="请检查管理员密钥、网络连接或后端服务。"
      class="telemetry-state-panel"
    >
      <template #actions>
        <button class="ui-btn" @click="goFirstPageAndLoad">重试</button>
      </template>
    </AppStatePanel>

    <section class="stats card glass-card ui-card">
      <button type="button" class="kpi" :class="{ active: quickSection === 'all' }" @click="setQuickSection('all')">
        <div class="kpi-title">总事件</div>
        <div class="kpi-value">{{ stats.total }}</div>
      </button>
      <button type="button" class="kpi" :class="{ active: quickSection === 'top' }" @click="setQuickSection('top')">
        <div class="kpi-title">Top 路径</div>
        <div class="kpi-value">{{ stats.topPaths.length }}</div>
      </button>
      <button type="button" class="kpi" :class="{ active: quickSection === 'funnel' }" @click="setQuickSection('funnel')">
        <div class="kpi-title">漏斗 home→skin→auth</div>
        <div class="kpi-value">{{ funnelText }}</div>
      </button>
    </section>

    <section class="card glass-card ui-card">
      <h3>分区分布</h3>
      <table>
        <thead>
          <tr><th>Section</th><th>Count</th></tr>
        </thead>
        <tbody>
          <tr v-for="x in bySectionRows" :key="x.section">
            <td>{{ x.section }}</td>
            <td>{{ x.count }}</td>
          </tr>
          <tr v-if="bySectionRows.length === 0"><td colspan="2" class="empty">暂无数据</td></tr>
        </tbody>
      </table>
    </section>

    <section class="card glass-card ui-card">
      <h3>热门路径（Top 20）</h3>
      <table>
        <thead>
          <tr><th>Path</th><th>Count</th></tr>
        </thead>
        <tbody>
          <tr v-for="x in stats.topPaths" :key="x.path">
            <td class="mono">{{ x.path }}</td>
            <td>{{ x.count }}</td>
          </tr>
          <tr v-if="stats.topPaths.length === 0"><td colspan="2" class="empty">暂无数据</td></tr>
        </tbody>
      </table>
    </section>

    <section class="list card glass-card ui-card">
      <div class="summary">共 {{ total }} 条，当前第 {{ page + 1 }} / {{ totalPages }} 页</div>
      <div class="pager">
        <button class="secondary" @click="prevPage" :disabled="loading || page <= 0">上一页</button>
        <button class="secondary" @click="nextPage" :disabled="loading || page + 1 >= totalPages">下一页</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>时间</th><th>路径</th><th>路由名</th><th>分区</th><th>标题</th><th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in items" :key="ev.id">
            <td>{{ fmt(ev.receivedAt || ev.ts) }}</td>
            <td class="mono">{{ ev.path }}</td>
            <td>{{ ev.name || '-' }}</td>
            <td>{{ ev.section || '-' }}</td>
            <td>{{ ev.title || '-' }}</td>
            <td class="mono">{{ ev.ip || '-' }}</td>
          </tr>
          <tr v-if="items.length === 0"><td colspan="6" class="empty">暂无数据</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import { useAdminSecret } from '@/composables/useAdminSecret'
import { parseApiError } from '@/shared/utils/apiResponse'

interface TelemetryEvent {
  id: string
  path: string
  name?: string
  section?: string
  title?: string
  ts?: number
  receivedAt?: string
  ip?: string
}

interface StatsResp {
  total: number
  bySection: Record<string, number>
  topPaths: Array<{ path: string; count: number }>
  funnel?: { home: number; skin: number; auth: number }
  message?: string
}

interface EventsResp {
  total: number
  page?: number
  pageSize?: number
  items: TelemetryEvent[]
  message?: string
}

const { adminSecret, hasSecret } = useAdminSecret({ persist: false })
const rangeFilter = ref<'all' | '15m' | '1h' | '24h'>('all')
const sectionFilter = ref('')
const pathFilter = ref('')
const autoRefresh = ref(false)
const autoRefreshBusy = ref(false)
const page = ref(0)
const pageSize = ref(50)
const quickSection = ref<'all' | 'top' | 'funnel' | ''>('all')
const loading = ref(false)
const error = ref('')
const total = ref(0)
const items = ref<TelemetryEvent[]>([])
const stats = ref<StatsResp>({ total: 0, bySection: {}, topPaths: [], funnel: { home: 0, skin: 0, auth: 0 } })
let timer: ReturnType<typeof setInterval> | null = null
let loadSeq = 0

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const bySectionRows = computed(() => Object.entries(stats.value.bySection || {}).map(([section, count]) => ({ section, count })).sort((a, b) => b.count - a.count))
const funnelText = computed(() => {
  const f = stats.value.funnel || { home: 0, skin: 0, auth: 0 }
  return `${f.home} / ${f.skin} / ${f.auth}`
})

watch(autoRefresh, (enabled) => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (enabled) {
    timer = setInterval(() => {
      if (autoRefreshBusy.value) return
      autoRefreshBusy.value = true
      void loadAll().finally(() => {
        autoRefreshBusy.value = false
      })
    }, 30000)
  }
})

let secretLoadTimer: ReturnType<typeof setTimeout> | null = null

watch(adminSecret, (secret) => {
  if (secretLoadTimer) {
    clearTimeout(secretLoadTimer)
    secretLoadTimer = null
  }
  if (!secret.trim()) {
    error.value = ''
    total.value = 0
    items.value = []
    stats.value = { total: 0, bySection: {}, topPaths: [], funnel: { home: 0, skin: 0, auth: 0 } }
    quickSection.value = 'all'
    return
  }
  secretLoadTimer = setTimeout(() => {
    page.value = 0
    void loadAll()
  }, 300)
})

function setQuickSection(section: 'all' | 'top' | 'funnel') {
  quickSection.value = section
  if (section === 'all') {
    rangeFilter.value = 'all'
    sectionFilter.value = ''
    pathFilter.value = ''
  } else if (section === 'top') {
    pathFilter.value = ''
    sectionFilter.value = ''
  } else if (section === 'funnel') {
    sectionFilter.value = ''
    pathFilter.value = ''
    rangeFilter.value = '24h'
  }
  goFirstPageAndLoad()
}

function clearFilters() {
  rangeFilter.value = 'all'
  sectionFilter.value = ''
  pathFilter.value = ''
  quickSection.value = 'all'
  goFirstPageAndLoad()
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (secretLoadTimer) {
    clearTimeout(secretLoadTimer)
    secretLoadTimer = null
  }
})

function fmt(v?: string | number) {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

function csvEscape(v: unknown) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(rows: TelemetryEvent[]) {
  const headers = ['receivedAt', 'path', 'name', 'section', 'title', 'ip']
  const lines = [headers.join(',')]
  for (const ev of rows) {
    lines.push([
      csvEscape(ev.receivedAt || ev.ts || ''),
      csvEscape(ev.path),
      csvEscape(ev.name || ''),
      csvEscape(ev.section || ''),
      csvEscape(ev.title || ''),
      csvEscape(ev.ip || '')
    ].join(','))
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `telemetry-events-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function fetchStats() {
  const qs = new URLSearchParams()
  if (rangeFilter.value !== 'all') qs.set('range', rangeFilter.value)
  const r = await fetch(`/api/admin/telemetry/stats?${qs.toString()}`, { headers: { 'X-Admin-Secret': adminSecret.value } })
  const j = await r.json().catch((): Partial<StatsResp> => ({} as Partial<StatsResp>))
  if (!r.ok) throw new Error(parseApiError(j, `统计加载失败 (${r.status})`))
  stats.value = {
    total: Number(j.total || 0),
    bySection: typeof j.bySection === 'object' && j.bySection ? j.bySection : {},
    topPaths: Array.isArray(j.topPaths) ? j.topPaths : [],
    funnel: j.funnel && typeof j.funnel === 'object' ? j.funnel : { home: 0, skin: 0, auth: 0 }
  }
}

async function fetchEvents() {
  const qs = new URLSearchParams()
  const pageNum = page.value + 1
  const offset = page.value * pageSize.value
  qs.set('page', String(pageNum))
  qs.set('pageSize', String(pageSize.value))
  // 兼容旧后端：仍附带 offset/limit
  qs.set('limit', String(pageSize.value))
  qs.set('offset', String(offset))
  if (sectionFilter.value) qs.set('section', sectionFilter.value)
  if (pathFilter.value) qs.set('path', pathFilter.value)
  if (rangeFilter.value !== 'all') qs.set('range', rangeFilter.value)
  const r = await fetch(`/api/admin/telemetry/events?${qs.toString()}`, {
    headers: { 'X-Admin-Secret': adminSecret.value }
  })
  const j = await r.json().catch((): Partial<EventsResp> => ({} as Partial<EventsResp>))
  if (!r.ok) throw new Error(parseApiError(j, `事件加载失败 (${r.status})`))
  total.value = Number(j.total || 0)
  if (Number.isFinite(j.page)) {
    page.value = Math.max(0, Number(j.page) - 1)
  }
  items.value = Array.isArray(j.items) ? j.items : []
}

async function loadAll() {
  if (!hasSecret.value) {
    loading.value = false
    error.value = ''
    total.value = 0
    items.value = []
    stats.value = { total: 0, bySection: {}, topPaths: [], funnel: { home: 0, skin: 0, auth: 0 } }
    return
  }

  const seq = ++loadSeq
  loading.value = true
  error.value = ''
  try {
    const [statsResult, eventsResult] = await Promise.allSettled([fetchStats(), fetchEvents()])
    if (seq !== loadSeq) return

    const messages: string[] = []
    if (statsResult.status === 'rejected') messages.push(statsResult.reason instanceof Error ? statsResult.reason.message : '统计加载失败')
    if (eventsResult.status === 'rejected') messages.push(eventsResult.reason instanceof Error ? eventsResult.reason.message : '事件加载失败')

    if (messages.length > 0) {
      error.value = messages.join('；')
    }
  } catch (e) {
    if (seq !== loadSeq) return
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

function goFirstPageAndLoad() {
  if (!hasSecret.value) return
  page.value = 0
  void loadAll()
}

function resetPageAndLoad() {
  if (!hasSecret.value) return
  page.value = 0
  void loadAll()
}

function prevPage() {
  if (!hasSecret.value) return
  if (page.value <= 0) return
  page.value -= 1
  void loadAll()
}

function nextPage() {
  if (!hasSecret.value) return
  if (page.value + 1 >= totalPages.value) return
  page.value += 1
  void loadAll()
}
</script>

<style scoped>
.telemetry-admin { display: grid; gap: 14px; color: #eef3ff; }
.head p { color: #9fb0cc; }

.header-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
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
.controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 12px; }
.controls label { display: grid; gap: 6px; font-size: 12px; color: #9fb0cc; }

.secondary.ui-btn { border-color: #334155; background: #1e293b; }

.actions { display: flex; gap: 8px; align-items: end; }
.auto-refresh { align-self: end; grid-template-columns: 1fr auto; align-items: center; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px; }
.kpi { border: 1px solid #233046; border-radius: 10px; padding: 10px; background: #0f172a; width: 100%; text-align: left; }
.kpi.active { border-color: rgba(0, 212, 255, 0.8); box-shadow: 0 0 0 1px rgba(0, 212, 255, 0.16) inset; }
.kpi-title { color: #9fb0cc; font-size: 12px; margin-bottom: 4px; }
.kpi-value { font-size: 22px; font-weight: 700; }
.list { padding: 12px; overflow: auto; }
.summary { color: #9fb0cc; margin-bottom: 10px; }
.pager { display: flex; gap: 8px; margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; min-width: 760px; }
th, td { border-bottom: 1px solid #233046; padding: 8px; text-align: left; font-size: 12px; }
.mono { font-family: Consolas, monospace; }
.empty { color: #9fb0cc; text-align: center; }
.error { color: #fca5a5; }

@media (max-width: 980px) {
  .controls { grid-template-columns: 1fr 1fr; }
  .stats { grid-template-columns: 1fr; }
}
</style>
