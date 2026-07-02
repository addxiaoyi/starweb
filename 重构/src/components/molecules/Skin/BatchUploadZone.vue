<template>
  <div
    :class="['batch-upload-zone', { dragging, hasFiles: files.length > 0 }]"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="handleDrop"
  >
    <!-- 拖拽区域 -->
    <div v-if="files.length === 0" class="drop-zone">
      <div class="drop-content">
        <AppIcon name="upload" :size="48" class="upload-icon" />
        <h3>拖拽 ZIP 文件到此处</h3>
        <p>或 <button class="text-link" @click="triggerFileInput">点击选择文件</button></p>
        <p class="hint">支持 .zip 格式，内含多张 PNG 皮肤（64x64 / 64x32）</p>
      </div>
    </div>

    <!-- 文件列表 -->
    <div v-else class="file-list">
      <div class="list-header">
        <h4>检测到 {{ validFiles.length }} 个有效皮肤</h4>
        <button class="text-btn" @click="clearFiles">
          <AppIcon name="trash" :size="14" />
          清空
        </button>
      </div>

      <div class="files-grid">
        <div
          v-for="(file, index) in files"
          :key="index"
          :class="['file-item', { valid: file.valid, invalid: !file.valid }]"
        >
          <div class="file-preview">
            <img v-if="file.preview" :src="file.preview" :alt="file.name" class="preview-img">
            <div v-else class="no-preview">
              <AppIcon name="file" :size="24" />
            </div>
          </div>
          <div class="file-info">
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
            <span :class="['file-status', file.valid ? 'valid' : 'invalid']">
              <AppIcon :name="file.valid ? 'check' : 'close'" :size="12" />
              {{ file.valid ? '有效' : file.error }}
            </span>
          </div>
          <button class="remove-btn" @click="removeFile(index)">
            <AppIcon name="close" :size="14" />
          </button>
        </div>
      </div>

      <!-- 上传进度 -->
      <div v-if="uploading" class="upload-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${uploadProgress}%` }"></div>
        </div>
        <span class="progress-text">{{ uploadedCount }} / {{ validFiles.length }} 已上传</span>
      </div>

      <!-- 操作按钮 -->
      <div class="upload-actions">
        <button class="mc-button" @click="clearFiles" :disabled="uploading">
          取消
        </button>
        <button
          class="mc-button primary"
          @click="startUpload"
          :disabled="validFiles.length === 0 || uploading"
        >
          <AppIcon v-if="uploading" name="refresh" :size="14" class="spin" />
          <span v-else>
            开始上传 ({{ validFiles.length }})
          </span>
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".zip"
      style="display: none"
      @change="handleFileSelect"
    >
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import { useToastStore } from '@/stores/toast';
import { apiJsonWithAuth } from '@/shared/utils/security';

interface SkinFile {
  name: string;
  size: number;
  data: Blob;
  preview?: string;
  valid: boolean;
  error?: string;
}

const emit = defineEmits<{
  'upload': [files: SkinFile[]];
  'submitted': [payload: { items: Array<{ id: string; fileName: string }> }];
}>();

const toast = useToastStore();
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const files = ref<SkinFile[]>([]);
const uploading = ref(false);
const uploadProgress = ref(0);
const uploadedCount = ref(0);

const validFiles = computed(() => files.value.filter(f => f.valid));

function triggerFileInput() {
  fileInput.value?.click();
}

async function handleDrop(e: DragEvent) {
  dragging.value = false;
  const droppedFiles = e.dataTransfer?.files;
  if (droppedFiles?.length) {
    await processZipFile(droppedFiles[0]);
  }
}

async function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const selectedFile = target.files?.[0];
  if (selectedFile) {
    await processZipFile(selectedFile);
  }
}

async function processZipFile(zipFile: File) {
  if (!zipFile.name.endsWith('.zip')) {
    toast.addToast({
      type: 'error',
      message: '请选择 ZIP 文件',
    });
    return;
  }

  try {
    const JSZip = await import('jszip');
    const zip = await JSZip.default.loadAsync(zipFile);
    
    const skinFiles: SkinFile[] = [];
    
    for (const [filename, file] of Object.entries(zip.files as Record<string, { dir?: boolean; async: (type: string) => Promise<Blob> }>)) {
      // 跳过目录和非 PNG 文件
      if (file.dir || !filename.endsWith('.png')) continue;
      
      const content = await file.async('blob');
      const skinFile: SkinFile = {
        name: filename.split('/').pop() || filename,
        size: content.size,
        data: content,
        valid: false
      };
      
      // 验证 PNG 格式和尺寸
      const validation = await validateSkinFile(content);
      skinFile.valid = validation.valid;
      skinFile.error = validation.error;
      
      if (validation.valid) {
        // 生成预览
        skinFile.preview = URL.createObjectURL(content);
      }
      
      skinFiles.push(skinFile);
    }
    
    files.value = skinFiles;
    
    toast.addToast({
      type: 'success',
      message: `解析完成，发现 ${skinFiles.filter(f => f.valid).length} 个有效皮肤`,
    });
  } catch (error) {
    toast.addToast({
      type: 'error',
      message: 'ZIP 文件解析失败',
    });
  }
}

async function validateSkinFile(blob: Blob): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      // 验证尺寸：标准皮肤 64x64 或旧版 64x32
      if (img.width === 64 && (img.height === 64 || img.height === 32)) {
        resolve({ valid: true });
      } else {
        resolve({ 
          valid: false, 
          error: `尺寸不符 (${img.width}x${img.height})` 
        });
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, error: '无效图片' });
    };
    
    img.src = url;
  });
}

function removeFile(index: number) {
  const file = files.value[index];
  if (file.preview) {
    URL.revokeObjectURL(file.preview);
  }
  files.value.splice(index, 1);
}

function clearFiles() {
  files.value.forEach(file => {
    if (file.preview) {
      URL.revokeObjectURL(file.preview);
    }
  });
  files.value = [];
  uploadProgress.value = 0;
  uploadedCount.value = 0;
}

async function startUpload() {
  if (validFiles.value.length === 0) return;
  
  uploading.value = true;
  uploadProgress.value = 0;
  uploadedCount.value = 0;

  try {
    const formData = new FormData();
    validFiles.value.forEach((file) => {
      formData.append('files', file.data, file.name);
    });
    formData.append('model', 'auto');
    const result = await apiJsonWithAuth<{ ok?: boolean; items?: Array<{ id: string; fileName: string }>; message?: string }>('/api/skins/player/submissions/batch', null, {
      method: 'POST',
      body: formData
    });

    if (result.response.ok) {
      uploadProgress.value = 100;
      uploadedCount.value = validFiles.value.length;
      emit('submitted', { items: result.data?.items || [] });
      toast.addToast({
        type: 'success',
        message: result.data?.message || '上传完成'
      });
      clearFiles();
    } else {
      throw new Error(result.data?.message || '上传失败');
    }
  } catch (error) {
    toast.addToast({
      type: 'error',
      message: '上传失败，请重试'
    });
  } finally {
    uploading.value = false;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
</script>

<style scoped lang="scss">
.batch-upload-zone {
  border: 2px dashed #555;
  border-radius: 12px;
  padding: 2rem;
  transition: all 0.3s;
  
  &.dragging {
    border-color: var(--accent-color, #00d4ff);
    background: rgba(0, 212, 255, 0.05);
  }
  
  &.hasFiles {
    border-style: solid;
    background: rgba(0, 0, 0, 0.2);
  }
}

.drop-zone {
  text-align: center;
}

.drop-content {
  .upload-icon {
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }
  
  h3 {
    color: var(--text-primary);
    margin: 0 0 0.5rem;
  }
  
  p {
    color: var(--text-secondary);
    margin: 0.25rem 0;
  }
  
  .text-link {
    background: none;
    border: none;
    color: var(--accent-color, #00d4ff);
    cursor: pointer;
    text-decoration: underline;
    
    &:hover {
      opacity: 0.8;
    }
  }
  
  .hint {
    font-size: 0.85rem;
    opacity: 0.7;
  }
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  
  h4 {
    margin: 0;
    color: var(--text-primary);
  }
  
  .text-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    font-size: 0.85rem;
    
    &:hover {
      opacity: 0.8;
    }
  }
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.file-item {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid #444;
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
  
  &.valid {
    border-color: #22c55e;
  }
  
  &.invalid {
    border-color: #ef4444;
    opacity: 0.7;
  }
}

.file-preview {
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  
  .preview-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }
  
  .no-preview {
    color: var(--text-secondary);
  }
}

.file-info {
  padding: 0.75rem;
  
  .file-name {
    display: block;
    color: var(--text-primary);
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 0.25rem;
  }
  
  .file-size {
    display: block;
    color: var(--text-secondary);
    font-size: 0.7rem;
    margin-bottom: 0.25rem;
  }
  
  .file-status {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    
    &.valid {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    
    &.invalid {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
  }
}

.remove-btn {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  
  &:hover {
    color: #ef4444;
  }
}

.upload-progress {
  margin-bottom: 1rem;
  
  .progress-bar {
    height: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--accent-color, #00d4ff);
    transition: width 0.3s;
  }
  
  .progress-text {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
}

.upload-actions {
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
</style>
