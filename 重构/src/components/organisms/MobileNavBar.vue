<template>
  <div class="mobile-nav-wrapper">
    <!-- ===== 顶部栏 ===== -->
    <header class="mobile-header">
      <div class="mobile-header-shell">
        <div class="mobile-header-left">
          <RouterLink to="/" class="mobile-brand-link" @click="playClick()">
            <StarMCLogo class="mobile-brand-logo" />
            <span class="mobile-brand-text">
              <strong>StarMC</strong>
            </span>
          </RouterLink>
        </div>

        <div class="mobile-header-right">
          <!-- 搜索按钮 -->
          <button
            class="mobile-icon-btn"
            type="button"
            aria-label="搜索"
            @click="openSearch"
          >
            <AppIcon name="search" :size="19" />
          </button>

          <!-- 账户按钮（移动端常驻） -->
          <RouterLink
            to="/auth"
            class="mobile-icon-btn mobile-account-btn"
            :aria-label="auth.isLoggedIn ? '账户' : '登录'"
            @click="playClick()"
          >
            <AppIcon :name="auth.isLoggedIn ? 'userCircle' : 'lock'" :size="19" />
          </RouterLink>

          <!-- 汉堡菜单 -->
          <button
            class="mobile-icon-btn mobile-menu-btn"
            :class="{ active: isDrawerOpen }"
            type="button"
            aria-label="菜单"
            @click="toggleDrawer"
          >
            <span class="menu-hamburger" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </header>

    <!-- ===== 底部标签栏 ===== -->
    <nav class="mobile-tab-bar" aria-label="主导航">
      <RouterLink
        v-for="tab in tabBarItems"
        :key="tab.path"
        :to="tab.path"
        class="mobile-tab"
        :class="{ active: isActive(tab.path) }"
        :aria-current="isActive(tab.path) ? 'page' : undefined"
        @click="playClick()"
      >
        <span class="mobile-tab-icon">
          <AppIcon :name="tab.icon" :size="22" />
        </span>
        <span class="mobile-tab-label">{{ tab.label }}</span>
      </RouterLink>

      <!-- 菜单按钮作为最后一个 tab -->
      <button
        class="mobile-tab mobile-menu-tab"
        type="button"
        :class="{ active: isDrawerOpen }"
        @click="toggleDrawer"
      >
        <span class="mobile-tab-icon">
          <AppIcon name="compact" :size="22" />
        </span>
        <span class="mobile-tab-label">更多</span>
      </button>
    </nav>

    <!-- ===== 侧滑抽屉菜单 ===== -->
    <Teleport to="body">
      <transition name="drawer-anim">
        <div v-if="isDrawerOpen" class="mobile-drawer-overlay" @click="closeDrawer">
          <aside class="mobile-drawer" @click.stop>
            <!-- 抽屉头部 -->
            <div class="drawer-top">
              <div class="drawer-user-info" v-if="auth.isLoggedIn">
                <div class="drawer-avatar">
                  <AppIcon name="userCircle" :size="28" />
                </div>
                <div class="drawer-user-text">
                  <p class="drawer-username">{{ auth.user?.username ?? '用户' }}</p>
                  <span class="drawer-user-role">{{ auth.user?.role ?? '普通用户' }}</span>
                </div>
                <RouterLink to="/profile" class="drawer-go-profile" @click="playClick(); closeDrawer()">
                  进入资料
                </RouterLink>
              </div>
              <div class="drawer-top-header">
                <div>
                  <p class="drawer-kicker">菜单</p>
                  <h2 class="drawer-title">StarMC</h2>
                </div>
                <button class="drawer-close-btn" @click="closeDrawer" aria-label="关闭">
                  <AppIcon name="close" :size="20" />
                </button>
              </div>
            </div>

            <!-- 菜单分组 -->
            <div class="drawer-content">
              <section class="drawer-section" v-for="section in menuSections" :key="section.title">
                <h3 class="drawer-section-title">{{ section.title }}</h3>
                <div class="drawer-items">
                  <template v-for="item in section.items" :key="item.path">
                    <RouterLink
                      v-if="!item.requiresLogin || auth.isLoggedIn"
                      :to="item.path"
                      class="drawer-item"
                      :class="{ active: isActive(item.path) }"
                      @click="handleDrawerNavigation"
                    >
                      <span class="drawer-item-icon">
                        <AppIcon :name="item.icon" :size="18" />
                      </span>
                      <span class="drawer-item-text">{{ item.label }}</span>
                      <AppIcon name="arrowRight" :size="14" class="drawer-item-arrow" />
                    </RouterLink>
                    <button
                      v-else
                      type="button"
                      class="drawer-item drawer-item-need-login"
                      @click="navigateToAuth"
                    >
                      <span class="drawer-item-icon">
                        <AppIcon name="lock" :size="18" />
                      </span>
                      <span class="drawer-item-text">{{ item.label }} (需登录)</span>
                    </button>
                  </template>
                </div>
              </section>
            </div>

            <!-- 抽屉底部 -->
            <div class="drawer-footer">
              <LanguageSwitcher class="drawer-language-switcher" />
              <p class="drawer-version">v{{ packageJson.version }}</p>
            </div>
          </aside>
        </div>
      </transition>
    </Teleport>

    <!-- ===== 搜索面板 ===== -->
    <Teleport to="body">
      <transition name="search-anim">
        <div v-if="isSearchOpen" class="mobile-search-overlay" @click="closeSearch">
          <div class="mobile-search-card" @click.stop>
            <div class="search-bar">
              <AppIcon name="search" :size="18" class="search-icon" />
              <input
                ref="searchInput"
                v-model="searchQuery"
                class="search-input"
                type="text"
                placeholder="搜索页面、皮肤、地图..."
                autofocus
              />
              <button class="search-cancel" @click="closeSearch">取消</button>
            </div>
            <div class="search-results" v-if="searchResults.length">
              <button
                v-for="item in searchResults"
                :key="item.path"
                class="search-result-item"
                @click="navigateTo(item.path)"
              >
                <span class="result-label">{{ item.label }}</span>
                <span class="result-path">{{ item.path }}</span>
              </button>
            </div>
            <p v-else-if="searchQuery.trim()" class="search-empty">没有找到匹配页面</p>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import StarMCLogo from '@/components/atoms/StarMCLogo.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import LanguageSwitcher from '@/components/atoms/LanguageSwitcher.vue';
import packageJson from '@/../package.json';
import { audioService } from '@/shared/utils/audioService';
import { useAuthStore } from '@/stores/auth';
import { SITE_PRIMARY_NAV, ROUTE_SECTION_TITLE, type SiteNavSection } from '@/shared/config/siteArchitecture';
import { resolveAudience, filterNavByAudience } from '@/shared/config/navPolicy';
import type { AppIconName } from '@/components/atoms/appIcons';

defineOptions({
  name: 'MobileNavBar',
  inheritAttrs: false
});

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const isDrawerOpen = ref(false);
const isSearchOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
let lastScrollTop = 0;
const isScrolled = ref(false);

const NAV_ICON_BY_PATH: Record<string, AppIconName> = {
  '': 'home',
  ztjk: 'gauge',
  guide: 'book',
  map: 'city',
  skin: 'shirt',
  'skin/manage': 'settings',
  'skin/review': 'clipboardCheck',
  profile: 'userCircle',
  notifications: 'warning',
  admin: 'shield',
};

function getNavIconName(path: string): AppIconName {
  return NAV_ICON_BY_PATH[path.replace(/^\/+/, '')] ?? 'link';
}

// 标签栏物品（移动端常驻）
const tabBarItems = computed(() => {
  const audience = resolveAudience(auth.isLoggedIn, auth.user);
  const items = filterNavByAudience(SITE_PRIMARY_NAV, audience)
    .sort((a, b) => a.order - b.order)
    .slice(0, 5); // 最多显示5个

  return items.map((item) => ({
    ...item,
    icon: getNavIconName(item.path)
  }));
});

// 抽屉菜单分组
const menuSections = computed(() => {
  const audience = resolveAudience(auth.isLoggedIn, auth.user);
  const items = filterNavByAudience(SITE_PRIMARY_NAV, audience)
    .sort((a, b) => a.order - b.order);

  // 分组
  const grouped = new Map<SiteNavSection, typeof items>();
  for (const item of items) {
    if (!grouped.has(item.section)) {
      grouped.set(item.section, []);
    }
    grouped.get(item.section)!.push(item);
  }

  return Array.from(grouped.entries()).map(([section, sectionItems]) => ({
    section,
    title: ROUTE_SECTION_TITLE[section],
    items: sectionItems.map((item) => ({
      ...item,
      icon: getNavIconName(item.path),
      requiresLogin: ['/profile', '/notifications', '/admin'].includes(item.path)
    }))
  })).filter((section) => section.items.length > 0);
});

function isActive(path: string) {
  return path === '/' ? route.path === path : route.path.startsWith(path);
}

function playClick() {
  audioService.playClick();
}

function toggleDrawer() {
  playClick();
  if (isDrawerOpen.value) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function openDrawer() {
  isDrawerOpen.value = true;
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  isDrawerOpen.value = false;
  document.body.style.overflow = '';
}

function handleDrawerNavigation() {
  playClick();
  closeDrawer();
}

function navigateToAuth() {
  handleDrawerNavigation();
  router.push('/auth');
}

function openSearch() {
  playClick();
  isSearchOpen.value = true;
  searchQuery.value = '';
  nextTick(() => searchInput.value?.focus());
}

function closeSearch() {
  isSearchOpen.value = false;
  searchQuery.value = '';
}

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  return menuSections.value.flatMap((s) => s.items).filter((item) =>
    [item.label, item.path].some((field) => field.toLowerCase().includes(query))
  ).slice(0, 8);
});

function navigateTo(path: string) {
  closeSearch();
  router.push(path);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 滚动监听：顶部栏高亮
function onScroll() {
  const scrollTop = window.scrollY;
  isScrolled.value = scrollTop > 20;
  lastScrollTop = scrollTop;
}

import { onMounted, onUnmounted } from 'vue';

let rafId: number | null = null;
function handleScroll() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    onScroll();
    rafId = null;
  });
}

onMounted(() => {
  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  if (rafId) cancelAnimationFrame(rafId);
  document.body.style.overflow = '';
});

watch(
  () => route.path,
  () => {
    closeDrawer();
    closeSearch();
  }
);
</script>

<style scoped>
.mobile-nav-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ===== 顶部栏 ===== */
.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding-top: env(safe-area-inset-top, 0px);
  background: rgba(7, 10, 16, 0.72);
  backdrop-filter: blur(20px) saturate(135%);
  -webkit-backdrop-filter: blur(20px) saturate(135%);
  border-bottom: 1px solid rgba(182, 198, 255, 0.08);
  transition: background-color 200ms var(--ease-standard), border-color 200ms var(--ease-standard);
}

.mobile-header.scrolled {
  background: rgba(7, 10, 16, 0.88);
  border-bottom-color: rgba(196, 209, 255, 0.12);
}

.mobile-header-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 12px;
}

.mobile-header-left {
  flex-shrink: 0;
}

.mobile-brand-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #f6f8ff;
}

.mobile-brand-logo {
  width: 30px;
  height: 30px;
}

.mobile-brand-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.mobile-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mobile-icon-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: rgba(235, 241, 255, 0.85);
  transition: background-color 150ms ease, color 150ms ease;
}

.mobile-icon-btn:hover,
.mobile-icon-btn:active {
  background: rgba(124, 140, 255, 0.1);
  color: #fff;
}

.mobile-account-btn {
  background: rgba(124, 140, 255, 0.1);
  border: 1px solid rgba(124, 140, 255, 0.14);
}

.menu-hamburger {
  width: 18px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  position: relative;
  transition: transform 180ms ease, top 180ms ease;
}

.menu-hamburger::before,
.menu-hamburger::after {
  content: '';
  position: absolute;
  left: 0;
  width: 18px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  transition: transform 180ms ease, top 180ms ease, bottom 180ms ease;
}

.menu-hamburger::before {
  top: -6px;
}

.menu-hamburger::after {
  top: 6px;
}

.mobile-menu-btn.active .menu-hamburger {
  background: transparent;
}

.mobile-menu-btn.active .menu-hamburger::before {
  top: 0;
  transform: rotate(45deg);
}

.mobile-menu-btn.active .menu-hamburger::after {
  top: 0;
  transform: rotate(-45deg);
}

/* ===== 底部标签栏 ===== */
.mobile-tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 999;
  display: flex;
  align-items: stretch;
  min-height: 56px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: rgba(7, 10, 16, 0.78);
  backdrop-filter: blur(20px) saturate(135%);
  -webkit-backdrop-filter: blur(20px) saturate(135%);
  border-top: 1px solid rgba(182, 198, 255, 0.08);
  padding: 0 4px;
  padding-top: 6px;
}

.mobile-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 2px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: rgba(225, 232, 255, 0.55);
  text-decoration: none;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: background-color 150ms ease, color 150ms ease, transform 150ms var(--ease-standard);
  -webkit-tap-highlight-color: transparent;
  position: relative;
}

.mobile-tab:active {
  transform: scale(0.94);
}

.mobile-tab.active {
  color: #8b9aff;
}

.mobile-tab.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 2px;
  border-radius: 999px;
  background: #8b9aff;
}

.mobile-tab-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  transition: background-color 150ms ease;
}

.mobile-tab.active .mobile-tab-icon {
  background: rgba(139, 154, 255, 0.14);
}

.mobile-tab-label {
  line-height: 1;
  white-space: nowrap;
}

.mobile-menu-tab {
  background: rgba(124, 140, 255, 0.06);
  border: 1px dashed rgba(124, 140, 255, 0.12);
  border-radius: 10px;
}

/* ===== 抽屉菜单 ===== */
.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(4, 8, 16, 0.55);
}

.mobile-drawer {
  width: min(340px, 88vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(12, 16, 28, 0.99), rgba(8, 10, 18, 0.98));
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.22);
  padding-top: env(safe-area-inset-top, 0px);
  overflow-y: auto;
}

.drawer-top {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.drawer-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px 16px;
}

.drawer-avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(124, 140, 255, 0.1);
  border: 1px solid rgba(124, 140, 255, 0.12);
  color: #8b9aff;
  flex-shrink: 0;
}

.drawer-user-text {
  flex: 1;
  min-width: 0;
}

.drawer-username {
  margin: 0;
  font-size: 14px;
  color: #fff;
  font-weight: 600;
}

.drawer-user-role {
  font-size: 11px;
  color: rgba(225, 232, 255, 0.46);
}

.drawer-go-profile {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(124, 140, 255, 0.1);
  border: 1px solid rgba(124, 140, 255, 0.12);
  color: #8b9aff;
  text-decoration: none;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.drawer-top-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 18px 16px;
}

.drawer-kicker {
  margin: 0 0 2px;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.4);
}

.drawer-title {
  margin: 0;
  font-size: 17px;
  color: #fff;
  font-weight: 700;
}

.drawer-close-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(235, 241, 255, 0.7);
}

.drawer-content {
  flex: 1;
  padding: 12px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-section-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.38);
  padding-left: 4px;
}

.drawer-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.025);
  color: rgba(240, 244, 255, 0.82);
  text-decoration: none;
  font-size: 14px;
  transition: background-color 150ms ease, border-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.drawer-item:active,
.drawer-item:hover,
.drawer-item:focus-visible {
  background: rgba(124, 140, 255, 0.08);
  border-color: rgba(124, 140, 255, 0.12);
}

.drawer-item.active {
  background: rgba(124, 140, 255, 0.12);
  border-color: rgba(124, 140, 255, 0.16);
  color: #fff;
}

.drawer-item-need-login {
  border: 1px dashed rgba(255, 255, 255, 0.06);
  color: rgba(225, 232, 255, 0.5);
}

.drawer-item-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  color: rgba(225, 232, 255, 0.65);
}

.drawer-item.active .drawer-item-icon {
  background: rgba(124, 140, 255, 0.12);
  color: #8b9aff;
}

.drawer-item-text {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.drawer-item-arrow {
  color: rgba(225, 232, 255, 0.35);
  flex-shrink: 0;
}

.drawer-footer {
  padding: 16px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.drawer-language-switcher {
  width: 100%;
}

.drawer-version {
  margin: 0;
  font-size: 11px;
  color: rgba(225, 232, 255, 0.3);
}

/* ===== 搜索面板 ===== */
.mobile-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(4, 8, 16, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: grid;
  place-items: start center;
  padding-top: calc(60px + env(safe-area-inset-top, 0px));
}

.mobile-search-card {
  width: min(92vw, 420px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 14, 24, 0.96);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28);
  padding: 14px;
  overflow: hidden;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.search-icon {
  color: rgba(225, 232, 255, 0.4);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 15px;
  outline: none;
}

.search-input::placeholder {
  color: rgba(235, 241, 255, 0.35);
}

.search-cancel {
  border: none;
  background: transparent;
  color: rgba(124, 140, 255, 0.8);
  font-size: 14px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 8px;
}

.search-cancel:active {
  background: rgba(124, 140, 255, 0.1);
}

.search-results {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 50vh;
  overflow-y: auto;
}

.search-result-item {
  text-align: left;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 14px;
}

.search-result-item:active {
  background: rgba(124, 140, 255, 0.08);
}

.result-path {
  font-size: 11px;
  color: rgba(235, 241, 255, 0.4);
}

.search-empty {
  margin: 10px 0 0;
  color: rgba(235, 241, 255, 0.4);
  font-size: 13px;
  text-align: center;
}

/* ===== 动画 ===== */
.drawer-anim-enter-active,
.drawer-anim-leave-active {
  transition: opacity 200ms var(--ease-standard);
}

.drawer-anim-enter-from,
.drawer-anim-leave-to {
  opacity: 0;
}

.drawer-anim-enter-active .mobile-drawer,
.drawer-anim-leave-active .mobile-drawer {
  transition: transform 200ms var(--ease-standard);
}

.drawer-anim-enter-from .mobile-drawer,
.drawer-anim-leave-to .mobile-drawer {
  transform: translateX(100%);
}

.search-anim-enter-active,
.search-anim-leave-active {
  transition: opacity 180ms var(--ease-standard);
}

.search-anim-enter-from,
.search-anim-leave-to {
  opacity: 0;
}

.search-anim-enter-from .mobile-search-card,
.search-anim-leave-to .mobile-search-card {
  transform: scale(0.94) translateY(-12px);
}

/* ===== 桌面端隐藏 ===== */
@media (min-width: 769px) {
  .mobile-nav-wrapper {
    display: none;
  }
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .mobile-tab-bar {
    padding: 0 2px;
    padding-top: 5px;
  }

  .mobile-tab-label {
    font-size: 9px;
  }

  .mobile-tab-icon {
    width: 24px;
    height: 24px;
  }
}
</style>
