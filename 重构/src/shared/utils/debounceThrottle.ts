type Fn<Args extends unknown[], R> = (...args: Args) => R;

export function debounce<Args extends unknown[], R>(
  func: Fn<Args, R>,
  wait: number = 300,
  immediate: boolean = false
): {
  (...args: Args): R | undefined;
  cancel(): void;
  flush(): R | undefined;
} {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let result: R | undefined;
  let lastArgs: Args | null = null;

  const later = () => {
    timeout = null;
    if (!immediate && lastArgs) {
      result = func(...lastArgs);
      lastArgs = null;
    }
  };

  const debounced = (...args: Args): R | undefined => {
    lastArgs = args;

    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);

    if (callNow) {
      result = func(...args);
      lastArgs = null;
    }

    return result;
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = null;
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      if (lastArgs) {
        result = func(...lastArgs);
        lastArgs = null;
      }
    }
    return result;
  };

  return debounced;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export function throttle<Args extends unknown[], R>(
  func: Fn<Args, R>,
  wait: number = 300,
  options: ThrottleOptions = {}
): {
  (...args: Args): R | undefined;
  cancel(): void;
  flush(): R | undefined;
} {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let result: R | undefined;
  let lastArgs: Args | null = null;
  let previous = 0;

  const { leading = true, trailing = true } = options;

  const later = () => {
    previous = leading === false ? 0 : Date.now();
    timeout = null;
    if (trailing && lastArgs) {
      result = func(...lastArgs);
      lastArgs = null;
    }
  };

  const throttled = (...args: Args): R | undefined => {
    const now = Date.now();
    if (!previous && leading === false) {
      previous = now;
    }
    const remaining = wait - (now - previous);
    lastArgs = args;

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func(...args);
      lastArgs = null;
    } else if (!timeout && trailing !== false) {
      timeout = setTimeout(later, remaining);
    }

    return result;
  };

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    previous = 0;
    timeout = null;
    lastArgs = null;
  };

  throttled.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      if (lastArgs) {
        result = func(...lastArgs);
        lastArgs = null;
      }
    }
    return result;
  };

  return throttled;
}
