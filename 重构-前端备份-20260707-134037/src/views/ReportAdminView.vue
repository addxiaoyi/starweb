<template>
  <div class="report-admin-view">
    <div class="container page-shell">
      <header class="admin-header page-hero">
        <h1 class="starmc-brand-glow page-hero__title">
          <AppIcon name="shield" :size="28" class="heading-icon" />
          举报管理
        </h1>
        <p class="subtitle page-hero__subtitle" data-typography="prose">
          处理用户举报的违规皮肤内容
        </p>
      </header>

      <!-- 统计卡片 -->
      <section class="stats-section starmc-list-group">
        <button type="button" class="starmc-list-item stat-card" :class="{ active: filterStatus === 'pending' }" @click="setQuickFilter('pending')">
          <AppIcon name="refresh" :size="24" />
          <div class="stat-info">
            <span class="starmc-badge is-warning stat-value">{{ stats.pending }}</span>
            <span class="stat-label">待处理</span>
          </div>
        </button>
        <button type="button" class="starmc-list-item stat-card" :class="{ active: filterStatus === 'reviewed' }" @click="setQuickFilter('reviewed')">
          <AppIcon name="checkCircle" :size="24" />
          <div class="stat-info">
            <span class="starmc-badge is-success stat-value">{{ stats.reviewed }}</span>
            <span class="stat-label">已处理</span>
          </div>
        </button>
        <button type="button" class="starmc-list-item stat-card" :class="{ active: filterStatus === 'dismissed' }" @click="setQuickFilter('dismissed')">
          <AppIcon name="xCircle" :size="24" />
          <div class="stat-info">
            <span class="starmc-badge is-error stat-value">{{ stats.dismissed }}</span>
            <span class="stat-label">已驳回</span>
          </div>
        </button>
      </section>
      <p class="stats-note">统计基于后台全量数据实时汇总。</p>

      <!-- 筛选栏 -->
      <section class="filter-section starmc-list-group">
        <div class="filter-group">
          <label>状态筛选</label>
          <select v-model="filterStatus" class="starmc-list-item" @change="loadReports">
            <option value="">全部</option>
            <option value="pending">待处理</option>
            <option value="reviewed">已处理</option>
            <option value="dismissed">已驳回</option>
          </select>
        </div>
        <button type="button" class="mc-button starmc-badge" @click="reloadReports">
          <AppIcon name="warning" :size="14" />
          刷新
        </button>
        <button type="button" class="mc-button starmc-badge" @click="clearFilter">
          <AppIcon name="xCircle" :size="14" />
          清空筛选
        </button>
      </section>

      <!-- 举报列表 -->
      <section class="reports-section">
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>加载中...</p>
        </div>

        <div v-else-if="reports.length === 0" class="empty-state">
          <AppIcon name="inbox" :size="48" />
          <p>暂无举报记录</p>
        </div>

        <div v-else class="reports-list starmc-list-group">
          <div
            v-for="report in paginatedReports"
            :key="report.id"
            :class="['report-card', 'starmc-list-item', report.status]"
          >
            <div class="report-header starmc-list-item">
              <div class="report-meta">
                <span :class="['status-badge', report.status]">
                  {{ statusText[report.status] }}
                </span>
                <span class="report-time">{{ formatDate(report.createdAt) }}</span>
              </div>
              <span :class="['reason-badge', report.reason]">
                <AppIcon :name="(reasonIcon[report.reason] as any)" :size="12" />
                {{ reasonText[report.reason] }}
              </span>
            </div>

            <div class="report-content starmc-list-group">
              <div class="skin-preview starmc-list-item">
                <img :src="report.skinImageUrl || '/images/skin-placeholder.png'" :alt="report.skinName" class="skin-image" @error="handleImageError">
                <div class="skin-info">
                  <h4>{{ report.skinName }}</h4>
                  <span class="skin-id">ID: {{ report.skinId }}</span>
                </div>
              </div>

              <div class="report-detail starmc-list-item">
                <div class="detail-row">
                  <label>举报人:</label>
                  <span>{{ report.reporterUuid }}</span>
                </div>
                <div class="detail-row" v-if="report.detail">
                  <label>补充说明:</label>
                  <p class="detail-text">{{ report.detail }}</p>
                </div>
              </div>
            </div>

            <!-- 处理结果（已处理） -->
            <div v-if="report.status !== 'pending'" class="review-result starmc-list-group">
              <div class="starmc-list-item detail-row">
                <label>处理人:</label>
                <span>{{ report.reviewedBy }}</span>
              </div>
              <div class="starmc-list-item detail-row">
                <label>处理时间:</label>
                <span>{{ formatDate(report.reviewedAt) }}</span>
              </div>
              <div class="starmc-list-item detail-row" v-if="report.reviewNote">
                <label>处理备注:</label>
                <p class="detail-text">{{ report.reviewNote }}</p>
              </div>
            </div>

            <!-- 操作按钮（待处理） -->
            <div v-if="report.status === 'pending'" class="report-actions starmc-list-group">
              <button class="mc-button danger starmc-list-item" @click="openReviewModal(report, 'dismiss')">
                <AppIcon name="x" :size="14" />
                驳回
              </button>
              <button class="mc-button primary starmc-list-item" @click="openReviewModal(report, 'approve')">
                <AppIcon name="check" :size="14" />
                确认违规
              </button>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="totalPages > 1" class="pagination starmc-list-group">
          <button
            class="page-btn starmc-list-item"
            :disabled="currentPage === 1"
            @click="changePage(currentPage - 1)"
          >
            <AppIcon name="chevronLeft" :size="16" />
          </button>
          <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button
            class="page-btn"
            :disabled="currentPage === totalPages"
            @click="changePage(currentPage + 1)"
          >
            <AppIcon name="chevronRight" :size="16" />
          </button>
        </div>
      </section>
    </div>

    <!-- 处理弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="reviewModalVisible" class="modal-overlay" @click.self="closeReviewModal">
          <div class="review-modal">
            <div class="modal-header">
              <h3>{{ reviewAction === 'approve' ? '确认违规' : '驳回举报' }}</h3>
              <button class="close-btn" @click="closeReviewModal">
                <AppIcon name="x" :size="20" />
              </button>
            </div>
            <div class="modal-body">
              <p class="review-hint">
                {{ reviewAction === 'approve' 
                  ? '确认该皮肤违规，将下架该皮肤并通知举报人' 
                  : '驳回该举报，将通知举报人举报不成立' 
                }}
              </p>
              <div class="form-group">
                <label>处理备注（可选）</label>
                <textarea
                  v-model="reviewNote"
                  rows="3"
                  placeholder="添加处理备注..."
                ></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="mc-button" @click="closeReviewModal">取消</button>
              <button
                :class="['mc-button', reviewAction === 'approve' ? 'danger' : 'primary']"
                @click="submitReview"
                :disabled="submitting"
              >
                <AppIcon v-if="submitting" name="loader" :size="14" class="spin" />
                <span v-else>确认</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import { getReportStats, getReports, reviewReport } from '@/features/skin/api-report';
import { useToastStore } from '@/stores/toast';
import type { ReportItem } from '@/features/skin/api-report';

const toast = useToastStore();

const reports = ref<ReportItem[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = 10;
const totalReports = ref(0);
const filterStatus = ref('');
const filteredReports = computed(() => {
  if (!filterStatus.value) return reports.value;
  return reports.value.filter((report) => report.status === filterStatus.value);
});

const paginatedReports = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredReports.value.slice(start, start + pageSize);
});

function syncStatsFromReports(source: ReportItem[]) {
  stats.value = {
    total: source.length,
    pending: source.filter((r) => r.status === 'pending').length,
    reviewed: source.filter((r) => r.status === 'reviewed').length,
    dismissed: source.filter((r) => r.status === 'dismissed').length
  };
}

function setQuickFilter(status: '' | 'pending' | 'reviewed' | 'dismissed') {
  filterStatus.value = status;
  currentPage.value = 1;
  void loadReports();
}

const stats = ref({
  total: 0,
  pending: 0,
  reviewed: 0,
  dismissed: 0
});

const totalPages = computed(() => Math.ceil(totalReports.value / pageSize));

const statusText: Record<string, string> = {
  pending: '待处理',
  reviewed: '已处理',
  dismissed: '已驳回'
};

const reasonText: Record<string, string> = {
  copyright: '版权投诉',
  nsfw: '色情低俗',
  spam: '垃圾广告',
  other: '其他违规'
};

const reasonIcon: Record<string, string> = {
  copyright: 'shield',
  nsfw: 'warning',
  spam: 'flag',
  other: 'warning'
};

const skinImageFallback = '/images/skin-placeholder.png';

// 处理弹窗
const reviewModalVisible = ref(false);
const reviewAction = ref<'approve' | 'dismiss'>('approve');
const reviewNote = ref('');
const currentReport = ref<ReportItem | null>(null);
const submitting = ref(false);

onMounted(() => {
  void (async () => {
    await loadReports();
    await loadStats();
  })();
});

async function reloadReports() {
  currentPage.value = 1;
  await loadReports();
  await loadStats();
}

function clearFilter() {
  filterStatus.value = '';
  void reloadReports();
}

async function loadReports() {
  loading.value = true;
  try {
    const result = await getReports(
      filterStatus.value || undefined,
      currentPage.value,
      pageSize
    );
    totalReports.value = result.total;
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
    if (currentPage.value > lastPage) {
      currentPage.value = lastPage;
      const fallback = await getReports(
        filterStatus.value || undefined,
        currentPage.value,
        pageSize
      );
      reports.value = fallback.items;
      totalReports.value = fallback.total;
      syncStatsFromReports(fallback.items);
      return;
    }
    reports.value = result.items;
    syncStatsFromReports(result.items);
  } catch (error) {
    toast.addToast({
      type: 'error',
      message: '加载失败',
    });
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    const snapshot = await getReportStats();
    stats.value = {
      total: snapshot.total,
      pending: snapshot.pending,
      reviewed: snapshot.reviewed,
      dismissed: snapshot.dismissed
    };
  } catch {
    // 统计接口异常时，回退到当前已加载列表，避免页面空白
    syncStatsFromReports(reports.value);
  }
}

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement | null;
  if (target && target.src !== skinImageFallback) {
    target.src = skinImageFallback;
  }
}

async function changePage(page: number) {
  currentPage.value = page;
  await loadReports();
}

function openReviewModal(report: ReportItem, action: 'approve' | 'dismiss') {
  currentReport.value = report;
  reviewAction.value = action;
  reviewNote.value = '';
  reviewModalVisible.value = true;
}

function closeReviewModal() {
  reviewModalVisible.value = false;
  currentReport.value = null;
  reviewNote.value = '';
}

async function submitReview() {
  if (!currentReport.value) return;
  
  submitting.value = true;
  try {
    await reviewReport(
      currentReport.value.id,
      reviewAction.value,
      reviewNote.value
    );
    
    toast.addToast({
      type: 'success',
      message: '处理成功',
    });
    
    closeReviewModal();
    await loadReports();
    await loadStats();
  } catch (error) {
    toast.addToast({
      type: 'error',
      message: '处理失败',
    });
  } finally {
    submitting.value = false;
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>

<style scoped lang="scss">
.report-admin-view {
  padding: 2rem 0;
}

.admin-header {
  text-align: center;
  margin-bottom: 2rem;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid #444;
  border-radius: 8px;
  color: var(--text-secondary);
  text-align: left;
  width: 100%;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
  
  .stat-info {
    display: flex;
    flex-direction: column;
  }
  
  .stat-value {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--text-primary);
  }
  
  .stat-label {
    font-size: 0.85rem;
  }
}

.stat-card:hover {
  transform: translateY(-1px);
  border-color: var(--accent-color, #00d4ff);
}

.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  
  label {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
  
  select {
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #555;
    border-radius: 6px;
    color: var(--text-primary);
    min-width: 150px;
    
    &:focus {
      outline: none;
      border-color: var(--accent-color, #00d4ff);
    }
  }
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: var(--text-secondary);
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent-color, #00d4ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.reports-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.report-card {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 1.25rem;
  
  &.pending {
    border-left: 4px solid #eab308;
  }
  
  &.reviewed {
    border-left: 4px solid #22c55e;
  }
  
  &.dismissed {
    border-left: 4px solid #6b7280;
  }
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.report-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  
  &.pending {
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
  }
  
  &.reviewed {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }
  
  &.dismissed {
    background: rgba(107, 114, 128, 0.2);
    color: #9ca3af;
  }
}

.report-time {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.reason-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-radius: 4px;
  font-size: 0.75rem;
}

.report-content {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.skin-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  
  .skin-image {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 4px;
    image-rendering: pixelated;
  }
  
  .skin-info {
    text-align: center;
    
    h4 {
      margin: 0;
      font-size: 0.9rem;
      color: var(--text-primary);
    }
    
    .skin-id {
      font-size: 0.75rem;
      color: var(--text-secondary);
      font-family: monospace;
    }
  }
}

.report-detail {
  .detail-row {
    margin-bottom: 0.5rem;
    
    label {
      color: var(--text-secondary);
      font-size: 0.8rem;
      margin-right: 0.5rem;
    }
    
    .detail-text {
      margin: 0.25rem 0 0;
      padding: 0.5rem;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 0.9rem;
    }
  }
}

.review-result {
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  margin-bottom: 1rem;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
}

.page-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid #555;
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.page-info {
  color: var(--text-secondary);
}

// 处理弹窗
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.review-modal {
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #444;
  
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
}

.modal-body {
  padding: 1rem;
}

.review-hint {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.form-group {
  label {
    display: block;
    color: var(--text-secondary);
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
  
  textarea {
    width: 100%;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #555;
    border-radius: 6px;
    color: var(--text-primary);
    resize: vertical;
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem;
  border-top: 1px solid #444;
}

.spin {
  animation: spin 1s linear infinite;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .stats-section {
    grid-template-columns: 1fr;
  }
  
  .report-content {
    grid-template-columns: 1fr;
  }
}
</style>
