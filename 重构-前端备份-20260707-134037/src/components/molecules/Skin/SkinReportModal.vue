<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="report-modal">
          <div class="modal-header">
            <h3>举报皮肤</h3>
            <button class="close-btn" @click="close">
              <AppIcon name="x" :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <div class="skin-info" v-if="reportSkin">
              <img :src="reportSkin.previewUrl || reportSkin.skinUrl" :alt="reportSkin.name" class="skin-thumb">
              <div class="info-text">
                <h4>{{ reportSkin.name }}</h4>
                <span class="skin-id">ID: {{ reportSkin.id }}</span>
              </div>
            </div>

            <form @submit.prevent="submitReport">
              <div class="form-group">
                <label>举报原因 <span class="required">*</span></label>
                <div class="reason-options">
                  <label
                    v-for="reason in reportReasons"
                    :key="reason.value"
                    :class="['reason-option', { selected: selectedReason === reason.value }]"
                  >
                    <input
                      type="radio"
                      :value="reason.value"
                      v-model="selectedReason"
                      name="reason"
                    >
                    <span class="radio-indicator"></span>
                    <span class="reason-label">
                      <AppIcon :name="reason.icon as any" :size="16" />
                      {{ reason.label }}
                    </span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label for="detail">补充说明</label>
                <textarea
                  id="detail"
                  v-model="detail"
                  rows="4"
                  maxlength="500"
                  placeholder="请详细描述举报原因，有助于管理员快速处理..."
                ></textarea>
                <span class="char-count">{{ detail.length }}/500</span>
              </div>

              <div class="form-notice">
                <AppIcon name="info" :size="14" />
                <span>恶意举报将被追究责任</span>
              </div>

              <div class="form-actions">
                <button type="button" class="mc-button" @click="close">取消</button>
                <button
                  type="submit"
                  class="mc-button primary"
                  :disabled="!selectedReason || submitting"
                >
                  <AppIcon v-if="submitting" name="loader" :size="14" class="spin" />
                  <span v-else>提交举报</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import { useToastStore } from '@/stores/toast';
import type { LibraryItem } from '@/features/skin/types';

interface Props {
  visible: boolean;
  skin?: LibraryItem | null;
  skinId?: string;
  skinName?: string;
}

interface ReportSubmitPayload {
  skinId: string;
  reason: string;
  detail: string;
}

interface ReportSubmittedSnapshot extends ReportSubmitPayload {
  reportId: string;
  status: string;
  statusText: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  'submit': [data: ReportSubmitPayload];
  'submitted': [data: ReportSubmittedSnapshot];
}>();

const toast = useToastStore();

const reportSkin = computed(() => props.skin || (props.skinId ? { id: props.skinId, name: props.skinName || props.skinId, skinUrl: '', previewUrl: '' } as LibraryItem : null));

const reportReasons = [
  { value: 'copyright', label: '版权投诉', icon: 'shield' },
  { value: 'nsfw', label: '色情低俗', icon: 'warning' },
  { value: 'spam', label: '垃圾广告', icon: 'flag' },
  { value: 'other', label: '其他违规', icon: 'warning' },
];

const selectedReason = ref('');
const detail = ref('');
const submitting = ref(false);

function close() {
  emit('update:visible', false);
  // 重置表单
  setTimeout(() => {
    selectedReason.value = '';
    detail.value = '';
  }, 300);
}

async function submitReport() {
  if (!reportSkin.value || !selectedReason.value) return;

  submitting.value = true;
  try {
    const payload: ReportSubmitPayload = {
      skinId: reportSkin.value.id,
      reason: selectedReason.value,
      detail: detail.value,
    };

    const { submitSkinReport } = await import('@/features/skin/api-report');
    const result = await submitSkinReport(payload);
    const reportId = String(result?.reportId || '').trim();
    const status = String(result?.status || 'pending').trim() || 'pending';
    const statusText = String(result?.statusText || '已提交，等待审核').trim() || '已提交，等待审核';

    emit('submit', payload);
    emit('submitted', {
      ...payload,
      reportId,
      status,
      statusText,
    });

    toast.addToast({
      type: 'success',
      message: reportId ? `举报已提交（编号：${reportId}）` : '举报已提交，感谢反馈',
    });

    close();
  } catch (error) {
    toast.addToast({
      type: 'error',
      message: '提交失败，请重试',
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
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

.report-modal {
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #444;
  
  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.1rem;
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

.modal-body {
  padding: 1.25rem;
}

.skin-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  
  .skin-thumb {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 4px;
    image-rendering: pixelated;
  }
  
  .info-text {
    h4 {
      margin: 0 0 0.25rem;
      color: var(--text-primary);
      font-size: 1rem;
    }
    
    .skin-id {
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-family: monospace;
    }
  }
}

.form-group {
  margin-bottom: 1.25rem;
  
  label {
    display: block;
    color: var(--text-primary);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    
    .required {
      color: #ef4444;
    }
  }
}

.reason-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reason-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(0, 0, 0, 0.3);
  }
  
  &.selected {
    border-color: var(--accent-color, #00d4ff);
    background: rgba(0, 212, 255, 0.1);
  }
  
  input {
    position: absolute;
    opacity: 0;
  }
}

.radio-indicator {
  width: 18px;
  height: 18px;
  border: 2px solid #666;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
  
  .reason-option.selected & {
    border-color: var(--accent-color, #00d4ff);
    
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 8px;
      height: 8px;
      background: var(--accent-color, #00d4ff);
      border-radius: 50%;
    }
  }
}

.reason-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
  font-size: 0.9rem;
}

textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #555;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.9rem;
  resize: vertical;
  
  &:focus {
    outline: none;
    border-color: var(--accent-color, #00d4ff);
  }
  
  &::placeholder {
    color: var(--text-secondary);
  }
}

.char-count {
  display: block;
  text-align: right;
  color: var(--text-secondary);
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.form-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 6px;
  color: #eab308;
  font-size: 0.85rem;
  margin-bottom: 1.25rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
