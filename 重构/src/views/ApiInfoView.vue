<template>
  <div class="apiInfo page-shell">
    <header class="hero">
      <h1 class="title">开发者 API</h1>
      <p class="subtitle">当前站点提供认证、皮肤与仪表盘能力，建议通过服务端调用并启用签名校验。</p>
      <div class="hero-actions">
        <button type="button" class="ui-btn" @click="copyBaseUrl">复制接口基址</button>
        <button type="button" class="ui-btn secondary" @click="scrollToSections">查看接口清单</button>
      </div>
    </header>

    <AppStatePanel
      variant="info"
      eyebrow="Developer"
      title="接入前请先阅读文档"
      message="接口细节与配置变量以仓库文档为准，建议先确认签名、鉴权与环境变量。"
      hint="如果你要做二次集成，优先从服务端封装开始。"
      class="api-state-panel"
    />

    <section class="card summary-card">
      <div>
        <h2>接口范围</h2>
        <ul>
          <li>账号与认证：登录态、用户档案、权限鉴权。</li>
          <li>皮肤站：皮肤上传、审核、玩家皮肤同步。</li>
          <li>仪表盘：用户配置、只读分享令牌、状态指标读取。</li>
        </ul>
      </div>
      <div class="stats-grid">
        <div class="stat-pill"><span>模块</span><strong>{{ moduleCount }}</strong></div>
        <div class="stat-pill"><span>建议优先级</span><strong>服务端接入</strong></div>
        <div class="stat-pill"><span>鉴权</span><strong>HMAC / 会话</strong></div>
      </div>
    </section>

    <section ref="sectionsRef" class="card">
      <h2>对接入口</h2>
      <p>接口细节与配置变量以仓库文档为准：</p>
      <ul>
        <li><code>velocity-limbo-auth/开发清单与网站对接全流程.md</code></li>
        <li><code>velocity-limbo-auth/站点与后端环境变量对照.md</code></li>
        <li><code>重构/backend/README.md</code></li>
      </ul>
    </section>

    <section class="card">
      <h2>接口速览</h2>
      <div class="endpoint-grid">
        <article v-for="item in endpointGroups" :key="item.title" class="endpoint-card">
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
          <ul>
            <li v-for="endpoint in item.endpoints" :key="endpoint">{{ endpoint }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="card">
      <h2>安全建议</h2>
      <ul>
        <li>服务端对服务端调用，不在浏览器暴露签名密钥。</li>
        <li>启用时间戳与 HMAC 校验，拒绝重放请求。</li>
        <li>生产环境强制 HTTPS，并限制来源与速率。</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'

const sectionsRef = ref<HTMLElement | null>(null)
const baseUrl = computed(() => (typeof window === 'undefined' ? '/api' : `${window.location.origin}/api`))
const moduleCount = computed(() => endpointGroups.length)

const endpointGroups = [
  {
    title: '认证与账号',
    description: '用于登录态、资料读取、权限校验与账号绑定。',
    endpoints: [
      'POST /api/auth/login',
      'GET /api/auth/me',
      'POST /api/user/totp/setup',
      'POST /api/user/totp/enable'
    ]
  },
  {
    title: '皮肤与投稿',
    description: '用于皮肤上传、投稿、审核与管理。',
    endpoints: [
      'GET /api/skins',
      'POST /api/skins/submissions',
      'GET /api/skins/reviews',
      'POST /api/skins/reviews/:id'
    ]
  },
  {
    title: '仪表盘与安全',
    description: '用于遥测、分享链接、会话与安全告警。',
    endpoints: [
      'GET /api/user/:id/dashboard-config',
      'GET /api/security/center',
      'GET /api/admin/telemetry/events',
      'GET /api/security/analytics/summary'
    ]
  }
]

async function copyBaseUrl() {
  try {
    await navigator.clipboard.writeText(baseUrl.value)
  } catch {
    // ignore clipboard failures
  }
}

function scrollToSections() {
  sectionsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<style scoped>
.apiInfo { max-width: 920px; margin: 0 auto; padding: 96px 16px 40px; color: var(--text-primary); }
.api-state-panel { margin: 12px 0 0; }

.hero {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.title {
  margin: 0;
  font-size: 30px;
}

.subtitle {
  margin: 10px 0 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.card {
  margin-top: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-2);
  padding: 14px 16px;
}
.summary-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: start;
}
.stats-grid {
  display: grid;
  gap: 8px;
  min-width: 220px;
}
.stat-pill {
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
}
.stat-pill span { color: var(--text-secondary); font-size: 12px; }
.stat-pill strong { font-size: 14px; }
.card h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.card ul {
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.card p {
  margin: 0 0 8px;
  color: var(--text-secondary);
}
.endpoint-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.endpoint-card {
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px;
  background: color-mix(in srgb, var(--surface-2) 86%, transparent);
}
.endpoint-card h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.endpoint-card p {
  margin-bottom: 8px;
}
code {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
}
@media (max-width: 900px) {
  .summary-card,
  .endpoint-grid {
    grid-template-columns: 1fr;
  }
}
</style>
