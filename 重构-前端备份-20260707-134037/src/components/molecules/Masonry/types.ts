export interface MasonryItem {
  id: string;
  img: string;
  url: string;
  height: number;
  width?: number;
}

export interface MasonryProps {
  items: MasonryItem[];
  ease?: string;
  duration?: number;
  stagger?: number;
  animateFrom?: 'bottom' | 'top' | 'left' | 'right' | 'center' | 'random';
  scaleOnHover?: boolean;
  hoverScale?: number;
  blurToFocus?: boolean;
  colorShiftOnHover?: boolean;
  class?: string;
}

export interface GridItem extends MasonryItem {
  x: number;
  y: number;
  w: number;
  h: number;
}
