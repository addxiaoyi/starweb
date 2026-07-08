import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from '@/stores/toast';

describe('useToastStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should add a toast message', () => {
    const store = useToastStore();
    expect(store.toasts).toHaveLength(0);

    store.addToast({ message: 'Test message', type: 'success' });

    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].message).toBe('Test message');
    expect(store.toasts[0].type).toBe('success');
  });

  it('should generate unique ids for toast messages', () => {
    const store = useToastStore();

    store.addToast({ message: 'First', type: 'info' });
    store.addToast({ message: 'Second', type: 'error' });

    expect(store.toasts[0].id).not.toBe(store.toasts[1].id);
  });

  it('should use default duration of 5000ms', () => {
    const store = useToastStore();
    store.addToast({ message: 'Test', type: 'info' });

    expect(store.toasts[0].duration).toBe(5000);
  });

  it('should accept custom duration', () => {
    const store = useToastStore();
    store.addToast({ message: 'Test', type: 'info', duration: 3000 });

    expect(store.toasts[0].duration).toBe(3000);
  });

  it('should remove toast by id', () => {
    const store = useToastStore();
    store.addToast({ message: 'First', type: 'info' });
    store.addToast({ message: 'Second', type: 'error' });

    const firstId = store.toasts[0].id;
    store.removeToast(firstId);

    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].message).toBe('Second');
  });

  it('should support all toast types', () => {
    const store = useToastStore();
    const types: Array<'info' | 'success' | 'warning' | 'error'> = ['info', 'success', 'warning', 'error'];

    types.forEach((type) => {
      store.addToast({ message: `Message ${type}`, type });
    });

    expect(store.toasts).toHaveLength(4);
    expect(store.toasts.map((t) => t.type)).toEqual(types);
  });

  it('should accept optional title', () => {
    const store = useToastStore();
    store.addToast({ message: 'Test', type: 'info', title: 'Optional Title' });

    expect(store.toasts[0].title).toBe('Optional Title');
  });
});
