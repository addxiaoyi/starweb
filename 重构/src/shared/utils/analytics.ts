declare global {
  function gtag(type: string, name: string, parameters?: Record<string, unknown>): void;
}

export const trackPageView = (page: string): void => {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'page_view', {
      page_title: page,
      page_location: window.location.href,
      page_path: window.location.pathname
    });
  }
  // console.log('[Analytics] Page view:', page, window.location.pathname);
};

export const trackEvent = (eventName: string, parameters: Record<string, unknown> = {}): void => {
  if (typeof gtag !== 'undefined') {
    gtag('event', eventName, parameters);
  }
  // console.log('[Analytics] Event:', eventName, parameters);
};

export const trackError = (error: unknown, context: Record<string, unknown> = {}): void => {
  const err = error as Error | null;
  const errorData = {
    message: err?.message || 'Unknown error',
    stack: err?.stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    context
  };
  
  console.error('[Error Tracking]', errorData);
  
  if (typeof gtag !== 'undefined') {
    gtag('event', 'exception', {
      description: errorData.message,
      fatal: 'false' as unknown as boolean // gtag exception expects boolean, but we cast for safety if needed
    });
  }
};

export const trackPerformance = (): void => {
  if (typeof PerformanceObserver !== 'undefined') {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const entryData = entry as PerformanceEntry & { value?: number };
        
        if (typeof gtag !== 'undefined' && entryData.value !== undefined) {
          gtag('event', 'timing_complete', {
            name: entryData.name,
            value: Math.round(entryData.value)
          });
        }
      }
    });
    
    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input-delay', 'cumulative-layout-shift'] });
  }
};

export const trackUserAction = (action: string, details: Record<string, unknown> = {}): void => {
  // console.log('[User Action]', action, details);
  
  if (typeof gtag !== 'undefined') {
    gtag('event', action, details);
  }
};
