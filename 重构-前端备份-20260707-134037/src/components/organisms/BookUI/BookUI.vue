<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, useAttrs } from 'vue';
import { debounce } from '@/shared/utils/debounceThrottle';
import { escapeHtmlContent, sanitizeHtml } from '@/shared/utils/security';
import { gsap } from 'gsap';
import type { BookPage, SplitPage } from './types';

defineOptions({
  name: 'BookUI',
  inheritAttrs: false
});

const props = defineProps<{
  pages: BookPage[];
  class?: string;
}>();

const attrs = useAttrs();

const currentPage = ref(1);
const splitPages = ref<SplitPage[]>([]);
const contentAreaRef = ref<HTMLElement | null>(null);
const isAnimating = ref(false);
const bookContainerRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const getDimensions = () => {
  if (!bookContainerRef.value) return { width: 690, height: 826 };
  
  const contentArea = bookContainerRef.value.querySelector('.contentArea') as HTMLElement;
  
  if (!contentArea) return { width: 690, height: 826 };

  // Get computed style to include padding in height calculation if needed, 
  // but clientHeight includes padding which is what we want for available space?
  // Actually clientHeight = height + padding - scrollbar. 
  // We want to know how much height is available for content.
  // The contentArea has overflow-y: auto, so it has a set height or flex height.
  // We should measure the max-height available for content.
  
  return { 
    width: contentArea.clientWidth, 
    height: contentArea.clientHeight
  };
};

const splitContentIntoPages = (content: string) => {
  // Ensure we have the reference element to clone styles from
  const sourceElement = bookContainerRef.value?.querySelector('.contentArea') as HTMLElement;
  if (!sourceElement) return [content];

  const { width: availableWidth, height: rawHeight } = getDimensions();
  // Subtract a larger safety buffer to prevent overflow at the bottom, especially on mobile
  const availableHeight = rawHeight - 100;
  
  // Clone the source element to ensure we get all styles (classes, scoped attributes)
  const tempDiv = sourceElement.cloneNode(false) as HTMLElement;
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  tempDiv.style.height = 'auto'; // Allow height to expand to measure content
  tempDiv.style.maxHeight = 'none';
  tempDiv.style.width = `${availableWidth}px`;
  tempDiv.style.overflow = 'visible';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '-9999px';
  
  // Important: copy all classes and attributes to match CSS selectors
   // The cloneNode(false) already does this.
   
   if (bookContainerRef.value) {
     bookContainerRef.value.appendChild(tempDiv);
   } else {
     document.body.appendChild(tempDiv);
   }
 
   const pages: string[] = [];
   let currentPageContent = '';
   // Removed currentHeight tracking as we now measure total content
 
   const measureContent = (html: string) => {
     tempDiv.innerHTML = html;
     return tempDiv.offsetHeight;
   };
 
   // 拆分单个元素为不超过页面高度的片段
   const splitElement = (element: HTMLElement): string[] => {
     // Skip style element
     if (element.tagName === 'STYLE') return [];
     
     const html = element.outerHTML;
     // 如果元素整体小于页面高度，直接返回
     if (measureContent(html) <= availableHeight) {
       return [html];
     }
 
     const tagName = element.tagName.toLowerCase();
     const results: string[] = [];
 
     // 1. 处理列表 (UL, OL)
     if (tagName === 'ul' || tagName === 'ol') {
       const items = Array.from(element.children) as HTMLElement[];
       let currentList = `<${tagName}>`;
       let hasItems = false;
       
       items.forEach((item, index) => {
         const itemHtml = item.outerHTML;
         const testList = currentList + itemHtml + `</${tagName}>`;
         
         // 如果当前累积的列表片段超过页面高度，先保存当前片段，开始新片段
         if (measureContent(testList) > availableHeight && hasItems) {
           currentList += `</${tagName}>`;
           results.push(currentList);
           if (tagName === 'ol') {
             currentList = `<${tagName} start="${index + 1}">`;
           } else {
             currentList = `<${tagName}>`;
           }
           hasItems = false;
         }
         currentList += itemHtml;
         hasItems = true;
       });
       
       if (hasItems) {
         currentList += `</${tagName}>`;
         results.push(currentList);
       }
       return results;
     }
 
     // 2. 处理包含复杂子元素的块级元素 (如包含 strong, em 的 p)
     const hasBlockChildren = Array.from(element.children).some(child => 
       ['DIV', 'P', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(child.tagName)
     );
 
     if (hasBlockChildren) {
      const children = Array.from(element.children) as HTMLElement[];
      return children.flatMap(child => splitElement(child));
    }
 
     // 3. 处理纯文本或仅含行内元素的块级元素
     if (element.children.length > 0) {
        // 如果包含行内元素但整体太高，尝试按句子拆分（简化处理：先看能不能按子元素拆）
        // 这里可以优化，但为简化逻辑，暂时尝试直接按文本拆分可能会破坏HTML结构
        // 更好的做法是递归拆分行内元素，但比较复杂。
        // 简单策略：如果太高，就硬拆文本，保留标签包裹
     }
 
     // 纯文本，安全拆分
     const textContent = element.textContent || '';
    // 按句子或标点拆分，保留标点
    const sentences = textContent.split(/([。！？；\n])/);
    let currentText = '';
    
    // 获取带有属性的开始标签，保留样式
    const attrs = Array.from(element.attributes)
      .map(attr => `${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`)
      .join(' ');
    const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`;
    
    // 重构句子数组，将标点合并回句子
    const mergedSentences: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
        if (i % 2 === 0) {
            let sentence = sentences[i];
            if (i + 1 < sentences.length) {
                sentence += sentences[i+1];
            }
            if (sentence) mergedSentences.push(sentence);
        }
    }
    
    mergedSentences.forEach(sentence => {
      const safeSentence = escapeHtmlContent(sentence);
      const testText = currentText + safeSentence;
      const testHtml = `${openTag}${testText}</${tagName}>`;
      
      if (measureContent(testHtml) > availableHeight) {
        if (currentText) {
          results.push(`${openTag}${currentText}</${tagName}>`);
        }
        currentText = safeSentence;
      } else {
        currentText = testText;
      }
    });
    
    if (currentText) {
      results.push(`${openTag}${currentText}</${tagName}>`);
    }
     
     return results.length > 0 ? results : [html];
   };
 
   // 创建临时的DOM容器来解析HTML字符串
   const contentParserDiv = document.createElement('div');
   contentParserDiv.innerHTML = content;
 
   // 遍历所有顶层节点
   const nodes = Array.from(contentParserDiv.childNodes);
   
   nodes.forEach(node => {
     let chunks: string[] = [];
     
     if (node.nodeType === Node.ELEMENT_NODE) {
       chunks = splitElement(node as HTMLElement);
     } else if (node.nodeType === Node.TEXT_NODE) {
       const text = node.textContent?.trim();
       if (text) {
         chunks = [`<div class="text-node">${escapeHtmlContent(text)}</div>`];
       }
     }
 
     chunks.forEach(chunk => {
       // Try adding chunk to current page content
       const testContent = currentPageContent + chunk;
       const testHeight = measureContent(testContent);
       
       // 如果加上这个片段后超过页面高度
       if (testHeight > availableHeight) {
         if (currentPageContent) {
           // 保存当前页
           pages.push(currentPageContent);
           // 新的一页从当前片段开始
           currentPageContent = chunk;
         } else {
           // 如果当前页是空的，但单个片段本身就超高（splitElement 应该已经处理过，但以防万一）
           // 我们只能把它放在这一页（会溢出），或者看是否能再次拆分。
           // 这里假设 splitElement 已经尽力拆分了。
           currentPageContent = chunk;
         }
       } else {
         currentPageContent = testContent;
       }
     });
   });
 
   if (currentPageContent) {
     pages.push(currentPageContent);
   }
 
   tempDiv.remove();
   return pages;
 };

const processPages = () => {
  splitPages.value = [];
  props.pages.forEach((page: BookPage) => {
    // Sanitize content before processing to prevent XSS during measurement
    const sanitizedContent = sanitizeHtml(page.content);
    const subPages = splitContentIntoPages(sanitizedContent);
    subPages.forEach((subPage, index) => {
      splitPages.value.push({
        title: index === 0 && page.title ? page.title : '',
        content: subPage // Content is already sanitized
      });
    });
  });
};

const animatePageChange = async (direction: 'next' | 'prev') => {
  if (isAnimating.value || !contentAreaRef.value) return;
  isAnimating.value = true;

  const tl = gsap.timeline({
    onComplete: () => {
      isAnimating.value = false;
    }
  });

  // 翻页动画：模拟纸张翻动
  tl.to(contentAreaRef.value, {
    opacity: 0,
    x: direction === 'next' ? -20 : 20,
    rotationY: direction === 'next' ? -10 : 10,
    duration: 0.2,
    ease: 'power2.in'
  });

  tl.add(() => {
    if (direction === 'next') {
      currentPage.value++;
    } else {
      currentPage.value--;
    }
  });

  tl.set(contentAreaRef.value, {
    x: direction === 'next' ? 20 : -20,
    rotationY: direction === 'next' ? 10 : -10
  });

  tl.to(contentAreaRef.value, {
    opacity: 1,
    x: 0,
    rotationY: 0,
    duration: 0.3,
    ease: 'power2.out'
  });
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    animatePageChange('next');
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    animatePageChange('prev');
  }
};

const totalPages = computed(() => splitPages.value.length);
const displayedPage = computed(() => splitPages.value[currentPage.value - 1]);

const debouncedProcessPages = debounce(() => {
  processPages();
}, 100);

onMounted(async () => {
  await nextTick();
  processPages();
  
  if (bookContainerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      debouncedProcessPages();
    });
    
    // Watch the content area wrapper for size changes
    const contentArea = bookContainerRef.value.querySelector('.contentArea');
    if (contentArea) {
      resizeObserver.observe(contentArea);
    } else {
      resizeObserver.observe(bookContainerRef.value);
    }
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

watch(() => props.pages, async () => {
  await nextTick();
  processPages();
  currentPage.value = 1;
}, { deep: true });

const computedClass = computed(() => {
  return [
    'bookWrapper',
    props.class,
    attrs.class
  ].filter(Boolean).join(' ');
});

const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <div ref="bookContainerRef" :class="computedClass" v-bind="filteredAttrs">
    <div class="mcBook">
      <div class="pageTexture">
        <div class="bindingRibbon">
          <div v-for="n in 12" :key="n" class="ribbonStitch" />
        </div>

        <div class="pageNumber">
          PAGE {{ currentPage }} / {{ totalPages }}
        </div>

        <div ref="contentAreaRef" class="contentArea">
          <h2 v-if="displayedPage?.title">{{ displayedPage.title }}</h2>
          <div v-if="displayedPage" v-html="displayedPage.content" />
        </div>

        <div class="controls">
          <button 
            class="navBtn" 
            :disabled="currentPage === 1 || isAnimating" 
            @click="prevPage"
          >
            <span>&lt;</span>
          </button>
          
          <button 
            class="navBtn" 
            :disabled="currentPage === totalPages || isAnimating" 
            @click="nextPage"
          >
            <span>&gt;</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@font-face {
  font-family: 'Minecraft';
  src: local('VT323'), local('VT323-Regular');
}

.bookWrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  perspective: 1000px;
  width: 100%;
  max-width: 100vw;
  overflow: hidden;
  box-sizing: border-box;
}

.mcBook {
  width: 840px;
  max-width: 100%;
  aspect-ratio: 3 / 4;
  height: auto;
  background-color: #D6C6A0;
  /* 使用渐变模拟陈旧羊皮纸效果 */
  background-image: 
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0%, rgba(0, 0, 0, 0.05) 100%),
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  background-blend-mode: overlay;
  
  /* 像素风格的多层边框 */
  border: 4px solid #3d2b1f;
  outline: 16px solid #6B4E36;
  outline-offset: -20px;
  border-radius: 4px;
  
  position: relative;
  box-shadow: 
    0 20px 50px rgba(0,0,0,0.4),
    inset 0 0 100px rgba(0,0,0,0.1);
  
  font-family: var(--font-pixel);
  image-rendering: pixelated;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  /* 书籍页边阴影 */
  &::before {
    content: '';
    position: absolute;
    left: 20px;
    top: 0;
    bottom: 0;
    width: 30px;
    background: linear-gradient(to right, rgba(0,0,0,0.15), transparent);
    z-index: 2;
    pointer-events: none;
  }
}

.pageTexture {
  flex: 1;
  padding: 48px 60px 80px 90px;
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(214, 198, 160, 0.4);
  
  /* 页面纹理细节 */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      rgba(0,0,0,0.01) 0px,
      rgba(0,0,0,0.01) 1px,
      transparent 1px,
      transparent 2px
    );
    pointer-events: none;
  }
}

.bindingRibbon {
  position: absolute;
  left: 12px;
  top: 0;
  bottom: 0;
  width: 16px;
  background: #5d4037;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 20px 0;
  z-index: 3;
  box-shadow: 2px 0 5px rgba(0,0,0,0.2);
}

.ribbonStitch {
  width: 8px;
  height: 24px;
  background: #3e2723;
  margin: 0 auto;
  border-radius: 2px;
  box-shadow: inset 1px 1px 2px rgba(0,0,0,0.5);
}

.pageNumber {
  text-align: right;
  font-size: 1.5rem;
  color: #5d4037;
  margin-bottom: 24px;
  opacity: 0.7;
  font-weight: bold;
}

.contentArea {
  flex: 1;
  color: #3e2723;
  overflow-y: auto;
  overflow-x: hidden;
  overflow-wrap: break-word;
  word-wrap: break-word;
  padding-right: 10px;
  font-family: var(--font-prose);
  font-size: 1.25rem;
  line-height: 1.75;

  /* 自定义像素风格滚动条 */
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.05);
  }
  &::-webkit-scrollbar-thumb {
    background: #6B4E36;
    border: 2px solid #D6C6A0;
  }

  h2 {
    font-family: var(--font-pixel);
    font-size: 2.1rem;
    margin-bottom: 2rem;
    color: #2d1b0e;
    border-bottom: 4px solid #5d4037;
    padding-bottom: 0.5rem;
    display: inline-block;
  }
  
  :deep(h3) {
    font-size: 1.68rem;
    margin: 1rem 0 .5rem;
    font-weight: 700;
  }
  
  :deep(h4) {
    font-size: 1.54rem;
    margin: .875rem 0 .4375rem;
    font-weight: 700;
  }

  :deep(p) {
    margin-bottom: 1.5rem;
    line-height: 1.75;
    font-size: 1.05rem;
  }
  :deep(strong) {
    color: #7a1f1f;
    font-weight: bold;
  }
  :deep(div) {
    margin-bottom: 1rem;
    font-size: 1.05rem;
  }
  :deep(ul), :deep(ol) {
    margin-bottom: 1.5rem;
    padding-left: 2rem;
    font-size: 1.05rem;
  }
  :deep(li) {
    margin-bottom: 0.5rem;
    list-style-type: disc;
  }
  :deep(ol) :deep(li) {
    list-style-type: decimal;
  }

  :deep(img) {
    max-width: 100%;
    height: auto;
    border: none;
    outline: none;
    box-shadow: none;
    display: block;
    margin: 1rem auto;
    background: transparent;
  }
}

.controls {
  position: absolute;
  bottom: 25px;
  left: 0;
  width: 100%;
  padding-left: 80px;
  padding-right: 60px;
  display: flex;
  justify-content: space-between;
  z-index: 10;
  pointer-events: none;
  box-sizing: border-box;
}

.navBtn {
  pointer-events: auto;
  background: transparent;
  border: none;
  color: #3e2723;
  padding: 5px;
  font-family: var(--font-pixel);
  font-size: 3.5rem;
  cursor: pointer;
  image-rendering: pixelated;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  line-height: 1;
  width: 50px;
  height: 50px;
  opacity: 0.7;

  &:hover:not(:disabled) {
    background: transparent;
    color: #000;
    transform: scale(1.1);
    opacity: 1;
    text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
    box-shadow: none;
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
    box-shadow: none;
  }

  &:disabled {
    visibility: hidden;
  }
}

@media (max-width: 900px) {
  .mcBook {
    border-width: 2px;
    outline-width: 12px;
    outline-offset: -14px;
  }
  .pageTexture { padding: 40px 40px 60px 60px; }
  .contentArea h2 { font-size: 1.8rem; }
  .navBtn { font-size: 2rem; padding: 6px 12px; }
}

@media (max-width: 768px) {
    .mcBook {
      width: 100% !important;
      max-width: 340px;
      outline-width: 8px;
      outline-offset: -10px;
    }
  .pageTexture { padding: 30px 25px 50px 30px; }
  .contentArea h2 { font-size: 1.6rem; margin-bottom: 0.8rem; }
  .contentArea :deep(h3) { font-size: 1.3rem; margin: 0.8rem 0 0.4rem; }
  .contentArea :deep(h4) { font-size: 1.2rem; margin: 0.6rem 0 0.3rem; }
  .contentArea :deep(p), 
  .contentArea :deep(ul), 
  .contentArea :deep(ol),
  .contentArea :deep(div) {
    font-size: 1rem;
    line-height: 1.4;
    margin-bottom: 0.6rem;
  }
  .contentArea :deep(ul), .contentArea :deep(ol) {
    padding-left: 1.2rem;
  }
  .contentArea :deep(li) {
    margin-bottom: 0.2rem;
  }
  .bindingRibbon { width: 12px; left: 8px; }
  .ribbonStitch { height: 16px; width: 6px; }
  .navBtn { font-size: 2rem; padding: 4px 10px; }
  .controls { bottom: 15px; right: 15px; padding-left: 50px; padding-right: 30px; }
}

@media (max-width: 480px) {
  /* Inherits most styles from 768px, but can override if needed */
  .mcBook {
    width: 100% !important;
    max-width: 340px;
  }
}
</style>
