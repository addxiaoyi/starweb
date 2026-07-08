<template>
  <div class="page-shell submission-view">

    <!-- ========== 页面 Header ========== -->
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">投稿中心</h1>
        <span class="meta-pill">{{ state.total }} 条投稿记录</span>
      </div>
      <div class="header-actions">
        <button type="button" class="ui-btn secondary small" @click="loadList(state.page)" :disabled="state.loading">
          <AppIcon name="refresh" :spin="state.loading" />
          刷新
        </button>
        <button type="button" class="ui-btn secondary small" @click="clearStatusFilter()" :disabled="!state.statusFilter">
          <AppIcon name="close" />
          清空筛选
        </button>
      </div>
    </header>

    <!-- ========== 标签页切换 ========== -->
    <nav class="tab-nav glass-panel" role="tablist">
      <button type="button" class="filter-chip" :class="{ active: state.statusFilter === '' }" @click="clearStatusFilter()">全部</button>
      <button type="button" class="filter-chip" :class="{ active: state.statusFilter === 'pending' }" @click="setStatusFilter('pending')">审核中</button>
      <button type="button" class="filter-chip" :class="{ active: state.statusFilter === 'approved' }" @click="setStatusFilter('approved')">已通过</button>
      <button type="button" class="filter-chip" :class="{ active: state.statusFilter === 'rejected' }" @click="setStatusFilter('rejected')">已拒绝</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'submit' }"
        role="tab"
        :aria-selected="activeTab === 'submit'"
        @click="activeTab = 'submit'"
      >
        <AppIcon name="upload" />
        我要投稿
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'list' }"
        role="tab"
        :aria-selected="activeTab === 'list'"
        @click="activeTab = 'list'"
      >
        <AppIcon name="clipboardList" />
        我的投稿
      </button>
    </nav>

    <!-- ========== Tab: 投稿表单 ========== -->
    <section v-if="activeTab === 'submit'" class="tab-panel glass-panel">
      <h2 class="panel-title">提交新皮肤</h2>
      <p class="panel-hint">上传你的 Minecraft 皮肤和披风，分享给服务器玩家。投稿经过审核后会在皮肤站展示。</p>

      <div class="batch-upload-card">
        <h3 class="subsection-title">ZIP 批量预览</h3>
        <p class="subsection-hint">可选：拖拽 ZIP 包快速预览其中的皮肤文件。</p>
        <BatchUploadZone @upload="handleBatchUpload" />
      </div>


      <form class="submit-form" @submit.prevent="onSubmit">
        <!-- 名称 -->
        <div class="form-group">
          <label class="form-label" for="skin-name">
            皮肤名称 <span class="required">*</span>
          </label>
          <input
            id="skin-name"
            v-model="form.name"
            type="text"
            class="ui-input"
            placeholder="给你的皮肤起个名字，例如：龙鳞战士、末影骑士"
            maxlength="50"
            required
          />
          <span class="form-hint">{{ form.name.length }}/50</span>
        </div>

        <!-- 简介 -->
        <div class="form-group">
          <label class="form-label" for="skin-desc">简介描述</label>
          <textarea
            id="skin-desc"
            v-model="form.description"
            class="ui-input"
            placeholder="介绍一下这个皮肤的设计灵感、适用场景等..."
            rows="3"
            maxlength="300"
          />
          <span class="form-hint">{{ form.description.length }}/300</span>
        </div>

        <!-- 标签 -->
        <div class="form-group">
          <label class="form-label" for="skin-tags">
            标签 <span class="label-hint">逗号分隔，最多 5 个</span>
          </label>
          <input
            id="skin-tags"
            v-model="form.tagsInput"
            type="text"
            class="ui-input"
            placeholder="pvp, medieval, fantasy, hd"
          />
        </div>

        <!-- 模型类型 -->
        <div class="form-group">
          <label class="form-label">模型类型</label>
          <div class="model-selector">
            <label v-for="m in MODEL_OPTIONS" :key="m.value" class="model-option">
              <input
                type="radio"
                name="model"
                :value="m.value"
                v-model="form.model"
              />
              <span class="model-box" :class="`model-${m.value}`">
                <AppIcon name="shirt" :size="20" />
                <span class="model-label">{{ m.label }}</span>
                <span class="model-desc">{{ m.desc }}</span>
              </span>
            </label>
          </div>
        </div>

        <!-- 皮肤文件上传 -->
        <div class="form-group">
          <label class="form-label">
            皮肤文件 <span class="required">*</span>
            <span class="label-hint">PNG/WebP，64×32、64×64、128×64、128×128，最大 2MB</span>
          </label>
          <div
            class="drop-zone"
            :class="{ 'has-file': form.skinFile, 'drag-over': skinDragOver }"
            @dragover="onDragOver"
            @dragleave="skinDragOver = false"
            @drop="onSkinDrop"
            @click="triggerSkinInput"
            role="button"
            tabindex="0"
            @keydown.enter="triggerSkinInput"
            @keydown.space.prevent="triggerSkinInput"
            :aria-label="form.skinFile ? `已选择: ${form.skinFile.name}` : '点击或拖拽上传皮肤文件'"
          >
            <input
              ref="skinInputRef"
              type="file"
              accept="image/png,image/webp"
              class="file-input-hidden"
              @change="onSkinInputChange"
            />

            <template v-if="form.skinFile">
              <div class="file-preview">
                <img
                  v-if="form.skinFile.previewUrl"
                  :src="form.skinFile.previewUrl"
                  alt="皮肤预览"
                  class="preview-img"
                />
                <div class="file-info">
                  <AppIcon name="checkCircle" class="icon-success" />
                  <span class="file-name">{{ form.skinFile.name }}</span>
                  <span class="file-size">{{ formatFileSize(form.skinFile.size) }}</span>
                  <button
                    type="button"
                    class="ui-btn ghost small remove-btn"
                    @click.stop="clearSkinFile"
                  >
                    <AppIcon name="close" /> 移除
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="drop-placeholder">
                <AppIcon name="cloudUpload" :size="32" class="upload-icon" />
                <p class="drop-title">点击上传或拖拽到此处</p>
                <p class="drop-hint">支持 PNG / WebP 格式</p>
              </div>
            </template>
          </div>
        </div>

        <!-- 披风文件上传 -->
        <div class="form-group">
          <label class="form-label">
            披风文件
            <span class="label-hint">可选，PNG/WebP，固定 22×17 像素，最大 2MB</span>
          </label>
          <div
            class="drop-zone cape-zone"
            :class="{ 'has-file': form.capeFile, 'drag-over': capeDragOver }"
            @dragover="onDragOver"
            @dragleave="capeDragOver = false"
            @drop="onCapeDrop"
            @click="triggerCapeInput"
            role="button"
            tabindex="0"
            @keydown.enter="triggerCapeInput"
            @keydown.space.prevent="triggerCapeInput"
            :aria-label="form.capeFile ? `已选择: ${form.capeFile.name}` : '点击或拖拽上传披风文件'"
          >
            <input
              ref="capeInputRef"
              type="file"
              accept="image/png,image/webp"
              class="file-input-hidden"
              @change="onCapeInputChange"
            />

            <template v-if="form.capeFile">
              <div class="file-preview cape-preview">
                <img
                  v-if="form.capeFile.previewUrl"
                  :src="form.capeFile.previewUrl"
                  alt="披风预览"
                  class="cape-img"
                />
                <div class="file-info">
                  <AppIcon name="checkCircle" class="icon-success" />
                  <span class="file-name">{{ form.capeFile.name }}</span>
                  <span class="file-size">{{ formatFileSize(form.capeFile.size) }}</span>
                  <button
                    type="button"
                    class="ui-btn ghost small remove-btn"
                    @click.stop="clearCapeFile"
                  >
                    <AppIcon name="close" /> 移除
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="drop-placeholder">
                <AppIcon name="cloudUpload" :size="24" class="upload-icon" />
                <p class="drop-title">点击上传披风（可选）</p>
                <p class="drop-hint">标准 22×17 像素</p>
              </div>
            </template>
          </div>
        </div>

        <!-- 提交按钮 -->
        <div class="form-actions">
          <button type="button" class="ui-btn ghost" @click="resetForm">
            重置
          </button>
          <button
            type="submit"
            class="ui-btn primary"
            :disabled="!canSubmit"
          >
            <AppIcon v-if="state.submitting" name="spinner" :spin="true" />
            <AppIcon v-else name="upload" />
            {{ state.submitting ? '提交中...' : '立即投稿' }}
          </button>
        </div>
      </form>
    </section>

    <!-- ========== Tab: 投稿列表 ========== -->
    <section v-if="activeTab === 'list'" class="tab-panel glass-panel">

      <!-- 列表 Header -->
      <div class="list-header">
        <span class="list-hint">当前筛选：{{ state.statusFilter || '全部' }}</span>
      </div>

      <!-- 骨架屏 -->
      <AppStatePanel
        v-if="state.loading"
        variant="loading"
        eyebrow="Submissions"
        title="正在加载投稿记录..."
        message="我们正在同步你的投稿列表，请稍候。"
        class="submission-state-panel"
      />

      <AppStatePanel
        v-else-if="filteredItems.length === 0"
        variant="empty"
        eyebrow="Submissions"
        title="你还没有投稿记录"
        message="切换到「我要投稿」标签，上传你的第一个皮肤吧。"
        hint="投稿经过审核后会在皮肤站展示。"
        class="submission-state-panel"
      >
        <template #icon>
          <AppIcon name="clipboardList" :size="48" class="empty-icon" />
        </template>
      </AppStatePanel>

      <!-- 投稿卡片列表 -->
      <div v-else class="submission-list">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="submission-card"
        >
          <!-- 预览 -->
          <div class="card-preview">
            <img
              v-if="item.previewUrl"
              :src="item.previewUrl"
              :alt="item.name"
              class="preview-img"
              loading="lazy"
            />
            <div v-else class="preview-placeholder">
              <AppIcon name="shirt" />
            </div>
          </div>

          <!-- 内容 -->
          <div class="card-body">
            <div class="card-title-row">
              <h3 class="card-title">{{ item.name }}</h3>
              <span class="status-badge" :class="`status-${item.status}`">
                <AppIcon :name="statusIcon(item.status)" :size="12" />
                {{ statusLabel(item.status) }}
              </span>
            </div>

            <p v-if="item.description" class="card-desc">{{ item.description }}</p>

            <div class="card-meta">
              <span class="meta-item">
                <AppIcon name="clockRotate" :size="12" />
                {{ formatDate(item.submittedAt) }}
              </span>
              <span class="model-chip" :class="`model-${item.model}`">{{ item.model }}</span>
              <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="tag-chip">{{ tag }}</span>
            </div>

            <!-- 拒绝原因 -->
            <div v-if="item.status === 'rejected' && item.reviewerNote" class="reject-note">
              <AppIcon name="warning" :size="12" />
              {{ item.reviewerNote }}
            </div>
          </div>

      <!-- 操作 -->
      <div class="card-actions">
        <button
          v-if="item.status === 'pending'"
          class="ui-btn ghost small"
          :disabled="state.deleting"
          @click="handleDelete(item.id)"
        >
          <AppIcon name="skull" />
          取消投稿
        </button>
        <button
          v-if="item.status === 'rejected'"
          class="ui-btn secondary small"
          :disabled="state.submitting"
          @click="handleResubmit(item.id)"
        >
          <AppIcon name="refresh" />
          重新提交
        </button>
        <button
          v-if="item.status === 'approved'"
          class="ui-btn secondary small"
        >
          <AppIcon name="eye" />
          查看
        </button>
      </div>
        </article>
      </div>

      <!-- 分页 -->
      <footer v-if="totalPages > 1" class="pagination">
        <span class="page-info">
          第 {{ state.page }} / {{ totalPages }} 页，共 {{ state.total }} 条
        </span>
        <div class="page-controls">
          <button
            class="ui-btn secondary small"
            :disabled="state.page <= 1"
            @click="goToPage(state.page - 1)"
          >
            <AppIcon name="arrowLeft" /> 上一页
          </button>
          <button
            v-for="p in visiblePages"
            :key="p"
            class="ui-btn small"
            :class="{ primary: p === state.page, ghost: p !== state.page }"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>
          <button
            class="ui-btn secondary small"
            :disabled="state.page >= totalPages"
            @click="goToPage(state.page + 1)"
          >
            下一页 <AppIcon name="arrowRight" />
          </button>
        </div>
      </footer>
    </section>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      :visible="deleteModal.visible"
      title="取消投稿"
      message="确定要取消这个投稿吗？取消后无法恢复。"
      confirm-text="取消投稿"
      cancel-text="保留"
      variant="danger"
      :loading="state.deleting"
      @confirm="confirmDelete"
      @cancel="closeDeleteModal"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue';
import { useSubmission } from '@/features/skin/useSubmission';
import type { SubmissionModel, SubmissionStatus } from '@/types/skin-submission';
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue';
import BatchUploadZone from '@/components/molecules/Skin/BatchUploadZone.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import { useToastStore } from '@/stores/toast';

const toast = useToastStore();
const {
  state,
  form,
  totalPages,
  filteredItems,
  canSubmit,
  selectSkinFile,
  selectCapeFile,
  clearSkinFile,
  clearCapeFile,
  onDragOver,
  onSkinDrop,
  onCapeDrop,
  resetForm,
  submitForm,
  loadList,
  goToPage,
  setStatusFilter,
  clearStatusFilter,
  deleteItem,
  resubmitItem,
} = useSubmission();

const deleteModal = reactive({ visible: false, id: '' });
function openDeleteModal(id: string) { deleteModal.id = id; deleteModal.visible = true; }
function closeDeleteModal() { deleteModal.visible = false; deleteModal.id = ''; }
async function confirmDelete() {
  if (!deleteModal.id) return;
  await deleteItem(deleteModal.id);
  closeDeleteModal();
}
function handleDelete(id: string) { openDeleteModal(id); }

async function handleResubmit(id: string) {
  const note = window.prompt('可选：填写重审说明（最多 200 字）', '') ?? '';
  await resubmitItem(id, note.trim());
}

// ============ 标签页 ============
const activeTab = ref<'submit' | 'list'>('submit');

// ============ 模型选项 ============
const MODEL_OPTIONS: Array<{ value: SubmissionModel; label: string; desc: string }> = [
  { value: 'default', label: 'Default', desc: '标准体型' },
  { value: 'slim', label: 'Slim', desc: '纤细体型' },
  { value: 'auto', label: 'Auto', desc: '自动检测' },
];

// ============ 拖拽状态 ============
const skinDragOver = ref(false);
const capeDragOver = ref(false);

// ============ 文件 input ref ============
const skinInputRef = ref<HTMLInputElement | null>(null);
const capeInputRef = ref<HTMLInputElement | null>(null);

function triggerSkinInput() {
  skinInputRef.value?.click();
}

function triggerCapeInput() {
  capeInputRef.value?.click();
}

async function onSkinInputChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    await selectSkinFile(file);
    // reset input so同一文件可再次选择
    if (skinInputRef.value) skinInputRef.value.value = '';
  }
}

async function onCapeInputChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    await selectCapeFile(file);
    if (capeInputRef.value) capeInputRef.value.value = '';
  }
}

// ============ 表单提交 ============
async function onSubmit() {
  await submitForm();
}

function handleBatchUpload(files: Array<{ name: string }>) {
  if (files.length === 0) return;
  toast.addToast({ type: 'info', message: `已预览 ${files.length} 个批量皮肤文件` });
}

// ============ 分页页码 ============
const visiblePages = computed(() => {
  const total = totalPages.value;
  const current = state.page;
  const range: number[] = [];

  let start = Math.max(1, current - 2);
  let end = Math.min(total, current + 2);

  if (end - start < 4) {
    if (start === 1) end = Math.min(total, start + 4);
    if (end === total) start = Math.max(1, end - 4);
  }

  for (let i = start; i <= end; i++) range.push(i);
  return range;
});

// ============ 辅助函数 ============
function statusLabel(status: SubmissionStatus): string {
  const map: Record<SubmissionStatus, string> = {
    pending: '审核中',
    approved: '已通过',
    rejected: '已拒绝',
  };
  return map[status] ?? status;
}

function statusIcon(status: SubmissionStatus): 'clockRotate' | 'checkCircle' | 'warning' {
  const map: Record<SubmissionStatus, 'clockRotate' | 'checkCircle' | 'warning'> = {
    pending: 'clockRotate',
    approved: 'checkCircle',
    rejected: 'warning',
  };
  return map[status];
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Watch tab switch — reload list when entering list tab
watch(activeTab, (tab) => {
  if (tab === 'list') {
    loadList(1);
  }
});
</script>

<style scoped>
/* ========== 布局 ========== */
.submission-view {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ========== Header ========== */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

/* ========== 标签页 ========== */
.tab-nav {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: var(--radius-2);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: none;
  border: none;
  border-radius: var(--radius-1);
  color: var(--text-secondary);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  background: var(--surface-1);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--brand-primary);
  color: #fff;
}

/* ========== 面板 ========== */
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.panel-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.panel-hint {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: -0.75rem 0 0;
  line-height: 1.6;
}

/* ========== 表单 ========== */
.batch-upload-card {
  padding: 1rem 1rem 0.5rem;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-2);
  background: var(--surface-0);
}

.subsection-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.subsection-hint {
  margin: 0.35rem 0 0.75rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.submit-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.required {
  color: #ef4444;
}

.label-hint {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: right;
  margin-top: -0.125rem;
}

textarea.ui-input {
  resize: vertical;
  min-height: 80px;
}

/* 模型选择 */
.model-selector {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.model-option {
  cursor: pointer;
}

.model-option input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.model-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-2);
  cursor: pointer;
  transition: all 0.15s;
  min-width: 80px;
}

.model-option input:checked + .model-box {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
}

.model-option input:focus-visible + .model-box {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}

.model-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.model-desc {
  font-size: 0.7rem;
  color: var(--text-muted);
}

/* ========== 拖拽上传区 ========== */
.drop-zone {
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-2);
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 4%, transparent);
}

.drop-zone:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}

.drop-zone.drag-over {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  transform: scale(1.01);
}

.drop-zone.has-file {
  border-style: solid;
  padding: 1rem;
}

.cape-zone {
  min-height: 90px;
}

.file-input-hidden {
  display: none;
}

.drop-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
}

.upload-icon {
  color: var(--text-muted);
}

.drop-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.drop-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

/* 文件预览 */
.file-preview {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.preview-img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  image-rendering: pixelated;
  flex-shrink: 0;
}

.cape-preview .cape-img {
  width: 44px;
  height: 34px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  flex-wrap: wrap;
}

.icon-success {
  color: #22c55e;
  flex-shrink: 0;
}

.file-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.file-size {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.remove-btn {
  margin-left: auto;
}

/* ========== 表单操作 ========== */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-subtle);
}

/* ========== 列表 ========== */
.list-header {
  display: flex;
  justify-content: flex-end;
}

.submission-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.submission-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  transition: all 0.15s;
}

.submission-card:hover {
  border-color: var(--border-default);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.submission-card.operating {
  opacity: 0.5;
  pointer-events: none;
}

/* 卡片预览 */
.card-preview {
  flex-shrink: 0;
}

.preview-img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  image-rendering: pixelated;
}

.preview-placeholder {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  color: var(--text-muted);
}

/* 卡片内容 */
.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.status-pending {
  background: color-mix(in srgb, #f59e0b 15%, transparent);
  color: #f59e0b;
}

.status-approved {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #22c55e;
}

.status-rejected {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}

.card-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.model-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-1);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.model-default { background: color-mix(in srgb, var(--brand-primary) 15%, transparent); color: var(--brand-primary); }
.model-slim { background: color-mix(in srgb, #8b5cf6 15%, transparent); color: #8b5cf6; }
.model-auto { background: color-mix(in srgb, #10b981 15%, transparent); color: #10b981; }

.tag-chip {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.reject-note {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  margin-top: 0.25rem;
  padding: 0.375rem 0.625rem;
  background: color-mix(in srgb, #ef4444 8%, transparent);
  border: 1px solid color-mix(in srgb, #ef4444 20%, transparent);
  border-radius: var(--radius-1);
  font-size: 0.8rem;
  color: #ef4444;
  line-height: 1.4;
}

/* 卡片操作 */
.card-actions {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  justify-content: flex-start;
  flex-shrink: 0;
}

/* ========== 骨架屏 ========== */
.submission-state-panel {
  margin-bottom: 0;
}

.empty-icon {
  opacity: 0.3;
}

/* ========== 分页 ========== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.page-info { font-size: 0.875rem; color: var(--text-muted); }
.page-controls { display: flex; gap: 0.375rem; flex-wrap: wrap; }

/* ========== 响应式 ========== */
@media (max-width: 640px) {
  .submission-view { padding: 1rem; }
  .submission-card { flex-wrap: wrap; }
  .card-actions { flex-direction: row; width: 100%; }
  .model-selector { flex-direction: column; }
  .model-box { flex-direction: row; justify-content: flex-start; width: 100%; }
}
</style>
