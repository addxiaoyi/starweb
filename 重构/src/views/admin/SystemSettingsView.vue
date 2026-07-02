<template>
  <div class="system-settings-view">
    <header class="settings-header">
      <div>
        <p class="settings-eyebrow">Administration</p>
        <h1>系统设置</h1>
        <p class="settings-subtitle">统一管理站点、功能、安全、邮件与存储配置。</p>
      </div>
      <button class="save-all-btn" :disabled="saving" @click="saveAll">
        {{ saving ? '保存中...' : '保存所有更改' }}
      </button>
    </header>

    <AppStatePanel
      variant="info"
      eyebrow="Settings"
      title="保存的配置会影响全站行为"
      message="修改后请确认各项参数是否与后端服务一致，尤其是存储、邮件和安全相关设置。"
      hint="建议一次只改一个模块，方便排查问题。"
      class="settings-state-panel"
    />

    <div class="settings-layout">
      <nav class="settings-nav">
        <button v-for="tab in tabs" :key="tab.id" class="nav-item" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <span class="nav-icon">{{ tab.icon }}</span>
          {{ tab.label }}
        </button>
      </nav>

      <div class="settings-panel">
        <section v-if="activeTab === 'basic'" class="setting-section">
          <h2>基础信息</h2>
          <div class="form-group"><label>站点名称</label><input v-model="settings.site.name" type="text" placeholder="StarMC"></div>
          <div class="form-group"><label>站点描述</label><textarea v-model="settings.site.description" rows="3" placeholder="StarMC - Minecraft 服务器社区" /></div>
          <div class="form-group"><label>站点 URL</label><input v-model="settings.site.url" type="url" placeholder="https://starmc.cn"></div>
          <div class="form-group"><label>联系邮箱</label><input v-model="settings.site.contactEmail" type="email" placeholder="admin@starmc.cn"></div>
          <div class="form-group"><label>ICP 备案号</label><input v-model="settings.site.icp" type="text" placeholder="粤ICP备XXXXXXXX号"></div>
          <h2>维护模式</h2>
          <div class="toggle-group">
            <div class="toggle-item">
              <div class="toggle-info"><span class="toggle-label">开启维护模式</span><span class="toggle-desc">开启后仅管理员可访问，其他用户看到维护页面</span></div>
              <label class="toggle-switch"><input v-model="settings.site.maintenanceMode" type="checkbox"><span class="slider" /></label>
            </div>
            <div v-if="settings.site.maintenanceMode" class="form-group maintenance-message"><label>维护提示信息</label><textarea v-model="settings.site.maintenanceMessage" rows="2" placeholder="系统维护中，预计 XX 分钟后恢复..." /></div>
          </div>
        </section>

        <section v-if="activeTab === 'features'" class="setting-section">
          <h2>功能开关</h2>
          <p class="section-desc">控制各功能模块的启用状态，关闭后对应功能对所有用户隐藏</p>
          <div class="toggle-group"><div v-for="feat in featureList" :key="feat.key" class="toggle-item"><div class="toggle-info"><span class="toggle-label">{{ feat.label }}</span><span class="toggle-desc">{{ feat.desc }}</span></div><label class="toggle-switch"><input v-model="settings.features[feat.key]" type="checkbox"><span class="slider" /></label></div></div>
        </section>

        <section v-if="activeTab === 'skin'" class="setting-section">
          <h2>皮肤上传限制</h2>
          <div class="form-row"><div class="form-group"><label>最大文件大小 (KB)</label><input v-model.number="settings.skin.maxFileSizeKB" type="number" min="64" max="4096"></div><div class="form-group"><label>每用户每日上传限制</label><input v-model.number="settings.skin.dailyUploadLimit" type="number" min="1" max="100"></div></div>
          <div class="form-row"><div class="form-group"><label>允许的图片宽度 (px)</label><input v-model="settings.skin.allowedWidths" type="text" placeholder="64,128,256"></div><div class="form-group"><label>允许的图片高度 (px)</label><input v-model="settings.skin.allowedHeights" type="text" placeholder="64,128,256"></div></div>
          <h2>审核设置</h2>
          <div class="toggle-group"><div class="toggle-item"><div class="toggle-info"><span class="toggle-label">自动审核通过</span><span class="toggle-desc">已认证用户上传皮肤无需审核直接上架</span></div><label class="toggle-switch"><input v-model="settings.skin.autoApprove" type="checkbox"><span class="slider" /></label></div><div class="toggle-item"><div class="toggle-info"><span class="toggle-label">AI 内容检测</span><span class="toggle-desc">上传时自动检测不当内容（需配置 API Key）</span></div><label class="toggle-switch"><input v-model="settings.skin.aiModeration" type="checkbox"><span class="slider" /></label></div></div>
        </section>

        <section v-if="activeTab === 'security'" class="setting-section">
          <h2>速率限制</h2>
          <div class="form-row"><div class="form-group"><label>API 请求限制（次/15分钟）</label><input v-model.number="settings.security.apiRateLimit" type="number" min="10" max="1000"></div><div class="form-group"><label>登录失败锁定次数</label><input v-model.number="settings.security.loginFailLockCount" type="number" min="3" max="20"></div></div>
          <h2>Session 设置</h2>
          <div class="form-row"><div class="form-group"><label>Access Token 有效期 (秒)</label><input v-model.number="settings.security.accessTokenTTL" type="number" min="300"></div><div class="form-group"><label>Refresh Token 有效期 (天)</label><input v-model.number="settings.security.refreshTokenDays" type="number" min="1" max="365"></div></div>
          <h2>IP 黑名单</h2>
          <div class="form-group"><label>被封禁的 IP（每行一个）</label><textarea v-model="settings.security.ipBlocklist" rows="5" placeholder="192.168.1.1&#10;10.0.0.0/8" class="mono-textarea" /></div>
          <div class="toggle-group"><div class="toggle-item"><div class="toggle-info"><span class="toggle-label">强制 HTTPS</span><span class="toggle-desc">自动将 HTTP 请求重定向到 HTTPS</span></div><label class="toggle-switch"><input v-model="settings.security.forceHttps" type="checkbox"><span class="slider" /></label></div><div class="toggle-item"><div class="toggle-info"><span class="toggle-label">双因素认证（2FA）</span><span class="toggle-desc">要求管理员账户强制开启 2FA</span></div><label class="toggle-switch"><input v-model="settings.security.require2FAForAdmin" type="checkbox"><span class="slider" /></label></div></div>
        </section>

        <section v-if="activeTab === 'email'" class="setting-section">
          <h2>SMTP 配置</h2>
          <div class="form-row"><div class="form-group"><label>SMTP 主机</label><input v-model="settings.email.smtpHost" type="text" placeholder="smtp.example.com"></div><div class="form-group"><label>SMTP 端口</label><input v-model.number="settings.email.smtpPort" type="number" placeholder="465"></div></div>
          <div class="form-row"><div class="form-group"><label>发件人邮箱</label><input v-model="settings.email.fromAddress" type="email" placeholder="noreply@starmc.cn"></div><div class="form-group"><label>发件人名称</label><input v-model="settings.email.fromName" type="text" placeholder="StarMC"></div></div>
          <button class="test-btn" @click="testEmail">发送测试邮件</button>
          <h2 class="section-spacer">邮件模板</h2>
          <div class="template-tabs"><button v-for="tpl in emailTemplates" :key="tpl.key" class="tpl-tab" :class="{ active: activeTemplate === tpl.key }" @click="activeTemplate = tpl.key">{{ tpl.label }}</button></div>
          <div class="template-editor"><div class="form-group"><label>邮件主题</label><input v-model="currentTemplate.subject" type="text"></div><div class="form-group"><label>邮件内容（支持 HTML）</label><textarea v-model="currentTemplate.body" rows="12" class="mono-textarea" /></div><div class="template-vars"><span class="vars-label">可用变量：</span><code v-for="v in currentTemplate.variables" :key="v">{{ '{' + v + '}' }}</code></div></div>
        </section>

        <section v-if="activeTab === 'storage'" class="setting-section">
          <h2>存储提供商</h2>
          <div class="radio-group"><label v-for="p in storageProviders" :key="p.value" class="radio-item"><input v-model="settings.storage.provider" type="radio" :value="p.value"><span class="radio-label">{{ p.label }}</span><span class="radio-desc">{{ p.desc }}</span></label></div>
          <template v-if="settings.storage.provider === 'local'"><div class="form-group section-spacer"><label>上传目录路径</label><input v-model="settings.storage.localPath" type="text" placeholder="/var/www/uploads"></div></template>
          <template v-if="settings.storage.provider === 's3'"><div class="form-row section-spacer"><div class="form-group"><label>S3 Bucket 名称</label><input v-model="settings.storage.s3Bucket" type="text"></div><div class="form-group"><label>S3 Region</label><input v-model="settings.storage.s3Region" type="text" placeholder="ap-northeast-1"></div></div><div class="form-row"><div class="form-group"><label>Access Key ID</label><input v-model="settings.storage.s3AccessKey" type="password"></div><div class="form-group"><label>Secret Access Key</label><input v-model="settings.storage.s3SecretKey" type="password"></div></div><div class="form-group"><label>自定义 CDN 域名（可选）</label><input v-model="settings.storage.cdnUrl" type="url" placeholder="https://cdn.starmc.cn"></div></template>
          <template v-if="settings.storage.provider === 'r2'"><div class="form-row section-spacer"><div class="form-group"><label>Account ID</label><input v-model="settings.storage.r2AccountId" type="text"></div><div class="form-group"><label>Bucket 名称</label><input v-model="settings.storage.r2Bucket" type="text"></div></div><div class="form-row"><div class="form-group"><label>Access Key ID</label><input v-model="settings.storage.r2AccessKey" type="password"></div><div class="form-group"><label>Secret Access Key</label><input v-model="settings.storage.r2SecretKey" type="password"></div></div></template>
          <h2 class="section-spacer">存储用量</h2>
          <div class="storage-stats"><div v-for="stat in storageStats" :key="stat.label" class="storage-item"><div class="storage-header"><span>{{ stat.label }}</span><span>{{ stat.used }} / {{ stat.total }}</span></div><div class="progress-bar"><div class="progress-fill" :style="{ width: stat.percent + '%' }" :class="{ warning: stat.percent > 70, danger: stat.percent > 90 }" /></div></div></div>
        </section>
      </div>
    </div>

    <Transition name="slide-up">
      <div v-if="toastMessage" class="saved-toast" :class="`is-${toastType}`" role="status" aria-live="polite">
        <span class="toast-icon">{{ toastType === 'success' ? '✅' : '⚠️' }}</span>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, computed, reactive } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'

const activeTab = ref('basic')
const saving = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const activeTemplate = ref('welcome')

const tabs = [
  { id: 'basic',    icon: '🌐', label: '基础设置' },
  { id: 'features', icon: '🔧', label: '功能开关' },
  { id: 'skin',     icon: '🎨', label: '皮肤站' },
  { id: 'security', icon: '🔒', label: '安全设置' },
  { id: 'email',    icon: '📧', label: '邮件模板' },
  { id: 'storage',  icon: '💾', label: '文件存储' },
]

const featureList = [
  { key: 'skinLibrary',    label: '皮肤库',     desc: '允许用户浏览和搜索皮肤库' },
  { key: 'skinUpload',     label: '皮肤投稿',   desc: '允许用户投稿自制皮肤' },
  { key: 'skinCompare',    label: '皮肤对比',   desc: '允许用户并排对比两款皮肤' },
  { key: 'favorites',      label: '收藏功能',   desc: '允许用户收藏皮肤' },
  { key: 'share',          label: '分享功能',   desc: '允许用户分享皮肤链接/二维码' },
  { key: 'report',         label: '举报功能',   desc: '允许用户举报不当皮肤' },
  { key: 'batchUpload',    label: '批量上传',   desc: '允许 ZIP 批量打包上传' },
  { key: 'serverStatus',   label: '服务器状态', desc: '展示 MC 服务器实时在线状态' },
  { key: 'i18n',           label: '多语言',     desc: '允许用户切换界面语言' },
  { key: 'pwa',            label: 'PWA 支持',   desc: '允许安装为桌面应用' },
  { key: 'webVitals',      label: 'Web Vitals 上报', desc: '收集性能指标用于优化' },
]

const storageProviders = [
  { value: 'local',  label: '本地存储',         desc: '存储到服务器本地磁盘' },
  { value: 's3',     label: 'Amazon S3',        desc: '使用 AWS S3 对象存储' },
  { value: 'r2',     label: 'Cloudflare R2',    desc: '使用 R2（无出站费用）' },
]

const emailTemplates = [
  { key: 'welcome',     label: '注册欢迎' },
  { key: 'verify',      label: '邮箱验证' },
  { key: 'resetPwd',    label: '密码重置' },
  { key: 'reviewPass',  label: '审核通过' },
  { key: 'reviewFail',  label: '审核未通过' },
  { key: 'reportAck',   label: '举报确认' },
]

const templateContents: Record<string, { subject: string; body: string; variables: string[] }> = {
  welcome: {
    subject: '欢迎加入 {siteName}',
    body: `<h1>欢迎，{username}！</h1>
<p>感谢您注册 {siteName}，您的账号已创建成功。</p>
<p>现在您可以浏览皮肤库、上传您的作品，和社区一起畅玩 Minecraft！</p>
<a href="{siteUrl}" style="background:#3b82f6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">立即探索</a>`,
    variables: ['siteName', 'username', 'siteUrl'],
  },
  verify: {
    subject: '验证您的 {siteName} 邮箱',
    body: `<h1>邮箱验证</h1>
<p>点击下方链接验证您的邮箱地址（链接 15 分钟内有效）：</p>
<a href="{verifyUrl}" style="background:#22c55e;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">验证邮箱</a>
<p style="color:#9ca3af;font-size:0.875rem">如果不是您发起的操作，请忽略此邮件。</p>`,
    variables: ['siteName', 'username', 'verifyUrl'],
  },
  resetPwd: {
    subject: '重置您的 {siteName} 密码',
    body: `<h1>密码重置</h1>
<p>您收到此邮件是因为有人（可能是您）请求重置密码。</p>
<a href="{resetUrl}" style="background:#ef4444;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">重置密码</a>
<p style="color:#9ca3af;font-size:0.875rem">链接 1 小时内有效。若非您本人操作，请忽略。</p>`,
    variables: ['siteName', 'username', 'resetUrl'],
  },
  reviewPass: {
    subject: '您投稿的皮肤已通过审核 ✅',
    body: `<h1>投稿通过！</h1>
<p>恭喜，您提交的皮肤 <strong>{skinName}</strong> 已通过审核并上架。</p>
<a href="{skinUrl}" style="background:#3b82f6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">查看皮肤</a>`,
    variables: ['username', 'skinName', 'skinUrl'],
  },
  reviewFail: {
    subject: '您投稿的皮肤未通过审核',
    body: `<h1>投稿未通过</h1>
<p>您提交的皮肤 <strong>{skinName}</strong> 未通过审核。</p>
<p>原因：{reason}</p>
<p>您可以修改后重新提交。如有疑问请联系管理员。</p>`,
    variables: ['username', 'skinName', 'reason'],
  },
  reportAck: {
    subject: '您的举报已收到',
    body: `<h1>举报已收到</h1>
<p>感谢您的反馈，我们已收到您的举报（ID: {reportId}）。</p>
<p>工作人员将在 24 小时内处理，感谢您帮助维护社区环境。</p>`,
    variables: ['username', 'reportId'],
  },
}

const currentTemplate = computed(() => templateContents[activeTemplate.value])

const settings = reactive({
  site: {
    name: 'StarMC',
    description: 'StarMC - 专注于提供优质 Minecraft 服务器体验的社区',
    url: 'https://starmc.cn',
    contactEmail: 'admin@starmc.cn',
    icp: '',
    maintenanceMode: false,
    maintenanceMessage: '系统维护中，请稍后访问...',
  },
  features: Object.fromEntries(featureList.map(f => [f.key, true])),
  skin: {
    maxFileSizeKB: 256,
    dailyUploadLimit: 10,
    allowedWidths: '64,128',
    allowedHeights: '64,128',
    autoApprove: false,
    aiModeration: false,
  },
  security: {
    apiRateLimit: 100,
    loginFailLockCount: 5,
    accessTokenTTL: 3600,
    refreshTokenDays: 30,
    ipBlocklist: '',
    forceHttps: true,
    require2FAForAdmin: false,
  },
  email: {
    smtpHost: '',
    smtpPort: 465,
    fromAddress: 'noreply@starmc.cn',
    fromName: 'StarMC',
  },
  storage: {
    provider: 'local' as 'local' | 's3' | 'r2',
    localPath: '/var/www/uploads',
    s3Bucket: '', s3Region: '', s3AccessKey: '', s3SecretKey: '',
    r2AccountId: '', r2Bucket: '', r2AccessKey: '', r2SecretKey: '',
    cdnUrl: '',
  },
})

const storageStats = [
  { label: '皮肤文件', used: '1.2 GB', total: '10 GB', percent: 12 },
  { label: '头像/预览图', used: '340 MB', total: '5 GB', percent: 7 },
  { label: '系统日志', used: '89 MB', total: '1 GB', percent: 9 },
]

let toastTimer: ReturnType<typeof setTimeout> | null = null

const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  if (toastTimer) clearTimeout(toastTimer)
  toastType.value = type
  toastMessage.value = message
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
    toastTimer = null
  }, 2500)
}

const saveAll = async () => {
  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 800))
    showToast('设置已保存', 'success')
  } catch {
    showToast('保存失败，请稍后重试', 'error')
  } finally {
    saving.value = false
  }
}

const testEmail = () => {
  showToast(`测试邮件已发送到 ${settings.email.fromAddress}`, 'success')
}

onBeforeUnmount(() => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
})
</script>

<style scoped>
.system-settings-view { padding: 1.5rem; max-width: 1200px; margin: 0 auto; position: relative; }
.settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 1rem; }
.settings-eyebrow { margin: 0 0 0.35rem; color: var(--text-secondary, #9ca3af); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.76rem; }
.settings-header h1 { margin: 0; font-size: 1.5rem; color: var(--text-primary, #fff); }
.settings-subtitle { margin: 0.35rem 0 0; color: var(--text-secondary, #9ca3af); }
.settings-state-panel { margin-bottom: 1rem; }

.save-all-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
  border: none;
  padding: 0.625rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.save-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 1.5rem;
  align-items: start;
}

.settings-nav {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  padding: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: sticky;
  top: 1rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: none;
  border: none;
  color: var(--text-secondary, #9ca3af);
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary, #fff);
}

.nav-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.nav-icon { font-size: 1rem; }

.settings-panel {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  padding: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.setting-section h2 {
  font-size: 1.0625rem;
  margin: 0 0 1.25rem 0;
  color: var(--text-primary, #fff);
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.section-desc {
  color: var(--text-secondary, #9ca3af);
  font-size: 0.875rem;
  margin: -0.75rem 0 1.25rem 0;
}

.form-group {
  margin-bottom: 1.125rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.875rem;
  color: var(--text-secondary, #9ca3af);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
  padding: 0.625rem 0.875rem;
  border-radius: 6px;
  font-size: 0.9375rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* 开关 */
.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.toggle-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.05);
  gap: 1rem;
}

.toggle-info { flex: 1; }

.toggle-label {
  display: block;
  font-size: 0.9375rem;
  color: var(--text-primary, #fff);
  margin-bottom: 0.2rem;
}

.toggle-desc {
  display: block;
  font-size: 0.8125rem;
  color: var(--text-secondary, #9ca3af);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input { opacity: 0; width: 0; height: 0; }

.slider {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.15);
  border-radius: 24px;
  cursor: pointer;
  transition: background 0.2s;
}

.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-switch input:checked + .slider { background: #22c55e; }
.toggle-switch input:checked + .slider::before { transform: translateX(20px); }

/* 单选 */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: border-color 0.2s;
}

.radio-item:has(input:checked) {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.06);
}

.radio-item input { accent-color: #3b82f6; }

.radio-label {
  font-weight: 500;
  color: var(--text-primary, #fff);
  min-width: 140px;
}

.radio-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary, #9ca3af);
}

/* 存储用量 */
.storage-stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.storage-item {}

.storage-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary, #9ca3af);
}

.progress-bar {
  height: 8px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 4px;
  transition: width 0.4s;
}

.progress-fill.warning { background: #f59e0b; }
.progress-fill.danger  { background: #ef4444; }

/* 邮件模板 */
.template-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}

.tpl-tab {
  padding: 0.375rem 0.875rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--text-secondary, #9ca3af);
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tpl-tab:hover { background: rgba(255,255,255,0.09); color: var(--text-primary, #fff); }
.tpl-tab.active {
  background: rgba(59,130,246,0.15);
  border-color: rgba(59,130,246,0.4);
  color: #3b82f6;
}

.template-vars {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.vars-label { color: var(--text-secondary, #9ca3af); }

.template-vars code {
  background: rgba(59,130,246,0.12);
  color: #93c5fd;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

/* 测试按钮 */
.test-btn {
  background: rgba(245,158,11,0.15);
  border: 1px solid rgba(245,158,11,0.3);
  color: #f59e0b;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.test-btn:hover { background: rgba(245,158,11,0.25); }

/* Toast */
.saved-toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(34,197,94,0.2);
  border: 1px solid rgba(34,197,94,0.4);
  color: #22c55e;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9375rem;
  z-index: 9999;
  backdrop-filter: blur(8px);
}

.saved-toast.is-error {
  background: rgba(239,68,68,0.18);
  border-color: rgba(239,68,68,0.38);
  color: #f87171;
}

.toast-icon {
  flex-shrink: 0;
}

.saved-toast span:last-child {
  line-height: 1.2;
}

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateX(-50%) translateY(1rem); }

@media (max-width: 768px) {
  .settings-layout { grid-template-columns: 1fr; }
  .settings-nav { position: static; display: flex; overflow-x: auto; padding: 0.5rem; }
  .nav-item { white-space: nowrap; }
  .form-row { grid-template-columns: 1fr; }
}
</style>
