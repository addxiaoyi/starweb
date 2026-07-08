import type { InjectionKey, Ref } from 'vue';

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right';

export interface PopoverProps {
  class?: string;
}

export interface PopoverContentProps {
  class?: string;
  side?: PopoverSide;
  sideOffset?: number;
}

export interface PopoverContext {
  isOpen: Ref<boolean>;
  triggerRef: Ref<HTMLElement | null>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setTriggerRef: (el: HTMLElement | null) => void;
}

export const POPOVER_CONTEXT_KEY: InjectionKey<PopoverContext> = Symbol('Popover');
