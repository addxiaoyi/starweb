/**
 * 审核中心 Hook
 */

import { computed, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { fetchReviewHistory, fetchReviewList, reopenReviewSubmission, reviewSubmission } from './api-review';
import type { ReviewForm, ReviewHistoryItem, ReviewRecord } from '@/types/skin-review';

export type ReviewCenterFilters = {
  status: '' | 'pending' | 'approved' | 'rejected';
  sort: 'newest' | 'oldest';
  keyword: string;
};

export function useReviewCenter() {
  const auth = useAuthStore();

  const state = reactive({
    list: [] as ReviewRecord[],
    total: 0,
    page: 1,
    pageSize: 10,
    loading: false,
    actionLoading: false,
    historyLoading: false,
    historyError: '',
    historyItems: [] as ReviewHistoryItem[],
    error: '',
    successMessage: '',
  });

  let listRequestSeq = 0;
  let successTimer: ReturnType<typeof setTimeout> | null = null;

  const filters = reactive<ReviewCenterFilters>({
    status: '',
    sort: 'newest',
    keyword: '',
  });

  const selectedRecord = ref<ReviewRecord | null>(null);

  const reviewForm = reactive<ReviewForm>({
    action: 'approve',
    note: '',
  });

  const totalPages = computed(() => Math.max(1, Math.ceil(state.total / state.pageSize)));
  const canReview = computed(() => auth.canReviewSubmissions);

  const filteredList = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    const base = state.list.filter((record) => {
      if (filters.status && record.status !== filters.status) return false;
      if (!keyword) return true;
      const haystack = [
        record.title,
        record.authorName,
        record.description,
        ...(record.tags ?? []),
        record.reviewNote,
        record.reviewerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
    return [...base].sort((a, b) => {
      const left = new Date(a.submittedAt).getTime();
      const right = new Date(b.submittedAt).getTime();
      return filters.sort === 'newest' ? right - left : left - right;
    });
  });

  const pendingCount = computed(() => state.list.filter((r) => r.status === 'pending').length);

  function notifyReceiptText(payload?: { queued?: boolean; notificationId?: string }) {
    if (!payload || payload.queued === undefined) return '';
    if (payload.queued) {
      const id = String(payload.notificationId || '').trim();
      return id ? `，通知已入站内消息（${id}）` : '，通知已入站内消息';
    }
    return '，通知未入队';
  }

  async function loadList(nextPage = state.page) {
    const requestSeq = ++listRequestSeq;
    state.loading = true;
    state.error = '';
    state.page = nextPage;
    try {
      const res = await fetchReviewList({
        page: state.page,
        pageSize: state.pageSize,
        status: filters.status || 'all',
        keyword: filters.keyword || undefined,
      });
      if (requestSeq !== listRequestSeq) return;
      state.list = res.records;
      state.total = res.total;
      state.page = res.page || state.page;
      state.pageSize = res.pageSize || state.pageSize;
      if (selectedRecord.value) {
        const latest = res.records.find((r) => r.id === selectedRecord.value?.id) || null;
        selectedRecord.value = latest;
        if (!latest) state.historyItems = [];
      }
    } catch (err) {
      if (requestSeq !== listRequestSeq) return;
      state.error = err instanceof Error ? err.message : '加载失败，请稍后重试';
    } finally {
      if (requestSeq === listRequestSeq) {
        state.loading = false;
      }
    }
  }

  async function loadHistory(id: string) {
    state.historyLoading = true;
    state.historyError = '';
    try {
      const result = await fetchReviewHistory(id, { page: 1, pageSize: 30 });
      state.historyItems = result.items;
    } catch (err) {
      state.historyItems = [];
      state.historyError = err instanceof Error ? err.message : '加载审核历史失败';
    } finally {
      state.historyLoading = false;
    }
  }

  function selectRecord(record: ReviewRecord) {
    selectedRecord.value = record;
    reviewForm.action = 'approve';
    reviewForm.note = '';
    state.successMessage = '';
    if (successTimer) {
      clearTimeout(successTimer);
      successTimer = null;
    }
    void loadHistory(record.id);
  }

  function clearSelection() {
    selectedRecord.value = null;
    state.historyItems = [];
    state.historyError = '';
  }

  function clearSuccessMessage() {
    state.successMessage = '';
    if (successTimer) {
      clearTimeout(successTimer);
      successTimer = null;
    }
  }

  function setFilters(next: Partial<ReviewCenterFilters>) {
    Object.assign(filters, next);
    state.page = 1;
    clearSelection();
    clearSuccessMessage();
    void loadList(1);
  }

  function resetFilters() {
    filters.status = '';
    filters.sort = 'newest';
    filters.keyword = '';
    state.page = 1;
    clearSelection();
    clearSuccessMessage();
    void loadList(1);
  }

  async function submitReview() {
    if (!selectedRecord.value || !canReview.value) return;
    const id = selectedRecord.value.id;
    if (reviewForm.action === 'reject' && reviewForm.note.trim().length === 0) {
      state.error = '驳回时必须填写原因';
      return;
    }
    state.actionLoading = true;
    state.error = '';
    state.successMessage = '';
    try {
      const result = await reviewSubmission(
        id,
        reviewForm.action,
        reviewForm.note.trim(),
        Number(selectedRecord.value.reviewVersion || 0)
      );
      const base = reviewForm.action === 'approve' ? '投稿已通过审核' : '投稿已驳回';
      state.successMessage = `${base}${notifyReceiptText(result.notify)}`;
      if (successTimer) clearTimeout(successTimer);
      successTimer = setTimeout(() => {
        state.successMessage = '';
        successTimer = null;
      }, 3500);
      await loadList(state.page);
      if (selectedRecord.value) {
        await loadHistory(selectedRecord.value.id);
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '操作失败，请稍后重试';
      if (state.error.includes('版本冲突')) {
        await loadList(state.page);
      }
    } finally {
      state.actionLoading = false;
    }
  }

  async function reopenSelected(note = '') {
    if (!selectedRecord.value || !canReview.value) return;
    if (selectedRecord.value.status === 'pending') {
      state.error = '该投稿已处于待审核状态';
      return;
    }
    state.actionLoading = true;
    state.error = '';
    state.successMessage = '';
    try {
      const result = await reopenReviewSubmission(
        selectedRecord.value.id,
        note.trim(),
        Number(selectedRecord.value.reviewVersion || 0)
      );
      state.successMessage = `投稿已回退到待审核${notifyReceiptText(result.notify)}`;
      if (successTimer) clearTimeout(successTimer);
      successTimer = setTimeout(() => {
        state.successMessage = '';
        successTimer = null;
      }, 3500);
      await loadList(state.page);
      if (selectedRecord.value) await loadHistory(selectedRecord.value.id);
    } catch (err) {
      state.error = err instanceof Error ? err.message : '回退待审失败';
      if (state.error.includes('版本冲突')) {
        await loadList(state.page);
      }
    } finally {
      state.actionLoading = false;
    }
  }

  function goPage(p: number) {
    if (p < 1 || p > totalPages.value) return;
    void loadList(p);
  }

  void loadList(1);

  return {
    state,
    filters,
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
  };
}
