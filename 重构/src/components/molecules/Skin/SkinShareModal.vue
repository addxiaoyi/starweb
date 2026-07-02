<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="share-modal">
          <div class="modal-header">
            <h3>{{ title }}</h3>
            <button class="close-btn" @click="close">
              <AppIcon name="x" :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <div class="share-summary">
              <div class="summary-card">
                <span class="summary-label">分享状态</span>
                <span class="summary-value">可复制链接、嵌入代码和二维码</span>
              </div>
              <div class="summary-card">
                <span class="summary-label">适用场景</span>
                <span class="summary-value">聊天、论坛、博客和个人主页</span>
              </div>
            </div>

            <div v-if="statusMessage" class="status-banner" :class="statusType">
              <AppIcon :name="statusType === 'success' ? 'check' : 'info'" :size="14" />
              <span>{{ statusMessage }}</span>
            </div>

            <!-- 分享链接 -->
            <div class="share-section">
              <label>分享链接</label>
              <div class="input-group">
                <input
                  ref="urlInput"
                  type="text"
                  :value="shareUrl"
                  readonly
                  class="share-input"
                >
                <button
                  class="mc-button primary"
                  @click="copyToClipboard(shareUrl, 'url')"
                  :class="{ success: copied.url }"
                >
                  <AppIcon :name="copied.url ? 'check' : 'share'" :size="14" />
                  {{ copied.url ? '已复制' : '复制' }}
                </button>
              </div>
            </div>

            <!-- 嵌入代码 -->
            <div class="share-section">
              <label>嵌入代码（iframe）</label>
              <div class="input-group">
                <textarea
                  ref="embedInput"
                  :value="embedCode"
                  readonly
                  class="share-textarea"
                  rows="3"
                ></textarea>
                <button
                  class="mc-button primary"
                  @click="copyToClipboard(embedCode, 'embed')"
                  :class="{ success: copied.embed }"
                >
                  <AppIcon :name="copied.embed ? 'check' : 'share'" :size="14" />
                  {{ copied.embed ? '已复制' : '复制' }}
                </button>
              </div>
            </div>

            <!-- 二维码 -->
            <div class="share-section qr-section">
              <label>二维码</label>
              <div class="qr-code" ref="qrContainer">
                <canvas ref="qrCanvas"></canvas>
              </div>
              <p class="qr-tip">手机可长按二维码保存</p>
              <button class="mc-button" @click="downloadQR">
                <AppIcon name="download" :size="14" />
                下载二维码
              </button>
            </div>

            <!-- 社交分享 -->
            <div class="share-section">
              <label>分享到</label>
              <div class="social-share">
                <button
                  v-for="platform in sharePlatforms"
                  :key="platform.name"
                  class="social-btn"
                  :style="{ background: platform.color }"
                  @click="shareTo(platform)"
                >
                  <AppIcon :name="platform.icon as any" :size="18" />
                  <span>{{ platform.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="mc-button" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';

interface Props {
  visible: boolean;
  shareUrl: string;
  embedCode: string;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '分享皮肤'
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const copied = ref({ url: false, embed: false });
const qrCanvas = ref<HTMLCanvasElement | null>(null);
const statusMessage = ref('');
const statusType = ref<'success' | 'info'>('info');

const sharePlatforms = [
  { name: 'twitter', label: 'Twitter', icon: 'share', color: '#1da1f2' },
  { name: 'facebook', label: 'Facebook', icon: 'share', color: '#4267b2' },
  { name: 'weibo', label: '微博', icon: 'share', color: '#e6162d' },
  { name: 'qq', label: 'QQ', icon: 'share', color: '#12b7f5' },
];

// 生成二维码
watch(() => props.visible, async (visible) => {
  if (visible && props.shareUrl) {
    await nextTick();
    generateQR();
  }
});

async function generateQR() {
  if (!qrCanvas.value) return;
  
  try {
    // 动态导入 QRCode 库
    const QRCode = await import('qrcode');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (QRCode as any).toCanvas(qrCanvas.value, props.shareUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (error) {
    console.error('QR generation failed:', error);
  }
}

function close() {
  emit('update:visible', false);
  copied.value = { url: false, embed: false };
  statusMessage.value = '';
}

function setStatus(message: string, type: 'success' | 'info' = 'info') {
  statusMessage.value = message;
  statusType.value = type;
  window.setTimeout(() => {
    if (statusMessage.value === message) {
      statusMessage.value = '';
    }
  }, 2200);
}

async function copyToClipboard(text: string, type: 'url' | 'embed') {
  try {
    await navigator.clipboard.writeText(text);
    copied.value[type] = true;
    setStatus(type === 'url' ? '分享链接已复制，可以直接发送给朋友' : '嵌入代码已复制，可以粘贴到网页中', 'success');
    setTimeout(() => {
      copied.value[type] = false;
    }, 2000);
  } catch {
    // Fallback
    const input = type === 'url' 
      ? document.querySelector('input.share-input') as HTMLInputElement
      : document.querySelector('textarea.share-textarea') as HTMLTextAreaElement;
    if (input) {
      input.select();
      document.execCommand('copy');
      copied.value[type] = true;
      setStatus(type === 'url' ? '分享链接已复制，可以直接发送给朋友' : '嵌入代码已复制，可以粘贴到网页中', 'success');
      setTimeout(() => {
        copied.value[type] = false;
      }, 2000);
    } else {
      setStatus('复制失败，请手动选择文本后复制', 'info');
    }
  }
}

function downloadQR() {
  if (!qrCanvas.value) return;
  const link = document.createElement('a');
  link.download = 'skin-share-qr.png';
  link.href = qrCanvas.value.toDataURL('image/png');
  link.click();
}

function shareTo(platform: typeof sharePlatforms[0]) {
  const urls: Record<string, string> = {
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(props.shareUrl)}&text=${encodeURIComponent('看看这个 Minecraft 皮肤！')}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(props.shareUrl)}`,
    weibo: `https://service.weibo.com/share/share.php?url=${encodeURIComponent(props.shareUrl)}&title=${encodeURIComponent('看看这个 Minecraft 皮肤！')}`,
    qq: `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(props.shareUrl)}&title=${encodeURIComponent('看看这个 Minecraft 皮肤！')}`,
  };
  
  const url = urls[platform.name];
  if (url) {
    window.open(url, '_blank', 'width=600,height=400');
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

.share-modal {
  background: linear-gradient(180deg, rgba(25, 25, 25, 0.98), rgba(20, 20, 20, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
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

.share-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  font-size: 0.9rem;

  &.success {
    background: rgba(34, 197, 94, 0.12);
    color: #bbf7d0;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  &.info {
    background: rgba(0, 212, 255, 0.1);
    color: #bae6fd;
    border: 1px solid rgba(0, 212, 255, 0.22);
  }
}

.summary-card {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.summary-label {
  display: block;
  color: var(--text-secondary);
  font-size: 0.75rem;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.summary-value {
  color: var(--text-primary);
  font-size: 0.92rem;
}

.share-section {
  margin-bottom: 1.25rem;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  label {
    display: block;
    color: var(--text-secondary);
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
}

.input-group {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.share-input,
.share-textarea {
  flex: 1;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: monospace;
  transition: border-color 0.2s, box-shadow 0.2s;
  
  &:focus {
    outline: none;
    border-color: var(--accent-color, #00d4ff);
    box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.12);
  }
}

.share-textarea {
  resize: none;
}

.mc-button {
  &.success {
    background: #22c55e;
    border-color: #22c55e;
  }
}

.qr-section {
  text-align: center;
  
  .qr-code {
    display: inline-block;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    margin-bottom: 0.75rem;
    
    canvas {
      display: block;
    }
  }
}

.qr-tip {
  margin: 0 0 0.75rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

@media (max-width: 768px) {
  .share-modal {
    max-width: 100%;
    border-radius: 14px;
  }

  .share-summary {
    grid-template-columns: 1fr;
  }

  .input-group {
    flex-direction: column;
  }

  .social-share {
    grid-template-columns: repeat(2, 1fr);
  }

  .modal-footer {
    justify-content: stretch;

    .mc-button {
      width: 100%;
    }
  }
}

.social-share {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.social-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.85rem 0.5rem;
  border: none;
  border-radius: 12px;
  color: white;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.15);
  
  &:hover {
    transform: translateY(-2px);
    opacity: 0.95;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
  }
  
  span {
    font-size: 0.75rem;
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 1rem 1.25rem;
  border-top: 1px solid #444;
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
