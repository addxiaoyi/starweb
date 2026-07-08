export interface ScrollFloatConfig {
  duration: number;
  ease: string;
  scrollStart: string;
  scrollEnd: string;
  stagger: number;
  fontSize: string;
}

export interface FloatUpConfig {
  duration: number;
  delay: number;
  distance: number;
  threshold: number;
  rootMargin: string;
}

export interface FadeInConfig {
  duration: number;
  ease: string;
}

export interface SlideInConfig {
  duration: number;
  ease: string;
  distance: number;
}

export interface ScaleConfig {
  duration: number;
  ease: string;
  scaleFrom: number;
  scaleTo: number;
}

export interface AnimationConfig {
  scrollFloat: ScrollFloatConfig;
  floatUp: FloatUpConfig;
  fadeIn: FadeInConfig;
  slideIn: SlideInConfig;
  scale: ScaleConfig;
}

export const ANIMATION_CONFIG: AnimationConfig = {
  scrollFloat: {
    duration: 1,
    ease: 'back.inOut(2)',
    scrollStart: 'center bottom+=50%',
    scrollEnd: 'bottom bottom-=40%',
    stagger: 0.03,
    fontSize: 'clamp(1.6rem, 8vw, 10rem)'
  },

  floatUp: {
    duration: 480,
    delay: 0,
    distance: 14,
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px'
  },

  fadeIn: {
    duration: 0.5,
    ease: 'power1.out'
  },

  slideIn: {
    duration: 0.6,
    ease: 'power2.out',
    distance: 30
  },

  scale: {
    duration: 0.5,
    ease: 'back.out(1.7)',
    scaleFrom: 0.95,
    scaleTo: 1
  }
};

export interface PriorityConfig {
  duration: number;
  ease: string;
  stagger: number;
}

export const ANIMATION_PRIORITIES: Record<string, PriorityConfig> = {
  high: {
    duration: 0.8,
    ease: 'power2.out',
    stagger: 0.05
  },

  medium: {
    duration: 0.6,
    ease: 'power2.out',
    stagger: 0.03
  },

  low: {
    duration: 0.4,
    ease: 'power1.out',
    stagger: 0.02
  }
};

export interface DeviceConfig {
  enabled: boolean;
  quality: 'high' | 'medium' | 'low';
  maxConcurrentAnimations: number;
}

export const DEVICE_ANIMATION_CONFIG: Record<string, DeviceConfig> = {
  desktop: {
    enabled: true,
    quality: 'high',
    maxConcurrentAnimations: 10
  },

  mobile: {
    enabled: true,
    quality: 'medium',
    maxConcurrentAnimations: 5
  },

  'low-end': {
    enabled: false,
    quality: 'low',
    maxConcurrentAnimations: 2
  }
};

export const getAnimationConfig = (deviceType: string): DeviceConfig => {
  return DEVICE_ANIMATION_CONFIG[deviceType] || DEVICE_ANIMATION_CONFIG.desktop;
};

export const getScrollFloatConfig = (priority: keyof typeof ANIMATION_PRIORITIES = 'medium'): ScrollFloatConfig & PriorityConfig => {
  const priorityConfig = ANIMATION_PRIORITIES[priority];
  return {
    ...ANIMATION_CONFIG.scrollFloat,
    ...priorityConfig
  };
};
