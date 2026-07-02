<template>
  <div class="system-settings-view page-shell">
    <header class="page-hero settings-hero">
      <h1 class="page-hero__title starmc-brand-glow">
        <AppIcon name="settings" :size="28" class="heading-icon" />
        系统设置
      </h1>
      <p class="page-hero__subtitle subtitle" data-typography="prose">
        统一管理站点开关、基础信息与安全策略。
      </p>
    </header>

    <AppStatePanel
      v-if="loading"
      variant="info"
      eyebrow="System"
      title="正在加载系统设置"
      message="正在读取当前配置，请稍候。"
      class="settings-state"
    />

    <AppStatePanel
      v-else-if="error"
      variant="error"
      eyebrow="System"
      title="系统设置加载失败"
      :message="error"
      hint="请稍后重试或检查后端配置。"
      class="settings-state"
    >
      <template #actions>
        <button type="button" class="mc-button primary" @click="loadSettings">重试</button>
      </template>
    </AppStatePanel>

    <template v-else>
      <section class="summary-grid">
        <article class="summary-card">
          <span class="summary-label">站点状态</span>
          <strong :class="['summary-value', settings.siteEnabled ? 'is-on' : 'is-off']">
            {{ settings.siteEnabled ? '启用' : '关闭' }}
          </strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">注册状态</span>
          <strong :class="['summary-value', settings.registrationEnabled ? 'is-on' : 'is-off']">
            {{ settings.registrationEnabled ? '允许注册' : '已关闭' }}
          </strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">维护模式</span>
          <strong :class="['summary-value', settings.maintenanceMode ? 'is-warning' : 'is-on']">
            {{ settings.maintenanceMode ? '开启' : '正常' }}
          </strong>
        </article>
      </section>

      <section class="settings-panel">
        <div class="panel-header">
          <h2>基础设置</h2>
          <div class="panel-actions">
            <button type="button" class="mc-button" @click="resetDraft" :disabled="saving">重置</button>
            <button type="button" class="mc-button primary" @click="saveSettings" :disabled="saving">
              <AppIcon v-if="saving" name="loader" :size="14" class="spin" />
              <span v-else>保存设置</span>
            </button>
          </div>
        </div>

        <div class="settings-grid">
          <label class="field field-wide">
            <span>站点名称</span>
            <input v-model.trim="draft.siteName" type="text" class="starmc-list-item" placeholder="StarMC" />
          </label>

          <label class="field field-wide">
            <span>站点副标题</span>
            <input v-model.trim="draft.siteTagline" type="text" class="starmc-list-item" placeholder="Minecraft 皮肤站" />
          </label>

          <label class="field">
            <span>站点启用</span>
            <select v-model="draft.siteEnabled" class="starmc-list-item">
              <option :value="true">启用</option>
              <option :value="false">关闭</option>
            </select>
          </label>

          <label class="field">
            <span>允许注册</span>
            <select v-model="draft.registrationEnabled" class="starmc-list-item">
              <option :value="true">允许</option>
              <option :value="false">关闭</option>
            </select>
          </label>

          <label class="field">
            <span>维护模式</span>
            <select v-model="draft.maintenanceMode" class="starmc-list-item">
              <option :value="true">开启</option>
              <option :value="false">关闭</option>
            </select>
          </label>

          <label class="field">
            <span>每页默认条数</span>
            <select v-model.number="draft.pageSize" class="starmc-list-item">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>

          <label class="field field-wide">
            <span>公告</span>
            <textarea
              v-model.trim="draft.announcement"
              rows="4"
              class="starmc-list-item"
              placeholder="显示在首页顶部的公告内容"
            />
          </label>
        </div>
      </section>

      <section class="settings-panel">
        <div class="panel-header">
          <h2>安全策略</h2>
        </div>

        <div class="settings-grid">
          <label class="field">
            <span>登录失败锁定阈值</span>
            <input v-model.number="draft.maxLoginAttempts" type="number" min="1" class="starmc-list-item" />
          </label>

          <label class="field">
            <span>验证码开关</span>
            <select v-model="draft.captchaEnabled" class="starmc-list-item">
              <option :value="true">开启</option>
              <option :value="false">关闭</option>
            </select>
          </label>

          <label class="field field-wide">
            <span>管理员邮箱</span>
            <input v-model.trim="draft.adminEmail" type="email" class="starmc-list-item" placeholder="admin@example.com" />
          </label>
        </div>
      </section>

      <section class="settings-panel preview-panel">
        <div class="panel-header">
          <h2>预览</h2>
        </div>
        <div class="preview-box">
          <p class="preview-title">{{ draft.siteName || '站点名称' }}</p>
          <p class="preview-subtitle">{{ draft.siteTagline || '站点副标题' }}</p>
          <p class="preview-text">{{ draft.announcement || '暂无公告' }}</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import AppStatePanel from '@/components/atoms/AppStatePanel.vue';
import { useToastStore } from '@/stores/toast';

type SystemSettings = {
  siteName: string;
  siteTagline: string;
  siteEnabled: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  pageSize: number;
  announcement: string;
  captchaEnabled: boolean;
  maxLoginAttempts: number;
  adminEmail: string;
};

const toast = useToastStore();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const settings = ref<SystemSettings>({
  siteName: 'StarMC',
  siteTagline: 'Minecraft 皮肤站',
  siteEnabled: true,
  registrationEnabled: true,
  maintenanceMode: false,
  pageSize: 20,
  announcement: '',
  captchaEnabled: true,
  maxLoginAttempts: 5,
  adminEmail: ''
});
const draft = reactive<SystemSettings>({ ...settings.value });

function applySettings(next: SystemSettings) {
  settings.value = { ...next };
  Object.assign(draft, next);
}

async function loadSettings() {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/admin/system-settings', { cache: 'no-store' });
    const data = await response.json().catch(() => ({} as Partial<SystemSettings> & { message?: string }));
    if (!response.ok) {
      throw new Error(data.message || `加载失败 (${response.status})`);
    }
    applySettings({
      siteName: data.siteName ?? 'StarMC',
      siteTagline: data.siteTagline ?? 'Minecraft 皮肤站',
      siteEnabled: data.siteEnabled ?? true,
      registrationEnabled: data.registrationEnabled ?? true,
      maintenanceMode: data.maintenanceMode ?? false,
      pageSize: data.pageSize ?? 20,
      announcement: data.announcement ?? '',
      captchaEnabled: data.captchaEnabled ?? true,
      maxLoginAttempts: data.maxLoginAttempts ?? 5,
      adminEmail: data.adminEmail ?? ''
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载系统设置失败';
  } finally {
    loading.value = false;
  }
}

function resetDraft() {
  Object.assign(draft, settings.value);
}

async function saveSettings() {
  saving.value = true;
  try {
    const response = await fetch('/api/admin/system-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    const data = await response.json().catch(() => ({} as { message?: string }));
    if (!response.ok) {
      throw new Error(data.message || `保存失败 (${response.status})`);
    }
    applySettings({ ...draft });
    toast.addToast({ type: 'success', message: '系统设置已保存' });
  } catch (err) {
    toast.addToast({ type: 'error', message: err instanceof Error ? err.message : '保存系统设置失败' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadSettings();
});
</script>

<style scoped>
.system-settings-view {
  display: grid;
  gap: 16px;
}

.settings-hero p {
  color: #9fb0cc;
}

.settings-state {
  margin-top: 6px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-card,
.settings-panel,
.preview-box {
  border: 1px solid rgba(35, 48, 70, 0.9);
  background: rgba(15, 23, 42, 0.72);
  border-radius: 16px;
  padding: 16px;
}

.summary-card {
  display: grid;
  gap: 8px;
}

.summary-label,
.field span {
  color: #9fb0cc;
  font-size: 12px;
}

.summary-value {
  font-size: 18px;
}

.summary-value.is-on {
  color: #86efac;
}

.summary-value.is-off {
  color: #fca5a5;
}

.summary-value.is-warning {
  color: #fbbf24;
}

.settings-panel {
  display: grid;
  gap: 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
}

.panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.field-wide {
  grid-column: 1 / -1;
}

.field input,
.field select,
.field textarea {
  width: 100%;
}

.preview-box {
  display: grid;
  gap: 8px;
}

.preview-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.preview-subtitle,
.preview-text {
  margin: 0;
  color: #cbd5e1;
}

@media (max-width: 980px) {
  .summary-grid,
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
