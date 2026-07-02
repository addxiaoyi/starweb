<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="a11y-scanner-overlay"
        @click.self="close"
      >
        <div class="a11y-scanner-modal">
          <header class="scanner-header">
            <h2>{{ $t('a11y.scannerTitle') || '无障碍检测' }}</h2>
            <button
              class="close-btn"
              aria-label="关闭"
              @click="close"
            >
              ×
            </button>
          </header>

          <div class="scanner-body">
            <!-- 扫描按钮 -->
            <div
              v-if="!lastResult"
              class="scan-prompt"
            >
              <p>{{ $t('a11y.scanPrompt') || '点击下方按钮开始检测页面无障碍问题' }}</p>
              <button
                class="scan-btn"
                :disabled="isScanning"
                @click="startScan"
              >
                <span v-if="isScanning">{{ $t('a11y.scanning') || '扫描中...' }}</span>
                <span v-else>{{ $t('a11y.startScan') || '开始扫描' }}</span>
              </button>
            </div>

            <!-- 扫描结果 -->
            <div
              v-else
              class="scan-results"
            >
              <!-- 结果摘要 -->
              <div
                class="result-summary"
                :class="{ pass: lastResult.pass, fail: !lastResult.pass }"
              >
                <div class="summary-icon">
                  {{ lastResult.pass ? '✅' : '⚠️' }}
                </div>
                <div class="summary-text">
                  <h3>
                    {{ lastResult.pass 
                      ? ($t('a11y.scanPass') || '检测通过') 
                      : ($t('a11y.scanFail') || '发现问题') }}
                  </h3>
                  <p>
                    {{ $t('a11y.violationsFound', { count: lastResult.violations }) 
                      || `发现 ${lastResult.violations} 个问题` }}
                    · {{ $t('a11y.scanTime', { time: lastResult.scanTime.toFixed(0) }) 
                      || `耗时 ${lastResult.scanTime.toFixed(0)}ms` }}
                  </p>
                </div>
              </div>

              <!-- 违规列表 -->
              <div
                v-if="violationsBySeverity.critical.length > 0"
                class="violation-group critical"
              >
                <h4>🔴 {{ $t('a11y.critical') || '严重' }} ({{ violationsBySeverity.critical.length }})</h4>
                <ul>
                  <li
                    v-for="(v, i) in violationsBySeverity.critical"
                    :key="`critical-${i}`"
                  >
                    <strong>{{ v.description }}</strong>
                    <p>{{ v.help }}</p>
                    <a
                      :href="v.helpUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ $t('a11y.learnMore') || '了解更多' }} →</a>
                  </li>
                </ul>
              </div>

              <div
                v-if="violationsBySeverity.serious.length > 0"
                class="violation-group serious"
              >
                <h4>🟠 {{ $t('a11y.serious') || '重要' }} ({{ violationsBySeverity.serious.length }})</h4>
                <ul>
                  <li
                    v-for="(v, i) in violationsBySeverity.serious"
                    :key="`serious-${i}`"
                  >
                    <strong>{{ v.description }}</strong>
                    <p>{{ v.help }}</p>
                  </li>
                </ul>
              </div>

              <div
                v-if="violationsBySeverity.moderate.length > 0"
                class="violation-group moderate"
              >
                <h4>🟡 {{ $t('a11y.moderate') || '中等' }} ({{ violationsBySeverity.moderate.length }})</h4>
                <ul>
                  <li
                    v-for="(v, i) in violationsBySeverity.moderate"
                    :key="`moderate-${i}`"
                  >
                    <strong>{{ v.description }}</strong>
                    <p>{{ v.help }}</p>
                  </li>
                </ul>
              </div>

              <!-- 重新扫描 -->
              <button
                class="rescan-btn"
                :disabled="isScanning"
                @click="startScan"
              >
                {{ isScanning 
                  ? ($t('a11y.scanning') || '扫描中...') 
                  : ($t('a11y.rescan') || '重新扫描') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useA11y } from '@/composables/useA11y'

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

const { isScanning, lastResult, scan, getViolationsBySeverity } = useA11y()

const violationsBySeverity = computed(() => {
  if (!lastResult.value) return { critical: [], serious: [], moderate: [], minor: [] }
  return getViolationsBySeverity()
})

const close = () => {
  isOpen.value = false
}

const startScan = async () => {
  await scan()
}
</script>

<style scoped>
.a11y-scanner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.a11y-scanner-modal {
  background: var(--surface-1, #1e1e23);
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.scanner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.scanner-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary, #fff);
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

.scanner-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.scan-prompt {
  text-align: center;
  padding: 2rem;
}

.scan-prompt p {
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 1.5rem;
}

.scan-btn,
.rescan-btn {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
}

.scan-btn:hover:not(:disabled),
.rescan-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.scan-btn:disabled,
.rescan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.result-summary.pass {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.result-summary.fail {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.summary-icon {
  font-size: 2rem;
}

.summary-text h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.125rem;
}

.summary-text p {
  margin: 0;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.875rem;
}

.violation-group {
  margin-bottom: 1.5rem;
}

.violation-group h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.9375rem;
}

.violation-group ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.violation-group li {
  padding: 0.875rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

.violation-group li strong {
  display: block;
  color: var(--text-primary, #fff);
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.violation-group li p {
  margin: 0 0 0.5rem 0;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.8125rem;
}

.violation-group li a {
  color: #3b82f6;
  font-size: 0.8125rem;
  text-decoration: none;
}

.violation-group li a:hover {
  text-decoration: underline;
}

.violation-group.critical li {
  border-left: 3px solid #ef4444;
}

.violation-group.serious li {
  border-left: 3px solid #f97316;
}

.violation-group.moderate li {
  border-left: 3px solid #eab308;
}

.rescan-btn {
  width: 100%;
  margin-top: 1rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
