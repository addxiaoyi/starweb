<template>
  <div class="admin-events page-shell">
    <header class="head">
      <h1>改密审计事件</h1>
      <p>查看最近请求 ID、状态、耗时与失败原因（需管理员密钥）。</p>
    </header>

    <section class="controls card glass-card ui-card">
      <label>
        管理员密钥
        <input class="ui-input" v-model.trim="adminSecret" type="password" placeholder="X-Admin-Secret" />
      </label>
      <label>
        状态筛选
        <select class="ui-input" v-model="okFilter" @change="goFirstPageAndLoad">
          <option value="all">全部</option>
          <option value="true">成功</option>
          <option value="false">失败</option>
        </select>
      </label>
      <label>
        类型筛选
        <select class="ui-input" v-model="typeFilter" @change="goFirstPageAndLoad">
          <option value="all">全部</option>
          <option value="request_code">request_code</option>
          <option value="confirm">confirm</option>
        </select>
      </label>
      <label>
        时间范围
        <select class="ui-input" v-model="rangeFilter" @change="goFirstPageAndLoad">
          <option value="15m">近 15 分钟</option>
          <option value="1h">近 1 小时</option>
          <option value="24h">近 24 小时</option>
        </select>
      </label>
      <label>
        排序
        <select class="ui-input" v-model="sortBy" @change="goFirstPageAndLoad">
          <option value="createdAt_desc">时间倒序</option>
          <option value="createdAt_asc">时间正序</option>
        </select>
      </label>
      <label>
        搜索
        <input class="ui-input" v-model.trim="search" type="text" placeholder="按 reqId / 角色名" @keyup.enter="goFirstPageAndLoad" />
      </label>
      <label>
        每页条数
        <select class="ui-input" v-model.number="pageSize" @change="goFirstPageAndLoad">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
      </label>
      <label class="auto-refresh">
        <span>自动刷新（5秒）</span>
        <input v-model="autoRefresh" type="checkbox" />
      </label>
      <div class="actions">
        <button class="ui-btn" @click="goFirstPageAndLoad" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
        <button class="secondary ui-btn" @click="exportCsv(items)" :disabled="loading || items.length === 0">导出当前页 CSV</button>
        <button class="secondary ui-btn" @click="exportAllFilteredCsv" :disabled="loading || exportingAll">{{ exportingAll ? '导出中...' : '导出筛选结果 CSV' }}</button>
      </div>
      <div class="last-refresh">最近刷新：{{ lastRefreshText }}</div>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="stats card glass-card ui-card">
      <div class="kpi">
        <div class="kpi-title">总事件</div>
        <div class="kpi-value">{{ stats.total }}</div>
      </div>
      <div class="kpi" :class="{ warn: stats.alerts.failRateHigh }">
        <div class="kpi-title">成功率 / 失败率</div>
        <div class="kpi-value">{{ stats.successRate }}% / {{ stats.failRate }}%</div>
      </div>
      <div class="kpi" :class="{ warn: stats.alerts.p95HighLatency }">
        <div class="kpi-title">P95 延迟</div>
        <div class="kpi-value">{{ stats.latency.p95 }}ms</div>
      </div>
      <div class="kpi">
        <div class="kpi-title">P99 延迟</div>
        <div class="kpi-value">{{ stats.latency.p99 }}ms</div>
      </div>
    </section>

    <section class="trend card glass-card ui-card">
      <h3>趋势（{{ rangeFilter }}）</h3>
      <div class="trend-grid">
        <div class="bars">
          <div
            v-for="(b, i) in stats.trend"
            :key="`${b.ts}-${i}`"
            class="bar"
            :style="{ height: `${Math.max(6, (b.total / trendMax) * 120)}px` }"
            :title="`${fmt(b.ts)} | total=${b.total}, success=${b.success}, failed=${b.failed}`"
          />
        </div>
        <div class="trend-note">max={{ trendMax }}，每柱为一个时间桶</div>
      </div>
    </section>

    <section class="reason-list card glass-card ui-card">
      <h3>失败/原因分布（Top 8）</h3>
      <table>
        <thead>
          <tr>
            <th>原因</th>
            <th>次数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in stats.reasons.slice(0, 8)" :key="x.reason">
            <td>{{ x.reason }}</td>
            <td>{{ x.count }}</td>
          </tr>
          <tr v-if="stats.reasons.length === 0">
            <td colspan="2" class="empty">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="list card glass-card">
      <div class="summary">共 {{ total }} 条，当前第 {{ page + 1 }} / {{ totalPages }} 页，显示 {{ items.length }} 条</div>
      <div class="pager">
        <button class="secondary" @click="prevPage" :disabled="loading || page <= 0">上一页</button>
        <button class="secondary" @click="nextPage" :disabled="loading || page + 1 >= totalPages">下一页</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
            <th>结果</th>
            <th>请求ID</th>
            <th>角色</th>
            <th>耗时</th>
            <th>原因</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in items" :key="ev.id">
            <td>{{ fmt(ev.createdAt) }}</td>
            <td>{{ ev.type }}</td>
            <td :class="ev.ok ? 'ok' : 'bad'">{{ ev.ok ? '成功' : '失败' }}</td>
            <td class="mono">{{ ev.reqId }}</td>
            <td>{{ ev.mcUsername || '-' }}</td>
            <td>{{ ev.latencyMs }}ms</td>
            <td>{{ ev.reason || '-' }}</td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="7" class="empty">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminSecret } from '@/composables/useAdminSecret'
import { parseApiError } from '@/shared/utils/apiResponse'

type AuditEvent = {
  id: string
  reqId: string
  type: 'request_code' | 'confirm' | string
  ok: boolean
  reason?: string
  mcUsername?: string
  latencyMs?: number
  createdAt?: string
}

type Stats = {
  total: number
  success: number
  failed: number
  successRate: number
  failRate: number
  latency: { p50: number; p95: number; p99: number; max: number }
  reasons: Array<{ reason: string; count: number }>
  trend: Array<{ ts: string; total: number; success: number; failed: number; successRate: number }>
  alerts: { failRateHigh: boolean; p95HighLatency: boolean }
}

type QueryOptions = { page: number; pageSize: number; limit: number; offset: number }

const route = useRoute()
const router = useRouter()

const { adminSecret, hasSecret } = useAdminSecret({ persist: false })
const okFilter = ref<'all' | 'true' | 'false'>('all')
const typeFilter = ref<'all' | 'request_code' | 'confirm'>('all')
const rangeFilter = ref<'15m' | '1h' | '24h'>('1h')
const sortBy = ref<'createdAt_desc' | 'createdAt_asc'>('createdAt_desc')
const search = ref('')
const pageSize = ref(50)
const page = ref(0)
const autoRefresh = ref(false)
const loading = ref(false)
const exportingAll = ref(false)
const error = ref('')
const total = ref(0)
const items = ref<AuditEvent[]>([])
const lastRefreshAt = ref<number | null>(null)
const stats = ref<Stats>({
  total: 0,
  success: 0,
  failed: 0,
  successRate: 0,
  failRate: 0,
  latency: { p50: 0, p95: 0, p99: 0, max: 0 },
  reasons: [],
  trend: [],
  alerts: { failRateHigh: false, p95HighLatency: false }
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const trendMax = computed(() => {
  const m = Math.max(0, ...stats.value.trend.map((x) => Number(x.total || 0)))
  return m <= 0 ? 1 : m
})
let refreshTimer: ReturnType<typeof setInterval> | null = null

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

watch(autoRefresh, (enabled) => {
  clearRefreshTimer()
  if (!enabled) return
  refreshTimer = setInterval(() => {
    void loadEvents()
  }, 5000)
})

onUnmounted(() => clearRefreshTimer())

const lastRefreshText = computed(() => {
  if (!lastRefreshAt.value) return '未刷新'
  return new Date(lastRefreshAt.value).toLocaleString()
})

function fmt(s?: string) {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

function buildQuery(opts: QueryOptions) {
  const qs = new URLSearchParams()
  qs.set('page', String(opts.page))
  qs.set('pageSize', String(opts.pageSize))
  // 兼容旧后端：仍附带 offset/limit
  qs.set('limit', String(opts.limit))
  qs.set('offset', String(opts.offset))
  qs.set('sort', sortBy.value)
  if (okFilter.value !== 'all') qs.set('ok', okFilter.value)
  if (typeFilter.value !== 'all') qs.set('type', typeFilter.value)
  if (rangeFilter.value) qs.set('range', rangeFilter.value)
  if (search.value) qs.set('q', search.value)
  return qs
}

function syncStateToUrl() {
  const q: Record<string, string> = {
    ok: okFilter.value,
    type: typeFilter.value,
    range: rangeFilter.value,
    sort: sortBy.value,
    search: search.value,
    page: String(page.value),
    pageSize: String(pageSize.value),
    auto: autoRefresh.value ? '1' : '0'
  }
  void router.replace({ query: { ...route.query, ...q } })
}

function initStateFromUrl() {
  const q = route.query
  const ok = String(q.ok || 'all')
  if (ok === 'all' || ok === 'true' || ok === 'false') okFilter.value = ok
  const type = String(q.type || 'all')
  if (type === 'all' || type === 'request_code' || type === 'confirm') typeFilter.value = type
  const range = String(q.range || '1h')
  if (range === '15m' || range === '1h' || range === '24h') rangeFilter.value = range
  const sort = String(q.sort || 'createdAt_desc')
  if (sort === 'createdAt_desc' || sort === 'createdAt_asc') sortBy.value = sort
  search.value = String(q.search || '')
  page.value = Math.max(0, Number(q.page || 0) || 0)
  pageSize.value = Math.min(200, Math.max(20, Number(q.pageSize || 50) || 50))
  autoRefresh.value = String(q.auto || '0') === '1'
}

async function fetchEvents(opts: QueryOptions) {
  const qs = buildQuery(opts)
  const r = await fetch(`/api/admin/mc-reset/events?${qs.toString()}`, {
    headers: { 'X-Admin-Secret': adminSecret.value }
  })
  const j = (await r.json().catch(() => ({}))) as {
    message?: string
    code?: string
    error?: string
    total?: number
    page?: number
    items?: AuditEvent[]
  }
  if (!r.ok) throw new Error(parseApiError(j, `加载失败 (${r.status})`))
  return {
    total: Number(j.total || 0),
    page: Number.isFinite(j.page) ? Number(j.page) : opts.page,
    items: Array.isArray(j.items) ? j.items : []
  }
}

async function fetchStats() {
  const qs = buildQuery({ page: 1, pageSize: 1, limit: 1, offset: 0 })
  qs.delete('limit')
  qs.delete('offset')
  const r = await fetch(`/api/admin/mc-reset/stats?${qs.toString()}`, {
    headers: { 'X-Admin-Secret': adminSecret.value }
  })
  const j = (await r.json().catch(() => ({}))) as Partial<Stats> & { message?: string; code?: string; error?: string }
  if (!r.ok) throw new Error(parseApiError(j, `统计加载失败 (${r.status})`))
  stats.value = {
    total: Number(j.total || 0),
    success: Number(j.success || 0),
    failed: Number(j.failed || 0),
    successRate: Number(j.successRate || 0),
    failRate: Number(j.failRate || 0),
    latency: {
      p50: Number(j.latency?.p50 || 0),
      p95: Number(j.latency?.p95 || 0),
      p99: Number(j.latency?.p99 || 0),
      max: Number(j.latency?.max || 0)
    },
    reasons: Array.isArray(j.reasons) ? j.reasons : [],
    trend: Array.isArray(j.trend) ? j.trend : [],
    alerts: {
      failRateHigh: Boolean(j.alerts?.failRateHigh),
      p95HighLatency: Boolean(j.alerts?.p95HighLatency)
    }
  }
}

function goFirstPageAndLoad() {
  if (!hasSecret.value) return
  page.value = 0
  syncStateToUrl()
  void loadEvents()
}

function prevPage() {
  if (!hasSecret.value) return
  if (page.value <= 0) return
  page.value -= 1
  syncStateToUrl()
  void loadEvents()
}

function nextPage() {
  if (!hasSecret.value) return
  if (page.value + 1 >= totalPages.value) return
  page.value += 1
  syncStateToUrl()
  void loadEvents()
}

function csvEscape(v: unknown) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(rows: AuditEvent[], filenamePrefix = 'mc-reset-events') {
  const headers = ['createdAt', 'type', 'ok', 'reqId', 'mcUsername', 'latencyMs', 'reason']
  const lines = [headers.join(',')]
  for (const ev of rows) {
    lines.push([
      csvEscape(ev.createdAt),
      csvEscape(ev.type),
      csvEscape(ev.ok ? 'true' : 'false'),
      csvEscape(ev.reqId),
      csvEscape(ev.mcUsername || ''),
      csvEscape(ev.latencyMs ?? ''),
      csvEscape(ev.reason || '')
    ].join(','))
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  a.download = `${filenamePrefix}-${ts}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function exportAllFilteredCsv() {
  if (!hasSecret.value) {
    error.value = '请先输入管理员密钥'
    return
  }
  exportingAll.value = true
  error.value = ''
  try {
    const batch = 500
    let offset = 0
    let all: AuditEvent[] = []
    let expectedTotal = 0
    while (true) {
      const r = await fetchEvents({
        page: Math.floor(offset / batch) + 1,
        pageSize: batch,
        limit: batch,
        offset
      })
      expectedTotal = r.total
      all = all.concat(r.items)
      offset += r.items.length
      if (r.items.length < batch || offset >= expectedTotal || offset >= 10000) break
    }
    exportCsv(all, 'mc-reset-events-filtered')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    exportingAll.value = false
  }
}

async function loadEvents() {
  if (!hasSecret.value) {
    error.value = ''
    total.value = 0
    items.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    const [eventData] = await Promise.all([
      fetchEvents({
        page: page.value + 1,
        pageSize: pageSize.value,
        limit: pageSize.value,
        offset: page.value * pageSize.value
      }),
      fetchStats()
    ])
    total.value = eventData.total
    page.value = Math.max(0, eventData.page - 1)
    items.value = eventData.items
    const maxPage = Math.max(0, Math.ceil(total.value / pageSize.value) - 1)
    if (page.value > maxPage) page.value = maxPage
    lastRefreshAt.value = Date.now()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '网络异常，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initStateFromUrl()
  syncStateToUrl()
})
</script>

<style scoped>
.admin-events { display: grid; gap: 14px; color: #eef3ff; }
.head p { color: #9fb0cc; }
.controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 12px; }
.controls label { display: grid; gap: 6px; font-size: 12px; color: #9fb0cc; }
.secondary.ui-btn { border-color: #334155; background: #1e293b; }

.actions { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
.auto-refresh { align-self: end; grid-template-columns: 1fr auto; align-items: center; }
.last-refresh { align-self: end; color: #9fb0cc; font-size: 12px; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 12px; }
.kpi { border: 1px solid #233046; border-radius: 10px; padding: 10px; background: #0f172a; }
.kpi.warn { border-color: rgba(239, 68, 68, 0.6); box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.25) inset; }
.kpi-title { color: #9fb0cc; font-size: 12px; margin-bottom: 4px; }
.kpi-value { font-size: 22px; font-weight: 700; }
.trend { padding: 12px; }
.trend h3 { margin: 0 0 10px; font-size: 14px; color: #c7d2fe; }
.trend-grid { display: grid; gap: 10px; }
.bars { display: grid; grid-auto-flow: column; align-items: end; gap: 4px; min-height: 130px; }
.bar { background: linear-gradient(180deg, #6366f1 0%, #4338ca 100%); border-radius: 4px 4px 0 0; }
.trend-note { color: #9fb0cc; font-size: 12px; }
.reason-list { padding: 12px; }
.reason-list h3 { margin: 0 0 10px; font-size: 14px; color: #c7d2fe; }
.list { padding: 12px; overflow: auto; }
.summary { color: #9fb0cc; margin-bottom: 10px; }
.pager { display: flex; gap: 8px; margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; min-width: 820px; }
th, td { border-bottom: 1px solid #233046; padding: 8px; text-align: left; font-size: 12px; }
.mono { font-family: Consolas, monospace; }
.ok { color: #86efac; }
.bad { color: #fca5a5; }
.empty { color: #9fb0cc; text-align: center; }
.error { color: #fca5a5; }

@media (max-width: 980px) {
  .controls { grid-template-columns: 1fr 1fr; }
  .stats { grid-template-columns: 1fr 1fr; }
}
</style>
