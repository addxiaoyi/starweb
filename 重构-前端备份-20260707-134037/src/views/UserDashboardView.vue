<template>
  <div class="dashboardPage">
    <div class="dashboardHeader">
      <div>
        <h1>用户仪表盘</h1>
        <p>当前用户：{{ auth.user?.username || '未知用户' }} · 目标ID：{{ targetUserId }}</p>
        <p class="metaLine">
          数据更新时间：{{ lastUpdatedText }}
          <span class="dot" :class="isStale ? 'dot-stale' : 'dot-fresh'"></span>
          {{ isStale ? '数据延迟' : '实时' }}
          <span class="summary warn">警告 {{ warnCount }}</span>
          <span class="summary critical">严重 {{ criticalCount }}</span>
          <span class="summary">配置保存：{{ lastSavedText }}</span>
          <span class="summary unsaved" v-if="hasUnsavedChanges">有未保存更改</span>
        </p>
      </div>
      <div class="headerActions">
        <button type="button" class="cfgToggle ui-btn" @click="copyReadonlyLink">复制只读链接</button>
        <button type="button" class="cfgToggle ui-btn" @click="loadShareTokens" :disabled="readonlyMode">已分享列表</button>
        <button type="button" class="cfgToggle ui-btn" @click="showConfig = !showConfig" :disabled="readonlyMode">
          {{ showConfig ? '收起配置' : '展开配置' }}
        </button>
      </div>
    </div>

    <AppStatePanel
      v-if="readonlyMode"
      variant="info"
      eyebrow="Dashboard"
      title="当前为只读模式"
      message="配置不可修改，但你仍然可以查看仪表盘状态与分享信息。"
      hint="如果这是你的个人仪表盘，请关闭分享链接或使用账号登录后再编辑。"
      class="dashboard-state-panel"
    />

    <section v-else class="dashboard-summary">
      <div class="summary-tile">
        <span class="summary-label">CPU</span>
        <strong class="summary-value">{{ cpuNow.toFixed(1) }}%</strong>
      </div>
      <div class="summary-tile">
        <span class="summary-label">内存</span>
        <strong class="summary-value">{{ memNow.toFixed(1) }}%</strong>
      </div>
      <div class="summary-tile">
        <span class="summary-label">告警</span>
        <strong class="summary-value">{{ filteredAlerts.length }}</strong>
      </div>
      <div class="summary-tile">
        <span class="summary-label">分享链接</span>
        <strong class="summary-value">{{ shareTokens.length }}</strong>
      </div>
    </section>

    <section class="dashboardCard ui-card" v-if="!readonlyMode">
      <header class="tokenHeader">
        <h2>已分享只读链接</h2>
        <button type="button" class="ghost ui-btn small" @click="revokeAllShareTokens" :disabled="!shareTokens.length">全部撤销</button>
      </header>

      <AppStatePanel
        v-if="!shareTokens.length"
        variant="empty"
        eyebrow="Sharing"
        title="暂无有效分享链接"
        message="你还没有创建过只读分享，或者分享链接已经全部过期。"
        hint="点击上方“复制只读链接”可以生成一个新的 24 小时链接。"
        class="dashboard-state-panel"
      />

      <div v-else class="tokenList">
        <div class="tokenItem" v-for="item in shareTokens" :key="item.token">
          <div class="tokenMeta">
            <div class="tokenLine">token: {{ item.token.slice(0, 12) }}...</div>
            <div class="tokenLine">过期: {{ formatTime(item.expiresAt) }}</div>
          </div>
          <button type="button" class="ghost ui-btn small" @click="revokeShareToken(item.token)">撤销</button>
        </div>
      </div>
    </section>

    <section class="alertStrip">
      <div class="alertHead">
        <strong>告警事件</strong>
        <span class="count">{{ filteredAlerts.length }}</span>
        <div class="filters">
          <button class="chip ui-btn small" :class="{ active: form.filters.alertLevel === 'all' }" @click="form.filters.alertLevel = 'all'">全部</button>
          <button class="chip ui-btn small" :class="{ active: form.filters.alertLevel === 'warn' }" @click="form.filters.alertLevel = 'warn'">警告</button>
          <button class="chip ui-btn small" :class="{ active: form.filters.alertLevel === 'critical' }" @click="form.filters.alertLevel = 'critical'">严重</button>
        </div>
        <button class="clearBtn ui-btn small" @click="clearAlerts">清空</button>
      </div>
      <div class="alertList">
        <span v-if="!filteredAlerts.length" class="empty">暂无告警</span>
        <button
          v-for="item in filteredAlerts"
          :key="item.id"
          class="alertItem"
          :class="item.level"
          @click="focusMetric(item.metric)"
          :title="item.time"
        >
          {{ item.relative }} {{ item.metric.toUpperCase() }} {{ item.value }}
        </button>
      </div>
    </section>

    <section class="kpiGrid">
      <article v-if="showWidget('cpu')" class="kpiCard" :class="levelClass(cpuLevel)" data-metric="cpu">
        <p class="kpiLabel">CPU</p>
        <p class="kpiValue">{{ cpuNow.toFixed(1) }}%</p>
        <p class="kpiHint">阈值 {{ form.thresholds.cpuWarn }}/{{ form.thresholds.cpuCritical }}</p>
      </article>
      <article v-if="showWidget('mem')" class="kpiCard" :class="levelClass(memLevel)" data-metric="mem">
        <p class="kpiLabel">内存</p>
        <p class="kpiValue">{{ memNow.toFixed(1) }}%</p>
        <p class="kpiHint">阈值 {{ form.thresholds.memWarn }}/{{ form.thresholds.memCritical }}</p>
      </article>
      <article v-if="showWidget('load')" class="kpiCard" :class="levelClass(loadLevel)">
        <p class="kpiLabel">负载</p>
        <p class="kpiValue">{{ loadNow.toFixed(2) }}</p>
        <p class="kpiHint">按个人阈值比率</p>
      </article>
      <article v-if="showWidget('temp')" class="kpiCard" :class="levelClass(tempLevel)">
        <p class="kpiLabel">温度</p>
        <p class="kpiValue">{{ tempNow.toFixed(0) }}°C</p>
        <p class="kpiHint">阈值 {{ form.thresholds.tempWarn }}/{{ form.thresholds.tempCritical }}</p>
      </article>
    </section>

    <section class="panel" v-if="showWidget('net')">
      <header><h2>网络吞吐</h2><span>RX {{ netRxNow }} KB/s · TX {{ netTxNow }} KB/s</span></header>
      <div class="trendChart" role="img" aria-label="网络趋势图">
        <div class="line lineA" :style="{ clipPath: netRxPath }"></div>
        <div class="line lineB" :style="{ clipPath: netTxPath }"></div>
      </div>
    </section>

    <section class="panel" v-if="showWidget('disk')">
      <header><h2>磁盘占用</h2><span>{{ diskNow.toFixed(0) }}%</span></header>
      <div class="barTrack"><div class="barFill" :style="{ width: `${diskNow}%` }"></div></div>
    </section>

    <section class="dashboardCard" v-if="showConfig">
      <header><h2>个人配置（每用户独立）</h2></header>
      <div class="row">
        <label>
          布局
          <select v-model="form.layout" :disabled="readonlyMode">
            <option value="classic">classic</option>
            <option value="compact">compact</option>
            <option value="wide">wide</option>
          </select>
        </label>
        <label>
          告警过滤
          <select v-model="form.filters.alertLevel" :disabled="readonlyMode">
            <option value="all">all</option>
            <option value="warn">warn</option>
            <option value="critical">critical</option>
          </select>
        </label>
      </div>

      <div class="widgetPicker">
        <p>可见组件</p>
        <div class="widgetChips">
          <button
            v-for="w in availableWidgets"
            :key="w.value"
            type="button"
            class="widgetChip"
            :class="{ active: form.widgets.includes(w.value) }"
            @click="toggleWidget(w.value)"
            :disabled="readonlyMode"
          >
            {{ w.label }}
          </button>
        </div>
      </div>

      <div class="grid">
        <label>CPU Warn <input type="number" v-model.number="form.thresholds.cpuWarn" :disabled="readonlyMode" /></label>
        <label>CPU Critical <input type="number" v-model.number="form.thresholds.cpuCritical" :disabled="readonlyMode" /></label>
        <label>MEM Warn <input type="number" v-model.number="form.thresholds.memWarn" :disabled="readonlyMode" /></label>
        <label>MEM Critical <input type="number" v-model.number="form.thresholds.memCritical" :disabled="readonlyMode" /></label>
        <label>DISK Warn <input type="number" v-model.number="form.thresholds.diskWarn" :disabled="readonlyMode" /></label>
        <label>DISK Critical <input type="number" v-model.number="form.thresholds.diskCritical" :disabled="readonlyMode" /></label>
        <label>TEMP Warn <input type="number" v-model.number="form.thresholds.tempWarn" :disabled="readonlyMode" /></label>
        <label>TEMP Critical <input type="number" v-model.number="form.thresholds.tempCritical" :disabled="readonlyMode" /></label>
      </div>

      <div class="actions">
        <button :disabled="saving || readonlyMode" @click="() => saveConfig()">{{ saving ? '保存中...' : '保存配置' }}</button>
        <button class="ghost" :disabled="saving || readonlyMode" @click="resetConfig">恢复默认</button>
        <button
          class="ghost"
          :disabled="saving || readonlyMode || !canUndoReset"
          @click="undoReset"
        >
          撤销恢复
        </button>
      </div>
      <p class="msg" :class="msgType" v-if="message">{{ message }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { apiJsonWithAuth } from '@/shared/utils/security'
import { getMinecraftServerStatus } from '@/shared/utils/minecraftServerUtils'
import { getWensetConfig } from '@/shared/config/wenset'

type DashboardConfig = {
  layout: string
  widgets: string[]
  thresholds: {
    cpuWarn: number
    cpuCritical: number
    memWarn: number
    memCritical: number
    loadWarnRate: number
    loadCriticalRate: number
    diskWarn: number
    diskCritical: number
    tempWarn: number
    tempCritical: number
  }
  filters: {
    alertLevel: 'all' | 'warn' | 'critical'
  }
}

type MetricLevel = 'normal' | 'warn' | 'critical'
type AlertItem = {
  id: string
  metric: 'cpu' | 'mem' | 'load' | 'disk' | 'temp' | 'stream'
  level: Exclude<MetricLevel, 'normal'>
  value: string
  time: string
  ts: number
  relative: string
}

const route = useRoute()
const auth = useAuthStore()
const toast = useToastStore()
const isLoggedIn = computed(() => auth.isLoggedIn);
const appCfg = getWensetConfig()
const targetUserId = ref('')
const shareToken = computed(() => String(route.query.share || '').trim())
const readonlyMode = computed(() => String(route.query.readonly || '') === '1' || !!shareToken.value)
const saving = ref(false)
const message = ref('')
const msgType = ref<'ok' | 'err'>('ok')
const showConfig = ref(false)
const isHydrating = ref(true)
const canUndoReset = ref(false)
const lastSavedAt = ref(0)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let undoResetTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedConfigSnapshot = ''
let resetBackupSnapshot = ''
const lastUpdatedAt = ref(0)
const isStale = ref(true)
const alerts = ref<AlertItem[]>([])
const shareTokens = ref<Array<{ token: string; createdAt: string; expiresAt: string; createdBy?: string }>>([])
const prevLevels = reactive<Record<string, MetricLevel>>({
  cpu: 'normal',
  mem: 'normal',
  load: 'normal',
  disk: 'normal',
  temp: 'normal',
  stream: 'normal'
})

const DEFAULT_CONFIG: DashboardConfig = {
  layout: 'classic',
  widgets: ['cpu', 'mem', 'load', 'disk', 'net', 'proc', 'percpu', 'temp'],
  thresholds: {
    cpuWarn: 70,
    cpuCritical: 90,
    memWarn: 75,
    memCritical: 90,
    loadWarnRate: 0.85,
    loadCriticalRate: 1.2,
    diskWarn: 80,
    diskCritical: 92,
    tempWarn: 65,
    tempCritical: 80
  },
  filters: { alertLevel: 'all' }
}

const form = reactive<DashboardConfig>(JSON.parse(JSON.stringify(DEFAULT_CONFIG)))

const cpuSeries = ref<number[]>([])
const memSeries = ref<number[]>([])
const loadSeries = ref<number[]>([])
const netRxSeries = ref<number[]>([])
const netTxSeries = ref<number[]>([])
const diskSeries = ref<number[]>([])
const tempSeries = ref<number[]>([])
const MAX_POINTS = 30
let timer: ReturnType<typeof setInterval> | null = null
let lastDisk = 58

const servers = [
  { ip: appCfg.server.javaIp, port: 25565 },
  { ip: appCfg.server.gunIp, port: 25565 }
]

function pushSeries(bucket: number[], value: number) {
  bucket.push(value)
  if (bucket.length > MAX_POINTS) bucket.shift()
}

function setMessage(text: string, type: 'ok' | 'err' = 'ok') {
  message.value = text
  msgType.value = type
}

const availableWidgets = [
  { value: 'cpu', label: 'CPU' },
  { value: 'mem', label: '内存' },
  { value: 'load', label: '负载' },
  { value: 'temp', label: '温度' },
  { value: 'net', label: '网络' },
  { value: 'disk', label: '磁盘' }
]

function showWidget(name: string) {
  return form.widgets.includes(name)
}

function toggleWidget(name: string) {
  if (readonlyMode.value) return
  const idx = form.widgets.indexOf(name)
  if (idx >= 0) {
    if (form.widgets.length <= 1) return
    form.widgets.splice(idx, 1)
    return
  }
  form.widgets.push(name)
}

function formatTime(iso: string) {
  const ms = Date.parse(String(iso || ''))
  if (!Number.isFinite(ms)) return '--'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

async function loadShareTokens() {
  const uid = targetUserId.value || String(route.params.userId || '')
  if (!uid || readonlyMode.value) return

  const { response, data } = await apiJsonWithAuth<{
    ok?: boolean
    items?: Array<{ token: string; createdAt: string; expiresAt: string; createdBy?: string }>
    message?: string
  }>(`/api/user/${encodeURIComponent(uid)}/dashboard-share-tokens`, null, { cache: 'no-store' })

  if (!response.ok) {
    setMessage(data?.message || '读取分享列表失败', 'err')
    return
  }

  shareTokens.value = Array.isArray(data?.items) ? data.items : []
  if (!shareTokens.value.length) {
    setMessage('暂无有效分享链接')
  }
}

async function revokeShareToken(token: string) {
  const uid = targetUserId.value || String(route.params.userId || '')
  if (!uid || !token || readonlyMode.value) return

  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; message?: string }>(
    `/api/user/${encodeURIComponent(uid)}/dashboard-share-token/${encodeURIComponent(token)}`,
    null,
    { method: 'DELETE' }
  )

  if (!response.ok) {
    toast.addToast({ message: data?.message || '撤销失败', type: 'error' })
    return
  }

  shareTokens.value = shareTokens.value.filter((t) => t.token !== token)
  toast.addToast({ message: '分享链接已撤销', type: 'success' })
}

async function revokeAllShareTokens() {
  const uid = targetUserId.value || String(route.params.userId || '')
  if (!uid || readonlyMode.value) return

  const tokens = [...shareTokens.value]
  for (const item of tokens) {
    await revokeShareToken(item.token)
  }
  toast.addToast({ message: '全部分享链接已撤销', type: 'success' })
}

async function copyReadonlyLink() {
  const uid = targetUserId.value || String(route.params.userId || '')
  if (!uid) return

  try {
    const { response, data } = await apiJsonWithAuth<{ ok?: boolean; token?: string; message?: string }>(
      `/api/user/${encodeURIComponent(uid)}/dashboard-share-token`,
      null,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlSec: 24 * 60 * 60 })
      }
    )

    if (!response.ok || !data?.token) {
      toast.addToast({ message: data?.message || '生成只读链接失败', type: 'error' })
      return
    }

    const link = `${location.origin}/dashboard/${encodeURIComponent(uid)}?share=${encodeURIComponent(data.token)}`
    try {
      await navigator.clipboard.writeText(link)
      toast.addToast({ message: '签名只读链接已复制（24小时有效）', type: 'success' })
    } catch {
      setMessage(link)
    }

    await loadShareTokens()
  } catch (e) {
    toast.addToast({ message: e instanceof Error ? e.message : '生成只读链接失败', type: 'error' })
  }
}

function applyConfig(cfg: DashboardConfig) {
  form.layout = cfg.layout
  form.widgets = Array.isArray(cfg.widgets) ? cfg.widgets.slice() : form.widgets
  form.thresholds = { ...form.thresholds, ...(cfg.thresholds || {}) }
  form.filters = { ...form.filters, ...(cfg.filters || {}) }
}

function getConfigSnapshot() {
  return JSON.stringify({
    layout: form.layout,
    widgets: [...form.widgets],
    thresholds: { ...form.thresholds },
    filters: { ...form.filters }
  })
}

function normalize(series: number[]) {
  if (!series.length) return [0]
  const max = Math.max(...series, 1)
  return series.map((v) => (v / max) * 100)
}

function buildPath(series: number[]) {
  if (!series.length) return 'polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)'
  const points = series
    .map((v, idx) => {
      const x = (idx / Math.max(1, series.length - 1)) * 100
      const y = 100 - v
      return `${x}% ${y}%`
    })
    .join(', ')
  return `polygon(0% 100%, ${points}, 100% 100%)`
}

function latestValue(series: number[]) {
  return series.length ? series[series.length - 1] : 0
}

const cpuNow = computed(() => latestValue(cpuSeries.value))
const memNow = computed(() => latestValue(memSeries.value))
const loadNow = computed(() => latestValue(loadSeries.value))
const netRxNow = computed(() => Math.round(latestValue(netRxSeries.value)))
const netTxNow = computed(() => Math.round(latestValue(netTxSeries.value)))
const diskNow = computed(() => latestValue(diskSeries.value))
const tempNow = computed(() => latestValue(tempSeries.value))

const netRxPath = computed(() => buildPath(normalize(netRxSeries.value)))
const netTxPath = computed(() => buildPath(normalize(netTxSeries.value)))

const lastUpdatedText = computed(() => {
  if (!lastUpdatedAt.value) return '--:--:--'
  return new Date(lastUpdatedAt.value).toLocaleTimeString('zh-CN', { hour12: false })
})

const lastSavedText = computed(() => {
  if (!lastSavedAt.value) return '未保存'
  return new Date(lastSavedAt.value).toLocaleTimeString('zh-CN', { hour12: false })
})

const hasUnsavedChanges = computed(() => {
  if (!targetUserId.value || isHydrating.value) return false
  return getConfigSnapshot() !== lastSavedConfigSnapshot
})

const filteredAlerts = computed(() => {
  const now = Date.now()
  const visible = alerts.value
    .filter((a) => now - a.ts <= 5 * 60 * 1000)
    .map((a) => ({ ...a, relative: relativeTime(a.ts) }))

  if (form.filters.alertLevel === 'all') return visible
  return visible.filter((a) => a.level === form.filters.alertLevel)
})

function clearAlerts() {
  alerts.value = []
}

const warnCount = computed(() => filteredAlerts.value.filter((a) => a.level === 'warn').length)
const criticalCount = computed(() => filteredAlerts.value.filter((a) => a.level === 'critical').length)

function metricLevel(v: number, warn: number, critical: number): MetricLevel {
  if (v >= critical) return 'critical'
  if (v >= warn) return 'warn'
  return 'normal'
}

const cpuLevel = computed(() => metricLevel(cpuNow.value, form.thresholds.cpuWarn, form.thresholds.cpuCritical))
const memLevel = computed(() => metricLevel(memNow.value, form.thresholds.memWarn, form.thresholds.memCritical))
const diskLevel = computed(() => metricLevel(diskNow.value, form.thresholds.diskWarn, form.thresholds.diskCritical))
const tempLevel = computed(() => metricLevel(tempNow.value, form.thresholds.tempWarn, form.thresholds.tempCritical))
const loadLevel = computed(() => {
  const base = 8
  const warn = base * form.thresholds.loadWarnRate
  const critical = base * form.thresholds.loadCriticalRate
  return metricLevel(loadNow.value, warn, critical)
})

function levelClass(level: MetricLevel) {
  return `level-${level}`
}

function relativeTime(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 5) return '刚刚'
  if (s < 60) return `${s}s前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分钟前`
  return `${Math.floor(m / 60)}小时前`
}

function pushAlert(metric: AlertItem['metric'], level: MetricLevel, value: string) {
  if (level === 'normal') {
    if (prevLevels[metric] !== 'normal') {
      pushRecoveryAlert(metric, value)
    }
    prevLevels[metric] = 'normal'
    return
  }
  if (prevLevels[metric] === level) return

  const now = Date.now()
  alerts.value.unshift({
    id: `${metric}-${now}`,
    metric,
    level,
    value,
    ts: now,
    time: new Date(now).toLocaleTimeString('zh-CN', { hour12: false }),
    relative: '刚刚'
  })
  alerts.value = alerts.value.filter((a) => now - a.ts <= 5 * 60 * 1000).slice(0, 30)
  prevLevels[metric] = level
}

function focusMetric(metric: string) {
  const el = document.querySelector(`[data-metric="${metric}"]`) as HTMLElement | null
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.style.boxShadow = '0 0 24px rgba(0, 243, 255, 0.35)'
  setTimeout(() => {
    el.style.boxShadow = ''
  }, 900)
}

function pushRecoveryAlert(metric: AlertItem['metric'], value: string) {
  const now = Date.now()
  alerts.value.unshift({
    id: `${metric}-recovery-${now}`,
    metric,
    level: 'warn',
    value: `${value}（恢复正常）`,
    ts: now,
    time: new Date(now).toLocaleTimeString('zh-CN', { hour12: false }),
    relative: '刚刚'
  })
  alerts.value = alerts.value.filter((a) => now - a.ts <= 5 * 60 * 1000).slice(0, 30)
}

async function tickRealMetrics() {
  const results = await Promise.allSettled(servers.map((s) => getMinecraftServerStatus(s.ip, s.port)))
  const online = results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((x) => x && x.online)

  if (!online.length) {
    isStale.value = true
    pushAlert('stream', 'warn', '数据超时')

    pushSeries(cpuSeries.value, Math.max(10, cpuNow.value * 0.9))
    pushSeries(memSeries.value, Math.max(20, memNow.value * 0.92))
    pushSeries(loadSeries.value, Math.max(0.5, loadNow.value * 0.85))
    pushSeries(netRxSeries.value, Math.max(20, netRxNow.value * 0.7))
    pushSeries(netTxSeries.value, Math.max(10, netTxNow.value * 0.7))
    pushSeries(diskSeries.value, lastDisk)
    pushSeries(tempSeries.value, Math.max(35, tempNow.value * 0.9))

    pushAlert('cpu', cpuLevel.value, `${cpuNow.value.toFixed(1)}%`)
    pushAlert('mem', memLevel.value, `${memNow.value.toFixed(1)}%`)
    pushAlert('load', loadLevel.value, loadNow.value.toFixed(2))
    pushAlert('disk', diskLevel.value, `${diskNow.value.toFixed(0)}%`)
    pushAlert('temp', tempLevel.value, `${tempNow.value.toFixed(0)}°C`)
    return
  }

  const totalOnline = online.reduce((s, item) => s + (item?.players?.online || 0), 0)
  const totalMax = Math.max(1, online.reduce((s, item) => s + (item?.players?.max || 0), 0))
  const pings = online
    .map((item) => {
      const m = String(item?.delay || '').match(/(\d+)/)
      return m ? Number(m[1]) : 0
    })
    .filter((n) => Number.isFinite(n))

  const avgPing = pings.length ? pings.reduce((a, b) => a + b, 0) / pings.length : 0
  const playerRate = totalOnline / totalMax

  const cpu = Math.min(100, Math.max(8, playerRate * 70 + avgPing * 0.18))
  const mem = Math.min(100, Math.max(20, 30 + playerRate * 62))
  const load = Math.max(0.5, 1 + playerRate * 8 + avgPing / 180)
  const netRx = Math.max(50, totalOnline * 230 + avgPing * 18)
  const netTx = Math.max(30, totalOnline * 120 + avgPing * 10)

  lastDisk = Math.min(98, Math.max(35, lastDisk + (playerRate - 0.5) * 0.6))
  const temp = Math.min(92, Math.max(35, 34 + cpu * 0.52))

  isStale.value = false
  prevLevels.stream = 'normal'
  lastUpdatedAt.value = Date.now()

  pushSeries(cpuSeries.value, cpu)
  pushSeries(memSeries.value, mem)
  pushSeries(loadSeries.value, load)
  pushSeries(netRxSeries.value, netRx)
  pushSeries(netTxSeries.value, netTx)
  pushSeries(diskSeries.value, lastDisk)
  pushSeries(tempSeries.value, temp)

  pushAlert('cpu', metricLevel(cpu, form.thresholds.cpuWarn, form.thresholds.cpuCritical), `${cpu.toFixed(1)}%`)
  pushAlert('mem', metricLevel(mem, form.thresholds.memWarn, form.thresholds.memCritical), `${mem.toFixed(1)}%`)
  const loadWarn = 8 * form.thresholds.loadWarnRate
  const loadCritical = 8 * form.thresholds.loadCriticalRate
  pushAlert('load', metricLevel(load, loadWarn, loadCritical), load.toFixed(2))
  pushAlert('disk', metricLevel(lastDisk, form.thresholds.diskWarn, form.thresholds.diskCritical), `${lastDisk.toFixed(0)}%`)
  pushAlert('temp', metricLevel(temp, form.thresholds.tempWarn, form.thresholds.tempCritical), `${temp.toFixed(0)}°C`)
}

async function loadConfig() {
  const uid = String(route.params.userId || '').trim()
  if (!uid) return
  targetUserId.value = uid

  if (shareToken.value) {
    const { response, data } = await apiJsonWithAuth<{ ok?: boolean; userId?: string; config?: DashboardConfig; message?: string }>(
      `/api/public/dashboard-share/${encodeURIComponent(shareToken.value)}`,
      null,
      { cache: 'no-store' }
    )

    if (!response.ok || !data?.config) {
      setMessage(data?.message || '读取分享配置失败', 'err')
      return
    }

    if (data.userId && data.userId !== uid) {
      setMessage('分享链接与当前用户路径不匹配', 'err')
      return
    }

    applyConfig(data.config)
    lastSavedConfigSnapshot = getConfigSnapshot()
    isHydrating.value = false
    setMessage('已加载分享配置（只读）')
    return
  }

  const { response, data } = await apiJsonWithAuth<{ ok?: boolean; config?: DashboardConfig; message?: string }>(
    `/api/user/${encodeURIComponent(uid)}/dashboard-config`,
    null,
    { cache: 'no-store' }
  )

  if (!response.ok || !data?.config) {
    setMessage(data?.message || '读取配置失败', 'err')
    return
  }

  applyConfig(data.config)
  lastSavedConfigSnapshot = getConfigSnapshot()
  isHydrating.value = false
  setMessage('配置已加载')
}

async function saveConfig(silent = false) {
  if (!targetUserId.value) return
  if (readonlyMode.value) return
  saving.value = true
  try {
    const payload = { config: JSON.parse(getConfigSnapshot()) }
    const { response, data } = await apiJsonWithAuth<{ ok?: boolean; config?: DashboardConfig; message?: string }>(
      `/api/user/${encodeURIComponent(targetUserId.value)}/dashboard-config`,
      null,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )
    if (!response.ok || !data?.config) {
      if (!silent) toast.addToast({ message: data?.message || '保存失败', type: 'error' })
      return
    }
    applyConfig(data.config)
    lastSavedConfigSnapshot = getConfigSnapshot()
    lastSavedAt.value = Date.now()
    if (!silent) toast.addToast({ message: '保存成功', type: 'success' })
  } catch (e) {
    if (!silent) toast.addToast({ message: e instanceof Error ? e.message : '保存失败', type: 'error' })
  } finally {
    saving.value = false
  }
}

async function resetConfig() {
  if (readonlyMode.value) return

  resetBackupSnapshot = getConfigSnapshot()
  canUndoReset.value = true
  if (undoResetTimer) clearTimeout(undoResetTimer)
  undoResetTimer = setTimeout(() => {
    canUndoReset.value = false
    resetBackupSnapshot = ''
  }, 5000)

  applyConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)))
  toast.addToast({ message: '正在恢复默认配置，5秒内可撤销...', type: 'info' })
  await saveConfig(true)
  toast.addToast({ message: '已恢复默认配置并保存成功（5秒内可撤销）', type: 'success' })
}

async function undoReset() {
  if (!canUndoReset.value || !resetBackupSnapshot || readonlyMode.value) return
  applyConfig(JSON.parse(resetBackupSnapshot))
  if (undoResetTimer) clearTimeout(undoResetTimer)
  canUndoReset.value = false
  resetBackupSnapshot = ''
  toast.addToast({ message: '已撤销恢复，正在保存...', type: 'info' })
  await saveConfig(true)
  toast.addToast({ message: '已撤销恢复并保存成功', type: 'success' })
}

watch(() => route.params.userId, () => {
  isHydrating.value = true
  void loadConfig()
})

watch(
  () => getConfigSnapshot(),
  (snapshot) => {
    if (readonlyMode.value) return
    if (isHydrating.value) return
    if (!targetUserId.value) return
    if (snapshot === lastSavedConfigSnapshot) return

    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      void saveConfig(true)
    }, 900)
  }
)

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (readonlyMode.value) return
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  void tickRealMetrics()
  timer = setInterval(() => void tickRealMetrics(), 5000)
  void loadConfig()
  if (!readonlyMode.value) {
    void loadShareTokens()
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (undoResetTimer) clearTimeout(undoResetTimer)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
.dashboardPage { max-width: 1180px; margin: 0 auto; padding: 92px 16px 40px; color: #fff; }
.dashboardHeader { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.dashboardHeader h1 { margin: 0; font-size: 30px; }
.dashboardHeader p { margin: 8px 0 0; color: #9fb3d7; }
.cfgToggle { color: #dfeeff; padding: 8px 12px; }

.kpiGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.kpiCard { border: 1px solid rgba(255,255,255,.16); border-radius: 10px; background: var(--surface-2, rgba(10,16,28,.72)); padding: 12px; }
.kpiLabel { margin: 0; color: #9db4d8; font-size: 12px; }
.kpiValue { margin: 8px 0 0; font-size: 28px; font-weight: 700; }
.kpiHint { margin: 6px 0 0; color: #93a8c8; font-size: 12px; }
.level-normal { border-color: rgba(10,255,96,.28); }
.level-warn { border-color: rgba(255,179,0,.56); box-shadow: inset 0 0 18px rgba(255,179,0,.08); }
.level-critical { border-color: rgba(255,0,60,.7); box-shadow: inset 0 0 18px rgba(255,0,60,.12); }

.panel, .dashboardCard { border: 1px solid rgba(255,255,255,.16); background: var(--surface-2, rgba(10,16,28,.72)); border-radius: 10px; padding: 14px; margin-bottom: 12px; }
.panel header { display: flex; justify-content: space-between; margin-bottom: 10px; }
.panel h2 { margin: 0; font-size: 16px; }
.panel span { color: #9fb3d7; font-size: 13px; }

.trendChart { position: relative; height: 140px; border-radius: 10px; border: 1px solid rgba(56,189,248,.28); background: rgba(15,23,42,.5); overflow: hidden; }
.line { position: absolute; inset: 0; }
.lineA { background: linear-gradient(180deg, rgba(34,211,238,.45), rgba(34,211,238,.08)); }
.lineB { background: linear-gradient(180deg, rgba(168,85,247,.42), rgba(168,85,247,.06)); mix-blend-mode: screen; }

.barTrack { height: 12px; border-radius: 999px; background: rgba(51,65,85,.8); overflow: hidden; }
.barFill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #22d3ee, #60a5fa); transition: width .35s ease; }

.row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }

.widgetPicker {
  margin-bottom: 12px;
}
.widgetPicker p {
  margin: 0 0 8px;
  color: #a9bfdf;
  font-size: 13px;
}
.widgetChips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.widgetChip {
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.03);
  color: #c6d6ef;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
}
.widgetChip.active {
  border-color: rgba(0, 243, 255, 0.68);
  background: rgba(0, 243, 255, 0.14);
  color: #e7fbff;
}

.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #c9d8f2; }
input, select { background: rgba(255,255,255,.06); color: #fff; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; padding: 8px; }
.actions { margin-top: 12px; }
button { border: 1px solid rgba(0,243,255,.5); background: rgba(0,243,255,.12); color: #dffbff; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
button.ghost { border-color: rgba(255,255,255,.25); background: rgba(255,255,255,.04); color: #c2d3ed; margin-left: 8px; }
.summary.unsaved { color: #ffd08a; border-color: rgba(255, 185, 66, 0.45); }
.tokenList { display: flex; flex-direction: column; gap: 8px; }
.tokenItem { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: rgba(255,255,255,.03); }
.tokenMeta { display: flex; flex-direction: column; gap: 4px; }
.tokenLine { font-size: 12px; color: #b9cae5; font-family: 'JetBrains Mono', monospace; }
.msg { margin-top: 10px; }
.msg.ok { color: #73f0b3; }
.msg.err { color: #ff8ea4; }

@media (max-width: 1024px) {
  .kpiGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .dashboardHeader { flex-direction: column; align-items: flex-start; }
  .kpiGrid, .row, .grid { grid-template-columns: 1fr; }
  .widgetChips { gap: 6px; }
}
</style>
