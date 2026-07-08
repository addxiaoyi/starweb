<template>
  <div ref="heroContainer" class="hero-container" v-bind="$attrs">
    <div class="hero-bottom-fade" aria-hidden="true"></div>
    <div class="video-background">
      <!-- Poster Fallback -->
      <div
        class="poster-bg"
        :style="{ backgroundImage: `url('${resolvePublicUrl('/poster.jpg')}')` }"
      ></div>
      
      <!-- Canvas 用于渲染视频，防止直接爬取 -->
      <canvas
        ref="videoCanvas"
        class="bg-canvas"
        :class="{ loaded: isVideoLoaded }"
      ></canvas>
      
      <!-- 隐藏的 Video 元素，用于解码 -->
      <!-- 移除 autoplay，通过 JS 控制 -->
      <video
        ref="bgVideo"
        class="hidden-video"
        muted
        loop
        playsinline
        preload="auto"
        style="display: none;"
        crossorigin="anonymous"
        @canplay="onVideoCanPlay"
        @error="onVideoError"
      >
        <source :src="resolvePublicUrl('/gg.mp4')" type="video/mp4">
        <track kind="captions" label="Chinese" src="" srclang="zh" default>
      </video>
    </div>
    
    <div class="hero-content page-hero">
      <p class="page-hero__eyebrow hero-reveal hero-reveal--eyebrow">StarMC Community</p>
      <h1
        class="hero-title page-hero__title hero-reveal hero-reveal--title"
        :class="{ 'with-gif': isGifLoaded }"
        :style="isGifLoaded ? { backgroundImage: animationGifUrl } : {}"
      >StarMC</h1>
      <p class="hero-subtitle page-hero__lede hero-reveal hero-reveal--subtitle">探索、创造、连接一个更完整的星系社区。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { debounce } from '@/shared/utils/debounceThrottle';

defineOptions({
  name: 'HeroSection',
  inheritAttrs: false
});

const bgVideo = ref<HTMLVideoElement | null>(null);
const videoCanvas = ref<HTMLCanvasElement | null>(null);
const isVideoLoaded = ref(false);
const baseUrl = import.meta.env.BASE_URL || '/';
const resolvePublicUrl = (path: string) => {
  if (!path.startsWith('/')) return path;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}${path}`;
};
const animationGif = resolvePublicUrl('/image/animation.gif');
// 直接在 JS 中构建完整的 url() 字符串可能导致 Vue/CSS 解析问题，改为仅传递 URL，在 CSS 中拼接或使用 style 绑定
const animationGifUrl = `url('${animationGif}')`; 
const isGifLoaded = ref(false);

const heroContainer = ref<HTMLElement | null>(null);
let animationFrameId: number | null = null;
let videoContext: CanvasRenderingContext2D | null = null;

// 反爬虫与安全检测 - 已移除，防止误伤
// const checkSecurity = (): boolean => { ... };

/** Cover 模式绘制一帧；缓冲区须已设为视口尺寸，避免默认 300×150 被 CSS 拉满屏产生「放大闪烁」 */
const drawCoverFrame = (): boolean => {
  if (!bgVideo.value || !videoCanvas.value || !videoContext) return false;

  const canvasWidth = videoCanvas.value.width;
  const canvasHeight = videoCanvas.value.height;
  const videoWidth = bgVideo.value.videoWidth;
  const videoHeight = bgVideo.value.videoHeight;

  if (!canvasWidth || !canvasHeight || !videoWidth || !videoHeight) return false;

  const widthRatio = canvasWidth / videoWidth;
  const heightRatio = canvasHeight / videoHeight;
  const scale = Math.max(widthRatio, heightRatio);
  const scaledWidth = videoWidth * scale;
  const scaledHeight = videoHeight * scale;
  const startX = (canvasWidth - scaledWidth) / 2;
  const startY = (canvasHeight - scaledHeight) / 2;

  videoContext.drawImage(bgVideo.value, startX, startY, scaledWidth, scaledHeight);
  return true;
};

const renderVideo = () => {
  if (!bgVideo.value || !videoCanvas.value || !videoContext) return;
  if (bgVideo.value.paused || bgVideo.value.ended) return;

  if (!drawCoverFrame()) return;

  if ('requestVideoFrameCallback' in bgVideo.value) {
    const videoWithRvf = bgVideo.value as HTMLVideoElement & {
      requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => number;
    };
    videoWithRvf.requestVideoFrameCallback(renderVideo);
  } else {
    animationFrameId = requestAnimationFrame(renderVideo);
  }
};

const onVideoCanPlay = async () => {
  if (!bgVideo.value || !videoCanvas.value) return;

  // 先设置真实画布分辨率与上下文，再决定是否显示 canvas
  updateCanvasSize();
  videoContext = videoCanvas.value.getContext('2d', { alpha: false });
  if (!videoContext) return;

  try {
    await bgVideo.value.play();
  } catch (e) {
    console.error('Video playback failed:', e);
    return;
  }

  // 必须先按视口写入正确分辨率并重绘，再显示 canvas；否则会短暂以 300×150 位图被 CSS 拉满屏
  const beginRenderLoop = () => {
    isVideoLoaded.value = true;
    if ('requestVideoFrameCallback' in bgVideo.value!) {
      const videoWithRvf = bgVideo.value as HTMLVideoElement & {
        requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => number;
      };
      videoWithRvf.requestVideoFrameCallback(renderVideo);
    } else {
      renderVideo();
    }
  };

  if (drawCoverFrame()) {
    beginRenderLoop();
    return;
  }

  const waitForFrame = (attempts: number) => {
    if (drawCoverFrame()) {
      beginRenderLoop();
      return;
    }
    if (attempts < 24) {
      requestAnimationFrame(() => waitForFrame(attempts + 1));
    }
  };
  waitForFrame(0);
};

const updateCanvasSize = () => {
  if (videoCanvas.value) {
    // 根据 dpr 调整分辨率，平衡清晰度和性能
    // 对于背景视频，通常不需要过高的 dpr，1.5 或 1 就够了
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); 
    videoCanvas.value.width = window.innerWidth * dpr;
    videoCanvas.value.height = window.innerHeight * dpr;
  }
};

const onVideoError = () => {
  isVideoLoaded.value = false;
};

let resizeObserver: ResizeObserver | null = null;

const preventContextMenu = (e: Event) => e.preventDefault();

onMounted(() => {
  // 禁用右键菜单
  document.addEventListener('contextmenu', preventContextMenu);
  
  const gif = new Image();
  gif.onload = () => { isGifLoaded.value = true; };
  gif.onerror = () => { isGifLoaded.value = false; };
  gif.src = animationGif;

  // 检测海报图片是否加载成功
  const poster = new Image();
  poster.src = resolvePublicUrl('/poster.jpg');
  poster.onerror = (e) => {
    console.error('Poster image failed to load:', e);
    // 可以在这里设置一个备用背景色或图片
  };
  
  // 监听窗口大小变化
  if (videoCanvas.value) {
    const debouncedUpdate = debounce(updateCanvasSize, 200);
    resizeObserver = new ResizeObserver(() => {
      debouncedUpdate();
    });
    resizeObserver.observe(document.body);
  }
  
  // 监听页面可见性变化处理
  globalThis.window.addEventListener('visibilitychange', handleVisibilityChange);
});

const handleVisibilityChange = () => {
    if (document.hidden) {
      bgVideo.value?.pause();
    } else {
      bgVideo.value?.play().catch(() => {});
      if (bgVideo.value && isVideoLoaded.value) {
    if ('requestVideoFrameCallback' in bgVideo.value) {
      const videoWithRvf = bgVideo.value as HTMLVideoElement & {
        requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => number;
      };
      videoWithRvf.requestVideoFrameCallback(renderVideo);
    } else {
      renderVideo();
    }
  }
    }
};

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  // 移除事件监听
  document.removeEventListener('contextmenu', preventContextMenu);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<style scoped lang="scss">
.hero-container {
  position: relative;
  width: 100%;
  min-height: 100svh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #05070d;
  user-select: none;
  -webkit-user-select: none;
}

.hero-container::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: transparent;
  pointer-events: none;
}

.video-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.poster-bg {
  position: absolute;
  inset: 0;
  background-color: #05070d;
  background-position: center;
  background-size: cover;
  opacity: 1;
  transition:
    opacity var(--motion-reveal, 480ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)),
    transform var(--motion-reveal, 480ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
  z-index: 1;
}

.bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 1s ease;
  z-index: 2;
}

.bg-canvas.loaded {
  opacity: 1;
}

.hero-reveal {
  animation: hero-reveal-in var(--motion-reveal, 480ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.hero-reveal--eyebrow {
  animation-delay: 120ms;
}

.hero-reveal--title {
  animation-delay: 190ms;
}

.hero-reveal--subtitle {
  animation-delay: 260ms;
}

@keyframes hero-reveal-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.hero-content {
  position: relative;
  z-index: 10;
  width: min(100%, 1080px);
  padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 3vw, 2.5rem);
  text-align: center;
  pointer-events: none;
  display: grid;
  gap: 0.75rem;
  justify-items: center;
}

.hero-content .page-hero__eyebrow {
  color: rgba(230, 236, 255, 0.72);
  letter-spacing: 0.2em;
}

.hero-content .hero-title {
  margin: 0;
  font-size: clamp(3rem, 10vw, 5.8rem);
  font-weight: 900;
  font-family: 'Minecraft', sans-serif;
  letter-spacing: 0.06em;
  pointer-events: auto;
  color: #0b0f17;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 36px rgba(0, 0, 0, 0.35);
  will-change: transform;
}

.hero-content .hero-title.with-gif {
  color: transparent;
  background-size: cover;
  background-position: center;
  -webkit-background-clip: text;
  background-clip: text;
  filter:
    drop-shadow(0 0 6px rgba(255, 255, 255, 0.22))
    drop-shadow(0 0 14px rgba(124, 92, 255, 0.18));
}

.hero-content .hero-subtitle {
  margin: 0;
  font-size: clamp(0.95rem, 2.6vw, 1.12rem);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(246, 250, 255, 0.88);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  pointer-events: auto;
  margin-top: 6px;
}

.hero-action {
  min-width: 150px;
}

@media (max-width: 768px) {
  .hero-content .hero-title {
    font-size: clamp(3.2rem, 15vw, 4.6rem);
  }

  .hero-content .hero-subtitle {
    letter-spacing: 0.04em;
  }
}

@media (max-width: 480px) {
  .hero-content .hero-title {
    font-size: clamp(2.9rem, 18vw, 4.1rem);
  }

  .hero-action {
    min-width: 140px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-reveal {
    animation: none !important;
  }

  .bg-canvas,
  .poster-bg {
    transition: none;
  }

  .hero-title,
  .hero-subtitle {
    transition: none;
  }
}
</style>
