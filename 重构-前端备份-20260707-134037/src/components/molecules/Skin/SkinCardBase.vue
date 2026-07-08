<template>
  <!--
    @slot default
    内容区插槽（`.skin-card-base__content`）。
    建议放置标题、说明、标签组、操作按钮等卡片主体内容。
  -->
  <component
    :is="as"
    class="skin-card-base"
    :class="[
      { 'is-interactive': interactive },
      themeClass
    ]"
    :style="rootStyle"
    :type="as === 'button' ? 'button' : undefined"
    @click="handleClick"
  >
    <div class="skin-card-base__cover" :style="coverStyle"></div>
    <span v-if="tag" class="skin-card-base__tag">{{ tag }}</span>
    <div class="skin-card-base__content">
      <slot />
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface SkinCardBaseProps {
  /**
   * 根节点标签类型。
   * - `div`: 普通容器
   * - `button`: 可交互卡片（会自动附加 type="button"）
   */
  as?: 'div' | 'button';
  /**
   * 封面区域的行内样式对象，例如背景图/渐变。
   */
  coverStyle?: Record<string, string>;
  /**
   * 左上角标签文本；为空时不渲染标签。
   */
  tag?: string;
  /**
   * 是否启用交互态（hover/active）并允许触发 click 事件。
   */
  interactive?: boolean;
  /**
   * 封面高度（像素）。
   */
  coverHeight?: number;
  /**
   * 内容区内边距，支持任意合法 CSS 长度值。
   */
  contentPadding?: string;
  /**
   * 主题预设：
   * - `default`: 默认主题
   * - `emerald`: 绿色主题
   * - `azure`: 蓝色主题
   * - `custom`: 不附加预设类，交由外部 CSS 变量完全自定义
   */
  theme?: 'default' | 'emerald' | 'azure' | 'custom';
}

const props = withDefaults(defineProps<SkinCardBaseProps>(), {
  as: 'div',
  coverStyle: () => ({}),
  tag: '',
  interactive: false,
  coverHeight: 72,
  contentPadding: '0.75rem',
  theme: 'default'
});

const emit = defineEmits<{
  /**
   * 仅在 interactive=true 时触发。
   */
  (e: 'click'): void;
}>();

const rootStyle = computed(() => ({
  '--skin-card-cover-height': `${props.coverHeight}px`,
  '--skin-card-content-padding': props.contentPadding
}));

const themeClass = computed(() => {
  if (props.theme === 'default') return 'skin-card-theme-default';
  if (props.theme === 'emerald') return 'skin-card-theme-emerald';
  if (props.theme === 'azure') return 'skin-card-theme-azure';
  return '';
});

const handleClick = () => {
  if (!props.interactive) return;
  emit('click');
};
</script>

<style scoped lang="scss">
.skin-card-base {
  width: 100%;
  position: relative;
  border-radius: var(--skin-card-radius, 0);
  border: var(--skin-card-border-width, 3px) solid var(--skin-card-border-color, #1f2f18);
  background: var(--skin-card-bg, linear-gradient(180deg, rgba(72, 95, 56, 0.9) 0%, rgba(48, 69, 38, 0.94) 100%));
  box-shadow: var(
    --skin-card-shadow,
    inset 0 2px 0 rgba(187, 220, 145, 0.35),
    inset 0 -2px 0 rgba(0, 0, 0, 0.35),
    0 6px 0 #192614,
    0 12px 24px rgba(0, 0, 0, 0.35)
  );
  overflow: hidden;
}

.skin-card-base.is-interactive {
  cursor: pointer;
  transition: transform 120ms steps(2), filter 120ms steps(2), border-color 120ms steps(2);
}

.skin-card-base.is-interactive:hover {
  transform: translateY(-1px);
  filter: brightness(var(--skin-card-hover-brightness, 1.03));
  border-color: var(--skin-card-hover-border-color, #b8e183);
}

.skin-card-base.is-interactive:active {
  transform: translateY(1px);
}

.skin-card-base__cover {
  width: 100%;
  height: var(--skin-card-cover-height);
  background-size: cover;
  background-position: center;
  border-bottom: var(--skin-card-cover-divider-width, 2px) solid var(--skin-card-border-color, #1f2f18);
}

.skin-card-base__tag {
  position: absolute;
  top: 5px;
  left: 5px;
  font-size: 0.6rem;
  background: var(--skin-card-tag-bg, #2f4525);
  color: var(--skin-card-tag-color, #def2c2);
  padding: 2px 6px;
  border-radius: var(--skin-card-tag-radius, 0);
  border: var(--skin-card-tag-border-width, 2px) solid var(--skin-card-border-color, #1f2f18);
}

.skin-card-base__content {
  padding: var(--skin-card-content-padding);
}

.skin-card-theme-default {
  --skin-card-border-color: #24331c;
  --skin-card-bg: linear-gradient(180deg, rgba(64, 88, 52, 0.92) 0%, rgba(43, 62, 31, 0.96) 100%);
  --skin-card-shadow:
    inset 0 2px 0 rgba(202, 230, 164, 0.34),
    inset 0 -2px 0 rgba(0, 0, 0, 0.34),
    0 6px 0 #182413,
    0 12px 24px rgba(0, 0, 0, 0.34);
  --skin-card-hover-border-color: #bfdc87;
  --skin-card-hover-brightness: 1.04;
  --skin-card-tag-bg: #314722;
  --skin-card-tag-color: #dff1c4;
}

.skin-card-theme-emerald {
  --skin-card-border-color: #1f2f18;
  --skin-card-bg: linear-gradient(180deg, rgba(72, 95, 56, 0.9) 0%, rgba(48, 69, 38, 0.94) 100%);
  --skin-card-shadow:
    inset 0 2px 0 rgba(187, 220, 145, 0.35),
    inset 0 -2px 0 rgba(0, 0, 0, 0.35),
    0 6px 0 #192614,
    0 12px 24px rgba(0, 0, 0, 0.35);
  --skin-card-hover-border-color: #b8e183;
  --skin-card-hover-brightness: 1.03;
  --skin-card-tag-bg: #2f4525;
  --skin-card-tag-color: #def2c2;
}

.skin-card-theme-azure {
  --skin-card-border-color: #1b2740;
  --skin-card-bg: linear-gradient(180deg, rgba(44, 70, 118, 0.92) 0%, rgba(28, 46, 86, 0.95) 100%);
  --skin-card-shadow:
    inset 0 2px 0 rgba(186, 206, 255, 0.32),
    inset 0 -2px 0 rgba(0, 0, 0, 0.35),
    0 6px 0 #111a2d,
    0 12px 24px rgba(0, 0, 0, 0.38);
  --skin-card-hover-border-color: #8fb4ff;
  --skin-card-hover-brightness: 1.04;
  --skin-card-tag-bg: #263a5f;
  --skin-card-tag-color: #dbe8ff;
}
</style>
