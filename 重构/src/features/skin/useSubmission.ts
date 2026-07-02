/**
 * 用户皮肤投稿 - 状态管理 Hook
 * 管理投稿表单、文件验证、列表展示
 */

import { computed, reactive } from 'vue';
import { useToastStore } from '@/stores/toast';
import { fetchSubmissionList, createSubmissionWithForm, deleteSubmission, resubmitSubmission } from './api-submission';
import type { SubmissionModel, SubmissionRecord, SubmissionStatus } from '@/types/skin-submission';

// ============ 常量 ============

const SKIN_MIME_TYPES = ['image/png', 'image/webp'];
const CAPE_MIME_TYPES = ['image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const VALID_SKIN_WIDTHS = [64, 128];
const VALID_SKIN_HEIGHTS = [32, 64, 128];
const CAPE_W = 22;
const CAPE_H = 17;
const PAGE_SIZE = 10;

// ============ 状态 ============

interface FormFile {
  name: string;
  size: number;
  type: string;
  previewUrl: string;
}

export function useSubmission() {
  const toast = useToastStore();

  const state = reactive({
    items: [] as SubmissionRecord[],
    total: 0,
    page: 1,
    loading: false,
    submitting: false,
    deleting: false,
    statusFilter: '' as '' | SubmissionStatus,
  });

  const form = reactive({
    name: '',
    description: '',
    tagsInput: '',
    model: 'default' as SubmissionModel,
    skinFile: null as FormFile | null,
    capeFile: null as FormFile | null,
  });

  // ============ 计算 ============

  const totalPages = computed(() => Math.ceil(state.total / PAGE_SIZE));
  const filteredItems = computed(() => {
    if (!state.statusFilter) return state.items;
    return state.items.filter((item) => item.status === state.statusFilter);
  });

  const canSubmit = computed(
    () =>
      form.name.trim().length > 0 &&
      form.skinFile !== null &&
      !state.submitting,
  );

  // ============ 文件验证 ============

  function readDimensions(file: File): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片尺寸')); };
      img.src = url;
    });
  }

  async function makeFormFile(file: File, validate: (f: File) => Promise<void>): Promise<FormFile> {
    await validate(file);
    return { name: file.name, size: file.size, type: file.type, previewUrl: URL.createObjectURL(file) };
  }

  async function validateSkin(file: File) {
    if (!SKIN_MIME_TYPES.includes(file.type)) throw new Error('皮肤文件只支持 PNG / WebP');
    if (file.size > MAX_FILE_SIZE) throw new Error('皮肤文件不能超过 2MB');
    const { w, h } = await readDimensions(file);
    if (!VALID_SKIN_WIDTHS.includes(w) || !VALID_SKIN_HEIGHTS.includes(h)) {
      throw new Error(`皮肤尺寸无效。有效：${VALID_SKIN_WIDTHS.flatMap(x => VALID_SKIN_HEIGHTS.map(h => `${x}×${h}`)).join('、')}。实际：${w}×${h}`);
    }
  }

  async function validateCape(file: File) {
    if (!CAPE_MIME_TYPES.includes(file.type)) throw new Error('披风文件只支持 PNG / WebP');
    if (file.size > MAX_FILE_SIZE) throw new Error('披风文件不能超过 2MB');
    const { w, h } = await readDimensions(file);
    if (w !== CAPE_W || h !== CAPE_H) throw new Error(`披风尺寸必须是 ${CAPE_W}×${CAPE_H}，实际：${w}×${h}`);
  }

  function revoke(f: FormFile | null) { if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl); }

  // ============ 文件操作 ============

  async function selectSkinFile(file: File) {
    revoke(form.skinFile);
    try { form.skinFile = await makeFormFile(file, validateSkin); }
    catch (e) { toast.addToast({ type: 'error', message: e instanceof Error ? e.message : '皮肤文件无效' }); form.skinFile = null; }
  }

  async function selectCapeFile(file: File) {
    revoke(form.capeFile);
    try { form.capeFile = await makeFormFile(file, validateCape); }
    catch (e) { toast.addToast({ type: 'error', message: e instanceof Error ? e.message : '披风文件无效' }); form.capeFile = null; }
  }

  function clearSkinFile() { revoke(form.skinFile); form.skinFile = null; }
  function clearCapeFile() { revoke(form.capeFile); form.capeFile = null; }

  // ============ 拖拽 ============

  function onDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation(); }

  async function onSkinDrop(e: DragEvent) {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer?.files?.[0]; if (f) await selectSkinFile(f);
  }

  async function onCapeDrop(e: DragEvent) {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer?.files?.[0]; if (f) await selectCapeFile(f);
  }

  // ============ 提交 ============

  async function submitForm() {
    if (!canSubmit.value || !form.skinFile) return;
    state.submitting = true;

    try {
      // 构建 File 对象
      const skinBlob = await fetch(form.skinFile.previewUrl).then(r => r.blob());
      const skinFileObj = new File([skinBlob], form.skinFile.name, { type: form.skinFile.type });

      let capeFileObj: File | null = null;
      if (form.capeFile) {
        const capeBlob = await fetch(form.capeFile.previewUrl).then(r => r.blob());
        capeFileObj = new File([capeBlob], form.capeFile.name, { type: form.capeFile.type });
      }

      const tags = form.tagsInput.split(',').map(t => t.trim()).filter(Boolean);

      await createSubmissionWithForm(
        form.name.trim(),
        form.description.trim(),
        tags,
        form.model,
        skinFileObj,
        capeFileObj,
      );

      toast.addToast({ type: 'success', message: '投稿成功！请等待审核。' });
      resetForm();
      await loadList(1);
    } catch (err) {
      toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '投稿失败，请重试' });
    } finally {
      state.submitting = false;
    }
  }

  function resetForm() {
    revoke(form.skinFile);
    revoke(form.capeFile);
    form.name = '';
    form.description = '';
    form.tagsInput = '';
    form.model = 'default';
    form.skinFile = null;
    form.capeFile = null;
  }

  // ============ 列表 ============

  async function loadList(page = state.page) {
    state.loading = true;
    try {
      const result = await fetchSubmissionList({ page, pageSize: PAGE_SIZE });
      state.items = result.items;
      state.total = result.total;
      state.page = result.page;
    } catch (err) {
      toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '加载失败' });
    } finally {
      state.loading = false;
    }
  }

  function setStatusFilter(status: '' | SubmissionStatus) {
    state.statusFilter = status;
  }

  function clearStatusFilter() {
    state.statusFilter = '';
  }

  async function goToPage(page: number) { await loadList(page); }

  // ============ 删除（取消投稿）============

  async function deleteItem(id: string) {
    state.deleting = true;
    try {
      await deleteSubmission(id);
      toast.addToast({ type: 'success', message: '已取消投稿' });
      const prevPage = state.page;
      await loadList(state.page);
      if (state.items.length === 0 && prevPage > 1) {
        await loadList(prevPage - 1);
      }
    } catch (err) {
      toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '取消失败' });
    } finally {
      state.deleting = false;
    }
  }

  async function resubmitItem(id: string, note = '') {
    state.submitting = true;
    try {
      await resubmitSubmission(id, note);
      toast.addToast({ type: 'success', message: '已重新提交审核' });
      await loadList(state.page);
    } catch (err) {
      toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '重新提交失败' });
    } finally {
      state.submitting = false;
    }
  }

  // ============ 初始化 ============
  loadList();

  return {
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
  };
}
