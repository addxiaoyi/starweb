import { ref, onUnmounted } from 'vue';

/**
 * Debounced value with cleanup
 */
export function useDebounce<T>(value: T, delay: number = 300): { debouncedValue: typeof value; isDebouncing: ReturnType<typeof ref<boolean>> } {
  const debouncedValue = ref<T>(value) as ReturnType<typeof ref<T>>;
  const isDebouncing = ref(false);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const update = (newValue: T) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    isDebouncing.value = true;
    timeout = setTimeout(() => {
      debouncedValue.value = newValue;
      isDebouncing.value = false;
      timeout = null;
    }, delay);
  };

  onUnmounted(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });

  // Create a method to update
  const debouncedUpdate = (newValue: T) => update(newValue);

  return {
    get debouncedValue() { return debouncedValue.value; },
    set debouncedValue(v) { update(v); },
    isDebouncing,
    update: debouncedUpdate
  } as unknown as { debouncedValue: T; isDebouncing: ReturnType<typeof ref<boolean>>; update: (v: T) => void };
}

/**
 * Simple debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, delay);
  };
}
