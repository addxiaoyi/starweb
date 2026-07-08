/**
 * 审核中心视图
 * 全量管理所有投稿：列表浏览、详情预览、审核操作（通过/驳回）
 * 权限：requiresReviewer
 */

<template>
  <div class="page-shell review-center-view">

    <!-- ========== 页面 Header ========== -->
    <header class="admin-header page-hero">
      <div class="header-left">
        <h1 class="page-title page-hero__title">投稿审核</h1>
        <span class="starmc-badge is-info">{{ state.total }} 条记录</span>
        <span v-if="pendingCount > 0" class="starmc-badge is-warning">{{ pendingCount }} 待审</span>
      </div>
      <div class="header-right">
        <button class="ui-btn secondary" @click="onRefreshClick" :disabled="state.loading">
          <AppIcon name="refresh" :spin="state.loading" />
          刷新
        </button>
        <button class="ui-btn secondary" @click="clearFilters" :disabled="state.loading && !filteredList.length">
          <AppIcon name="close" />
          清空筛选
        </button>
      </div>
    </header>

    <section v-if="state.successMessage" class="review-success-banner" role="status" aria-live="polite">
      <AppIcon name="checkCircle" />
      <span>{{ state.successMessage }}</span>
    </section>

    <!-- ========== 筛选栏 ========== -->
    <section class="filter-bar glass-panel">
      <div class="filter-group">
        <label class="filter-label">状态</label>
        <select v-model="filterStatus" class="ui-input filter-select" @change="onFilterChange">
          <option value="">全部</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">排序</label>
        <select v-model="filterSort" class="ui-input filter-select">
          <option value="newest">最新投稿</option>
          <option value="oldest">最早投稿</option>
        </select>
      </div>
      <div class="filter-group filter-keyword">
        <label class="filter-label">搜索</label>
        <div class="search-wrap">
          <AppIcon name="network" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="ui-input search-input"
            placeholder="标题 / 投稿人..."
            @keyup.enter="onFilterChange"
          />
          <button v-if="keyword" class="clear-btn" @click="keyword = ''; onFilterChange()">
            <AppIcon name="close" />
          </button>
        </div>
      </div>
    </section>

    <!-- ========== 主内容区 ========== -->
    <section class="security-quick-stats">
      <div class="quick-stat">
        <span class="quick-stat__label">总记录</span>
        <strong class="quick-stat__value">{{ state.total }}</strong>
      </div>
      <div class="quick-stat">
        <span class="quick-stat__label">待审</span>
        <strong class="quick-stat__value">{{ pendingCount }}</strong>
      </div>
      <div class="quick-stat">
        <span class="quick-stat__label">当前选中</span>
        <strong class="quick-stat__value">{{ selectedRecord?.id ?? '—' }}</strong>
      </div>
    </section>

    <div class="review-layout">

      <!-- 左：记录列表 -->
      <section class="review-list-panel glass-panel" aria-label="投稿列表">
        <AppStatePanel
          v-if="state.loading"
          variant="loading"
          eyebrow="Review Center"
          title="正在加载投稿记录..."
          message="我们正在同步待审、已通过与已驳回的投稿列表。"
          class="review-state-panel"
        />

        <AppStatePanel
          v-else-if="state.error"
          variant="error"
          eyebrow="Review Center"
          title="加载投稿列表失败"
          :message="state.error"
          hint="你可以稍后重试，或检查网络与后端服务状态。"
          class="review-state-panel"
        >
          <template #actions>
            <button class="ui-btn secondary" @click="onRefreshClick">重试</button>
          </template>
        </AppStatePanel>

        <AppStatePanel
          v-else-if="filteredList.length === 0"
          variant="empty"
          eyebrow="Review Center"
          title="暂无符合条件的记录"
          message="当前筛选条件下没有可展示的投稿。"
          hint="可以调整状态、排序或关键词筛选。"
          class="review-state-panel"
        >
          <template #icon>
            <AppIcon name="external" class="empty-icon" />
          </template>
          <template #actions>
            <button class="ui-btn secondary" @click="clearFilters">清空筛选</button>
          </template>
        </AppStatePanel>

        <!-- 列表 -->
        <ul v-else class="starmc-list-group record-list" role="listbox" aria-label="投稿记录列表">
          <li
            v-for="item in filteredList"
            :key="item.id"
            class="starmc-list-item record-item"
            :class="{
              'is-selected': selectedRecord?.id === item.id,
              [`status-${item.status}`]: true,
            }"
            role="option"
            :aria-selected="selectedRecord?.id === item.id"
            tabindex="0"
            @click="selectRecord(item)"
            @keydown.enter="selectRecord(item)"
            @keydown.space.prevent="selectRecord(item)"
          >
            <!-- 缩略图 -->
            <div class="record-thumb-wrap">
              <img
                v-if="item.skinFile.url"
                :src="item.skinFile.url"
                :alt="item.title"
                class="record-thumb"
                loading="lazy"
              />
              <div v-else class="record-thumb record-thumb--placeholder">
                <AppIcon name="userCircle" class="thumb-icon" />
              </div>
              <!-- 状态徽章 -->
              <span class="starmc-badge record-badge" :class="`badge-${item.status}`">
                {{ STATUS_LABEL[item.status] }}
              </span>
            </div>

            <!-- 信息 -->
            <div class="record-info">
              <p class="record-title">{{ item.title || `投稿 #${item.id}` }}</p>
              <p class="record-meta">
                <span>{{ item.authorName }}</span>
                <span class="meta-sep">·</span>
                <span>{{ formatDate(item.submittedAt) }}</span>
              </p>
              <p v-if="item.tags?.length" class="record-tags">
                <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="starmc-badge tag-chip">
                  {{ tag }}
                </span>
              </p>
              <!-- 驳回原因预览 -->
              <p v-if="item.status === 'rejected' && item.reviewNote" class="reject-preview">
                <AppIcon name="warning" class="reject-icon" />
                {{ item.reviewNote }}
              </p>
            </div>
          </li>
        </ul>

        <!-- 分页 -->
        <nav v-if="totalPages > 1" class="pagination" aria-label="列表分页">
          <button
            class="page-btn"
            :disabled="state.page <= 1"
            @click="goPage(state.page - 1)"
          >
            <AppIcon name="arrowLeft" />
          </button>
          <span class="page-info">{{ state.page }} / {{ totalPages }}</span>
          <button
            class="page-btn"
            :disabled="state.page >= totalPages"
            @click="goPage(state.page + 1)"
          >
            <AppIcon name="chevronRight" />
          </button>
        </nav>
      </section>

      <!-- 右：详情 + 审核面板 -->
      <aside class="review-detail-panel glass-panel" aria-label="审核操作面板">
        <!-- 无选中 -->
        <div v-if="!selectedRecord" class="detail-empty">
          <AppIcon name="external" class="empty-icon" />
          <p>选择一个投稿以查看详情</p>
        </div>

        <!-- 详情 -->
        <div v-else class="detail-content">
          <div class="detail-header starmc-list-item">
            <div class="starmc-list-item__main">
              <h2 class="detail-title">{{ selectedRecord.title || `投稿 #${selectedRecord.id}` }}</h2>
            </div>
            <button class="clear-btn detail-close" @click="clearSelection" title="关闭">
              <AppIcon name="close" />
            </button>
          </div>

          <!-- 皮肤预览 -->
          <div class="skin-preview-wrap">
            <img
              v-if="selectedRecord.skinFile.url"
              :src="selectedRecord.skinFile.url"
              :alt="selectedRecord.title"
              class="detail-skin-img"
            />
            <div v-else class="detail-skin-placeholder">
              <AppIcon name="userCircle" class="ph-icon" />
            </div>
          </div>

          <!-- 元信息 -->
          <dl class="detail-meta starmc-list-group">
            <div class="starmc-list-item meta-row">
              <dt>投稿人</dt>
              <dd>{{ selectedRecord.authorName }}</dd>
            </div>
            <div class="starmc-list-item meta-row">
              <dt>提交时间</dt>
              <dd>{{ formatDateTime(selectedRecord.submittedAt) }}</dd>
            </div>
            <div v-if="selectedRecord.tags?.length" class="starmc-list-item meta-row">
              <dt>标签</dt>
              <dd class="tags-wrap">
                <span v-for="tag in selectedRecord.tags" :key="tag" class="starmc-badge tag-chip">{{ tag }}</span>
              </dd>
            </div>
            <div v-if="selectedRecord.description" class="starmc-list-item meta-row">
              <dt>描述</dt>
              <dd class="desc-text">{{ selectedRecord.description }}</dd>
            </div>

            <!-- 披风 -->
            <div v-if="selectedRecord.capeFile?.url" class="starmc-list-item meta-row">
              <dt>披风</dt>
              <dd>
                <img :src="selectedRecord.capeFile.url" class="cape-thumb" alt="披风" />
              </dd>
            </div>

            <!-- 审核信息（已审核的记录） -->
            <template v-if="selectedRecord.status !== 'pending'">
              <div class="starmc-list-item meta-row">
                <dt>审核人</dt>
                <dd>{{ selectedRecord.reviewerName ?? '—' }}</dd>
              </div>
              <div class="starmc-list-item meta-row">
                <dt>审核时间</dt>
                <dd>{{ selectedRecord.reviewedAt ? formatDateTime(selectedRecord.reviewedAt) : '—' }}</dd>
              </div>
              <div v-if="selectedRecord.reviewNote" class="starmc-list-item meta-row">
                <dt>{{ selectedRecord.status === 'rejected' ? '驳回原因' : '备注' }}</dt>
                <dd class="desc-text">{{ selectedRecord.reviewNote }}</dd>
              </div>
            </template>
          </dl>

          <section class="review-history starmc-list-group">
            <div class="history-title">处理历史</div>
            <p v-if="state.historyLoading" class="history-empty">正在加载审核历史...</p>
            <p v-else-if="state.historyError" class="history-error">{{ state.historyError }}</p>
            <p v-else-if="state.historyItems.length === 0" class="history-empty">暂无历史记录</p>
            <ul v-else class="history-list">
              <li v-for="item in state.historyItems" :key="item.id" class="history-item starmc-list-item">
                <span class="history-action">{{ historyActionLabel(item.action) }}</span>
                <span class="history-meta">{{ item.operatorName || '系统' }} · {{ formatDateTime(item.at) }}</span>
                <span v-if="historyTransitionText(item)" class="history-transition">{{ historyTransitionText(item) }}</span>
                <span v-if="item.note" class="history-note">{{ item.note }}</span>
              </li>
            </ul>
          </section>

          <!-- ========== 审核操作（仅 pending 且有权限）========== -->
          <template v-if="selectedRecord.status === 'pending' && canReview">
            <div class="review-action-block starmc-list-group">
              <div class="action-label">审核操作</div>

              <!-- 错误提示 -->
              <p v-if="state.error" class="action-error" role="alert">
                <AppIcon name="warning" />
                {{ state.error }}
              </p>

              <!-- 操作选择 -->
              <div class="action-toggle">
                <button
                  type="button"
                  class="action-chip"
                  :class="{ active: reviewForm.action === 'approve' }"
                  @click="reviewForm.action = 'approve'"
                >
                  <AppIcon name="checkCircle" />
                  通过
                </button>
                <button
                  type="button"
                  class="action-chip danger"
                  :class="{ active: reviewForm.action === 'reject' }"
                  @click="reviewForm.action = 'reject'"
                >
                  <AppIcon name="close" />
                  驳回
                </button>
              </div>

              <!-- 备注输入 -->
              <label class="form-label">
                {{ reviewForm.action === 'reject' ? '驳回原因（必填）' : '备注（可选）' }}
              </label>
              <textarea
                v-model="reviewForm.note"
                class="ui-input review-textarea"
                :placeholder="reviewForm.action === 'reject' ? '请说明驳回原因，以便投稿人改进' : '可选备注'"
                :maxlength="200"
                rows="3"
              ></textarea>
              <p class="char-hint">{{ reviewForm.note.length }} / 200</p>

              <!-- 提交按钮 -->
              <button
                class="ui-btn w-full"
                :class="reviewForm.action === 'reject' ? 'danger' : 'primary'"
                :disabled="state.actionLoading || (reviewForm.action === 'reject' && !reviewForm.note.trim())"
                @click="submitReview"
              >
                <AppIcon v-if="state.actionLoading" name="refresh" :spin="true" />
                <template v-else>
                  <AppIcon :name="reviewForm.action === 'approve' ? 'checkCircle' : 'close'" />
                  {{ reviewForm.action === 'approve' ? '确认通过' : '确认驳回' }}
                </template>
              </button>
            </div>
          </template>

          <!-- 只读提示（非 pending 或无权限） -->
          <div v-else-if="selectedRecord.status !== 'pending' && canReview" class="readonly-notice">
            <AppIcon name="infoCircle" />
            <span>此投稿已处理，可选择回退到待审核。</span>
            <button class="ui-btn secondary small" :disabled="state.actionLoading" @click="onReopenToPending">
              <AppIcon name="refresh" />
              回退到待审
            </button>
          </div>
          <div v-else-if="selectedRecord.status !== 'pending'" class="readonly-notice">
            <AppIcon name="infoCircle" />
            你没有审核权限
          </div>
        </div>
      </aside>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import { useReviewCenter } from '@/features/skin/useReviewCenter';

const {
  state,
  filteredList,
  selectedRecord,
  reviewForm,
  totalPages,
  canReview,
  pendingCount,
  loadList,
  selectRecord,
  clearSelection,
  setFilters,
  resetFilters,
  submitReview,
  reopenSelected,
  goPage,
} = useReviewCenter();

// ========== 本地筛选状态 ==========
const filterStatus = ref('');
const filterSort = ref('newest');
const keyword = ref('');

function onFilterChange() {
  setFilters({
    status: filterStatus.value as '' | 'pending' | 'approved' | 'rejected',
    sort: filterSort.value as 'newest' | 'oldest',
    keyword: keyword.value,
  });
}

watch([filterStatus, filterSort, keyword], onFilterChange);

function clearFilters() {
  filterStatus.value = '';
  filterSort.value = 'newest';
  keyword.value = '';
  resetFilters();
}

function onRefreshClick() {
  void loadList();
}

async function onReopenToPending() {
  if (!selectedRecord.value) return;
  const note = window.prompt('可选：填写回退待审原因（最多 200 字）', '') ?? '';
  await reopenSelected(note.trim());
}

// ========== 状态标签 ==========
const STATUS_LABEL: Record<string, string> = {
  pending: '待审',
  approved: '已通过',
  rejected: '已驳回',
};

function historyActionLabel(action: string): string {
  const map: Record<string, string> = {
    submit: '提交投稿',
    approve: '审核通过',
    reject: '审核驳回',
    reopen: '回退待审',
    resubmit: '作者重提',
  };
  return map[action] || action;
}

function historyTransitionText(item: { statusBefore?: string; statusAfter?: string }): string {
  const before = String(item.statusBefore || '').trim();
  const after = String(item.statusAfter || '').trim();
  if (!before && !after) return '';
  if (!before) return `状态 -> ${after}`;
  if (!after) return `状态：${before}`;
  return `状态：${before} -> ${after}`;
}

// ========== 工具函数 ==========
function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
/* === Layout === */
.review-center-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 100%;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.header-right {
  display: flex;
  gap: 8px;
}
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

/* === Filter Bar === */
.review-success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(34, 197, 94, 0.14);
  border: 1px solid rgba(34, 197, 94, 0.28);
  color: #86efac;
  font-size: 0.9rem;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.filter-select {
  min-width: 100px;
}
.filter-keyword {
  flex: 1;
  min-width: 200px;
}
.search-wrap {
  position: relative;
  flex: 1;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}
.search-input {
  padding-left: 34px;
  width: 100%;
}
.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;
}
.clear-btn:hover {
  color: var(--text-primary);
}

/* === Main Layout === */
.review-layout {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 16px;
  flex: 1;
  min-height: 0;
  align-items: start;
}

/* === Left Panel: List === */
.review-list-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
}
.review-state-panel {
  margin-bottom: 0;
}
.record-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: calc(100vh - 340px);
  overflow-y: auto;
}
.record-item {
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.record-item:hover {
  background: rgba(255, 255, 255, 0.04);
}
.record-item.is-selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
}
.record-item:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.6);
  outline-offset: 2px;
}
.record-thumb-wrap {
  position: relative;
  flex-shrink: 0;
}
.record-thumb {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 6px;
  background: var(--bg-elevated);
  image-rendering: pixelated;
}
.record-thumb--placeholder {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb-icon {
  width: 24px;
  height: 24px;
  color: var(--text-muted);
}
.record-badge {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.6rem;
  font-weight: 700;
  white-space: nowrap;
}
.badge-pending {
  background: #fbbf24;
  color: #000;
}
.badge-approved {
  background: #34d399;
  color: #000;
}
.badge-rejected {
  background: #f87171;
  color: #fff;
}
.record-info {
  flex: 1;
  min-width: 0;
}
.record-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0 4px;
}
.record-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 4px;
}
.meta-sep {
  opacity: 0.5;
}
.record-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin: 0;
}
.tag-chip {
  font-size: 0.65rem;
  background: var(--bg-elevated);
  color: var(--text-muted);
  border-radius: 4px;
  padding: 1px 5px;
}
.reject-preview {
  font-size: 0.7rem;
  color: #f87171;
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 4px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reject-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

/* === Right Panel: Detail === */
.review-detail-panel {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 100px);
  overflow: hidden;
}
.detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  padding: 40px;
}
.empty-icon {
  width: 40px;
  height: 40px;
  opacity: 0.4;
}
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.detail-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
}
.detail-close {
  flex-shrink: 0;
  margin-top: 2px;
}
.skin-preview-wrap {
  display: flex;
  justify-content: center;
  background: var(--bg-base);
  border-radius: 8px;
  padding: 12px;
}
.detail-skin-img {
  max-width: 100%;
  max-height: 180px;
  object-fit: contain;
  image-rendering: pixelated;
}
.detail-skin-placeholder {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ph-icon {
  width: 40px;
  height: 40px;
  color: var(--text-muted);
  opacity: 0.4;
}
.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}
.meta-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.meta-row dt {
  font-size: 0.75rem;
  color: var(--text-muted);
  width: 60px;
  flex-shrink: 0;
  padding-top: 2px;
}
.meta-row dd {
  font-size: 0.8rem;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
}
.tags-wrap {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.desc-text {
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.review-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history-action {
  font-size: 0.8rem;
  color: var(--text-primary);
}
.history-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}
.history-note {
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.history-transition {
  font-size: 0.72rem;
  color: #93c5fd;
}
.history-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.history-error {
  margin: 0;
  color: #f87171;
  font-size: 0.75rem;
}
.cape-thumb {
  max-width: 100px;
  max-height: 60px;
  object-fit: contain;
  image-rendering: pixelated;
  border-radius: 4px;
  background: var(--bg-elevated);
}

/* === Review Action Block === */
.review-action-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 16px;
}
.action-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.action-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0;
}
.action-toggle {
  display: flex;
  gap: 8px;
}
.action-chip {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1.5px solid var(--bg-elevated);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.15s;
}
.action-chip:hover {
  border-color: #34d399;
  color: #34d399;
}
.action-chip.active {
  border-color: #34d399;
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}
.action-chip.danger:hover {
  border-color: #f87171;
  color: #f87171;
}
.action-chip.danger.active {
  border-color: #f87171;
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}
.form-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.review-textarea {
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  line-height: 1.5;
}
.char-hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-align: right;
  margin: -4px 0 0;
}
.w-full {
  width: 100%;
}
.readonly-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 4px;
}

/* === Pagination === */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.page-info {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* === Responsive === */
@media (max-width: 768px) {
  .review-layout {
    grid-template-columns: 1fr;
  }
  .review-detail-panel {
    position: static;
    max-height: none;
  }
}
</style>
