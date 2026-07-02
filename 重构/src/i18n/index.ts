import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';

// 检测浏览器语言
function detectBrowserLanguage(): string {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
}

// 从 localStorage 获取保存的语言设置
function getStoredLanguage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('app-language');
}

// 获取初始语言
function getInitialLocale(): string {
  const stored = getStoredLanguage();
  if (stored && ['zh-CN', 'en-US'].includes(stored)) {
    return stored;
  }
  return detectBrowserLanguage();
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
  // 数字和日期格式化
  numberFormats: {
    'zh-CN': {
      currency: {
        style: 'currency',
        currency: 'CNY',
        notation: 'standard',
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      },
    },
    'en-US': {
      currency: {
        style: 'currency',
        currency: 'USD',
        notation: 'standard',
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      },
    },
  },
  datetimeFormats: {
    'zh-CN': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
      long: {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      },
    },
    'en-US': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
      long: {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      },
    },
  },
});

// 切换语言并持久化
export function setLanguage(locale: string): void {
  if (!['zh-CN', 'en-US'].includes(locale)) return;
  i18n.global.locale.value = locale as 'zh-CN' | 'en-US';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('app-language', locale);
  }
  // 更新 HTML lang 属性
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale);
  }
}

// 获取当前语言
export function getCurrentLanguage(): string {
  return i18n.global.locale.value;
}

export default i18n;
