<template>
  <svg
    class="app-icon"
    :class="{ 'app-icon--spin': spin }"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g
      stroke="currentColor"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path v-for="(path, index) in current.paths" :key="index" :d="path" />
      <circle
        v-for="(circle, index) in current.circles || []"
        :key="`c-${index}`"
        :cx="circle.cx"
        :cy="circle.cy"
        :r="circle.r"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { APP_ICON_PATHS, type AppIconName, type IconGlyph } from './appIcons'

const props = withDefaults(
  defineProps<{
    name: AppIconName
    size?: number
    strokeWidth?: number
    spin?: boolean
  }>(),
  {
    size: 22,
    strokeWidth: 1.8,
    spin: false,
  }
)

const current = computed<IconGlyph>(
  () => (APP_ICON_PATHS[props.name] ?? APP_ICON_PATHS.infoCircle) as IconGlyph
)
</script>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}

.app-icon--spin {
  transform-origin: center;
  animation: app-icon-spin 0.75s linear infinite;
}

@keyframes app-icon-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
