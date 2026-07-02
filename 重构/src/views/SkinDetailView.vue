<template>
  <div class="skin-detail-view">
    <div class="container">
      <AppStatePanel
        v-if="loading"
        variant="loading"
        eyebrow="Skin Detail"
        title="正在加载皮肤详情"
        message="我们正在从服务器读取皮肤信息，请稍候。"
        hint="如果网络较慢，可以稍等几秒或刷新页面。"
      />
      <AppStatePanel
        v-else-if="error"
        variant="error"
        eyebrow="加载失败"
        :title="t('common.error')"
        :message="error"
        hint="点击重试即可重新请求当前皮肤信息。"
      >
        <template #actions>
          <button class="retry-btn" @click="loadSkin">{{ t('common.retry') || '重试' }}</button>
        </template>
      </AppStatePanel>
      <template v-else>
        <nav class="breadcrumb" aria-label="面包屑导航">
          <RouterLink to="/skin" class="breadcrumb-link">{{ t('nav.skin') }}</RouterLink>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-current">{{ skinName }}</span>
        </nav>

        <section class="detail-summary card glass-panel">
          <div class="summary-tile"><span>收藏</span><strong>{{ favoriteCount }}</strong></div>
          <div class="summary-tile"><span>下载</span><strong>{{ downloadCount }}</strong></div>
          <div class="summary-tile"><span>浏览</span><strong>{{ viewCount }}</strong></div>
          <div class="summary-tile"><span>评论</span><strong>{{ commentCount }}</strong></div>
        </section>

        <div class="skin-detail-content">
          <div class="preview-section">
            <div class="preview-container">
              <SkinPreview
                v-if="skinUrl"
                ref="previewRef"
                :skin-url="skinUrl"
                :cape-url="capeUrl"
                :model="model"
                :auto-rotate="isWalking"
                class="skin-preview-3d"
              />
              <div v-else class="preview-placeholder">
                <AppIcon name="image" :size="48" />
                <p>{{ t('skin.noSkin') }}</p>
              </div>
            </div>

            <div class="preview-controls">
              <button class="control-btn" :class="{ active: isWalking }" @click="toggleWalk()">
                <AppIcon :name="isWalking ? 'pause' : 'play'" :size="18" />
                {{ isWalking ? t('skin.stop') : t('skin.walk') }}
              </button>
              <button class="control-btn" @click="resetView">
                <AppIcon name="refresh" :size="18" />
                {{ t('skin.reset') }}
              </button>
              <div class="model-selector">
                <label>{{ t('skin.model') }}:</label>
                <select v-model="model" class="model-select">
                  <option value="auto">{{ t('skin.modelAuto') }}</option>
                  <option value="default">{{ t('skin.modelDefault') }}</option>
                  <option value="slim">{{ t('skin.modelSlim') }}</option>
                </select>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="skin-header">
              <div>
                <p class="skin-eyebrow">{{ modelLabel }}</p>
                <h1 class="skin-name">{{ skinName }}</h1>
              </div>
              <div class="skin-actions">
                <button class="action-btn favorite" :class="{ active: isFavorite(skinId) }" @click="handleFavoriteToggle" :aria-label="isFavorite(skinId) ? t('skin.unfavorite') : t('skin.favorite')">
                  <AppIcon :name="isFavorite(skinId) ? 'heart' : 'heartOutline'" :size="20" />
                </button>
                <button class="action-btn share" @click="openShare" :aria-label="t('skin.share')">
                  <AppIcon name="share" :size="20" />
                </button>
                <button class="action-btn report" @click="openReport" :aria-label="t('skin.report')">
                  <AppIcon name="flag" :size="20" />
                </button>
              </div>
            </div>

            <div class="skin-meta starmc-list-group">
              <div class="starmc-list-item meta-item">
                <span class="meta-label">{{ t('common.upload') }}:</span>
                <span class="starmc-badge is-info meta-value">{{ formatDate(createdAt) }}</span>
              </div>
              <div class="starmc-list-item meta-item">
                <span class="meta-label">{{ t('common.update') }}:</span>
                <span class="starmc-badge is-info meta-value">{{ formatDate(updatedAt) }}</span>
              </div>
              <div class="starmc-list-item meta-item" v-if="uploader">
                <span class="meta-label">{{ t('auth.profile') }}:</span>
                <span class="starmc-badge is-info meta-value">{{ uploader }}</span>
              </div>
            </div>

            <div class="skin-tags starmc-list-group" v-if="tags.length > 0">
              <span v-for="tag in tags" :key="tag" class="starmc-badge tag">{{ tag }}</span>
            </div>

            <p class="skin-description" v-if="description">{{ description }}</p>

            <div class="skin-stats starmc-list-group">
              <div class="starmc-list-item stat-item"><AppIcon name="heart" :size="16" /><span>{{ favoriteCount }}</span></div>
              <div class="starmc-list-item stat-item"><AppIcon name="download" :size="16" /><span>{{ downloadCount }}</span></div>
              <div class="starmc-list-item stat-item"><AppIcon name="eye" :size="16" /><span>{{ viewCount }}</span></div>
              <div class="starmc-list-item stat-item"><AppIcon name="flag" :size="16" /><span>{{ commentCount }}</span></div>
            </div>

            <div class="action-buttons">
              <button class="btn-primary" @click="applySkin" :disabled="isApplying || !skinUrl">
                <AppIcon name="check" :size="18" />
                {{ isApplying ? t('common.processing') : t('skin.applySkin') }}
              </button>
              <button class="btn-secondary" @click="downloadSkin" :disabled="!skinUrl">
                <AppIcon name="download" :size="18" />
                {{ t('common.download') }}
              </button>
            </div>

            <div v-if="reportReceipt?.reportId" class="report-receipt starmc-list-group">
              <div class="starmc-list-item receipt-head">
                <span class="meta-label">举报回执</span>
                <strong>#{{ reportReceipt.reportId }}</strong>
                <span class="receipt-status-badge" :class="reportStatusClass">{{ reportStatusLabel }}</span>
              </div>
              <p class="receipt-status-text">{{ reportReceipt.statusText || '已提交，等待审核' }}</p>
              <p v-if="reportReceipt.reviewNote" class="receipt-note">处理备注：{{ reportReceipt.reviewNote }}</p>
              <p v-if="reportReceipt.reviewedAt" class="receipt-time">处理时间：{{ formatDate(reportReceipt.reviewedAt) }}</p>
              <div class="receipt-actions">
                <button class="btn-secondary btn-small" type="button" :disabled="reportStatusRefreshing" @click="refreshReportStatus()">
                  {{ reportStatusRefreshing ? '刷新中...' : '刷新状态' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <section class="detail-extra-grid">
          <article class="card glass-panel detail-extra-card">
            <div class="detail-extra-head">
              <h2 class="section-title">评论区</h2>
              <span class="section-meta">{{ commentCount }} 条</span>
            </div>
            <form class="comment-editor" @submit.prevent="submitComment">
              <textarea
                v-model="commentDraft"
                class="comment-input"
                rows="3"
                maxlength="500"
                placeholder="写下你的看法（最多 500 字）"
              />
              <div class="comment-editor-actions">
                <span class="section-meta">{{ commentDraft.length }}/500</span>
                <button class="btn-primary btn-small" type="submit" :disabled="commentSubmitting || !commentDraft.trim()">
                  {{ commentSubmitting ? '发布中...' : '发布评论' }}
                </button>
              </div>
            </form>

            <div v-if="commentsLoading" class="section-empty">评论加载中...</div>
            <ul v-else-if="comments.length > 0" class="comment-list">
              <li v-for="comment in comments" :key="comment.id" class="comment-item">
                <header class="comment-head">
                  <strong>{{ comment.username || '用户' }}</strong>
                  <time>{{ formatDate(comment.createdAt) }}</time>
                </header>
                <p class="comment-content">{{ comment.content }}</p>
                <div class="comment-actions">
                  <button
                    class="comment-action-btn"
                    type="button"
                    :disabled="commentWorkingId === comment.id"
                    @click="likeComment(comment)"
                  >
                    赞 {{ comment.likeCount || 0 }}
                  </button>
                  <button
                    v-if="canDeleteComment(comment)"
                    class="comment-action-btn danger"
                    type="button"
                    :disabled="commentWorkingId === comment.id"
                    @click="removeComment(comment)"
                  >
                    删除
                  </button>
                </div>
              </li>
            </ul>
            <div v-else class="section-empty">还没有评论，来发第一条吧。</div>
          </article>

          <article class="card glass-panel detail-extra-card">
            <div class="detail-extra-head">
              <h2 class="section-title">版本历史</h2>
              <span class="section-meta">{{ versions.length }} 条</span>
            </div>
            <div v-if="versionsLoading" class="section-empty">版本记录加载中...</div>
            <ul v-else-if="versions.length > 0" class="version-list">
              <li v-for="version in versions" :key="version.id" class="version-item">
                <div>
                  <strong>v{{ version.versionNumber }} · {{ version.title || skinName }}</strong>
                  <p class="version-meta">{{ formatDate(version.at) }} · {{ version.model || 'default' }}</p>
                </div>
                <button
                  v-if="canRollbackVersions"
                  class="btn-secondary btn-small"
                  type="button"
                  :disabled="rollbackWorkingId === version.id"
                  @click="rollbackToVersion(version)"
                >
                  {{ rollbackWorkingId === version.id ? '回滚中...' : '回滚到此版本' }}
                </button>
              </li>
            </ul>
            <div v-else class="section-empty">暂无版本记录。</div>
          </article>
        </section>

        <section class="related-skins" v-if="relatedSkins.length > 0">
          <h2 class="section-title">{{ t('skin.popularSkins') }}</h2>
          <div class="skins-grid">
            <SkinCard v-for="skin in relatedSkins" :key="skin.id" :skin="skin" @click="goToSkin(skin.id)" />
          </div>
        </section>
      </template>
    </div>

    <SkinShareModal
      v-if="showShareModal"
      :visible="showShareModal"
      :share-url="shareUrl"
      :embed-code="embedCode"
      :title="'分享《' + skinName + '》'"
      @update:visible="showShareModal = $event"
    />

    <SkinReportModal
      v-if="showReportModal"
      :visible="showReportModal"
      :skin="{ id: skinId, name: skinName, skinUrl, previewUrl: skinUrl }"
      @update:visible="showReportModal = $event"
      @submitted="onReportSubmitted"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToastStore } from '@/stores/toast';
import { useAuthStore } from '@/stores/auth';
import { useFavorite } from '@/features/skin/useFavorite';
import SkinPreview from '@/components/organisms/Skin/SkinPreview.vue';
import SkinCard from '@/components/molecules/Skin/SkinCard.vue';
import SkinShareModal from '@/components/molecules/Skin/SkinShareModal.vue';
import SkinReportModal from '@/components/molecules/Skin/SkinReportModal.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import { applySkinAssets } from '@/features/skin/api';
import { fetchSkinReportStatus } from '@/features/skin/api-report';
import {
  createSkinComment,
  deleteSkinComment,
  fetchSkinComments,
  fetchSkinVersions,
  likeSkinComment,
  rollbackSkinVersion,
  type SkinComment,
  type SkinVersionRecord,
} from '@/features/skin/api-detail';

const { t, d } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const auth = useAuthStore();

const skinId = computed(() => route.params.id as string);
const shareUrl = computed(() => (typeof window === 'undefined' ? `/skin/${skinId.value}` : `${window.location.origin}/skin/${skinId.value}`));

const loading = ref(false);
const error = ref('');

const catalogItem = ref<{ id: string; name: string; description?: string; tags?: string[]; skinUrl?: string; capeUrl?: string; previewUrl?: string; model?: string; uploaderName?: string; createdAt?: string; updatedAt?: string; } | null>(null);
const skinName = computed(() => catalogItem.value?.name || '皮肤详情');
const skinUrl = computed(() => catalogItem.value?.skinUrl || catalogItem.value?.previewUrl || '');
const capeUrl = computed(() => catalogItem.value?.capeUrl || '');
const model = ref<'auto' | 'default' | 'slim'>('auto');
const description = computed(() => catalogItem.value?.description || '暂无简介');
const tags = computed(() => catalogItem.value?.tags || []);
const uploader = computed(() => catalogItem.value?.uploaderName || '未知上传者');
const createdAt = computed(() => catalogItem.value?.createdAt || '');
const updatedAt = computed(() => catalogItem.value?.updatedAt || '');
const favoriteCount = ref(0);
const downloadCount = ref(0);
const viewCount = ref(0);
const commentCount = ref(0);

const comments = ref<SkinComment[]>([]);
const commentsLoading = ref(false);
const commentDraft = ref('');
const commentSubmitting = ref(false);
const commentWorkingId = ref('');
const versions = ref<SkinVersionRecord[]>([]);
const versionsLoading = ref(false);
const rollbackWorkingId = ref('');
const permissionRollback = ref(false);

const { isFavorite, toggleFavorite } = useFavorite();
const previewRef = ref<InstanceType<typeof SkinPreview> | null>(null);
const isWalking = ref(true);
const isApplying = ref(false);
const showShareModal = ref(false);
const showReportModal = ref(false);
const reportStatusRefreshing = ref(false);

interface ReportReceiptState {
  reportId: string;
  status: string;
  statusText: string;
  reviewedAt: string;
  reviewNote: string;
  updatedAt: string;
}

interface ReportSubmittedEvent {
  reportId?: string;
  status?: string;
  statusText?: string;
}

const reportReceipt = ref<ReportReceiptState | null>(null);
let reportStatusPollTimer: ReturnType<typeof setTimeout> | null = null;

const modelLabel = computed(() => {
  if (model.value === 'slim') return t('skin.modelSlim');
  if (model.value === 'default') return t('skin.modelDefault');
  return t('skin.modelAuto');
});

const reportStatusLabel = computed(() => {
  const status = String(reportReceipt.value?.status || '').trim().toLowerCase();
  if (status === 'pending') return '待处理';
  if (status === 'reviewed') return '已处理';
  if (status === 'dismissed') return '已驳回';
  return status || '未知状态';
});

const reportStatusClass = computed(() => {
  const status = String(reportReceipt.value?.status || '').trim().toLowerCase();
  if (status === 'reviewed') return 'is-reviewed';
  if (status === 'dismissed') return 'is-dismissed';
  return 'is-pending';
});

const canRollbackVersions = computed(() => {
  if (permissionRollback.value) return true;
  const user = auth.user;
  const roles = new Set<string>([
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(user?.role ? [user.role] : []),
  ].map((r) => String(r || '').toLowerCase()));
  return roles.has('admin') || roles.has('reviewer') || roles.has('moderator');
});

const embedCode = computed(() =>
  `<iframe src="${shareUrl.value}" width="300" height="400" frameborder="0"></iframe>`,
);

function toggleWalk() { isWalking.value = !isWalking.value; }
function resetView() { previewRef.value?.resetCamera?.(); }

async function applySkin() {
  if (!skinUrl.value) return;
  if (!auth.isLoggedIn || !auth.user?.uuid) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: t('skin.loginRequired') || '请先登录后再应用皮肤' });
    return;
  }
  isApplying.value = true;
  try {
    await applySkinAssets({ uuid: String(auth.user.uuid), skinAssetId: 0, capeAssetId: 0, slot: 'default' });
    toast.addToast({ type: 'success', title: t('common.success'), message: t('skin.applySuccess') });
  } catch {
    toast.addToast({ type: 'error', title: t('common.error'), message: t('skin.applyError') });
  } finally {
    isApplying.value = false;
  }
}

async function reportView() {
  try {
    const resp = await fetch(`/api/skins/${encodeURIComponent(String(skinId.value))}/view`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok && data && typeof data.viewCount === 'number') {
      viewCount.value = data.viewCount;
    }
  } catch {
    // ignore metric update failures
  }
}

async function reportDownload() {
  try {
    const resp = await fetch(`/api/skins/${encodeURIComponent(String(skinId.value))}/download`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok && data && typeof data.downloadCount === 'number') {
      downloadCount.value = data.downloadCount;
    }
  } catch {
    // ignore metric update failures
  }
}

async function handleFavoriteToggle() {
  const id = skinId.value;
  const wasFavorite = isFavorite.value(id);
  try {
    await toggleFavorite(id);
    favoriteCount.value = Math.max(0, favoriteCount.value + (wasFavorite ? -1 : 1));
  } catch {
    // toast is handled in useFavorite
  }
}

function downloadSkin() {
  if (!skinUrl.value) return;
  const link = document.createElement('a');
  link.href = skinUrl.value;
  link.download = `${skinName.value}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  void reportDownload();
}

function openShare() { showShareModal.value = true; }
function openReport() { showReportModal.value = true; }

function clearReportStatusPollTimer() {
  if (!reportStatusPollTimer) return;
  clearTimeout(reportStatusPollTimer);
  reportStatusPollTimer = null;
}

function shouldPollReportStatus() {
  const receipt = reportReceipt.value;
  if (!receipt?.reportId) return false;
  return String(receipt.status || '').trim().toLowerCase() === 'pending';
}

function scheduleReportStatusPoll(delayMs = 20_000) {
  clearReportStatusPollTimer();
  if (!shouldPollReportStatus()) return;
  reportStatusPollTimer = setTimeout(() => {
    void refreshReportStatus({ silent: true, fromPoll: true });
  }, delayMs);
}

async function refreshReportStatus(options: { silent?: boolean; fromPoll?: boolean } = {}) {
  const reportId = String(reportReceipt.value?.reportId || '').trim();
  if (!reportId) return;
  const fromPoll = Boolean(options.fromPoll);
  if (!fromPoll) reportStatusRefreshing.value = true;
  try {
    const snapshot = await fetchSkinReportStatus(reportId);
    reportReceipt.value = {
      reportId: snapshot.id || reportId,
      status: String(snapshot.status || 'pending'),
      statusText: String(snapshot.statusText || ''),
      reviewedAt: String(snapshot.reviewedAt || ''),
      reviewNote: String(snapshot.reviewNote || ''),
      updatedAt: String(snapshot.updatedAt || ''),
    };
    if (shouldPollReportStatus()) {
      scheduleReportStatusPoll();
    } else {
      clearReportStatusPollTimer();
    }
    if (!options.silent && !fromPoll) {
      toast.addToast({ type: 'success', title: t('common.success'), message: '举报状态已刷新' });
    }
  } catch (error) {
    if (!options.silent && !fromPoll) {
      const msg = error instanceof Error ? error.message : '举报状态刷新失败';
      toast.addToast({ type: 'error', title: t('common.error'), message: msg });
    }
    if (fromPoll && shouldPollReportStatus()) {
      scheduleReportStatusPoll(35_000);
    }
  } finally {
    if (!fromPoll) reportStatusRefreshing.value = false;
  }
}

function onReportSubmitted(payload?: ReportSubmittedEvent) {
  showReportModal.value = false;
  const reportId = String(payload?.reportId || '').trim();
  if (!reportId) return;
  reportReceipt.value = {
    reportId,
    status: String(payload?.status || 'pending'),
    statusText: String(payload?.statusText || '已提交，等待审核'),
    reviewedAt: '',
    reviewNote: '',
    updatedAt: '',
  };
  scheduleReportStatusPoll(15_000);
  void refreshReportStatus({ silent: true });
}

const relatedSkins = ref<Array<{ id: string; name: string; previewUrl?: string; tags?: string[] }>>([]);

function goToSkin(id: string) { router.push(`/skin/${id}`); }
function formatDate(dateString: string): string { return dateString ? d(new Date(dateString), 'short') : '—'; }

function canDeleteComment(comment: SkinComment): boolean {
  if (!auth.user?.id) return false;
  return String(comment.userId || '') === String(auth.user.id || '') || canRollbackVersions.value;
}

async function loadComments() {
  commentsLoading.value = true;
  try {
    const data = await fetchSkinComments(String(skinId.value), { page: 1, pageSize: 20 });
    comments.value = Array.isArray(data.items) ? data.items : [];
    if (Number.isFinite(Number(data.total))) {
      commentCount.value = Number(data.total || 0);
    }
  } catch {
    comments.value = [];
  } finally {
    commentsLoading.value = false;
  }
}

async function submitComment() {
  if (!auth.isLoggedIn) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: '请先登录后再发表评论' });
    return;
  }
  const text = commentDraft.value.trim();
  if (!text) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: '评论内容不能为空' });
    return;
  }
  if (text.length > 500) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: '评论内容不能超过 500 字' });
    return;
  }
  commentSubmitting.value = true;
  try {
    const { response, data } = await createSkinComment(String(skinId.value), text);
    if (!response.ok || !data?.item) {
      throw new Error(data?.message || `评论发布失败(${response.status})`);
    }
    comments.value = [data.item, ...comments.value];
    commentCount.value = Math.max(commentCount.value, comments.value.length);
    commentDraft.value = '';
    toast.addToast({ type: 'success', title: t('common.success'), message: '评论已发布' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '评论发布失败';
    toast.addToast({ type: 'error', title: t('common.error'), message: msg });
  } finally {
    commentSubmitting.value = false;
  }
}

async function likeComment(comment: SkinComment) {
  if (!auth.isLoggedIn) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: '请先登录后再点赞评论' });
    return;
  }
  if (!comment?.id || commentWorkingId.value === comment.id) return;
  commentWorkingId.value = comment.id;
  try {
    const { response, data } = await likeSkinComment(comment.id);
    if (!response.ok) throw new Error(`点赞失败(${response.status})`);
    const next = Number(data?.likeCount);
    comment.likeCount = Number.isFinite(next)
      ? Math.max(0, next)
      : Math.max(0, Number(comment.likeCount || 0) + 1);
  } catch {
    toast.addToast({ type: 'error', title: t('common.error'), message: '点赞失败，请稍后再试' });
  } finally {
    commentWorkingId.value = '';
  }
}

async function removeComment(comment: SkinComment) {
  if (!canDeleteComment(comment)) return;
  if (!window.confirm('确认删除这条评论吗？')) return;
  if (!comment?.id || commentWorkingId.value === comment.id) return;
  commentWorkingId.value = comment.id;
  try {
    const { response } = await deleteSkinComment(comment.id);
    if (!response.ok) throw new Error(`删除失败(${response.status})`);
    comments.value = comments.value.filter((row) => row.id !== comment.id);
    commentCount.value = Math.max(0, commentCount.value - 1);
  } catch {
    toast.addToast({ type: 'error', title: t('common.error'), message: '删除评论失败' });
  } finally {
    commentWorkingId.value = '';
  }
}

async function loadVersions() {
  versionsLoading.value = true;
  try {
    const data = await fetchSkinVersions(String(skinId.value), { page: 1, pageSize: 8 });
    versions.value = Array.isArray(data.items) ? data.items : [];
  } catch {
    versions.value = [];
  } finally {
    versionsLoading.value = false;
  }
}

async function loadPermissions() {
  permissionRollback.value = false;
  if (!auth.isLoggedIn) return;
  try {
    const resp = await fetch('/api/user/permissions', {
      cache: 'no-store',
      credentials: 'include',
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || typeof data !== 'object') return;
    permissionRollback.value = Boolean((data as { capabilities?: { canRollbackSkinVersion?: boolean } }).capabilities?.canRollbackSkinVersion);
  } catch {
    permissionRollback.value = false;
  }
}

async function rollbackToVersion(row: SkinVersionRecord) {
  if (!auth.isLoggedIn) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: '请先登录后再回滚版本' });
    return;
  }
  if (!canRollbackVersions.value) {
    toast.addToast({ type: 'warning', title: t('common.warning'), message: '当前账号无版本回滚权限' });
    return;
  }
  if (!row?.id) return;
  const noteRaw = window.prompt('请输入回滚备注（可选）', '');
  if (noteRaw === null) return;
  rollbackWorkingId.value = row.id;
  try {
    const { response, data } = await rollbackSkinVersion(String(skinId.value), {
      versionId: row.id,
      note: noteRaw.trim(),
    });
    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || `回滚失败(${response.status})`);
    }
    toast.addToast({ type: 'success', title: t('common.success'), message: '版本回滚成功' });
    await Promise.all([loadSkin(), loadVersions()]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '版本回滚失败';
    toast.addToast({ type: 'error', title: t('common.error'), message: msg });
  } finally {
    rollbackWorkingId.value = '';
  }
}

async function loadSkin() {
  loading.value = true;
  error.value = '';
  try {
    const resp = await fetch(`/api/skins/${encodeURIComponent(String(skinId.value))}?relatedLimit=6`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const data = await resp.json().catch(() => null);
    const item = data?.item;
    if (!resp.ok || !item) { error.value = '未找到该皮肤'; return; }
    catalogItem.value = {
      id: String(item.id || ''),
      name: String(item.name || '皮肤详情'),
      description: String(item.description || ''),
      tags: Array.isArray(item.tags) ? item.tags : [],
      skinUrl: String(item.skinUrl || ''),
      capeUrl: String(item.capeUrl || ''),
      previewUrl: String(item.previewUrl || item.skinUrl || ''),
      model: String(item.model || 'auto'),
      uploaderName: String(item.uploaderName || ''),
      createdAt: String(item.createdAt || ''),
      updatedAt: String(item.updatedAt || ''),
    };
    favoriteCount.value = Number(item?.stats?.favoriteCount) || 0;
    downloadCount.value = Number(item?.stats?.downloadCount) || 0;
    viewCount.value = Number(item?.stats?.viewCount) || 0;
    commentCount.value = Number(item?.stats?.commentCount) || 0;
    relatedSkins.value = Array.isArray(data?.related)
      ? data.related.map((s: Record<string, unknown>) => ({
          id: String(s?.id || ''),
          name: String(s?.name || '未命名'),
          previewUrl: String(s?.previewUrl || s?.skinUrl || ''),
          tags: Array.isArray(s?.tags) ? s.tags.map((x: unknown) => String(x)) : [],
        }))
      : [];
    model.value = catalogItem.value.model === 'slim' ? 'slim' : catalogItem.value.model === 'default' ? 'default' : 'auto';
    void reportView();
  } catch {
    error.value = '加载皮肤详情失败';
  } finally {
    loading.value = false;
  }
}

watch(skinId, () => {
  clearReportStatusPollTimer();
  reportReceipt.value = null;
  void Promise.all([loadSkin(), loadComments(), loadVersions(), loadPermissions()]);
}, { immediate: true });

onUnmounted(() => {
  clearReportStatusPollTimer();
});
</script>

<style scoped lang="scss">
.skin-detail-view {
  min-height: 100vh;
  padding: 24px 0 48px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.state-card {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
  padding: 16px;
}

.summary-tile {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
}

.summary-tile span {
  display: block;
  color: rgba(255,255,255,.55);
  font-size: 12px;
  margin-bottom: 6px;
}

.summary-tile strong {
  color: #fff;
  font-size: 18px;
}

.state-card--error {
  text-align: center;
}

.retry-btn {
  justify-self: center;
  padding: 0.8rem 1.2rem;
  border-radius: 12px;
  border: 0;
  background: linear-gradient(135deg, rgba(124, 140, 255, 0.95), rgba(92, 109, 232, 0.95));
  color: #fff;
  cursor: pointer;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.breadcrumb-link {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: color 0.2s;

  &:hover { color: #fff; }
}

.breadcrumb-separator { color: rgba(255, 255, 255, 0.4); }
.breadcrumb-current { color: #fff; font-weight: 500; }

.skin-detail-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 48px;
}

.preview-section { display: flex; flex-direction: column; gap: 16px; }
.preview-container {
  aspect-ratio: 1;
  background: linear-gradient(135deg, rgba(30, 35, 50, 0.8), rgba(20, 25, 40, 0.9));
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.skin-preview-3d { width: 100%; height: 100%; }
.preview-placeholder {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.4); gap: 12px;
}
.preview-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.control-btn {
  display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; color: rgba(255, 255, 255, 0.8); font-size: 14px; cursor: pointer; transition: all 0.2s;
  &:hover { background: rgba(255, 255, 255, 0.12); }
  &.active { background: rgba(124, 140, 255, 0.2); border-color: rgba(124, 140, 255, 0.4); color: rgba(124, 140, 255, 0.9); }
}
.model-selector { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 14px; color: rgba(255, 255, 255, 0.6); }
.model-select {
  padding: 6px 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; color: #fff; font-size: 14px; cursor: pointer;
  option { background: #1a1d26; }
}

.info-section { display: flex; flex-direction: column; gap: 20px; }
.skin-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.skin-eyebrow { margin: 0 0 0.35rem; color: var(--text-secondary); letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.78rem; }
.skin-name { font-size: clamp(1.8rem, 4vw, 2.2rem); font-weight: 700; color: #fff; margin: 0; line-height: 1.2; }
.skin-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.action-btn {
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; color: rgba(255, 255, 255, 0.7); cursor: pointer; transition: all 0.2s;
  &:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
  &.favorite.active { background: rgba(255, 100, 100, 0.2); border-color: rgba(255, 100, 100, 0.4); color: #ff6464; }
}
.skin-meta { display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.meta-item { display: flex; gap: 8px; color: rgba(255, 255, 255, 0.6); }
.meta-label { color: rgba(255, 255, 255, 0.4); }
.meta-value { color: rgba(255, 255, 255, 0.8); }
.skin-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tag { padding: 4px 10px; background: rgba(124, 140, 255, 0.15); border: 1px solid rgba(124, 140, 255, 0.25); border-radius: 20px; font-size: 12px; color: rgba(124, 140, 255, 0.9); }
.skin-description { font-size: 15px; line-height: 1.6; color: rgba(255, 255, 255, 0.7); margin: 0; }
.skin-stats { display: flex; gap: 24px; padding: 16px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); border-bottom: 1px solid rgba(255, 255, 255, 0.08); flex-wrap: wrap; }
.stat-item { display: flex; align-items: center; gap: 6px; color: rgba(255, 255, 255, 0.6); font-size: 14px; }
.action-buttons { display: flex; gap: 12px; margin-top: auto; flex-wrap: wrap; }
.report-receipt {
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  gap: 8px;
}
.receipt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.receipt-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid transparent;
}
.receipt-status-badge.is-pending {
  color: #facc15;
  background: rgba(250, 204, 21, 0.12);
  border-color: rgba(250, 204, 21, 0.35);
}
.receipt-status-badge.is-reviewed {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
}
.receipt-status-badge.is-dismissed {
  color: #9ca3af;
  background: rgba(156, 163, 175, 0.12);
  border-color: rgba(156, 163, 175, 0.35);
}
.receipt-status-text,
.receipt-note,
.receipt-time {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}
.receipt-actions {
  display: flex;
  justify-content: flex-end;
}
.btn-primary, .btn-secondary { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 24px; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.btn-primary {
  flex: 1; background: linear-gradient(135deg, rgba(124, 140, 255, 0.9), rgba(92, 109, 232, 0.9)); border: none; color: #fff;
  &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(92, 109, 232, 0.4); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}
.btn-secondary { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.8); &:hover { background: rgba(255, 255, 255, 0.12); } }
.related-skins { padding-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.section-title { font-size: 20px; font-weight: 600; color: #fff; margin: 0 0 20px; }
.skins-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }

.detail-extra-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 32px;
}

.detail-extra-card {
  display: grid;
  gap: 12px;
  align-content: start;
}

.detail-extra-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-extra-head .section-title {
  margin: 0;
  font-size: 18px;
}

.section-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.section-empty {
  padding: 14px;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.55);
  font-size: 14px;
}

.comment-editor {
  display: grid;
  gap: 10px;
}

.comment-input {
  width: 100%;
  resize: vertical;
  min-height: 84px;
  max-height: 220px;
  padding: 10px 12px;
  border-radius: 10px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.04);
}

.comment-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.comment-list,
.version-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.comment-item,
.version-item {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
}

.comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.comment-head time {
  color: rgba(255, 255, 255, 0.5);
}

.comment-content {
  margin: 8px 0 10px;
  color: rgba(255, 255, 255, 0.86);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-action-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.comment-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.comment-action-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.comment-action-btn.danger {
  color: #ff8e8e;
  border-color: rgba(255, 120, 120, 0.35);
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.version-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.56);
}

.btn-small {
  padding: 8px 12px;
  font-size: 13px;
}

@media (max-width: 768px) {
  .skin-detail-view { padding-top: 16px; }
  .container { padding-inline: 16px; }
  .skin-detail-content { grid-template-columns: 1fr; gap: 22px; }
  .detail-extra-grid { grid-template-columns: 1fr; }
  .preview-controls { align-items: stretch; }
  .model-selector { margin-left: 0; width: 100%; justify-content: space-between; }
  .action-buttons { flex-direction: column; }
}
</style>
