import { ref, watch, type Ref } from 'vue';

/**
 * Reactive localStorage with TypeScript support
 */
export function useLocalStorage<T>(key: string, defaultValue: T): Ref<T> {
  const storedValue = localStorage.getItem(key);

  const data = ref<T>(
    storedValue !== null && storedValue !== undefined
      ? (JSON.parse(storedValue) as T)
      : defaultValue
  ) as Ref<T>;

  watch(
    data,
    (newValue) => {
      // Handle null/undefined explicitly
      if (newValue === null || newValue === undefined) {
        localStorage.removeItem(key);
      } else {
        try {
          localStorage.setItem(key, JSON.stringify(newValue));
        } catch {
          // Handle potential storage errors
          console.error(`Failed to save to localStorage: ${key}`);
        }
      }
    },
    { deep: true }
  );

  return data;
}
