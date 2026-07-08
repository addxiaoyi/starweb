import { ref, onMounted, onUnmounted, type Ref } from 'vue';

/**
 * Intersection Observer composable for lazy loading
 */
export function useIntersection(
  target: Ref<HTMLElement | null>,
  options: IntersectionObserverInit = {}
) {
  const isIntersecting = ref(false);
  const hasIntersected = ref(false);
  const ratio = ref(0);

  let observer: IntersectionObserver | null = null;

  const defaultOptions: IntersectionObserverInit = {
    threshold: [0, 0.25, 0.5, 0.75, 1],
    rootMargin: '50px',
    ...options,
  };

  onMounted(() => {
    if (!target.value) return;

    observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      isIntersecting.value = entry.isIntersecting;
      ratio.value = entry.intersectionRatio;

      if (entry.isIntersecting) {
        hasIntersected.value = true;
      }
    }, defaultOptions);

    observer.observe(target.value);
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  return {
    isIntersecting,
    hasIntersected,
    ratio,
  };
}
