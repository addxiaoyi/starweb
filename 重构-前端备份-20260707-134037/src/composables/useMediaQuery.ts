import { computed } from 'vue';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const breakpointMap: Record<Breakpoint, number> = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/**
 * Reactive media query breakpoints
 */
export function useMediaQuery() {
  const getMatch = (query: string): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  };

  const isXs = computed(() => getMatch(`(max-width: ${breakpointMap.xs - 1}px)`));
  const isSm = computed(() => getMatch(`(min-width: ${breakpointMap.xs}px) and (max-width: ${breakpointMap.md - 1}px)`));
  const isMd = computed(() => getMatch(`(min-width: ${breakpointMap.md}px) and (max-width: ${breakpointMap.lg - 1}px)`));
  const isLg = computed(() => getMatch(`(min-width: ${breakpointMap.lg}px) and (max-width: ${breakpointMap.xl - 1}px)`));
  const isXl = computed(() => getMatch(`(min-width: ${breakpointMap.xl}px) and (max-width: ${breakpointMap['2xl'] - 1}px)`));
  const is2xl = computed(() => getMatch(`(min-width: ${breakpointMap['2xl']}px)`));

  const currentBreakpoint = computed<Breakpoint>(() => {
    if (is2xl.value) return '2xl';
    if (isXl.value) return 'xl';
    if (isLg.value) return 'lg';
    if (isMd.value) return 'md';
    if (isSm.value) return 'sm';
    return 'xs';
  });

  const isMobile = computed(() => isXs.value || isSm.value);
  const isTablet = computed(() => isMd.value);
  const isDesktop = computed(() => isLg.value || isXl.value || is2xl.value);

  const prefersDark = computed(() => getMatch('(prefers-color-scheme: dark)'));
  const prefersReducedMotion = computed(() => getMatch('(prefers-reduced-motion: reduce)'));

  return {
    isXs,
    isSm,
    isMd,
    isLg,
    isXl,
    is2xl,
    currentBreakpoint,
    isMobile,
    isTablet,
    isDesktop,
    prefersDark,
    prefersReducedMotion,
  };
}
