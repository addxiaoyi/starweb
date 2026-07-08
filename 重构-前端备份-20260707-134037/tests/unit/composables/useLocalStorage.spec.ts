import { describe, it, expect, afterEach } from 'vitest';
import { useLocalStorage } from '@/composables/useLocalStorage';
import { nextTick } from 'vue';

describe('useLocalStorage', () => {
  const TEST_KEY = 'test-storage-key';

  afterEach(() => {
    localStorage.removeItem(TEST_KEY);
  });

  it('should return default value when no stored value exists', () => {
    const value = useLocalStorage(TEST_KEY, 'default');
    expect(value.value).toBe('default');
  });

  it('should read existing value from localStorage', () => {
    localStorage.setItem(TEST_KEY, JSON.stringify('stored'));
    const value = useLocalStorage(TEST_KEY, 'default');
    expect(value.value).toBe('stored');
  });

  it('should sync value changes to localStorage', async () => {
    const value = useLocalStorage<string>(TEST_KEY, 'initial');
    value.value = 'updated';
    await nextTick();
    expect(localStorage.getItem(TEST_KEY)).toBe(JSON.stringify('updated'));
  });

  it('should handle object values', async () => {
    const value = useLocalStorage(TEST_KEY, { name: 'test' });
    value.value = { name: 'updated' };
    await nextTick();
    expect(localStorage.getItem(TEST_KEY)).toBe(JSON.stringify({ name: 'updated' }));
  });

  it('should initialize with string default value', async () => {
    // Verify the composable can be instantiated with a string type
    const value = useLocalStorage<string>(TEST_KEY, 'initial');
    expect(value.value).toBe('initial');
  });

  it('should handle deep objects with reactivity', async () => {
    const value = useLocalStorage<{ nested: { value: number } }>(TEST_KEY, { nested: { value: 1 } });
    value.value.nested.value = 42;
    await nextTick();
    expect(localStorage.getItem(TEST_KEY)).toBe(JSON.stringify({ nested: { value: 42 } }));
  });
});
