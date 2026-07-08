<template>
  <footer
    v-bind="filteredAttrs"
    :class="computedClass"
  >
    <div class="footer-content">
      <div class="footer-grid">
        <div class="footer-section brand-section">
          <h2 class="footer-title mc-title">
            <AppIcon name="cube" :size="22" class="title-icon" /> StarMC
          </h2>
          
          <p class="brand-description" data-typography="prose">
            探索无限可能，创造属于你的世界。StarMC 致力于为玩家提供最优质的 Minecraft 游戏体验，包含生存、创造、小游戏等多种模式。
          </p>
          
          <div class="social-links">
            <a
              :href="config.social.github"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link"
              title="GitHub"
            >
              <AppIcon name="github" :size="20" />
            </a>
            <a
              :href="config.social.bilibili"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link"
              title="Bilibili"
            >
              <AppIcon name="bilibili" :size="20" />
            </a>
            <a
              :href="config.social.mcmod"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link"
              title="MC百科"
            >
              <AppIcon name="book" :size="20" />
            </a>
            <a
              :href="config.social.minebbs"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link"
              title="MineBBS"
            >
              <AppIcon name="git" :size="20" />
            </a>
          </div>

          <div class="quote-container">
            <p
              v-if="dailyQuote"
              :class="['daily-quote', { 'long-quote': dailyQuote.length > 30 }]"
            >
              <AppIcon name="quoteLeft" :size="14" class="quote-icon-start" />
              <span class="quote-text">{{ dailyQuote }}</span>
              <AppIcon name="quoteRight" :size="14" class="quote-icon-end" />
            </p>
            <p
              v-else
              class="quote-loading"
            >
              <AppIcon name="spinner" :size="16" spin /> 正在加载每日一言
            </p>
          </div>
        </div>

        <div class="footer-section contact-section">
          <h3 class="section-title">
            联系我们
          </h3>
          <ul class="contact-list">
            <li class="contact-item">
              <AppIcon
                name="qq"
                :size="18"
                class="contact-qq-icon"
                title="点击复制群号"
                @click="copyText(config.contacts.qqGroup)"
              />
              <a
                :href="config.contacts.qqGroupLink"
                target="_blank"
                rel="noopener noreferrer"
              >QQ群 {{ config.contacts.qqGroup }}</a>
            </li>
            <li class="contact-item">
              <AppIcon name="mail" :size="18" />
              <a :href="'mailto:' + config.contacts.qqEmail">{{ config.contacts.qqEmail }}</a>
            </li>
            <li class="contact-item">
              <AppIcon name="discord" :size="18" />
              <a
                :href="config.urls.discord"
                target="_blank"
                rel="noopener noreferrer"
                title="需要VPN才能加入"
              >Discord 社区</a>
            </li>
          </ul>
        </div>

        <!-- 时间显示区域 -->
        <div class="footer-section time-section">
          <h3 class="section-title">
            当前时间
          </h3>
          <div class="time-widget">
            <div class="time-main">
              <span class="time-hour">{{ timeParts.hour }}</span>
              <span class="time-blink">:</span>
              <span class="time-minute">{{ timeParts.minute }}</span>
              <span class="time-blink">:</span>
              <span class="time-second">{{ timeParts.second }}</span>
            </div>
            <div class="time-sub">
              <span class="time-date">{{ timeParts.year }}-{{ timeParts.month }}-{{ timeParts.day }}</span>
              <span class="time-week">周{{ timeParts.week }}</span>
            </div>
          </div>
        </div>

        <div class="footer-section auth-section">
          <h3 class="section-title">
            形象与认证
          </h3>
          <div class="auth-container">
            <router-link to="/skin" class="auth-card-link">
              <div class="auth-info-card">
                <AppIcon name="userCircle" :size="40" class="auth-avatar-icon" />
                <div class="auth-info-text">
                  <p class="auth-main-text">皮肤工作站</p>
                  <p class="auth-sub-text">点击管理您的 3D 角色形象</p>
                </div>
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部版权 -->
    <div class="footer-bottom">
      <!-- Minecraft相关网站链接 -->
      <div class="minecraft-links">
        <div class="minecraft-links-grid">
        <!-- 1. MC官方网站 -->
        <div class="link-group">
          <h3 class="link-group-title">官方网站</h3>
          <div class="links-container">
            <Tooltip content="Minecraft官方网站">
              <a :href="config.links.minecraft" target="_blank" rel="noopener noreferrer">Minecraft官网</a>
            </Tooltip>
            <Tooltip content="Minecraft教育版官方网站">
              <a :href="config.links.education" target="_blank" rel="noopener noreferrer">Minecraft教育版</a>
            </Tooltip>
            <Tooltip content="MC的官方反馈社区">
              <a :href="config.links.feedback" target="_blank" rel="noopener noreferrer">反馈社区</a>
            </Tooltip>
          </div>
        </div>

        <!-- 2. 非官方论坛 -->
        <div class="link-group">
          <h3 class="link-group-title">非官方论坛</h3>
          <div class="links-container">
            <Tooltip content="国外比较有名的非官方Minecraft论坛">
              <a :href="config.links.forum" target="_blank" rel="noopener noreferrer">Minecraft Forum</a>
            </Tooltip>
            <Tooltip content="一个新兴的Minecraft技术交流社区">
              <a :href="config.links.mcflare" target="_blank" rel="noopener noreferrer">MCFlare</a>
            </Tooltip>
            <Tooltip content="一个国内的我的世界中文论坛，主营基岩版">
              <a :href="config.links.minebbs" target="_blank" rel="noopener noreferrer">MineBBS</a>
            </Tooltip>
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- 服务器官网信息-->
    <div class="server-info-section">
      <div class="server-info-container">
        <div class="server-info-row">
          <div class="server-info-item">
            <div class="server-info-text server-info-text-primary">
              <span class="copyright-symbol">&copy;</span> 2026 <strong class="brand-highlight">StarMC Network</strong>. ALL RIGHTS RESERVED.
            </div>
          </div>

          <div class="separator-vertical" />

          <div class="server-info-item">
            <div class="server-info-text server-info-text-secondary">
              制作者 ADDXxiaoyi312048 | 核心代码量: {{ totalCodeLines }}
            </div>
          </div>

          <div class="separator-vertical" />

          <div class="server-info-item">
            <div class="server-info-text server-info-text-primary">
              <a
                :href="config.urls.wiki"
                target="_blank"
                rel="noopener noreferrer"
                class="footer-wiki-link"
              >
                <AppIcon name="book" :size="18" class="wiki-link-icon" />WIKI
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </footer>
  <section class="sponsor-landmark" role="region" aria-label="赞助信息">
    <SponsorSection />
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, useAttrs } from 'vue';
import Tooltip from "@/components/atoms/Tooltip.vue";
import SponsorSection from "@/components/organisms/SponsorSection.vue";
import AppIcon from '@/components/atoms/AppIcon.vue';
import { getWensetConfig } from '@/shared/config/wenset';

defineOptions({
  name: 'SiteFooter',
  inheritAttrs: false
});

const config = getWensetConfig();

const attrs = useAttrs();

interface Props {
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  class: ''
});

const filteredAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const computedClass = computed(() => {
  return [
    'site-footer',
    props.class,
    attrs.class
  ].filter(Boolean).join(' ');
});

const dailyQuote = ref<string>('');

interface TimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  week: string;
}

const timeParts = ref<TimeParts>({
  year: '0000',
  month: '00',
  day: '00',
  hour: '00',
  minute: '00',
  second: '00',
  week: '-'
});

// 计算代码总行数
const totalCodeLines = ref<number>(0);

const calculateCodeLines = async () => {
  try {
    totalCodeLines.value = 32158;
  } catch (_e) {
    totalCodeLines.value = 32158;
  }
};

let timer: ReturnType<typeof setInterval> | null = null;

// 组件挂载时计算代码行数
onMounted(() => {
  calculateCodeLines();
  showTime();
  timer = setInterval(showTime, 1000);
  fetchDailyQuote();
});

onUnmounted(() => {
  if (timer) {clearInterval(timer);}
});

const showTime = () => {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const week = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  
  timeParts.value = { year, month, day, hour, minute, second, week };
};

const fetchDailyQuote = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    // 使用配置中的 API 路径，并添加缓存随机参数
    // 支持多个备选API端点（逗号分隔）
    const apiEndpoints = config.urls.hitokoto.split(',').map(url => {
      const separator = url.includes('?') ? '&' : '?';
      return `${url.trim()}${separator}t=${Date.now()}`;
    });
    
    let response: Response | undefined;
    let lastError: Error | undefined;
    
    // 简单的重试逻辑
    for (const url of apiEndpoints) {
      try {
        response = await fetch(url, { 
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit'
        });
        if (response.ok) {break;}
      } catch (_e) {
        lastError = _e as Error;
        continue;
      }
    }
    
    clearTimeout(timeoutId);
    
    if (!response || !response.ok) {
      const errorMessage = lastError?.message || (response ? `API Error: ${response.status}` : 'Network Error');
      throw new Error(errorMessage);
    }
      
      const data = await response.json();
      
      if (data && data.hitokoto) {
      let quote = data.hitokoto;
      if (data.from_who && data.from_who !== 'null') {
        quote += ` ——${data.from_who}`;
      } else if (data.from) {
        quote += ` ——《${data.from}》`;
      }
      dailyQuote.value = quote;
    } else {
      useBackupQuote();
    }
  } catch (_error) {
    clearTimeout(timeoutId);
    // 静默处理错误，不输出到控制台干扰用户
    // console.warn('Hitokoto API error (using backup):', _error.message);
    useBackupQuote();
  }
};

const useBackupQuote = () => {
  const backupQuotes = [
    '成功不是终点，失败不是致命的，继续前进的勇气才是最重要的',
    '每一天都是一个新的开始，抓住机会去创造奇迹',
    '我的世界在下雨的时候，我会站在原地，等待下一个机会',
    '小僵尸来咯~~',
    '难道你也玩mc',
    '闪烁吧，少年'
  ];
  dailyQuote.value = backupQuotes[Math.floor(Math.random() * backupQuotes.length)];
};

const copyText = async (text?: string) => {
  const content = text || `${config.server.javaIp}:25565`;
  try {
    if (navigator.clipboard && globalThis.window.isSecureContext) {
      await navigator.clipboard.writeText(content);
      alert('已复制到剪贴板！');
    } else {
      const input = document.createElement('input');
      input.value = content;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      alert('已复制到剪贴板！');
    }
  } catch (_e) {
    alert('复制失败，请手动复制');
  }
};
</script>

<style lang="scss" scoped>
.site-footer {
  background-color: #1a1a1a;
  color: #a0a0a0;
  font-family: var(--font-ui);
  border-top: 1px solid #333;
  width: 100%;
  position: relative;
  z-index: 20;
  margin-top: 0;
  padding-top: 4rem;
}

.site-footer :deep(
  h1, h2, h3, h4, h5, h6,
  p, span, a, li, strong, em,
  div, button, input, select, textarea,
  .time-widget, .time-main, .time-sub,
  .footer-title, .section-title, .link-group-title,
  .auth-main-text, .auth-sub-text
) {
  font-family: var(--font-ui) !important;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 4rem 2rem;
}


.footer-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: 3rem;
  z-index: 1;
  padding: 1.5rem;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.015);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  
  @media (max-width: 992px) {
    grid-template-columns: 1fr 1fr;
  }
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 2.5rem;
    text-align: center;
  }
}

.footer-section {
  display: flex;
  flex-direction: column;
}

.footer-title {
  color: #ffffff;
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  letter-spacing: 1px;
}

.section-title {
  color: #ffffff;
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: -8px;
    width: 30px;
    height: 2px;
    background-color: var(--primary, #007bff);
    
    @media (max-width: 768px) {
      left: 50%;
      transform: translateX(-50%);
    }
  }
}

/* Brand & Quote */
.title-icon {
  color: var(--primary, #007bff);
  margin-right: 10px;
  vertical-align: middle;
}

.brand-description {
  color: #888;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
  max-width: 90%;
  
  @media (max-width: 768px) {
    max-width: 100%;
  }
}

.social-links {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  
  @media (max-width: 768px) {
    justify-content: center;
  }
}

.social-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #ffffff0d;
  border-radius: 50%;
  color: #fff;
  transition: all 0.3s ease;
  border: 1px solid #ffffff1a;
  text-decoration: none;
  
  &:hover {
    background: var(--primary, #007bff);
    border-color: var(--primary, #007bff);
    transform: translateY(-3px);
    box-shadow: 0 4px 10px #007bff4d;
  }
  
  &:active {
    transform: translateY(0);
  }
}

.quote-container {
  margin-top: 0.5rem;
}

.daily-quote {
  font-style: italic;
  line-height: 1.6;
  color: #cccccc;
  font-size: 0.95rem;
  border-left: 3px solid var(--primary, #007bff);
  background: #ffffff05;
  padding: 1rem;
  border-radius: 0 8px 8px 0;
  transition: all 0.3s ease;

  &.long-quote {
    font-size: 0.85rem;
    line-height: 1.5;
  }
  
  @media (max-width: 768px) {
    border-left: none;
    border-top: 3px solid var(--primary, #007bff);
    border-radius: 0 0 8px 8px;
  }
}

.quote-icon-start, .quote-icon-end {
  color: #ffffff33;
  margin: 0 0.5rem;
  vertical-align: middle;
}

.quote-text {
  color: #cccccc;
}

.quote-loading {
  font-size: 0.9rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  @media (max-width: 768px) {
    justify-content: center;
  }
}

/* Contact List */
.contact-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.contact-item {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
  
  @media (max-width: 768px) {
    justify-content: center;
  }
  
  .app-icon {
    margin-right: 10px;
    color: #ffffff;
    cursor: pointer;
    transition: color 0.3s ease;
    flex-shrink: 0;

    &:hover {
      color: var(--primary, #007bff);
    }
  }

  a {
    color: #a0a0a0;
    text-decoration: none;
    font-size: 0.95rem;
    transition: color 0.3s ease;
    
    &:hover {
      color: #ffffff;
    }
  }
  
  &:hover {
    transform: translateX(5px);
    
    @media (max-width: 768px) {
      transform: translateY(-2px);
    }
  }
}

.time-widget {
  background: #ffffff0d;
  padding: 1.5rem;
  border-radius: 8px;
  text-align: center;
  border: 1px solid #ffffff1a;
  box-shadow: 0 4px 6px #00000033;
}

.time-main {
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
  font-family: var(--font-ui);
  margin-bottom: 0.5rem;
  letter-spacing: 2px;
  
  @media (max-width: 768px) {
    font-size: 1.8rem;
  }
}

.time-blink {
  animation: blink 1s infinite;
  margin: 0 2px;
  color: var(--primary, #007bff);
}

.time-sub {
  font-size: 0.9rem;
  color: #9a9a9a;
  display: flex;
  justify-content: center;
  gap: 1rem;
}

@keyframes blink {
  50% { opacity: 0; }
}

.auth-section {
  align-items: flex-start;
}

.auth-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.footer-bottom {
  background-color: #111111;
  padding: 1.5rem 0;
  border-top: 1px solid #252525;
  font-family: var(--font-ui) !important;
}

.footer-bottom :deep(*),
.server-info-section,
.server-info-section :deep(*) {
  font-family: var(--font-ui) !important;
}

.minecraft-links {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 2rem;
  border-top: 1px solid #252525;
  margin-top: 1rem;
}

.minecraft-links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3rem;
  justify-content: center;
}

.links-title {
  text-align: center;
  font-size: 1rem;
  color: #ffffff;
  margin-bottom: 1.5rem;
  font-weight: 600;
}

.link-group {
  margin-bottom: 0;
}

.link-group-title {
  font-size: 0.9rem;
  color: #cccccc;
  margin-bottom: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-left: 0.5rem;
  border-left: 2px solid var(--primary, #007bff);
}

.links-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-left: 1rem;
}

.links-container a {
  font-size: 0.8rem;
  color: #999999;
  text-decoration: none;
  transition: all 0.3s ease;
  padding: 0.25rem 0;
  border-radius: 0;
  outline: none;
  display: inline-block;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  line-height: inherit;
  margin: 0;
  white-space: nowrap;
  border-bottom: 1px solid transparent;
}

.links-container a:focus {
  outline: none;
}

.links-container a::-moz-focus-inner {
  border: 0;
}

.links-container a:hover {
  color: var(--primary, #007bff);
  border-bottom-color: var(--primary, #007bff);
  transform: translateY(-2px);
}

@media (max-width: 768px) {
  .minecraft-links {
    padding: 1rem;
  }
  
  .links-container {
    padding-left: 0.5rem;
  }
  
  .link-group-title {
    text-align: center;
    padding-left: 0;
    border-left: none;
    border-bottom: 2px solid var(--primary, #007bff);
    padding-bottom: 0.5rem;
  }
}

@media (max-width: 480px) {
  .site-footer {
    padding: 2rem 0 1rem;
  }
  
  .footer-content {
    padding: 0 1rem;
  }
  
  .footer-grid {
    gap: 2rem;
  }
  
  .footer-title {
    font-size: 1.5rem;
    margin-bottom: 1.2rem;
  }
  
  .section-title {
    font-size: 1rem;
    margin-bottom: 1.2rem;
  }
  
  .title-icon {
    margin-right: 8px;
  }
  
  .brand-description {
    font-size: 0.9rem;
    line-height: 1.5;
    margin-bottom: 1.2rem;
  }
  
  .social-links {
    gap: 0.75rem;
    margin-bottom: 1.2rem;
  }
  
  .social-link {
    width: 32px;
    height: 32px;
  }
  
  .quote-container {
    margin-top: 0.3rem;
  }
  
  .daily-quote {
    font-size: 0.9rem;
    padding: 0.8rem;
  }
  
  .quote-icon-start,
  .quote-icon-end {
    margin: 0 0.4rem;
  }
  
  .contact-list {
    gap: 0.8rem;
  }
  
  .contact-item {
    margin-bottom: 0.8rem;

    .app-icon {
      margin-right: 8px;
    }
    
    a {
      font-size: 0.9rem;
    }
  }
  
  .time-widget {
    padding: 1rem;
  }
  
  .time-main {
    font-size: 1.8rem;
  }
  
  .time-sub {
    font-size: 0.85rem;
  }
  
  .footer-bottom {
    padding: 1.2rem 0;
  }
  
  .minecraft-links {
    padding: 0.8rem 0.5rem;
    margin-top: 0.8rem;
  }
  
  .links-title {
    font-size: 0.95rem;
    margin-bottom: 1.2rem;
  }
  
  .links-container {
    padding-left: 0;
    gap: 0.6rem;
  }
  
  .links-container a {
    font-size: 0.75rem;
    padding: 0.2rem 0;
  }
  
  .server-info-section {
    padding: 1.5rem 0;
  }
  
  .server-info-container h4 {
    font-size: 0.95rem;
  }
  
  .server-info-container .flex {
    gap: 1rem;
    padding: 0.8rem 0;
    font-size: 0.85rem;
  }
}

@media (max-width: 360px) {
  .site-footer {
    padding: 1.5rem 0 0.8rem;
  }
  
  .footer-content {
    padding: 0 0.5rem;
  }
  
  .footer-grid {
    gap: 1.5rem;
  }
  
  .footer-title {
    font-size: 1.3rem;
    margin-bottom: 1rem;
  }
  
  .section-title {
    font-size: 0.95rem;
    margin-bottom: 1rem;
  }
  
  .title-icon {
    margin-right: 6px;
  }
  
  .brand-description {
    font-size: 0.85rem;
    line-height: 1.4;
    margin-bottom: 1rem;
  }
  
  .social-links {
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  
  .social-link {
    width: 30px;
    height: 30px;
  }
  
  .daily-quote {
    font-size: 0.85rem;
    padding: 0.6rem;
  }
  
  .quote-icon-start,
  .quote-icon-end {
    margin: 0 0.3rem;
  }
  
  .contact-item {
    margin-bottom: 0.6rem;

    .app-icon {
      margin-right: 6px;
    }
    
    a {
      font-size: 0.85rem;
    }
  }
  
  .time-widget {
    padding: 0.8rem;
  }
  
  .time-main {
    font-size: 1.6rem;
  }
  
  .time-sub {
    font-size: 0.8rem;
  }
  
  .footer-bottom {
    padding: 1rem 0;
  }
  
  .minecraft-links {
    padding: 0.6rem 0.3rem;
    margin-top: 0.6rem;
  }
  
  .links-title {
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }
  
  .link-group {
    margin-bottom: 1rem;
  }
  
  .link-group-title {
    font-size: 0.8rem;
    padding-bottom: 0.3rem;
  }
  
  .links-container {
    gap: 0.5rem;
  }
  
  .links-container a {
    font-size: 0.7rem;
  }
  
  .server-info-section {
    padding: 1.2rem 0;
  }
  
  .server-info-container h4 {
    font-size: 0.9rem;
  }
  
  .server-info-container .flex {
    gap: 0.8rem;
    padding: 0.6rem 0;
    font-size: 0.8rem;
  }
}

.server-info-section {
  background: rgba(9, 11, 18, 0.92);
  padding: 1.25rem 0;
  border-top: 1px solid rgba(182, 198, 255, 0.1);
}

.server-info-container {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
  padding: 0 1rem;
}

.server-info-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
  gap: 1.25rem;
  overflow-x: auto;
  padding: 0.625rem 0;
}

.server-info-item {
  display: inline-block;
  white-space: nowrap;
  margin: 0;
}

.server-info-text {
  text-align: center;
  letter-spacing: 1px;
  line-height: 1.4;
}

.server-info-text-primary {
  font-size: 13px;
  color: #9a9a9a;
}

.server-info-text-secondary {
  font-size: 12px;
  color: #8a8a8a;
}

.copyright-symbol {
  color: #555;
}

.brand-highlight {
  color: #ffaa00;
}

.separator-vertical {
  width: 1px;
  height: 20px;
  background-color: rgba(255, 255, 255, 0.1);
  margin: 0 0.625rem;
  flex-shrink: 0;
}

.footer-wiki-link {
  color: var(--brand-primary, var(--primary, #6366f1));
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  transition: all 0.3s ease;
  border-bottom: 1px solid transparent;
}

.footer-wiki-link:hover {
  color: #ffffff;
  border-bottom-color: var(--brand-primary, var(--primary, #6366f1));
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .server-info-row {
    flex-wrap: wrap;
    gap: 0.875rem;
  }

  .separator-vertical {
    display: none;
  }
}
.auth-card-link {
  text-decoration: none;
  display: block;
  transition: transform 0.3s ease;
  
  &:hover {
    transform: translateY(-5px);
  }
}

.auth-info-card {
  display: flex;
  align-items: center;
  gap: 15px;
  background: rgba(255, 255, 255, 0.05);
  padding: 15px 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--primary, #007bff);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  }
}

.auth-avatar-icon {
  color: var(--primary, #007bff);
  flex-shrink: 0;
}

.wiki-link-icon {
  margin-right: 0.5rem;
  vertical-align: middle;
}

.contact-qq-icon {
  cursor: pointer;
}

.auth-info-text {
  flex: 1;
}

.auth-main-text {
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  margin: 0;
}

.auth-sub-text {
  color: #9a9a9a;
  font-size: 0.75rem;
  margin: 0;
}
</style>
