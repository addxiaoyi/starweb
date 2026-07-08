<template>
  <div class="profile-view page-shell">
    <header class="page-hero profile-hero panel-hover">
      <div class="profile-hero__text">
        <p class="page-hero__eyebrow">Account Center</p>
        <h1 class="page-hero__title">个人中心</h1>
        <p class="page-hero__subtitle" data-typography="prose">
          查看你的账号概况、收藏统计、投稿进度与安全状态。
        </p>
      </div>
      <div class="profile-hero__actions">
        <RouterLink to="/skin/favorites" class="ui-btn">我的收藏</RouterLink>
        <RouterLink to="/skin/submit" class="ui-btn secondary">投稿中心</RouterLink>
      </div>
    </header>

    <section class="profile-summary card glass-panel">
      <article class="summary-card">
        <span class="summary-label">当前用户</span>
        <strong class="summary-value">{{ userName }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">收藏数量</span>
        <strong class="summary-value">{{ favoritesCount }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">投稿数量</span>
        <strong class="summary-value">{{ submissionsCount }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">安全状态</span>
        <strong class="summary-value">{{ securityLabel }}</strong>
      </article>
    </section>

    <section class="profile-grid">
      <article class="card glass-panel profile-card">
        <h2>快捷入口</h2>
        <div class="quick-links">
          <RouterLink to="/skin" class="quick-link">浏览皮肤库</RouterLink>
          <RouterLink to="/skin/favorites" class="quick-link">查看收藏</RouterLink>
          <RouterLink to="/notifications" class="quick-link">通知中心</RouterLink>
          <RouterLink to="/guide" class="quick-link">服务器指引</RouterLink>
          <RouterLink to="/security" class="quick-link">安全中心</RouterLink>
        </div>
      </article>

      <article class="card glass-panel profile-card">
        <h2>最近动态</h2>
        <ul class="activity-list">
          <li v-for="item in recentActivity" :key="item.id" class="activity-item">
            <div>
              <div class="activity-title">{{ item.title }}</div>
              <div class="activity-sub">{{ item.subtitle }}</div>
            </div>
            <time class="activity-time">{{ item.time }}</time>
          </li>
        </ul>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

type RecentActivity = {
  id: string
  title: string
  subtitle: string
  time: string
}

const summary = ref<{
  user?: { username?: string }
  favoritesCount?: number
  submissionsCount?: number
  security?: { level?: string; totpEnabled?: boolean }
  recentActivity?: Array<{ id?: string; title?: string; subtitle?: string; time?: string }>
} | null>(null)

const userName = computed(() => summary.value?.user?.username || auth.user?.username || '未登录用户')
const favoritesCount = computed(() => Number(summary.value?.favoritesCount || 0))
const submissionsCount = computed(() => Number(summary.value?.submissionsCount || 0))
const securityLabel = computed(() => {
  const level = String(summary.value?.security?.level || '')
  if (!auth.isLoggedIn) return '未登录'
  if (level === 'risk') return '风险'
  if (level === 'attention') return '需关注'
  return summary.value?.security?.totpEnabled ? '安全' : '基础保护'
})

const fallbackActivity: RecentActivity[] = [
  { id: '1', title: '收藏同步', subtitle: '最近的收藏列表已刷新', time: '刚刚' },
  { id: '2', title: '投稿记录', subtitle: '可在投稿中心查看审核状态', time: '今天' },
  { id: '3', title: '安全检查', subtitle: '建议前往安全中心查看会话', time: '前天' }
]

const recentActivity = computed<RecentActivity[]>(() => {
  const list = Array.isArray(summary.value?.recentActivity) ? summary.value.recentActivity : []
  if (list.length === 0) return fallbackActivity
  return list.map((item, idx) => ({
    id: String(item?.id || `activity-${idx}`),
    title: String(item?.title || '动态更新'),
    subtitle: String(item?.subtitle || ''),
    time: String(item?.time || ''),
  }))
})

async function loadSummary() {
  if (!auth.isLoggedIn) {
    summary.value = null
    return
  }
  try {
    const resp = await fetch('/api/user/center/summary', {
      credentials: 'include',
      cache: 'no-store'
    })
    if (!resp.ok) return
    const data = await resp.json().catch(() => null)
    if (data && typeof data === 'object') {
      summary.value = data as typeof summary.value
    }
  } catch {
    // ignore degraded mode
  }
}

onMounted(() => {
  void loadSummary()
})
</script>

<style scoped>
.profile-view {
  display: grid;
  gap: 16px;
  padding-bottom: 24px;
}

.profile-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.profile-hero__text {
  min-width: 0;
}

.profile-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.profile-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  padding: 14px;
  background: rgba(255,255,255,.03);
}

.summary-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.summary-value {
  font-size: 18px;
  color: var(--text-primary);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.profile-card h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.quick-link {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  color: var(--text-primary);
  text-decoration: none;
  background: rgba(255,255,255,.03);
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.02);
}

.activity-title {
  font-weight: 600;
}

.activity-sub,
.activity-time {
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .profile-summary,
  .profile-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .profile-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-summary,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .activity-item {
    flex-direction: column;
  }
}
</style>
