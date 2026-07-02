import type { Directive, DirectiveBinding } from 'vue';
import { ANIMATION_CONFIG } from '@/shared/config/animationConfig';

interface FloatUpHTMLElement extends HTMLElement {
  _floatUpObserver?: IntersectionObserver;
  _floatUpCleanup?: () => void;
}

interface FloatUpBinding {
  delay?: number;
  duration?: number;
  distance?: number;
  threshold?: number;
  rootMargin?: string;
}

const getBindingConfig = (binding: DirectiveBinding<FloatUpBinding | number | undefined>) => {
  const value = binding.value;
  const options = typeof value === 'number' ? { delay: value } : value ?? {};

  return {
    ...ANIMATION_CONFIG.floatUp,
    ...options,
  };
};

const reveal = (el: FloatUpHTMLElement, settleAfter = 0) => {
  el.classList.add('motion-reveal--visible');

  let settleTimer: number | undefined;
  const settle = () => {
    el.classList.add('motion-reveal--settled');
    el.removeEventListener('transitionend', settle);
    if (settleTimer) window.clearTimeout(settleTimer);
  };

  el.addEventListener('transitionend', settle);
  if (settleAfter > 0) {
    settleTimer = window.setTimeout(settle, settleAfter + 80);
  }

  el._floatUpCleanup = settle;
};

const shouldReduceMotion = () => {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const vFloatUp: Directive<FloatUpHTMLElement, FloatUpBinding | number | undefined> = {
  beforeMount(el, binding) {
    const config = getBindingConfig(binding);

    el.classList.add('motion-reveal');
    el.style.setProperty('--motion-reveal', `${config.duration}ms`);
    el.style.setProperty('--motion-reveal-delay', `${config.delay}ms`);
    el.style.setProperty('--motion-reveal-distance', `${config.distance}px`);
  },

  mounted(el, binding) {
    const config = getBindingConfig(binding);

    if (typeof window === 'undefined' || shouldReduceMotion()) {
      reveal(el, 0);
      el.classList.add('motion-reveal--settled');
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      reveal(el, config.duration + config.delay);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reveal(el, config.duration + config.delay);
        observer.unobserve(el);
      }
    }, {
      root: null,
      rootMargin: config.rootMargin,
      threshold: config.threshold,
    });

    observer.observe(el);
    el._floatUpObserver = observer;
  },

  updated(el, binding) {
    const config = getBindingConfig(binding);

    el.style.setProperty('--motion-reveal', `${config.duration}ms`);
    el.style.setProperty('--motion-reveal-delay', `${config.delay}ms`);
    el.style.setProperty('--motion-reveal-distance', `${config.distance}px`);
  },

  unmounted(el) {
    el._floatUpObserver?.disconnect();
    el._floatUpCleanup?.();
  }
};

export default vFloatUp;
