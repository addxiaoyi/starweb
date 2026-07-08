<template>
  <div class="skin-admin-view">
    <header class="admin-header page-hero">
      <div>
        <h1 class="page-hero__title">{{ $t('admin.skin.title') || '皮肤库管理' }}</h1>
        <p class="admin-subtitle">管理上架、审核与展示效果，保持内容健康可用。</p>
      </div>
      <div class="header-actions">
        <div class="search-box">
          <input v-model="searchQuery" type="text" :placeholder="$t('admin.skin.search') || '搜索皮肤...'"
          @keyup.enter="handleSearch">
          <button type="button" @click="handleSearch">{{ $t('common.search') }}</button>
        </div>
        <button type="button" class="add-btn" @click="showAddModal = true">+ {{ $t('admin.skin.add') || '添加皮肤' }}</button>
      </div>
    </header>

    <section class="admin-summary">
      <div class="summary-card"><span>总皮肤数</span><strong>{{ stats.total }}</strong></div>
      <div class="summary-card"><span>已上架</span><strong>{{ stats.online }}</strong></div>
      <div class="summary-card"><span>待审核</span><strong>{{ stats.pending }}</strong></div>
      <div class="summary-card"><span>已下架</span><strong>{{ stats.offline }}</strong></div>
    </section>

    <div class="stats-grid starmc-list-group">
      <div class="starmc-list-item stat-card"><span class="starmc-badge is-info stat-value">{{ stats.total }}</span><span class="stat-label">{{ $t('admin.skin.total') || '总皮肤数' }}</span></div>
      <div class="starmc-list-item stat-card online"><span class="starmc-badge is-success stat-value">{{ stats.online }}</span><span class="stat-label">{{ $t('admin.skin.online') || '已上架' }}</span></div>
      <div class="starmc-list-item stat-card pending"><span class="starmc-badge is-warning stat-value">{{ stats.pending }}</span><span class="stat-label">{{ $t('admin.skin.pending') || '待审核' }}</span></div>
      <div class="starmc-list-item stat-card offline"><span class="starmc-badge is-error stat-value">{{ stats.offline }}</span><span class="stat-label">{{ $t('admin.skin.offline') || '已下架' }}</span></div>
    </div>

    <div class="filters starmc-list-group">
      <select v-model="filterStatus" class="starmc-list-item"><option value="">{{ $t('admin.skin.allStatus') || '所有状态' }}</option><option value="online">{{ $t('admin.skin.online') || '已上架' }}</option><option value="pending">{{ $t('admin.skin.pending') || '待审核' }}</option><option value="offline">{{ $t('admin.skin.offline') || '已下架' }}</option></select>
      <select v-model="filterModel" class="starmc-list-item"><option value="">{{ $t('admin.skin.allModels') || '所有模型' }}</option><option value="auto">Auto</option><option value="default">Default</option><option value="slim">Slim</option></select>
      <select v-model="sortBy" class="starmc-list-item"><option value="newest">{{ $t('admin.skin.newest') || '最新上传' }}</option><option value="oldest">{{ $t('admin.skin.oldest') || '最早上传' }}</option><option value="name">{{ $t('admin.skin.name') || '名称' }}</option><option value="downloads">{{ $t('admin.skin.downloads') || '下载量' }}</option></select>
    </div>

    <div class="skin-list starmc-list-group">
      <table>
        <thead>
          <tr>
            <th>{{ $t('admin.skin.preview') || '预览' }}</th><th>{{ $t('admin.skin.name') || '名称' }}</th><th>{{ $t('admin.skin.model') || '模型' }}</th><th>{{ $t('admin.skin.tags') || '标签' }}</th><th>{{ $t('admin.skin.status') || '状态' }}</th><th>{{ $t('admin.skin.stats') || '统计' }}</th><th>{{ $t('admin.skin.actions') || '操作' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="pagedSkins.length === 0"><td colspan="7" class="empty-cell">暂无匹配皮肤，试试更换筛选条件。</td></tr>
          <tr v-for="skin in pagedSkins" :key="skin.id">
            <td class="preview-cell"><img :src="skin.previewUrl || skin.skinUrl" :alt="skin.name" class="skin-preview"></td>
            <td><strong>{{ skin.name }}</strong><p class="skin-id">ID: {{ skin.id }}</p></td>
            <td><span class="model-badge" :class="skin.model">{{ skin.model }}</span></td>
            <td><div class="tag-list"><span v-for="tag in skin.tags" :key="tag" class="tag">{{ tag }}</span></div></td>
            <td><span class="status-badge" :class="skin.status">{{ getStatusLabel(skin.status) }}</span></td>
            <td><div class="stats"><span>⬇️ {{ skin.downloadCount || 0 }}</span><span>⭐ {{ skin.favoriteCount || 0 }}</span><span>👁️ {{ skin.viewCount || 0 }}</span></div></td>
            <td><div class="action-btns"><button type="button" class="edit-btn" :title="$t('admin.skin.edit') || '编辑'" @click="editSkin(skin)">✏️</button><button type="button" v-if="skin.status !== 'online'" class="online-btn" :title="$t('admin.skin.publish') || '上架'" @click="publishSkin(skin.id)">✅</button><button type="button" v-if="skin.status === 'online'" class="offline-btn" :title="$t('admin.skin.unpublish') || '下架'" @click="unpublishSkin(skin.id)">⏸️</button><button type="button" class="delete-btn" :title="$t('admin.skin.delete') || '删除'" @click="confirmDelete(skin)">🗑️</button></div></td>
          </tr>
        </tbody>
      </table>
      <div class="pagination"><button type="button" :disabled="currentPage <= 1" @click="currentPage--">←</button><span>{{ $t('admin.skin.page', { current: currentPage, total: totalPages }) }}</span><button type="button" :disabled="currentPage >= totalPages" @click="currentPage++">→</button></div>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showAddModal || editingSkin" class="modal-overlay" @click.self="closeModal">
          <div class="modal">
            <h2>{{ editingSkin ? ($t('admin.skin.edit') || '编辑皮肤') : ($t('admin.skin.add') || '添加皮肤') }}</h2>
            <form @submit.prevent="saveSkin">
              <div class="form-group"><label>{{ $t('admin.skin.name') || '名称' }} *</label><input v-model="form.name" type="text" required></div>
              <div class="form-group"><label>{{ $t('admin.skin.skinUrl') || '皮肤 URL' }} *</label><input v-model="form.skinUrl" type="url" required></div>
              <div class="form-group"><label>{{ $t('admin.skin.capeUrl') || '披风 URL' }}</label><input v-model="form.capeUrl" type="url"></div>
              <div class="form-group"><label>{{ $t('admin.skin.model') || '模型' }}</label><select v-model="form.model"><option value="auto">Auto</option><option value="default">Default</option><option value="slim">Slim</option></select></div>
              <div class="form-group"><label>{{ $t('admin.skin.tags') || '标签' }}</label><input v-model="form.tagsInput" type="text" :placeholder="$t('admin.skin.tagsPlaceholder') || '用逗号分隔标签'"></div>
              <div class="form-group"><label>{{ $t('admin.skin.status') || '状态' }}</label><select v-model="form.status"><option value="pending">{{ $t('admin.skin.pending') || '待审核' }}</option><option value="online">{{ $t('admin.skin.online') || '已上架' }}</option><option value="offline">{{ $t('admin.skin.offline') || '已下架' }}</option></select></div>
              <div class="form-actions"><button type="button" class="cancel-btn" @click="closeModal">{{ $t('common.cancel') }}</button><button type="submit" class="save-btn" :disabled="saving">{{ saving ? ($t('common.saving') || '保存中...') : ($t('common.save') || '保存') }}</button></div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="skinToDelete" class="modal-overlay" @click.self="skinToDelete = null">
          <div class="modal confirm-modal">
            <h3>{{ $t('admin.skin.confirmDelete') || '确认删除' }}</h3>
            <p>{{ $t('admin.skin.deleteWarning', { name: skinToDelete.name }) }}</p>
            <div class="form-actions"><button class="cancel-btn" @click="skinToDelete = null">{{ $t('common.cancel') }}</button><button class="delete-confirm-btn" @click="deleteSkin(skinToDelete.id)">{{ $t('admin.skin.delete') || '删除' }}</button></div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'

interface Skin {
  id: string
  name: string
  model: 'auto' | 'default' | 'slim'
  skinUrl: string
  capeUrl?: string
  previewUrl?: string
  tags: string[]
  status: 'online' | 'pending' | 'offline'
  downloadCount?: number
  favoriteCount?: number
  viewCount?: number
  createdAt?: string
  updatedAt?: string
}

const mockSkins: Skin[] = [
  { id: '1', name: '龙骑士皮肤', model: 'default', skinUrl: '/skins/dragon-knight.png', previewUrl: '/previews/dragon-knight.png', tags: ['pvp', 'medieval', 'hd'], status: 'online', downloadCount: 1250, favoriteCount: 89, viewCount: 3420 },
  { id: '2', name: '现代都市风格', model: 'slim', skinUrl: '/skins/modern-city.png', tags: ['modern', 'casual'], status: 'pending', downloadCount: 0, favoriteCount: 0, viewCount: 15 },
  { id: '3', name: '复古像素风', model: 'auto', skinUrl: '/skins/retro-pixel.png', previewUrl: '/previews/retro-pixel.png', tags: ['retro', 'pixel', '8bit'], status: 'offline', downloadCount: 567, favoriteCount: 45, viewCount: 1234 },
]

const skins = ref<Skin[]>(mockSkins)
const searchQuery = ref('')
const filterStatus = ref('')
const filterModel = ref('')
const sortBy = ref('newest')
const currentPage = ref(1)
const pageSize = 10

const showAddModal = ref(false)
const editingSkin = ref<Skin | null>(null)
const skinToDelete = ref<Skin | null>(null)
const saving = ref(false)

const form = reactive<{ name: string; skinUrl: string; capeUrl: string; model: Skin['model']; tagsInput: string; status: Skin['status'] }>({ name: '', skinUrl: '', capeUrl: '', model: 'auto', tagsInput: '', status: 'pending' })

const filteredSkins = computed(() => {
  let result = [...skins.value]
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(s => s.name.toLowerCase().includes(query) || s.tags.some(t => t.toLowerCase().includes(query)))
  }
  if (filterStatus.value) result = result.filter(s => s.status === filterStatus.value)
  if (filterModel.value) result = result.filter(s => s.model === filterModel.value)
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'newest': return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1
      case 'oldest': return (a.createdAt || '') > (b.createdAt || '') ? 1 : -1
      case 'name': return a.name.localeCompare(b.name)
      case 'downloads': return (b.downloadCount || 0) - (a.downloadCount || 0)
      default: return 0
    }
  })
  return result
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredSkins.value.length / pageSize)))
const pagedSkins = computed(() => filteredSkins.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const stats = computed(() => skins.value.reduce((acc, skin) => { acc.total++; acc[skin.status]++; return acc }, { total: 0, online: 0, pending: 0, offline: 0 }))

const handleSearch = () => { currentPage.value = 1 }
const getStatusLabel = (status: string) => ({ online: '已上架', pending: '待审核', offline: '已下架' }[status] || status)
const editSkin = (skin: Skin) => { editingSkin.value = skin; form.name = skin.name; form.skinUrl = skin.skinUrl; form.capeUrl = skin.capeUrl || ''; form.model = skin.model; form.tagsInput = skin.tags.join(', '); form.status = skin.status }
const closeModal = () => { showAddModal.value = false; editingSkin.value = null; form.name = ''; form.skinUrl = ''; form.capeUrl = ''; form.model = 'auto'; form.tagsInput = ''; form.status = 'pending' }

const saveSkin = async () => {
  saving.value = true
  const skinData: Skin = { id: editingSkin.value?.id || Date.now().toString(), name: form.name, skinUrl: form.skinUrl, capeUrl: form.capeUrl || undefined, model: form.model, tags: form.tagsInput.split(',').map(t => t.trim()).filter(Boolean), status: form.status, downloadCount: editingSkin.value?.downloadCount || 0, favoriteCount: editingSkin.value?.favoriteCount || 0, viewCount: editingSkin.value?.viewCount || 0 }
  if (editingSkin.value) {
    const index = skins.value.findIndex(s => s.id === editingSkin.value!.id)
    if (index !== -1) skins.value[index] = skinData
  } else { skins.value.unshift(skinData) }
  await new Promise(r => setTimeout(r, 350))
  saving.value = false
  closeModal()
}
const publishSkin = (id: string) => { const skin = skins.value.find(s => s.id === id); if (skin) skin.status = 'online' }
const unpublishSkin = (id: string) => { const skin = skins.value.find(s => s.id === id); if (skin) skin.status = 'offline' }
const confirmDelete = (skin: Skin) => { skinToDelete.value = skin }
const deleteSkin = (id: string) => { skins.value = skins.value.filter(s => s.id !== id); skinToDelete.value = null }
</script>

<style scoped>
.skin-admin-view { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
.admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
.admin-header h1 { margin: 0; font-size: 1.5rem; color: var(--text-primary, #fff); }
.admin-subtitle { margin: 0.35rem 0 0; color: var(--text-secondary, #9ca3af); }
.header-actions, .search-box, .filters, .action-btns, .form-actions { display: flex; gap: 0.75rem; align-items: center; }
.search-box input, .filters select, .form-group input, .form-group select { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary, #fff); padding: 0.5rem 0.75rem; border-radius: 6px; }
.search-box button, .add-btn, .save-btn { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.add-btn { background: linear-gradient(135deg, #22c55e, #16a34a); }
.admin-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 1rem; }
.summary-card { border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; background: rgba(255,255,255,0.03); }
.summary-card span { display:block; font-size:12px; color: var(--text-secondary, #9ca3af); margin-bottom: 4px; }
.summary-card strong { font-size: 20px; color: var(--text-primary, #fff); }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 1.25rem; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
.stat-card.online { border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.05); }
.stat-card.pending { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.05); }
.stat-card.offline { border-color: rgba(156,163,175,0.3); background: rgba(156,163,175,0.05); }
.stat-value { display:block; font-size:1.75rem; font-weight:600; color: var(--text-primary, #fff); }
.stat-label { display:block; font-size:0.8125rem; color: var(--text-secondary, #9ca3af); margin-top:0.25rem; }
.filters { margin-bottom: 1rem; flex-wrap: wrap; }
.skin-list { background: rgba(255,255,255,0.02); border-radius: 8px; overflow: hidden; }
.skin-list table { width: 100%; border-collapse: collapse; }
.skin-list th, .skin-list td { padding: 0.875rem 1rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
.skin-list th { background: rgba(255,255,255,0.03); font-weight:500; font-size:0.8125rem; color: var(--text-secondary, #9ca3af); text-transform: uppercase; letter-spacing:0.025em; }
.empty-cell { text-align:center; color: var(--text-secondary, #9ca3af); padding: 2rem 1rem; }
.preview-cell { width: 60px; }
.skin-preview { width:48px; height:48px; border-radius:6px; object-fit:cover; background: rgba(0,0,0,0.3); }
.skin-id { margin: 0.25rem 0 0; font-size:0.75rem; color: var(--text-secondary, #9ca3af); }
.model-badge, .status-badge { display:inline-block; padding:0.25rem 0.625rem; border-radius:4px; font-size:0.75rem; font-weight:500; }
.model-badge { background: rgba(59,130,246,0.2); color: #3b82f6; }
.model-badge.slim { background: rgba(168,85,247,0.2); color: #a855f7; }
.tag-list { display:flex; flex-wrap:wrap; gap:0.375rem; }
.tag { display:inline-block; padding:0.125rem 0.5rem; background: rgba(255,255,255,0.08); border-radius:4px; font-size:0.75rem; color: var(--text-secondary, #9ca3af); }
.status-badge.online { background: rgba(34,197,94,0.2); color:#22c55e; }
.status-badge.pending { background: rgba(245,158,11,0.2); color:#f59e0b; }
.status-badge.offline { background: rgba(156,163,175,0.2); color:#9ca3af; }
.stats { display:flex; flex-direction:column; gap:0.25rem; font-size:0.8125rem; color: var(--text-secondary, #9ca3af); }
.action-btns button, .pagination button, .cancel-btn, .delete-confirm-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary, #9ca3af); padding: 0.375rem 0.75rem; border-radius: 4px; cursor: pointer; }
.pagination { display:flex; justify-content:center; align-items:center; gap:1rem; padding:1rem; border-top:1px solid rgba(255,255,255,0.05); }
.pagination button:disabled { opacity:0.4; cursor:not-allowed; }
.modal-overlay { position:fixed; inset:0; background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1rem; }
.modal { background: var(--surface-1, #1e1e23); border-radius:12px; width:100%; max-width:500px; max-height:90vh; overflow-y:auto; padding:1.5rem; }
.form-group { margin-bottom:1rem; }
.form-group label { display:block; margin-bottom:0.375rem; font-size:0.875rem; color: var(--text-secondary, #9ca3af); }
.form-group input, .form-group select { width:100%; }
.form-actions { margin-top:1.5rem; }
.save-btn:disabled { opacity:0.6; cursor:not-allowed; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .admin-header { flex-direction: column; align-items: flex-start; } .header-actions { width:100%; flex-direction: column; align-items: stretch; } .search-box { width:100%; } .search-box input { flex:1; } .skin-list { overflow-x:auto; } .skin-list table { min-width: 800px; } }
</style>