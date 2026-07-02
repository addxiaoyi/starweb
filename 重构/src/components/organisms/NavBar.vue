<template>
  <header
    v-bind="filteredAttrs"
    :class="computedClass"
    :style="navbarStyle"
  >
    <div class="navbar-shell">
      <div class="navbar-brand-group">
        <RouterLink
          to="/"
          class="brand-link"
          aria-label="返回首页"
        >
          <span class="brand-mark" aria-hidden="true">
            <StarMCLogo class="brand-logo-svg" />
          </span>
          <span class="brand-text">
            <strong class="brand-title">StarMC</strong>
          </span>
        </RouterLink>

        <button
          class="menu-toggle mobile-only"
          :class="{ active: isMobileMenuOpen }"
          :aria-expanded="isMobileMenuOpen ? 'true' : 'false'"
          aria-haspopup="true"
          aria-label="打开主菜单"
          @click.stop="toggleMobileMenu"
        >
          <span class="menu-toggle-bars" aria-hidden="true"></span>
        </button>
      </div>

      <nav class="desktop-nav" aria-label="主要导航">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.path"
          :to="item.path"
          class="nav-pill"
          :class="{ active: isActiveRoute(item.path) }"
          :aria-current="isActiveRoute(item.path) ? 'page' : undefined"
          @click="audioService.playClick()"
        >
          <span class="nav-pill-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="navbar-actions">
        <button
          class="icon-chip search-trigger"
          type="button"
          @click="toggleSearchPanel"
          :aria-expanded="isSearchOpen ? 'true' : 'false'"
          aria-label="打开站内快速搜索"
        >
          <AppIcon name="search" :size="15" />
        </button>

        <LanguageSwitcher class="language-chip" />

        <button
          class="icon-chip account-chip"
          type="button"
          @click="toggleAccountMenu"
          :aria-expanded="isAccountMenuOpen ? 'true' : 'false'"
          :aria-label="auth.isLoggedIn ? `打开账户菜单，当前用户 ${auth.user?.username ?? '账户'}` : '登录或注册'"
        >
          <AppIcon :name="auth.isLoggedIn ? 'userCircle' : 'lock'" :size="15" />
        </button>
      </div>
    </div>

    <div v-if="isSearchOpen" class="navbar-search-panel" @click.self="closeSearchPanel">
      <div class="navbar-search-card">
        <div class="navbar-search-header">
          <div>
            <p class="navbar-search-kicker">快速搜索</p>
            <h3 class="navbar-search-title">在导航中查找页面</h3>
          </div>
          <button class="navbar-search-close" type="button" @click="closeSearchPanel" aria-label="关闭搜索">
            <AppIcon name="close" :size="18" />
          </button>
        </div>
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="navbar-search-input"
          type="text"
          placeholder="输入关键词，比如：皮肤、地图、教程"
          @keydown.enter.prevent="runQuickSearch"
        />
        <div class="navbar-search-results" v-if="quickSearchResults.length">
          <button
            v-for="item in quickSearchResults"
            :key="item.path"
            type="button"
            class="navbar-search-result"
            @click="navigateFromSearch(item.path)"
          >
            <span class="result-label">{{ item.label }}</span>
            <span class="result-path">{{ item.path }}</span>
          </button>
        </div>
        <p v-else class="navbar-search-empty">没有找到匹配页面</p>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isAccountMenuOpen" class="account-menu-panel" @click.self="closeAccountMenu">
        <div class="account-menu-card">
          <p class="account-menu-kicker">账户</p>
          <h3 class="account-menu-title">{{ auth.isLoggedIn ? (auth.user?.username ?? '账户中心') : '欢迎回来' }}</h3>
          <p class="account-menu-desc">
            {{ auth.isLoggedIn ? '快速进入你的个人中心与操作入口。' : '登录后可管理收藏、投稿和个人资料。' }}
          </p>
          <div class="account-menu-actions">
            <RouterLink
              v-if="auth.isLoggedIn"
              to="/profile"
              class="account-menu-link"
              @click="audioService.playClick(); closeAccountMenu()"
            >
              进入账户中心
            </RouterLink>
            <RouterLink
              v-if="auth.isLoggedIn"
              to="/notifications"
              class="account-menu-link secondary-link"
              @click="audioService.playClick(); closeAccountMenu()"
            >
              查看通知
            </RouterLink>
            <RouterLink
              v-if="auth.isLoggedIn && isAdmin"
              to="/admin/users"
              class="account-menu-link secondary-link"
              @click="audioService.playClick(); closeAccountMenu()"
            >
              用户管理
            </RouterLink>
            <RouterLink
              v-if="auth.isLoggedIn && isAdmin"
              to="/diagnostics/ops"
              class="account-menu-link secondary-link"
              @click="audioService.playClick(); closeAccountMenu()"
            >
              运维中心
            </RouterLink>
            <RouterLink
              v-if="!auth.isLoggedIn"
              to="/auth"
              class="account-menu-link"
              @click="audioService.playClick(); closeAccountMenu()"
            >
              去登录
            </RouterLink>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <transition name="drawer-anim">
        <div
          v-if="isMobileMenuOpen"
          class="mobile-drawer-overlay"
          @click="closeMobileMenu"
        >
          <aside class="mobile-drawer" @click.stop>
            <div class="drawer-header">
              <div>
                <p class="drawer-kicker">导航</p>
                <h2 class="drawer-title">StarMC 菜单</h2>
              </div>
              <button
                class="drawer-close"
                @click="closeMobileMenu"
                aria-label="关闭菜单"
              >
                <AppIcon name="close" :size="20" />
              </button>
            </div>

            <div class="drawer-meta">
              <div class="drawer-meta-card">
                <span class="drawer-meta-label">当前页面</span>
                <span class="drawer-meta-value">{{ currentRouteLabel }}</span>
              </div>
              <div class="drawer-meta-card">
                <span class="drawer-meta-label">可用入口</span>
                <span class="drawer-meta-value">{{ visibleNavItems.length }} 项</span>
              </div>
            </div>

            <nav class="drawer-nav" aria-label="移动端导航">
              <section
                v-for="group in groupedNavItems"
                :key="group.section"
                class="drawer-group"
              >
                <p class="drawer-group-title">{{ group.title }}</p>
                <RouterLink
                  v-for="item in group.items"
                  :key="item.path"
                  :to="item.path"
                  class="drawer-link"
                  :class="{ active: isActiveRoute(item.path) }"
                  :aria-current="isActiveRoute(item.path) ? 'page' : undefined"
                  @click="audioService.playClick(); closeMobileMenu()"
                >
                  <span>{{ item.label }}</span>
                  <AppIcon name="arrowRight" :size="16" class="drawer-link-icon" />
                </RouterLink>
              </section>
            </nav>
          </aside>
        </div>
      </transition>
    </Teleport>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import StarMCLogo from '@/components/atoms/StarMCLogo.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import LanguageSwitcher from '@/components/atoms/LanguageSwitcher.vue';
import { audioService } from '@/shared/utils/audioService';
import { useAuthStore } from '@/stores/auth';
import { SITE_PRIMARY_NAV, ROUTE_SECTION_TITLE, type SiteNavSection } from '@/shared/config/siteArchitecture';
import { resolveAudience, filterNavByAudience } from '@/shared/config/navPolicy';

defineOptions({
  name: 'NavBar',
  inheritAttrs: false
});

interface Props {
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  class: ''
});

const attrs = useAttrs();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const isMobileMenuOpen = ref(false);
const isSearchOpen = ref(false);
const isAccountMenuOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const isScrolled = ref(false);
const isHidden = ref(false);
let lastScrollTop = 0;

const audience = computed(() => resolveAudience(auth.isLoggedIn, auth.user));
const isAdmin = computed(() => {
  if (!auth.user) return false;
  const roleSet = new Set([
    ...(Array.isArray(auth.user.roles) ? auth.user.roles : []),
    ...(auth.user.role ? [auth.user.role] : [])
  ].map((role) => String(role || '').toLowerCase()));
  return roleSet.has('admin');
});

const visibleNavItems = computed(() =>
  filterNavByAudience(SITE_PRIMARY_NAV, audience.value).sort((a, b) => a.order - b.order)
);

const groupedNavItems = computed(() => {
  const grouped = new Map<SiteNavSection, typeof visibleNavItems.value>();

  for (const item of visibleNavItems.value) {
    if (!grouped.has(item.section)) {
      grouped.set(item.section, []);
    }
    grouped.get(item.section)!.push(item);
  }

  return Array.from(grouped.entries()).map(([section, items]) => ({
    section,
    title: ROUTE_SECTION_TITLE[section],
    items
  }));
});

const currentRouteLabel = computed(() => {
  const matched = visibleNavItems.value.find((item) => isActiveRoute(item.path));
  return matched?.label ?? '首页';
});

const quickSearchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return visibleNavItems.value.slice(0, 5);
  return visibleNavItems.value.filter((item) =>
    [item.label, item.path].some((field) => field.toLowerCase().includes(query))
  ).slice(0, 6);
});

function isActiveRoute(path: string) {
  return path === '/' ? route.path === path : route.path.startsWith(path);
}

function setBodyScrollLock(locked: boolean) {
  document.body.style.overflow = locked ? 'hidden' : '';
}

function openMobileMenu() {
  isMobileMenuOpen.value = true;
  setBodyScrollLock(true);
}

function closeMobileMenu() {
  if (isMobileMenuOpen.value) {
    audioService.playClick();
  }
  isMobileMenuOpen.value = false;
  setBodyScrollLock(false);
}

function toggleMobileMenu() {
  audioService.playClick();
  if (isMobileMenuOpen.value) {
    closeMobileMenu();
    return;
  }
  openMobileMenu();
}

function navigateTo(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    globalThis.window.open(path, '_blank', 'noopener,noreferrer');
    return;
  }

  if (route.path !== path) {
    router.push(path);
  }

  globalThis.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSearchPanel() {
  isSearchOpen.value = true;
  searchQuery.value = '';
  window.setTimeout(() => searchInput.value?.focus(), 0);
}

function closeSearchPanel() {
  isSearchOpen.value = false;
}

function toggleSearchPanel() {
  audioService.playClick();
  if (isSearchOpen.value) {
    closeSearchPanel();
    return;
  }
  isAccountMenuOpen.value = false;
  openSearchPanel();
}

function openAccountMenu() {
  isAccountMenuOpen.value = true;
}

function closeAccountMenu() {
  isAccountMenuOpen.value = false;
}

function toggleAccountMenu() {
  audioService.playClick();
  if (isAccountMenuOpen.value) {
    closeAccountMenu();
    return;
  }
  isSearchOpen.value = false;
  openAccountMenu();
}

function navigateFromSearch(path: string) {
  closeSearchPanel();
  navigateTo(path);
}

function runQuickSearch() {
  if (quickSearchResults.value[0]) {
    navigateFromSearch(quickSearchResults.value[0].path);
  }
}

watch(
  () => route.path,
  () => {
    closeMobileMenu();
    closeSearchPanel();
    closeAccountMenu();
    globalThis.window.scrollTo({ top: 0, behavior: 'smooth' });
  }
);

function handleScroll() {
  const scrollTop = globalThis.window.scrollY;
  const delta = scrollTop - lastScrollTop;

  isScrolled.value = scrollTop > 24;

  if (scrollTop > 160 && delta > 8 && !isMobileMenuOpen.value) {
    isHidden.value = true;
  } else if (delta < -8 || scrollTop < 56) {
    isHidden.value = false;
  }

  lastScrollTop = scrollTop;
}

let rafId: number | null = null;
function onScroll() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    handleScroll();
    rafId = null;
  });
}

let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
function handleResize() {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    if (globalThis.window.innerWidth >= 768 && isMobileMenuOpen.value) {
      closeMobileMenu();
    }
  }, 120);
}

onMounted(() => {
  handleScroll();
  globalThis.window.addEventListener('scroll', onScroll, { passive: true });
  globalThis.window.addEventListener('resize', handleResize, { passive: true });
});

onUnmounted(() => {
  globalThis.window.removeEventListener('scroll', onScroll);
  globalThis.window.removeEventListener('resize', handleResize);
  if (rafId) {
    cancelAnimationFrame(rafId);
  }
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  setBodyScrollLock(false);
});

const computedClass = computed(() => [
  'navbar',
  isScrolled.value ? 'scrolled' : '',
  isHidden.value ? 'nav-hidden' : '',
  props.class,
  attrs.class
].filter(Boolean).join(' '));

const filteredAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const navbarStyle = computed(() => ({
  '--navbar-height': '68px',
  '--navbar-height-mobile': '60px'
}));
</script>

<style scoped>
.navbar {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: var(--navbar-height);
  padding-top: env(safe-area-inset-top, 0px);
  background: linear-gradient(180deg, rgba(7, 10, 16, 0.76), rgba(7, 10, 16, 0.5));
  backdrop-filter: blur(20px) saturate(135%);
  -webkit-backdrop-filter: blur(20px) saturate(135%);
  border-bottom: 1px solid rgba(182, 198, 255, 0.1);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
  transition: transform 220ms var(--ease-standard), background-color 220ms var(--ease-standard), border-color 220ms var(--ease-standard), box-shadow 220ms var(--ease-standard);
}

.navbar.nav-hidden {
  transform: translateY(-100%);
}

.navbar.scrolled {
  background: linear-gradient(180deg, rgba(7, 10, 16, 0.88), rgba(7, 10, 16, 0.68));
  border-bottom-color: rgba(196, 209, 255, 0.14);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
}

.navbar-shell {
  width: min(100%, 1320px);
  min-height: var(--navbar-height);
  padding: 0 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.navbar-brand-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #f6f8ff;
  text-decoration: none;
  min-width: 0;
}

.brand-mark {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.028);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.brand-logo-svg {
  width: 26px;
  height: 26px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-title {
  font-size: 15px;
  line-height: 1.1;
  letter-spacing: 0.02em;
}

.desktop-nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.nav-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.012);
  color: rgba(235, 241, 255, 0.78);
  text-decoration: none;
  font-size: 11px;
  letter-spacing: 0.03em;
  transition: transform 180ms var(--ease-standard), background-color 180ms var(--ease-standard), border-color 180ms var(--ease-standard), color 180ms var(--ease-standard), box-shadow 180ms var(--ease-standard);
}

.nav-pill:hover,
.nav-pill:focus-visible {
  color: #fff;
  background: rgba(124, 140, 255, 0.08);
  border-color: rgba(124, 140, 255, 0.12);
  transform: translateY(-1px);
}

.nav-pill.active {
  color: #fff;
  background: linear-gradient(180deg, rgba(124, 140, 255, 0.12), rgba(92, 109, 232, 0.08));
  border-color: rgba(124, 140, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.navbar-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}

.icon-chip {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.045);
  background: rgba(255, 255, 255, 0.015);
  color: rgba(235, 241, 255, 0.78);
  transition: transform 180ms var(--ease-standard), background-color 180ms var(--ease-standard), border-color 180ms var(--ease-standard), color 180ms var(--ease-standard);
}

.icon-chip:hover,
.icon-chip:focus-visible {
  color: #fff;
  background: rgba(124, 140, 255, 0.08);
  border-color: rgba(124, 140, 255, 0.12);
  transform: translateY(-1px);
}

.mobile-only {
  display: none;
}

.menu-toggle {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.menu-toggle-bars,
.menu-toggle-bars::before,
.menu-toggle-bars::after {
  width: 20px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  display: block;
  position: relative;
  transition: transform 180ms ease, opacity 180ms ease, top 180ms ease, bottom 180ms ease;
}

.menu-toggle-bars::before,
.menu-toggle-bars::after {
  content: '';
  position: absolute;
  left: 0;
}

.menu-toggle-bars::before {
  top: -7px;
}

.menu-toggle-bars::after {
  bottom: -7px;
}

.menu-toggle.active .menu-toggle-bars {
  background: transparent;
}

.menu-toggle.active .menu-toggle-bars::before {
  top: 0;
  transform: rotate(45deg);
}

.menu-toggle.active .menu-toggle-bars::after {
  bottom: 0;
  transform: rotate(-45deg);
}

.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
  background: rgba(4, 8, 16, 0.68);
}

.mobile-drawer {
  width: min(360px, 90vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(13, 17, 28, 0.98), rgba(9, 11, 18, 0.96));
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -18px 0 38px rgba(0, 0, 0, 0.28);
  padding-top: env(safe-area-inset-top, 0px);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 18px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.drawer-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.46);
}

.drawer-title {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.drawer-close {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.drawer-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 18px 8px;
}

.drawer-meta-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.drawer-meta-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.46);
}

.drawer-meta-value {
  font-size: 14px;
  color: rgba(246, 248, 255, 0.92);
}

.drawer-nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 18px 20px;
}

.drawer-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-group-title {
  margin: 0 6px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.46);
}

.drawer-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(240, 244, 255, 0.88);
  text-decoration: none;
  transition: transform 180ms var(--ease-standard), background-color 180ms var(--ease-standard), border-color 180ms var(--ease-standard);
}

.drawer-link:hover,
.drawer-link:focus-visible {
  transform: translateX(2px);
  background: rgba(124, 140, 255, 0.1);
  border-color: rgba(124, 140, 255, 0.16);
}

.drawer-link.active {
  background: linear-gradient(180deg, rgba(124, 140, 255, 0.2), rgba(92, 109, 232, 0.12));
  border-color: rgba(124, 140, 255, 0.22);
}

.drawer-link-icon {
  color: rgba(225, 232, 255, 0.62);
}

.navbar-search-panel {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgba(4, 8, 16, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: grid;
  place-items: start center;
  padding-top: 92px;
}

.account-menu-panel {
  position: fixed;
  top: calc(var(--navbar-height) + env(safe-area-inset-top, 0px) + 6px);
  right: 12px;
  z-index: 1900;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.navbar-search-card {
  width: min(560px, calc(100vw - 24px));
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 14, 24, 0.96);
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.3);
  padding: 16px;
}

.account-menu-card {
  pointer-events: auto;
  min-width: 240px;
  max-width: 280px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 14, 24, 0.98);
  box-shadow: 0 16px 28px rgba(0, 0, 0, 0.22);
  padding: 12px;
}

.navbar-search-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.navbar-search-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.46);
}

.navbar-search-title {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.navbar-search-close {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(235, 241, 255, 0.8);
}

.navbar-search-input {
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #fff;
  outline: none;
}

.navbar-search-input::placeholder {
  color: rgba(235, 241, 255, 0.38);
}

.navbar-search-input:focus {
  border-color: rgba(124, 140, 255, 0.28);
  box-shadow: 0 0 0 3px rgba(124, 140, 255, 0.12);
}

.navbar-search-results {
  margin-top: 12px;
  display: grid;
  gap: 8px;
  max-height: min(48vh, 380px);
  overflow: auto;
}

.navbar-search-result {
  text-align: left;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-label {
  font-size: 13px;
}

.result-path {
  font-size: 11px;
  color: rgba(235, 241, 255, 0.46);
}

.navbar-search-empty {
  margin: 12px 0 0;
  color: rgba(235, 241, 255, 0.48);
  font-size: 13px;
}

.account-menu-kicker {
  margin: 0 0 4px;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(225, 232, 255, 0.42);
}

.account-menu-title {
  margin: 0;
  font-size: 15px;
  color: #fff;
}

.account-menu-desc {
  margin: 8px 0 0;
  color: rgba(235, 241, 255, 0.62);
  font-size: 11px;
}

.account-menu-actions {
  margin-top: 10px;
}

.account-menu-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 11px;
  background: rgba(124, 140, 255, 0.12);
  color: #fff;
  text-decoration: none;
  border: 1px solid rgba(124, 140, 255, 0.14);
}

.account-menu-link + .account-menu-link {
  margin-top: 8px;
}

.account-menu-link.secondary-link {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.drawer-anim-enter-active,
.drawer-anim-leave-active {
  transition: opacity 220ms var(--ease-standard);
}

.drawer-anim-enter-from,
.drawer-anim-leave-to {
  opacity: 0;
}

.drawer-anim-enter-active .mobile-drawer,
.drawer-anim-leave-active .mobile-drawer {
  transition: transform 220ms var(--ease-standard);
}

.drawer-anim-enter-from .mobile-drawer,
.drawer-anim-leave-to .mobile-drawer {
  transform: translateX(100%);
}

.navbar :focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (max-width: 768px) {
  .navbar {
    min-height: var(--navbar-height-mobile);
  }

  .navbar-shell {
    min-height: var(--navbar-height-mobile);
    grid-template-columns: 1fr auto;
    gap: 10px;
    padding: 0 14px;
  }

  .desktop-nav {
    display: none;
  }

  .navbar-actions {
    display: flex;
  }

  .search-trigger,
  .language-chip,
  .account-chip {
    display: none;
  }

  .navbar-search-panel {
    padding-top: 76px;
  }

  .navbar-search-card {
    width: min(100vw - 16px, 560px);
    border-radius: 18px;
  }

  .account-menu-panel {
    right: 8px;
    top: calc(var(--navbar-height-mobile) + env(safe-area-inset-top, 0px) + 6px);
  }

  .account-menu-card {
    min-width: 240px;
    max-width: calc(100vw - 16px);
  }

  .mobile-only {
    display: inline-flex;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
    border-radius: 13px;
  }

  .brand-title {
    font-size: 15px;
  }

  .drawer-meta {
    grid-template-columns: 1fr;
  }
}
</style>
