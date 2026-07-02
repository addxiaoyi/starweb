<template>
  <div class="page-shell skin-share-view">
    <header class="share-header">
      <p class="share-eyebrow">Skin Share</p>
      <h1 class="page-title">皮肤分享</h1>
      <p class="page-subtitle">根据分享码展示皮肤内容，方便快速预览与复制使用。</p>
      <div class="share-summary" v-if="shareItem">
        <span class="summary-pill">{{ modelLabel }}</span>
        <span class="summary-pill">{{ shareItem.tags?.length || 0 }} 个标签</span>
        <span class="summary-pill">{{ shareItem.updatedAt ? '已更新' : '未记录时间' }}</span>
      </div>
    </header>

    <section class="share-card glass-panel starmc-list-group" aria-live="polite">
      <AppStatePanel
        v-if="loading"
        variant="loading"
        title="正在加载分享内容..."
        message="正在从服务器获取皮肤信息，请稍候。"
      />

      <AppStatePanel
        v-else-if="error"
        variant="error"
        title="分享内容加载失败"
        :message="error"
        hint="请检查分享链接是否正确，或稍后重试。"
      />

      <template v-else-if="shareItem">
        <div class="share-item starmc-list-item">
          <img
            :src="shareItem.previewUrl || shareItem.skinUrl || fallbackPreview"
            :alt="shareItem.name || '分享皮肤预览'"
            class="share-thumb"
          />
          <div class="share-meta">
            <div class="share-meta-head">
              <h2>{{ shareItem.name || '未命名皮肤' }}</h2>
              <span v-if="shareItem.model" class="starmc-badge meta-badge">{{ modelLabel }}</span>
            </div>

            <p class="share-description share-description--muted">该分享未提供描述。</p>

            <dl class="share-details starmc-list-group">
              <div class="starmc-list-item">
                <dt>分享码</dt>
                <dd>{{ shareCode }}</dd>
              </div>
              <div v-if="shareItem.updatedAt" class="starmc-list-item">
                <dt>更新时间</dt>
                <dd>{{ formatDate(shareItem.updatedAt) }}</dd>
              </div>
              <div v-if="shareItem.source" class="starmc-list-item">
                <dt>来源</dt>
                <dd>{{ shareItem.source }}</dd>
              </div>
            </dl>

            <div v-if="shareItem.tags?.length" class="share-tags starmc-list-group" aria-label="皮肤标签">
              <span v-for="tag in shareItem.tags" :key="tag" class="starmc-badge tag">{{ tag }}</span>
            </div>
          </div>
        </div>
      </template>

      <AppStatePanel
        v-else
        variant="empty"
        :title="shareCode ? '未找到对应分享内容。' : '缺少分享码。'"
        :message="shareCode ? '请确认链接是否正确，或让分享者重新生成链接。' : '请通过带有分享码的链接打开此页面。'"
        hint="如果你是分享者，请重新复制分享链接后再试。"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { apiJsonWithAuth } from '@/shared/utils/security'
import type { LibraryItem } from '@/features/skin/types'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'

const error = ref('')

const route = useRoute()
const shareCode = computed(() => String(route.params.code || '').trim())
const loading = ref(false)
const shareItem = ref<LibraryItem | null>(null)
const fallbackPreview = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22240%22 viewBox=%220 0 240 240%22%3E%3Crect width=%22240%22 height=%22240%22 rx=%2232%22 fill=%22%23161b2e%22/%3E%3Cpath d=%22M52 178l32-58 28 30 24-42 52 70H52z%22 fill=%22%23384a73%22/%3E%3Ccircle cx=%2292%22 cy=%2292%22 r=%2214%22 fill=%22%235e72b8%22/%3E%3C/svg%3E'

const modelLabel = computed(() => {
  const model = shareItem.value?.model
  if (model === 'slim') return '细手臂'
  if (model === 'default') return '经典'
  if (model === 'auto') return '自动识别'
  return model || ''
})

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function loadShare() {
  if (!shareCode.value) {
    shareItem.value = null
    error.value = ''
    return
  }

  loading.value = true
  error.value = ''
  try {
    const { response, data } = await apiJsonWithAuth<{ item?: LibraryItem }>(`/api/skins/share/${encodeURIComponent(shareCode.value)}`)
    shareItem.value = response.ok && data?.item ? data.item : null
    if (!shareItem.value) {
      error.value = '未找到对应分享内容'
    }
  } catch (e) {
    shareItem.value = null
    error.value = e instanceof Error ? e.message : '分享内容加载失败'
  } finally {
    loading.value = false
  }
}

watch(shareCode, loadShare, { immediate: true })
</script>

<style scoped>
.skin-share-view {
  padding: clamp(1.5rem, 3vw, 2.5rem) 1.5rem 3rem;
}

.share-header {
  margin-bottom: 1rem;
}

.share-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

.summary-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(124, 140, 255, 0.12);
  color: var(--text-primary);
  border: 1px solid rgba(124, 140, 255, 0.18);
  font-size: 0.84rem;
}

.share-eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.page-title {
  margin: 0 0 0.5rem;
}

.page-subtitle {
  margin: 0;
  color: var(--text-secondary);
}

.share-card {
  padding: clamp(1rem, 2vw, 1.5rem);
}

.share-item {
  display: grid;
  grid-template-columns: minmax(120px, 220px) 1fr;
  gap: 1.25rem;
  align-items: start;
}

.share-thumb {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.share-meta {
  min-width: 0;
}

.share-meta-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.35rem;
}

.share-meta h2 {
  margin: 0;
}

.meta-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  background: rgba(124, 140, 255, 0.12);
  color: var(--primary);
  font-size: 0.85rem;
}

.share-description {
  margin: 0 0 1rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

.share-description--muted {
  font-style: italic;
}

.share-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.85rem;
  margin: 0 0 1rem;
}

.share-details div {
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.share-details dt {
  margin-bottom: 0.35rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.share-details dd {
  margin: 0;
  word-break: break-word;
}

.share-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag {
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.share-empty {
  color: var(--text-secondary);
}

.share-state {
  min-height: 240px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.75rem;
  padding: 1.5rem;
}

.share-state-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.share-state-text {
  margin: 0;
  max-width: 34rem;
  line-height: 1.7;
}

.share-spinner {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.14);
  border-top-color: var(--primary);
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .skin-share-view {
    padding-inline: 1rem;
  }

  .share-item {
    grid-template-columns: 1fr;
  }

  .share-thumb {
    max-width: 220px;
    justify-self: center;
  }
}
</style>
