<template>
  <section 
    v-bind="filteredAttrs"
    :class="computedClass"
    :style="{ '--card-width': `${cardWidth}px` }"
  >
    <div
      class="carousel-viewport"
      @mouseenter="pauseAutoplay"
      @mouseleave="startAutoplay"
    >
      <div
        class="carousel-track"
        :class="{ 'no-transition': isTransitioning }"
        :style="{ transform: `translateX(-${visualIndex * cardWidth}px)` }"
        @transitionend="handleTransitionEnd"
      >
        <div
            v-for="(member, index) in displayMembers"
            :key="index"
            class="carousel-card-wrapper"
            :class="{ 
              'active': index === visualIndex
            }"
            :style="{ 
              width: `${cardWidth}px`
            }"
            @click="goToMember(index)"
          >
          <div class="mc-gui-panel">
            <div class="mc-slot-row">
              <div class="mc-item-slot">
                <OptimizedImage
                  :src="getAvatarUrl(member.avatarUrl, member.qq, member.name)"
                  :alt="member.name"
                  class="mc-avatar-img"
                  lazy
                  @error="handleImageError($event, member.name)"
                />
              </div>
            </div>

            <!-- 2. 名字框(铁砧改名风格) -->
            <div class="mc-anvil-container">
              <div class="mc-anvil-input">
                {{ member.name }}<span class="blinking-cursor">_</span>
              </div>
            </div>

            <!-- 3. 信息区域 (物品 Lore 风格) -->
            <div class="mc-lore-container">
              <!-- 职业/称号 -->
              <div class="mc-lore-role">
                <span>{{ member.role }}</span>
              </div>
                
              <!-- 分割线-->
              <div class="mc-lore-divider" />

              <!-- 描述 -->
              <div class="mc-lore-desc">
                <span
                  v-for="(line, i) in formatDesc(member.description)"
                  :key="i"
                  class="lore-line"
                >
                  {{ line }}
                </span>
              </div>
                
              <!-- 底部属性(NBT标签风格) -->
              <div class="mc-lore-nbt">
                NBT: {{ member.role.length }} tags
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, useAttrs } from 'vue';
import teamMembersData from '@/shared/config/teamConfig';
import OptimizedImage from '@/components/atoms/OptimizedImage.vue';

defineOptions({
  name: 'TeamCarousel',
  inheritAttrs: false
});

const attrs = useAttrs();

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
});


const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});

const computedClass = computed(() => {
  return [
    'section-container',
    'mc-pure-ui-section',
    props.class,
    attrs.class
  ].filter(Boolean).join(' ');
});

const teamMembers = computed(() => teamMembersData || []);

const visualIndex = ref(3); // Start at first real item (after 3 clones)
const cardWidth = ref(300);

const updateCardWidth = () => {
  if (window.innerWidth <= 480) {
    cardWidth.value = Math.min(window.innerWidth * 0.85, 280);
  } else if (window.innerWidth <= 768) {
    cardWidth.value = 280;
  } else {
    cardWidth.value = 300;
  }
};

let resizeTimeout: ReturnType<typeof setTimeout>;
const debouncedUpdateWidth = () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(updateCardWidth, 200);
};

const autoplayInterval = ref<ReturnType<typeof setInterval> | null>(null);
const isTransitioning = ref(false); // Controls pointer events
const isResetting = ref(false); // Controls transition-duration: 0s

const toColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
};

const getAvatarUrl = (avatarUrl: string, qq: string, name: string) => {
  // 优先使用真实头像地址
  if (avatarUrl && /^https?:\/\//i.test(avatarUrl)) {
    return avatarUrl;
  }

  // 兜底：QQ 头像直链
  if (qq) {
    return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=160`;
  }

  // 最终兜底：SVG 首字母占位图
  const text = (name || '?').trim().slice(0, 1).toUpperCase();
  const bg = toColor(qq || name || 'starmc');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><rect width='128' height='128' fill='${bg}'/><text x='50%' y='56%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='64' fill='#ffffff'>${text}</text></svg>`;
  const base64Svg = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64Svg}`;
};

const displayMembers = computed(() => {
  const members = teamMembers.value;
  if (members.length === 0) {return [];}
  
  const cloneCount = 3;
  return [
    ...members.slice(-cloneCount),
    ...members,
    ...members.slice(0, cloneCount)
  ];
});

// Calculate real index for active state
const currentIndex = computed(() => {
  const N = teamMembers.value.length;
  if (N === 0) return 0;
  // visualIndex 3 -> real index 0
  return (visualIndex.value - 3 + N * 2) % N;
});

const nextMember = () => {
  if (teamMembers.value.length === 0 || isResetting.value) return;
  visualIndex.value++;
  isTransitioning.value = true;
};

const prevMember = () => {
  if (teamMembers.value.length === 0 || isResetting.value) return;
  visualIndex.value--;
  isTransitioning.value = true;
};

const goToMember = (index: number) => {
  // index is relative to displayMembers
  if (index < 0 || index >= displayMembers.value.length) return;
  visualIndex.value = index;
  isTransitioning.value = true;
};

const handleTransitionEnd = () => {
  isTransitioning.value = false;
  const N = teamMembers.value.length;
  if (N === 0) return;
  
  // Check bounds and reset if needed
  if (visualIndex.value >= N + 3) {
    isResetting.value = true;
    visualIndex.value = visualIndex.value - N;
    // Force reflow or wait for next tick to re-enable transition
    setTimeout(() => {
      isResetting.value = false;
    }, 50);
  } else if (visualIndex.value < 3) {
    isResetting.value = true;
    visualIndex.value = visualIndex.value + N;
    setTimeout(() => {
      isResetting.value = false;
    }, 50);
  }
};

const formatDesc = (desc: string) => {
  if (!desc) {
    return ['无描述'];
  }
  return [desc];
};

const handleImageError = (event: Event, name: string) => {
  const img = event.target as HTMLImageElement;
  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8B8B8B&color=ffffff&size=128&font-size=0.5&length=1`;
};

const startAutoplay = () => {
  if (autoplayInterval.value) {return;}
  autoplayInterval.value = setInterval(() => {
    nextMember();
  }, 4000);
};

const pauseAutoplay = () => {
  if (autoplayInterval.value) {
    clearInterval(autoplayInterval.value);
    autoplayInterval.value = null;
  }
};

onMounted(() => {
  updateCardWidth();
  window.addEventListener('resize', debouncedUpdateWidth, { passive: true });
  startAutoplay();
});

onUnmounted(() => {
  window.removeEventListener('resize', debouncedUpdateWidth);
  pauseAutoplay();
});
</script>

<style scoped>
@font-face {
  font-family: 'VT323';
  src: local('VT323'), local('VT323-Regular');
}

.mc-pure-ui-section {
  background: transparent; 
  font-family: 'VT323', 'Courier New', Courier, monospace; 
  position: relative;
  overflow: hidden;
  text-align: center;
}

.carousel-viewport {
  position: relative;
  width: 100%;
  max-width: var(--card-width);
  margin: 0 auto;
  padding: 10px 0;
  overflow: hidden;
}

.carousel-track {
  display: flex;
  transition: transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1);
  margin-left: calc(50% - (var(--card-width) / 2)); 
  /* Ensure track is centered relative to the viewport center */
}

.carousel-track.no-transition {
  transition: none;
}

@media (max-width: 768px) {
  .carousel-viewport {
    width: var(--card-width); /* Restrict viewport width to card width on mobile */
    overflow: hidden;
  }

  .carousel-track {
    margin-left: 0; 
  }
}

.carousel-card-wrapper {
  flex-shrink: 0;
  padding: 0 10px;
  transition: transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.8s cubic-bezier(0.4, 0.0, 0.2, 1), filter 0.8s cubic-bezier(0.4, 0.0, 0.2, 1);
  transform: scale(0.92);
  opacity: 0.5;
  cursor: pointer;
  filter: blur(2px) grayscale(0.4);
  pointer-events: none;
  will-change: transform, opacity, filter;
}

.carousel-card-wrapper.active {
  transform: scale(1.0);
  opacity: 1;
  z-index: 10;
  filter: blur(0) grayscale(0);
  pointer-events: auto;
}

@media (max-width: 768px) {
  .carousel-card-wrapper {
    filter: none !important; /* Disable blur/grayscale on mobile for performance */
    transition: transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.8s cubic-bezier(0.4, 0.0, 0.2, 1);
    will-change: transform, opacity;
  }
  
  .carousel-card-wrapper.active {
    filter: none !important;
  }
}

/* Removed duplicate .mc-gui-panel block */

/* Waterfall Animation Removed */

.mc-gui-panel {
  background-color: #C6C6C6; 
  border: 2px solid #000; 
  box-shadow: 
    inset 2px 2px 0px #FFF,   
    inset -2px -2px 0px #555; 
  padding: 12px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mc-slot-row {
  display: flex;
  justify-content: center;
}

.mc-item-slot {
  width: 84px;
  height: 84px;
  background-color: #8B8B8B;
  box-shadow: 
    inset 2px 2px 0px #373737,
    inset -2px -2px 0px #FFF;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.mc-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 0 !important; /* Square corners for Minecraft style */
}

.mc-avatar-img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0 !important;
}

.mc-item-slot:hover {
  background-color: #8B8B8B; 
}
.mc-item-slot:hover::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255, 255, 255, 0.2);
  pointer-events: none;
}

.mc-stack-count {
  display: none;
  position: absolute;
  bottom: 2px;
  right: 4px;
  color: #FFF;
  font-size: 1.2rem;
  text-shadow: 2px 2px 0 #3f3f3f;
  font-family: 'Minecraft', 'VT323', monospace;
}

.mc-anvil-container {
  width: 100%;
}

.mc-anvil-input {
  background-color: #000000;
  border: 2px solid #A0A0A0; 
  box-shadow: inset 2px 2px 0 #000; 
  color: #FFFFFF;
  padding: 8px 10px;
  font-size: 1.25rem;
  text-align: left;
  font-family: 'Minecraft', 'VT323', monospace;
  position: relative;
  overflow: hidden;
  white-space: nowrap;
}

.blinking-cursor {
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  color: #FFF;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.mc-lore-container {
  background-color: rgba(16, 0, 16, 0.95); 
  border: 2px solid #2e004e; 
  margin-top: 4px;
  padding: 8px;
  text-align: left;
  box-shadow: 
    inset 1px 1px 0 #2e004e,
    inset -1px -1px 0 #2e004e; 
}

.mc-lore-role {
  color: #55FFFF; 
  font-size: 1.1rem;
  margin-bottom: 4px;
  text-shadow: 2px 2px 0 #2a2a2a;
}

.enchant-glint {
  color: #FF55FF; 
  font-weight: bold;
}

.mc-lore-divider {
  height: 2px;
  background-color: #2e004e;
  margin: 4px 0;
}

.mc-lore-desc {
  color: #AAAAAA; 
  font-size: 1rem;
  line-height: 1.4;
  font-style: italic; 
  text-shadow: 1px 1px 0 #111;
}

.lore-line {
  display: block;
}

.mc-lore-nbt {
  margin-top: 8px;
  color: #555555; 
  font-size: 0.8rem;
  font-family: 'Minecraft', monospace;
}

.mc-stone-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  background: #757575; 
  border: none;
  box-shadow: 
    inset 2px 2px 0px #C6C6C6,
    inset -2px -2px 0px #373737,
    2px 2px 0px 0px #000;
  color: #FFF;
  font-family: 'Minecraft', 'VT323', monospace;
  font-size: 1.5rem;
  cursor: pointer;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mc-stone-btn:active {
  background: #606060;
  box-shadow: 
    inset 2px 2px 0px #373737,
    inset -2px -2px 0px #C6C6C6;
  transform: translateY(-50%) translateY(2px);
}

.prev-btn { left: calc(50% - (var(--card-width) / 2) - 60px); }
.next-btn { right: calc(50% - (var(--card-width) / 2) - 60px); }

@media (max-width: 768px) {
  .mc-stone-btn { width: 36px; height: 36px; }
  .prev-btn { left: 10px; }
  .next-btn { right: 10px; }
  .mc-lore-desc { font-size: 0.9rem; }
  
  .mc-pure-ui-section {
    padding: 1.5rem 0;
  }
  
  .carousel-viewport {
    max-width: var(--card-width);
    padding: 5px 0;
  }
  
  .mc-gui-panel {
    padding: 10px;
    gap: 10px;
  }
  
  .mc-item-slot {
    width: 72px;
    height: 72px;
  }
  
  .mc-avatar-img {
    width: 64px;
    height: 64px;
  }
  
  .mc-anvil-input {
    padding: 6px 8px;
    font-size: 1.1rem;
  }
  
  .mc-lore-container {
    padding: 6px;
  }
  
  .mc-lore-role {
    font-size: 1rem;
  }
}

@media (max-width: 480px) {
  .mc-pure-ui-section {
    padding: 1rem 0;
  }
  
  .mc-stone-btn {
    width: 32px;
    height: 32px;
    font-size: 1.2rem;
  }
  
  .prev-btn { left: 5px; }
  .next-btn { right: 5px; }
  
  .carousel-viewport {
    padding: 3px 0;
  }
  
  .mc-gui-panel {
    padding: 8px;
    gap: 8px;
    border-width: 1px;
  }
  
  .mc-item-slot {
    width: 64px;
    height: 64px;
    box-shadow: 
      inset 1px 1px 0px #373737,
      inset -1px -1px 0px #FFF;
  }
  
  .mc-avatar-img {
    width: 56px;
    height: 56px;
  }
  
  .mc-anvil-input {
    padding: 5px 6px;
    font-size: 1rem;
    border-width: 1px;
  }
  
  .mc-lore-container {
    padding: 5px;
    border-width: 1px;
  }
  
  .mc-lore-role {
    font-size: 0.9rem;
    margin-bottom: 3px;
  }
  
  .mc-lore-divider {
    height: 1px;
    margin: 3px 0;
  }
  
  .mc-lore-desc {
    font-size: 0.85rem;
    line-height: 1.3;
  }
  
  .mc-lore-nbt {
    font-size: 0.7rem;
    margin-top: 6px;
  }
}

@media (max-width: 360px) {
  .mc-stone-btn {
    width: 28px;
    height: 28px;
    font-size: 1rem;
  }
  
  .prev-btn { left: -10px; }
  .next-btn { right: -10px; }
  
  .mc-gui-panel {
    padding: 6px;
    gap: 6px;
  }
  
  .mc-item-slot {
    width: 56px;
    height: 56px;
  }
  
  .mc-avatar-img {
    width: 48px;
    height: 48px;
  }
  
  .mc-anvil-input {
    padding: 4px 5px;
    font-size: 0.9rem;
  }
  
  .mc-lore-container {
    padding: 4px;
  }
  
  .mc-lore-role {
    font-size: 0.85rem;
  }
  
  .mc-lore-desc {
    font-size: 0.8rem;
  }
  
  .mc-lore-nbt {
    font-size: 0.65rem;
  }
}
</style>
