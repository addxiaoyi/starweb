import { ref, type Ref, nextTick } from 'vue';

interface DragOptions<T> {
  items: Ref<T[]>;
  containerRef: Ref<HTMLElement | { $el?: HTMLElement | null } | null>;
  onDragEnd?: (newItems: T[]) => void;
  scrollSpeed?: number;
  scrollThreshold?: number;
  onError?: (error: Error) => void;
  onPerformanceIssue?: (fps: number) => void;
}

export function useGridDrag<T extends { id: string | number }>(options: DragOptions<T>) {
  const { items, containerRef, onDragEnd, scrollSpeed = 10, scrollThreshold = 50, onError, onPerformanceIssue } = options;

  const isDragging = ref(false);
  const draggedIndex = ref<number>(-1);
  const ghostElement = ref<HTMLElement | null>(null);
  const targetIndex = ref<number>(-1);

  // State for drag
  let startX = 0;
  let startY = 0;
  let initialGhostRect = { left: 0, top: 0, width: 0, height: 0 };
  
  // Animation frame for smooth drag
  let animationFrameId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  // Auto-scroll
  
  const getContainer = (): HTMLElement | null => {
    const el = containerRef.value;
    if (!el) return null;
    // Handle Vue component instance (like TransitionGroup)
    if (typeof el === 'object' && el !== null && '$el' in el) {
      return (el as { $el?: HTMLElement | null }).$el ?? null;
    }
    return el as HTMLElement;
  };

  const createGhost = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Copy computed styles to preserve appearance
    const computedStyle = window.getComputedStyle(element);
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.boxSizing = computedStyle.boxSizing;
    clone.style.padding = computedStyle.padding;
    clone.style.margin = '0'; // Reset margin for fixed positioning
    clone.style.background = computedStyle.background;
    clone.style.borderRadius = computedStyle.borderRadius;
    
    // Fixed positioning for the ghost
    clone.style.position = 'fixed';
    clone.style.top = `${rect.top}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.zIndex = '1000';
    clone.style.pointerEvents = 'none'; // Allow events to pass through to check underlying elements
    clone.style.opacity = '0.9';
    clone.style.transform = 'scale(1.05)';
    clone.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4)';
    clone.style.transition = 'none';
    
    // Store initial ghost rect for calculations without layout thrashing
    initialGhostRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    
    // Ensure all children have same styles
    // (Deep cloning usually preserves inline styles, but computed styles like flex might be lost if not explicit)
    // For this specific use case, we assume the CSS classes handle most styling.
    
    document.body.appendChild(clone);
    return { ghost: clone };
  };

  const startDrag = (index: number, event: MouseEvent | TouchEvent) => {
    const target = event.target as HTMLElement;
    // Prevent drag on interactive elements
    if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button')) {
      return;
    }

    const initiate = (clientX: number, clientY: number) => {
        isDragging.value = true;
        draggedIndex.value = index;
        targetIndex.value = index;
        startX = clientX;
        startY = clientY;
        lastClientX = clientX;
        lastClientY = clientY;

        const container = getContainer();
        if (!container) return;
        const children = Array.from(container.children) as HTMLElement[];
        const element = children[index];
        if (!element) return;

        const { ghost } = createGhost(element);
        ghostElement.value = ghost;
        element.style.opacity = '0.2';
        element.style.visibility = 'visible';

        window.addEventListener('mousemove', onDragMove, { passive: false });
        window.addEventListener('touchmove', onDragMove, { passive: false });
        window.addEventListener('mouseup', onDragEndHandler);
        window.addEventListener('touchend', onDragEndHandler);
        
        startAnimationLoop();
    };

    if (event.type === 'touchstart') {
       const touch = (event as TouchEvent).touches[0];
       const sX = touch.clientX;
       const sY = touch.clientY;
       
       let timer: ReturnType<typeof setTimeout> | null = null;
       
       const clear = () => {
         if (timer) clearTimeout(timer);
         window.removeEventListener('touchmove', checkMove);
         window.removeEventListener('touchend', clear);
       };
       
       const checkMove = (e: TouchEvent) => {
         const t = e.touches[0];
         if (Math.abs(t.clientX - sX) > 10 || Math.abs(t.clientY - sY) > 10) {
           clear();
         }
       };

       window.addEventListener('touchmove', checkMove, { passive: true });
       window.addEventListener('touchend', clear);
       
       timer = setTimeout(() => {
         clear();
         initiate(sX, sY);
         if (navigator.vibrate) navigator.vibrate(50);
       }, 300);
       
       return;
    }

    // Mouse
    if (event.cancelable) event.preventDefault();
    initiate((event as MouseEvent).clientX, (event as MouseEvent).clientY);
  };

  const startAnimationLoop = () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    let lastTime = performance.now();
    let frameCount = 0;
    
    // Throttle drop target calculation to avoid excessive layout thrashing
    let lastCalcTime = 0;

    const loop = () => {
      if (!isDragging.value) return;
      
      const now = performance.now();
      frameCount++;
      
      if (now - lastTime >= 1000) {
        if (frameCount < 55 && onPerformanceIssue) { // 60fps target, allow small drop
          onPerformanceIssue(frameCount);
        }
        frameCount = 0;
        lastTime = now;
      }
      
      try {
        // ORDER MATTERS FOR PERFORMANCE:
        // 1. Read layout (calculateDropTarget reads getBoundingClientRect)
        // 2. Write layout (scroll, transform)
        
        // Throttle heavy calculation (every ~30ms = 30fps for logic, 60fps for visual)
        if (now - lastCalcTime > 32) {
          calculateDropTarget();
          lastCalcTime = now;
        }
        
        checkAutoScroll();
        updateGhostPosition();
      } catch (e) {
        console.error('Drag error:', e);
        if (onError) onError(e as Error);
        // Emergency cleanup
        isDragging.value = false;
        if (ghostElement.value) {
            ghostElement.value.remove();
            ghostElement.value = null;
        }
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('touchmove', onDragMove);
        window.removeEventListener('mouseup', onDragEndHandler);
        window.removeEventListener('touchend', onDragEndHandler);
        return;
      }
      
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
  };

  const updateGhostPosition = () => {
    if (!ghostElement.value) return;
    
    const deltaX = lastClientX - startX;
    const deltaY = lastClientY - startY;
    
    // Use transform for performance
    ghostElement.value.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.05)`;
  };

  const onDragMove = (event: MouseEvent | TouchEvent) => {
    if (!isDragging.value) return;
    
    if (event.cancelable) event.preventDefault(); // Stop scrolling

    const clientX = event instanceof MouseEvent ? event.clientX : (event as TouchEvent).touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;
    
    lastClientX = clientX;
    lastClientY = clientY;
  };

  const calculateDropTarget = () => {
    const container = getContainer();
    if (!container) return;

    // Use cached ghost position + delta instead of asking DOM (which forces layout)
    const deltaX = lastClientX - startX;
    const deltaY = lastClientY - startY;
    const ghostLeft = initialGhostRect.left + deltaX;
    const ghostTop = initialGhostRect.top + deltaY;
    
    // Center point of the dragged ghost
    const ghostCenterX = ghostLeft + initialGhostRect.width / 2;
    const ghostCenterY = ghostTop + initialGhostRect.height / 2;
    
    // Ghost boundaries
    const ghostRight = ghostLeft + initialGhostRect.width;
    const ghostBottom = ghostTop + initialGhostRect.height;

    const children = Array.from(container.children) as HTMLElement[];
    
    // Find closest item
    let closestIndex = -1;
    let minDistance = Infinity;

    children.forEach((child, index) => {
      // Don't skip the dragged item itself, as we might drop it back to original position
      // But we generally look for other items.
      
      const rect = child.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dist = (ghostCenterX - centerX) ** 2 + (ghostCenterY - centerY) ** 2;
      
      // Optimization: Check if overlapping
      if (ghostRight < rect.left || ghostLeft > rect.right || ghostBottom < rect.top || ghostTop > rect.bottom) return;

      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    });
    
    if (closestIndex !== -1 && closestIndex !== targetIndex.value) {
      targetIndex.value = closestIndex;
      // Trigger haptic feedback if available when target changes
      if (navigator.vibrate) navigator.vibrate(5);
    }
  };

  const checkAutoScroll = () => {
    const innerHeight = window.innerHeight;
    const threshold = scrollThreshold;
    
    if (lastClientY < threshold) {
      // Scroll up
      window.scrollBy(0, -scrollSpeed);
    } else if (lastClientY > innerHeight - threshold) {
      // Scroll down
      window.scrollBy(0, scrollSpeed);
    }
  };

  const onDragEndHandler = async () => {
    if (!isDragging.value) return;
    
    isDragging.value = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('mouseup', onDragEndHandler);
    window.removeEventListener('touchend', onDragEndHandler);

    if (ghostElement.value) {
      // Perform the swap on drop
      if (draggedIndex.value !== -1 && targetIndex.value !== -1 && draggedIndex.value !== targetIndex.value) {
        // Validate items.value before spreading
        if (items.value && typeof items.value[Symbol.iterator] === 'function') {
           const newItems = [...items.value];
           const [movedItem] = newItems.splice(draggedIndex.value, 1);
           newItems.splice(targetIndex.value, 0, movedItem);
           items.value = newItems;
           // Update draggedIndex to point to the new location so we can animate there
           draggedIndex.value = targetIndex.value;
        }
      }

      // Find the final position of the element
      await nextTick();
      const container = getContainer();
      if (!container) return;

      const children = Array.from(container.children) as HTMLElement[];
      const element = children[draggedIndex.value];
      
      if (element) {
        const destRect = element.getBoundingClientRect();
        
        // FLIP animation for ghost to snap to grid
        // Calculate the difference between current ghost position and destination
        // Current ghost is fixed at (initialGhostLeft + deltaX, initialGhostTop + deltaY)
        // We want to animate it to (destRect.left, destRect.top)
        
        // Reset transform to identity but set top/left to current visual position to start animation
        
        ghostElement.value.style.transition = 'all 0.4s cubic-bezier(0.2, 0, 0, 1)';
        ghostElement.value.style.transform = 'scale(1)';
        ghostElement.value.style.left = `${destRect.left}px`;
        ghostElement.value.style.top = `${destRect.top}px`;
        
        // Wait for transition
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Restore original element
        element.style.opacity = '';
        element.style.visibility = '';
      }
      
      ghostElement.value.remove();
      ghostElement.value = null;
    }
    
    draggedIndex.value = -1;
    targetIndex.value = -1;
    
    if (onDragEnd) onDragEnd(items.value);
  };

  return {
    startDrag,
    isDragging,
    draggedIndex
  };
}
