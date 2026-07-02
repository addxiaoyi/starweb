import type { AppIconName } from '@/components/atoms/appIcons'

export interface Tab {
  id: string | number;
  label: string;
  /** 优先使用 SVG 图标 */
  iconName?: AppIconName;
  /** 自定义 CSS 类（非 Font Awesome） */
  iconClass?: string;
  icon?: string;
}

export interface CreativeUIProps {
  modelValue: string | number;
  tabs: Tab[];
  className?: string;
}
