<template>
  <div class="skin-selector">
    <div class="selector-input" @click="openModal" @keydown="handleSelectorKeydown" tabindex="0" role="button" aria-label="选择皮肤">
      <div v-if="selectedSkin" class="selected-skin">
        <img :src="selectedSkin.previewUrl || selectedSkin.skinUrl" :alt="selectedSkin.name" class="skin-thumb">
        <div class="skin-info">
          <span class="skin-name">{{ selectedSkin.name }}</span>
          <span class="skin-model">{{ selectedSkin.model || 'auto' }}</span>
        </div>
        <div class="selected-badge">已选</div>
      </div>
      <div v-else class="placeholder">
        <AppIcon name="search" :size="20" />
        <span>点击选择皮肤</span>
      </div>
    </div>

    <!-- 选择弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="modalVisible" class="selector-modal-overlay" @click.self="closeModal">
          <div class="selector-modal">
            <div class="modal-header">
              <h3>选择皮肤</h3>
              <button class="close-btn" @click="closeModal">
                <AppIcon name="x" :size="20" />
              </button>
            </div>
            
            <div class="search-box">
              <AppIcon name="search" :size="16" class="search-icon" />
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索皮肤名称..."
                @input="debouncedSearch"
                :aria-label="'搜索皮肤名称'"
              >
            </div>

            <div class="modal-tip">
              <AppIcon name="sparkles" :size="14" />
              <span>回车可打开选择器，输入关键词快速筛选</span>
            </div>

            <div class="skin-list" v-if="!loading">
              <div
                v-for="skin in skinList"
                :key="skin.id"
                :class="['skin-item', { selected: selectedSkin?.id === skin.id }]"
                @click="selectSkin(skin)"
              >
                <img :src="skin.previewUrl || skin.skinUrl" :alt="skin.name" class="item-thumb">
                <div class="item-info">
                  <span class="item-name">{{ skin.name }}</span>
                  <span class="item-tags">
                    <span v-for="tag in (skin.tags || []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
                  </span>
                </div>
                <AppIcon v-if="selectedSkin?.id === skin.id" name="checkCircle" :size="20" class="check-icon" />
              </div>
              
              <div v-if="skinList.length === 0" class="empty-state">
                <AppIcon name="inbox" :size="32" />
                <p>没有找到皮肤</p>
              </div>
            </div>

            <div v-else class="loading-state">
              <div class="spinner"></div>
              <p>加载中...</p>
            </div>

            <div class="modal-footer">
              <button class="mc-button" @click="closeModal">取消</button>
              <button class="mc-button primary" @click="confirmSelection" :disabled="!tempSelected">
                确认选择
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/atoms/AppIcon.vue'
import type { LibraryItem } from '@/features/skin/types'

interface Props {
  modelValue?: LibraryItem | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: LibraryItem | null]
  select: [value: LibraryItem]
}>()

const modalVisible = ref(false)
const searchKeyword = ref('')
const skinList = ref<LibraryItem[]>([])
const loading = ref(false)
const tempSelected = ref<LibraryItem | null>(null)

const selectedSkin = computed({
  get: () => props.modelValue || null,
  set: (val) => emit('update:modelValue', val),
})

function loadRecentSkins() {
  try {
    const recent = localStorage.getItem('recentSkins')
    if (recent) {
      skinList.value = JSON.parse(recent).slice(0, 10)
    }
  } catch {
    skinList.value = []
  }
}

function openModal() {
  modalVisible.value = true
  tempSelected.value = selectedSkin.value
  loadRecentSkins()
  if (skinList.value.length === 0) {
    searchSkins('')
  }
}

function closeModal() {
  modalVisible.value = false
  searchKeyword.value = ''
}

function selectSkin(skin: LibraryItem) {
  tempSelected.value = skin
}

function confirmSelection() {
  if (tempSelected.value) {
    selectedSkin.value = tempSelected.value
    emit('select', tempSelected.value)
    saveRecentSkin(tempSelected.value)
    closeModal()
  }
}

function handleSelectorKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openModal()
  }
}

function saveRecentSkin(skin: LibraryItem) {
  try {
    const recent = JSON.parse(localStorage.getItem('recentSkins') || '[]')
    const filtered = recent.filter((s: LibraryItem) => s.id !== skin.id)
    filtered.unshift(skin)
    localStorage.setItem('recentSkins', JSON.stringify(filtered.slice(0, 10)))
  } catch {
    // ignore
  }
}

let searchTimeout: ReturnType<typeof setTimeout>
function debouncedSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchSkins(searchKeyword.value), 300)
}

async function searchSkins(keyword: string) {
  loading.value = true
  try {
    const { searchSkinLibrary } = await import('@/features/skin/api')
    const result = await searchSkinLibrary(keyword)
    skinList.value = result.data?.items || []
  } catch (error) {
    console.error('Search failed:', error)
    skinList.value = []
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.skin-selector {
  width: 100%;
}

.selector-input {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid #555;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
  
  &:hover,
  &:focus-visible {
    border-color: var(--accent-color, #00d4ff);
    box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.12);
  }
}

.selected-skin {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.selected-badge {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  color: #000;
  background: var(--accent-color, #00d4ff);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
}

.skin-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  image-rendering: pixelated;
}

.skin-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.skin-name {
  color: var(--text-primary);
  font-weight: 500;
}

.skin-model {
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-transform: uppercase;
}

.selected-icon {
  color: var(--accent-color, #00d4ff);
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  padding: 0.5rem 0;
}

// 弹窗样式
.selector-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.selector-modal {
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  
  h3 {
    margin: 0;
    color: var(--text-primary);
  }
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  
  &:hover {
    color: var(--text-primary);
  }
}

.search-box {
  position: relative;
  padding: 1rem;
  border-bottom: 1px solid #444;
  
  .search-icon {
    position: absolute;
    left: 1.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
  }
  
  input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #555;
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.95rem;
    
    &:focus {
      outline: none;
      border-color: var(--accent-color, #00d4ff);
    }
    
    &::placeholder {
      color: var(--text-secondary);
    }
  }
}

.skin-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  max-height: 400px;
}

.skin-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
  border: 1px solid transparent;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-1px);
  }
  
  &.selected {
    background: rgba(0, 212, 255, 0.1);
    border-color: var(--accent-color, #00d4ff);
  }
}

.item-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  image-rendering: pixelated;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-name {
  color: var(--text-primary);
  font-size: 0.9rem;
}

.item-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  color: var(--text-secondary);
}

.check-icon {
  color: var(--accent-color, #00d4ff);
}

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--text-secondary);
  gap: 1rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent-color, #00d4ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-tip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 1rem 0.75rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
