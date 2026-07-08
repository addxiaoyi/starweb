<template>
  <div class="language-switcher" role="group" :aria-label="t('common.language')">
    <button
      class="lang-btn"
      type="button"
      :class="{ active: currentLang === 'zh-CN' }"
      @click.prevent.stop="switchLang('zh-CN')"
      :aria-label="t('common.language') + ': 中文'"
      :aria-pressed="currentLang === 'zh-CN'"
    >
      中
    </button>
    <span class="lang-divider" aria-hidden="true">/</span>
    <button
      class="lang-btn"
      type="button"
      :class="{ active: currentLang === 'en-US' }"
      @click.prevent.stop="switchLang('en-US')"
      :aria-label="t('common.language') + ': English'"
      :aria-pressed="currentLang === 'en-US'"
    >
      EN
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { setLanguage, i18n } from '@/i18n';

const { t } = useI18n();

const currentLang = computed(() => i18n.global.locale.value);

function switchLang(locale: string) {
  if (locale === currentLang.value) return;
  setLanguage(locale);
}
</script>

<style scoped lang="scss">
.language-switcher {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.lang-btn {
  min-height: 30px;
  min-width: 34px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(235, 241, 255, 0.68);
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: color 180ms var(--ease-standard), background-color 180ms var(--ease-standard), transform 180ms var(--ease-standard);

  &:hover {
    color: rgba(255, 255, 255, 0.92);
    background: rgba(255, 255, 255, 0.05);
  }

  &.active {
    color: #fff;
    background: rgba(124, 140, 255, 0.16);
  }

  &:focus-visible {
    outline: 2px solid rgba(124, 140, 255, 0.65);
    outline-offset: 2px;
  }
}

.lang-divider {
  color: rgba(255, 255, 255, 0.18);
  font-size: 10px;
}
</style>
