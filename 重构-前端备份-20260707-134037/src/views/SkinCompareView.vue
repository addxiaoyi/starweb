<template>
  <div class="skin-compare-view">
    <div class="container page-shell">
      <header class="compare-header page-hero">
        <h1 class="starmc-brand-glow page-hero__title">
          <AppIcon name="warning" :size="28" class="heading-icon" />
          皮肤对比
        </h1>
        <p class="subtitle page-hero__subtitle" data-typography="prose">
          选择两个皮肤并排预览，支持独立控制和分享对比链接
        </p>
        <div class="compare-summary" aria-label="对比摘要">
          <div class="summary-pill">
            <span>已选</span>
            <strong>{{ Number(Boolean(leftSkin)) + Number(Boolean(rightSkin)) }}/2</strong>
          </div>
          <div class="summary-pill">
            <span>分享</span>
            <strong>{{ copiedLink ? '已复制' : '可分享' }}</strong>
          </div>
        </div>
      </header>

      <section v-if="hasSelection" class="compare-toolbar starmc-list-group" aria-label="对比工具栏">
        <div class="toolbar-meta starmc-list-item">
          <span>{{ leftSkin?.name || '左侧未选择' }}</span>
          <AppIcon name="arrowRight" :size="14" />
          <span>{{ rightSkin?.name || '右侧未选择' }}</span>
        </div>
        <div class="toolbar-actions starmc-list-item">
          <button class="mc-button" @click="swapSkins" :disabled="!leftSkin || !rightSkin">
            <AppIcon name="shuffle" :size="16" />
            交换左右
          </button>
          <button class="mc-button" @click="copyCurrentLink" :class="{ success: copiedLink }">
            <AppIcon :name="copiedLink ? 'check' : 'link'" :size="16" />
            {{ copiedLink ? '链接已复制' : '复制链接' }}
          </button>
          <button class="mc-button primary" @click="openShareModal">
            <AppIcon name="share" :size="16" />
            分享对比
          </button>
          <button class="mc-button" @click="resetComparison">
            <AppIcon name="refresh" :size="16" />
            重置
          </button>
        </div>
      </section>

      <AppStatePanel
        v-if="!hasSelection"
        variant="empty"
        eyebrow="Skin Compare"
        title="开始你的皮肤对比"
        message="先为左侧和右侧各选一个皮肤，就能立即预览、交换顺序、复制链接并生成分享卡片。"
        hint="建议先从左侧选择常用皮肤，再从右侧找一个对照项。"
        class="compare-empty-panel"
      >
        <template #icon>
          <AppIcon name="sparkles" :size="28" class="empty-state-icon" />
        </template>
      </AppStatePanel>

      <!-- 皮肤选择器 -->
      <section class="selector-section starmc-list-group">
        <div class="skin-selectors">
          <div class="skin-selector starmc-list-item">
            <h3>左侧皮肤</h3>
            <SkinSelector
              v-model="leftSkin"
              @select="(skin) => onSkinSelect('left', skin)"
            />
          </div>
          <div class="vs-divider starmc-list-item">
            <span class="vs-text">VS</span>
          </div>
          <div class="skin-selector starmc-list-item">
            <h3>右侧皮肤</h3>
            <SkinSelector
              v-model="rightSkin"
              @select="(skin) => onSkinSelect('right', skin)"
            />
          </div>
        </div>
      </section>

      <!-- 对比展示区 -->
      <section class="compare-section" v-if="hasSelection">
        <SkinCompare
          :left-skin="leftSkin"
          :right-skin="rightSkin"
        />
      </section>
    </div>

    <!-- 分享弹窗 -->
    <SkinShareModal
      v-model:visible="shareModalVisible"
      :share-url="shareUrl"
      :embed-code="embedCode"
      title="分享皮肤对比"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/atoms/AppIcon.vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import SkinSelector from '@/components/molecules/Skin/SkinSelector.vue'
import SkinCompare from '@/components/organisms/Skin/SkinCompare.vue'
import SkinShareModal from '@/components/molecules/Skin/SkinShareModal.vue'
import type { LibraryItem } from '@/features/skin/types'

const route = useRoute()
const router = useRouter()

const leftSkin = ref<LibraryItem | null>(null)
const rightSkin = ref<LibraryItem | null>(null)
const shareModalVisible = ref(false)
const copiedLink = ref(false)
const hasSelection = computed(() => Boolean(leftSkin.value || rightSkin.value))

function syncFromRoute() {
  const leftId = typeof route.query.left === 'string' ? route.query.left : ''
  const rightId = typeof route.query.right === 'string' ? route.query.right : ''

  if (leftId) loadSkinById(leftId, 'left')
  if (rightId) loadSkinById(rightId, 'right')
}

onMounted(syncFromRoute)

async function loadSkinById(id: string, side: 'left' | 'right') {
  try {
    const { searchSkinLibrary } = await import('@/features/skin/api')
    const result = await searchSkinLibrary(id)
    const skin = result.data?.items?.find((item) => item.id === id)
    if (skin) {
      assignSkin(side, skin)
    }
  } catch (error) {
    console.error('Failed to load skin:', error)
  }
}

function assignSkin(side: 'left' | 'right', skin: LibraryItem) {
  if (side === 'left') leftSkin.value = skin
  else rightSkin.value = skin
  updateUrlParams()
}

function onSkinSelect(side: 'left' | 'right', skin: LibraryItem) {
  assignSkin(side, skin)
}

function updateUrlParams() {
  const query: Record<string, string> = {}
  if (leftSkin.value?.id) query.left = leftSkin.value.id
  if (rightSkin.value?.id) query.right = rightSkin.value.id

  router.replace({
    path: '/skin/compare',
    query: Object.keys(query).length > 0 ? query : undefined,
  })
}

const shareUrl = computed(() => {
  const params = new URLSearchParams()
  if (leftSkin.value?.id) params.set('left', leftSkin.value.id)
  if (rightSkin.value?.id) params.set('right', rightSkin.value.id)

  if (typeof window === 'undefined') {
    return `/skin/compare?${params.toString()}`
  }

  const base = window.location.origin
  return `${base}/skin/compare?${params.toString()}`
})

const embedCode = computed(() => {
  const width = 800
  const height = 500
  return `<iframe src="${shareUrl.value}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`
})

async function copyCurrentLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copiedLink.value = true
    setTimeout(() => {
      copiedLink.value = false
    }, 2000)
  } catch {
    copiedLink.value = false
  }
}

function openShareModal() {
  shareModalVisible.value = true
}

function swapSkins() {
  if (!leftSkin.value || !rightSkin.value) return

  const temp = leftSkin.value
  leftSkin.value = rightSkin.value
  rightSkin.value = temp
  updateUrlParams()
}

function resetComparison() {
  leftSkin.value = null
  rightSkin.value = null
  router.replace({ path: '/skin/compare' })
}
</script>

<style scoped lang="scss">
.skin-compare-view {
  padding: 2rem 0;
}

.compare-header {
  text-align: center;
  margin-bottom: 2rem;
}

.compare-summary {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 14px;
}

.summary-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.04);
}

.summary-pill span {
  font-size: 12px;
  color: var(--text-secondary);
}

.summary-pill strong {
  color: var(--text-primary);
}

.compare-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(10px);
}

.compare-empty-panel {
  margin-bottom: 1.5rem;
}

.empty-state-icon {
  color: var(--accent-color, #00d4ff);
  flex-shrink: 0;
}

.toolbar-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  min-width: 0;

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.toolbar-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.selector-section {
  margin-bottom: 2rem;
}

.skin-selectors {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1.5rem;
  align-items: start;
}

.skin-selector {
  h3 {
    color: var(--text-primary);
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 2rem;
  
  .vs-text {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--accent-color, #00d4ff);
    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
  }
}

.compare-section {
  margin-bottom: 2rem;
}

.action-section {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.empty-hint {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.18);
  color: var(--text-secondary);
  line-height: 1.7;
}

@media (max-width: 768px) {
  .compare-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions {
    justify-content: stretch;

    .mc-button {
      width: 100%;
    }
  }

  .skin-selectors {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .vs-divider {
    padding: 0.5rem 0;
  }

  .empty-state-card {
    flex-direction: column;
  }
}
</style>
