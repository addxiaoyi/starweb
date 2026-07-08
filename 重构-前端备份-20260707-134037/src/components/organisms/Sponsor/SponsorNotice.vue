<template>
  <div class="notice-content">
    <div class="text-container">
      <p class="main-text">
        <span class="highlight-gold">致 玩家：</span><br><br>
        这是一个公益服务器<br>
        赞助基本<span class="highlight-red">没有任何</span>游戏内特权或数值奖励<br>
        所有的资金将用于服务器续费与维护（甚至红包回馈玩家）<br>
        <br>
        <span class="text-muted"><i>感谢你愿意为这个世界延续薪火</i></span>
      </p>
    </div>

    <div class="action-row">
      <Popover>
        <PopoverTrigger>
          <button
            class="action-btn"
            :class="{ 'is-loading': isLoading }"
            aria-label="点击扫码支持服务器"
          >
            <span class="btn-text">
              <AppIcon
                v-if="isLoading"
                name="spinner"
                :size="18"
                spin
              />
              <span v-else>发电</span>
            </span>
            <div class="btn-glow" />
          </button>
        </PopoverTrigger>
        
        <PopoverContent
          side="top"
          :side-offset="10"
          class="modern-tooltip"
        >
          <div class="tooltip-content">
            <div class="tooltip-header">
              扫码支持
            </div>
            <div class="tooltip-subtitle">
              {{ showStaticQr ? '优先展示赞赏码图片' : '当前使用备用二维码' }}
            </div>
            <div class="qr-container">
              <OptimizedImage
                v-if="showStaticQr"
                :src="qrSrc || ''"
                :alt="qrAlt"
                class="qr-code qr-image"
                :lazy="false"
                @error="handleStaticQrError"
              />
              <canvas v-else-if="!qrLoadFailed" ref="qrCanvas" class="qr-code" aria-label="赞赏码"></canvas>
              <div v-else class="qr-fallback">
                赞赏码暂未配置
                <br>
                请稍后再试
              </div>
            </div>
            <div class="tooltip-footer">
              感谢你的每一份心意
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/molecules/Popover';

interface Props {
  qrSrc?: string;
  qrAlt?: string;
  qrUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  qrSrc: '',
  qrAlt: '赞赏码',
  qrUrl: 'https://example.com/support',
});

const qrCanvas = ref<HTMLCanvasElement | null>(null);
const qrLoadFailed = ref(false);
const isLoading = ref(false);
const hasStaticQr = computed(() => Boolean(props.qrSrc?.trim()));
const showStaticQr = computed(() => hasStaticQr.value && !qrLoadFailed.value);

function handleStaticQrError() {
  qrLoadFailed.value = true;
}

onMounted(async () => {
  if (hasStaticQr.value) return;
  if (!qrCanvas.value) return;

  try {
    const QRCode = await import('qrcode');
    await QRCode.toCanvas(qrCanvas.value, props.qrUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (error) {
    qrLoadFailed.value = true;
    console.error('Failed to generate sponsor QR code:', error);
  }
});
</script>

<style scoped>
.notice-content {
  padding: 2rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  align-items: center;
}

.text-container {
  width: 100%;
  max-width: 600px;
  text-align: center;
}

.main-text {
  font-family: 'Inter', sans-serif;
  font-size: 1.15rem;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  font-weight: 400;
}

.highlight-gold { 
  color: #FFD700; 
  font-weight: 700;
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
}

.highlight-red { 
  color: #FF5555; 
  font-weight: 700; 
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: rgba(255, 85, 85, 0.3);
}

.text-muted { 
  color: rgba(255, 255, 255, 0.5); 
  font-size: 1rem;
}

.action-row {
  display: flex;
  justify-content: center;
  width: 100%;
}

.action-btn {
  --mc-green-light: #8fbe56;
  --mc-green: #6a9f3b;
  --mc-green-dark: #4a6f27;
  --mc-border-dark: #1e2f12;
  --mc-border-light: #b9da80;

  position: relative;
  background:
    linear-gradient(
      to bottom,
      var(--mc-green-light) 0%,
      var(--mc-green) 52%,
      var(--mc-green-dark) 100%
    );
  border: 3px solid var(--mc-border-dark);
  border-radius: 0;
  padding: 0.95rem 3.4rem;
  min-width: 220px;
  cursor: pointer;
  overflow: hidden;
  image-rendering: pixelated;
  box-shadow:
    inset 0 2px 0 0 rgba(255, 255, 255, 0.35),
    inset 0 -2px 0 0 rgba(0, 0, 0, 0.35),
    0 6px 0 0 #223617,
    0 8px 20px rgba(0, 0, 0, 0.35);
  transition: transform 0.12s steps(2), filter 0.12s steps(2), box-shadow 0.12s steps(2);
}

.action-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.08) 0 6px,
      rgba(255, 255, 255, 0) 6px 12px
    );
}

.action-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.06);
  box-shadow:
    inset 0 2px 0 0 rgba(255, 255, 255, 0.4),
    inset 0 -2px 0 0 rgba(0, 0, 0, 0.4),
    0 8px 0 0 #223617,
    0 10px 22px rgba(0, 0, 0, 0.38);
}

.action-btn:active {
  transform: translateY(4px);
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.25),
    inset 0 -1px 0 0 rgba(0, 0, 0, 0.45),
    0 2px 0 0 #223617,
    0 3px 12px rgba(0, 0, 0, 0.3);
}

.btn-text {
  position: relative;
  z-index: 2;
  font-family: 'Press Start 2P', 'Inter', sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: #f4ffe3;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow:
    2px 2px 0 #223617,
    0 0 6px rgba(180, 255, 110, 0.35);
}

.btn-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 150px;
  height: 58px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(195, 255, 139, 0.32) 0%, rgba(195, 255, 139, 0) 72%);
  opacity: 0.65;
  transition: opacity 0.12s steps(2), transform 0.12s steps(2);
  pointer-events: none;
}

.action-btn:hover .btn-glow {
  opacity: 0.82;
  transform: translate(-50%, -50%) scale(1.03);
}

.action-btn:active .btn-glow {
  opacity: 0.45;
  transform: translate(-50%, -50%) scale(0.96);
}

:deep(.modern-tooltip) {
  background: rgba(20, 20, 25, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.tooltip-content {
  text-align: center;
  padding: 24px;
  color: #FFF;
}

.tooltip-header {
  color: #FFD700;
  margin-bottom: 8px;
  font-size: 1.5rem;
  font-weight: 700;
  font-family: 'Inter', sans-serif;
}

.tooltip-subtitle {
  color: rgba(255, 255, 255, 0.58);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.qr-container {
  background: #FFF;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.qr-code {
  width: 280px;
  height: 280px;
  display: block;
  border-radius: 4px;
}

.qr-image {
  object-fit: contain;
  background: #fff;
}

.qr-fallback {
  width: 280px;
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  text-align: center;
  padding: 1rem;
}

.tooltip-footer {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
  font-style: italic;
}

@media (max-width: 768px) {
  .notice-content {
    padding: 1.5rem;
    gap: 1.5rem;
  }
  
  .main-text {
    font-size: 1rem;
  }
  
  .action-btn {
    padding: 0.8rem 2.2rem;
    width: 100%;
    max-width: 300px;
    min-width: 0;
  }
  
  .btn-text {
    font-size: 0.82rem;
    letter-spacing: 0.06em;
  }
  
  .qr-code,
  .qr-fallback {
    width: 240px;
    height: 240px;
  }
}
</style>
