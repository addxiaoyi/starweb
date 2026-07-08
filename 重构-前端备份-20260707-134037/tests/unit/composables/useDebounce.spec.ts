import { describe, it, expect } from 'vitest';
import { debounce } from '@/composables/useDebounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only execute once when called multiple times within delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the debounced function', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn('arg1', 'arg2');

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should reset timer when called again', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn();
    vi.advanceTimersByTime(200);
    debouncedFn();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
