<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="audit-log-overlay"
        @click.self="close"
      >
        <div class="audit-log-modal">
          <header class="audit-header">
            <h2>{{ $t('audit.title') || '安全审计日志' }}</h2>
            <div class="header-actions">
              <button
                class="export-btn"
                @click="exportLogs"
              >
                {{ $t('audit.export') || '导出' }}
              </button>
              <button
                class="close-btn"
                aria-label="关闭"
                @click="close"
              >
                ×
              </button>
            </div>
          </header>

          <div class="audit-body">
            <!-- 统计卡片 -->
            <div class="stats-grid">
              <div class="stat-card">
                <span class="stat-value">{{ stats.total }}</span>
                <span class="stat-label">{{ $t('audit.totalLogs') || '总记录' }}</span>
              </div>
              <div class="stat-card success">
                <span class="stat-value">{{ stats.success }}</span>
                <span class="stat-label">{{ $t('audit.success') || '成功' }}</span>
              </div>
              <div class="stat-card failure">
                <span class="stat-value">{{ stats.failure }}</span>
                <span class="stat-label">{{ $t('audit.failure') || '失败' }}</span>
              </div>
              <div class="stat-card denied">
                <span class="stat-value">{{ stats.denied }}</span>
                <span class="stat-label">{{ $t('audit.denied') || '拒绝' }}</span>
              </div>
            </div>

            <!-- 过滤器 -->
            <div class="filters">
              <select
                v-model="filterAction"
                class="filter-select"
              >
                <option value="">{{ $t('audit.allActions') || '所有操作' }}</option>
                <option value="login">{{ $t('audit.login') || '登录' }}</option>
                <option value="logout">{{ $t('audit.logout') || '登出' }}</option>
                <option value="create">{{ $t('audit.create') || '创建' }}</option>
                <option value="update">{{ $t('audit.update') || '更新' }}</option>
                <option value="delete">{{ $t('audit.delete') || '删除' }}</option>
              </select>

              <select
                v-model="filterResult"
                class="filter-select"
              >
                <option value="">{{ $t('audit.allResults') || '所有结果' }}</option>
                <option value="success">{{ $t('audit.success') || '成功' }}</option>
                <option value="failure">{{ $t('audit.failure') || '失败' }}</option>
                <option value="denied">{{ $t('audit.denied') || '拒绝' }}</option>
              </select>

              <button
                class="clear-btn"
                @click="clearFilters"
              >
                {{ $t('audit.clear') || '清除' }}
              </button>
            </div>

            <!-- 日志列表 -->
            <div class="log-list">
              <div
                v-for="log in filteredLogs"
                :key="log.timestamp + log.action"
                class="log-item"
                :class="log.result"
              >
                <div class="log-header">
                  <span
                    class="log-result-badge"
                    :class="log.result"
                  >
                    {{ getResultLabel(log.result) }}
                  </span>
                  <span class="log-action">{{ log.action }}</span>
                  <span class="log-resource">{{ log.resource }}</span>
                  <time class="log-time">{{ formatTime(log.timestamp) }}</time>
                </div>
                <div
                  v-if="log.userId || log.ip"
                  class="log-meta"
                >
                  <span v-if="log.userId">User: {{ log.userId }}</span>
                  <span v-if="log.ip">IP: {{ log.ip }}</span>
                  <span v-if="log.requestId">Req: {{ log.requestId }}</span>
                </div>
                <div
                  v-if="log.error"
                  class="log-error"
                >
                  {{ log.error }}
                </div>
                <div
                  v-if="log.metadata && Object.keys(log.metadata).length > 0"
                  class="log-metadata"
                >
                  <details>
                    <summary>{{ $t('audit.metadata') || '元数据' }}</summary>
                    <pre>{{ JSON.stringify(log.metadata, null, 2) }}</pre>
                  </details>
                </div>
              </div>

              <div
                v-if="filteredLogs.length === 0"
                class="empty-state"
              >
                {{ $t('audit.noLogs') || '暂无日志记录' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getAuditLogs, clearAuditLogs, type AuditLogEntry } from '@/shared/utils/logSanitizer'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const filterAction = ref('')
const filterResult = ref('')

const logs = computed(() => getAuditLogs())

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    if (filterAction.value && !log.action.toLowerCase().includes(filterAction.value.toLowerCase())) {
      return false
    }
    if (filterResult.value && log.result !== filterResult.value) {
      return false
    }
    return true
  }).slice().reverse()
})

const stats = computed(() => {
  return logs.value.reduce((acc, log) => {
    acc.total++
    acc[log.result]++
    return acc
  }, { total: 0, success: 0, failure: 0, denied: 0 })
})

const close = () => {
  isOpen.value = false
}

const clearFilters = () => {
  filterAction.value = ''
  filterResult.value = ''
}

const getResultLabel = (result: string) => {
  const labels: Record<string, string> = {
    success: '✓',
    failure: '✗',
    denied: '⊘',
  }
  return labels[result] || result
}

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const exportLogs = () => {
  const data = JSON.stringify(logs.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.audit-log-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.audit-log-modal {
  background: var(--surface-1, #1e1e23);
  border-radius: 12px;
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.audit-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary, #fff);
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.export-btn {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.export-btn:hover {
  background: rgba(59, 130, 246, 0.3);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary, #9ca3af);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--text-primary, #fff);
}

.audit-body {
  padding: 1.5rem;
  overflow-y: auto;
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
  padding: 1rem;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-card.success {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
}

.stat-card.failure {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
}

.stat-card.denied {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.05);
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary, #9ca3af);
  margin-top: 0.25rem;
}

.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.clear-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary, #9ca3af);
  padding: 0.5rem 0.875rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.log-item {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 1rem;
  border-left: 3px solid transparent;
}

.log-item.success {
  border-left-color: #22c55e;
}

.log-item.failure {
  border-left-color: #ef4444;
}

.log-item.denied {
  border-left-color: #f59e0b;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.log-result-badge {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
}

.log-result-badge.success {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.log-result-badge.failure {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.log-result-badge.denied {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.log-action {
  font-weight: 500;
  color: var(--text-primary, #fff);
}

.log-resource {
  color: var(--text-secondary, #9ca3af);
  font-size: 0.875rem;
}

.log-time {
  margin-left: auto;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.75rem;
  font-family: monospace;
}

.log-meta {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #9ca3af);
}

.log-error {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: #ef4444;
  font-family: monospace;
}

.log-metadata {
  margin-top: 0.5rem;
}

.log-metadata details {
  font-size: 0.8125rem;
}

.log-metadata summary {
  color: #3b82f6;
  cursor: pointer;
  user-select: none;
}

.log-metadata pre {
  margin: 0.5rem 0 0 0;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 0.75rem;
  overflow-x: auto;
  color: var(--text-secondary, #9ca3af);
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary, #9ca3af);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .log-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .log-time {
    margin-left: 0;
  }
}
</style>
