<template>
  <div class="mc-binding-view page-shell">
    <!-- ========== 页面 Header ========== -->
    <header class="page-hero">
      <h1 class="page-hero__title">超级联合登录</h1>
      <p class="page-hero__subtitle">
        绑定 Minecraft 账号，打通网站与服务器之间的统一身份认证
      </p>
    </header>

    <!-- 未登录 -->
    <section v-if="!auth.isLoggedIn" class="glass-panel panel">
      <div class="unauth-notice">
        <AppIcon name="lock" :size="40" />
        <p>请先登录后再进行账号绑定操作。</p>
        <RouterLink to="/login" class="ui-btn primary">前往登录</RouterLink>
      </div>
    </section>

    <!-- 加载中 -->
    <section v-else-if="state.loading" class="glass-panel panel loading-panel" aria-busy="true" aria-label="加载绑定状态">
      <div class="skeleton-block skeleton-block--lg"></div>
      <div class="skeleton-block skeleton-block--md"></div>
      <div class="skeleton-block skeleton-block--md"></div>
    </section>

    <!-- 主内容 -->
    <template v-else>

      <!-- ========== 绑定状态总览 ========== -->
      <section class="glass-panel panel status-overview">
        <div class="bind-status-grid">

          <!-- 绑定状态 -->
          <div class="status-card" :class="isLinked ? 'is-linked' : 'is-unlinked'">
            <div class="status-icon-wrap">
              <AppIcon :name="isLinked ? 'checkCircle' : 'close'" :size="32" />
            </div>
            <div class="status-info">
              <div class="status-label">游戏角色</div>
              <div class="status-value">
                <template v-if="isLinked">
                  <strong class="mc-name">{{ mcUsername }}</strong>
                </template>
                <template v-else>
                  <span class="muted">未绑定</span>
                </template>
              </div>
            </div>
          </div>

          <!-- 正版验证状态 -->
          <div
            class="status-card"
            :class="{
              'is-verified': isVerified,
              'is-unverified': !isVerified && isLinked,
              'is-nolink': !isLinked
            }"
          >
            <div class="status-icon-wrap">
              <AppIcon :name="isVerified ? 'gem' : 'shield'" :size="32" />
            </div>
            <div class="status-info">
              <div class="status-label">正版验证</div>
              <div class="status-value">
                <template v-if="isVerified">
                  <span class="verified-badge">已验证</span>
                </template>
                <template v-else-if="isLinked">
                  <span class="unverified-badge">未验证</span>
                </template>
                <template v-else>
                  <span class="muted">—</span>
                </template>
              </div>
            </div>
          </div>

          <!-- VLA 联动状态 -->
          <div class="status-card" :class="state.binding.vlaLinked ? 'is-linked' : 'is-unlinked'">
            <div class="status-icon-wrap">
              <AppIcon name="server" :size="32" />
            </div>
            <div class="status-info">
              <div class="status-label">服务器联动</div>
              <div class="status-value">
                <template v-if="state.binding.vlaLinked">
                  <span class="vla-badge">已同步</span>
                </template>
                <template v-else>
                  <span class="muted">—</span>
                </template>
              </div>
            </div>
          </div>

        </div>

        <!-- 解释什么是超级联合登录 -->
        <div class="unified-login-explainer">
          <h3>什么是超级联合登录？</h3>
          <div class="explainer-grid">
            <div class="explain-item">
              <AppIcon name="external" :size="20" />
              <div>
                <strong>账号绑定</strong>
                <p>将你的网站账号与游戏内角色绑定，服务器自动识别你的身份</p>
              </div>
            </div>
            <div class="explain-item">
              <AppIcon name="shield" :size="20" />
              <div>
                <strong>正版验证（可选）</strong>
                <p>通过 Mojang API 证明你是该账号的真实持有者</p>
              </div>
            </div>
            <div class="explain-item">
              <AppIcon name="bolt" :size="20" />
              <div>
                <strong>免密进服</strong>
                <p>绑定后进服无需输入密码，服务器自动识别你的身份</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ========== 未绑定：绑定表单 ========== -->
      <template v-if="!isLinked">
        <section class="glass-panel panel bind-form-panel">
          <h2 class="section-title">绑定游戏角色</h2>
          <p class="section-desc">
            输入你的 Minecraft Java 版游戏名。绑定后，系统将自动联动服务器完成身份识别。
          </p>

          <form class="bind-form" @submit.prevent="handleBind">
            <div class="input-group">
              <label class="input-label" for="mc-username">Minecraft 用户名</label>
              <input
                id="mc-username"
                v-model="bindForm.username"
                class="ui-input block"
                type="text"
                placeholder="例如：Steve123"
                maxlength="16"
                pattern="[a-zA-Z0-9_]{3,16}"
                required
                autocomplete="off"
                spellcheck="false"
              />
              <span class="input-hint">3–16 个字符，只允许字母、数字、下划线</span>
            </div>

            <div class="input-group">
              <label class="input-label" for="invite-code">邀请码 <span class="optional-tag">(可选)</span></label>
              <input
                id="invite-code"
                v-model="bindForm.inviteCode"
                class="ui-input block"
                type="text"
                placeholder="如有邀请限制请填写"
                maxlength="20"
                autocomplete="off"
              />
            </div>

            <div v-if="auth.user?.totpEnabled" class="input-group">
              <label class="input-label" for="totp-code">两步验证码</label>
              <input
                id="totp-code"
                v-model="bindForm.totpCode"
                class="ui-input block"
                type="tel"
                placeholder="Google Authenticator 验证码"
                maxlength="6"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="one-time-code"
              />
            </div>

            <div class="bind-note">
              <AppIcon name="infoCircle" :size="14" />
              <span>请确保该角色已在服务器注册过。绑定后服务器将自动识别你的身份。</span>
            </div>

            <button
              type="submit"
              class="ui-btn primary block"
              :disabled="state.linking || !bindForm.username.trim()"
            >
              {{ state.linking ? '绑定中...' : '确认绑定' }}
            </button>
          </form>
        </section>
      </template>

      <!-- ========== 已绑定：正版验证流程 ========== -->
      <template v-else>

        <!-- 验证成功 -->
        <template v-if="state.verifyStep === 'success'">
          <section class="glass-panel panel verify-panel">
            <div class="verify-success-card">
              <AppIcon name="gem" :size="56" class="success-icon" />
              <h2>正版验证成功！</h2>
              <p>你已通过 Mojang API 验证，是账号「<strong>{{ mcUsername }}</strong>」的真实持有者。</p>
              <p v-if="state.binding.mcUuid" class="uuid-display">
                UUID：<code>{{ state.binding.mcUuid }}</code>
              </p>
              <button class="ui-btn secondary" @click="reverify">
                <AppIcon name="refresh" :size="16" />
                重新验证
              </button>
            </div>
          </section>
        </template>

        <!-- 验证过期 -->
        <template v-else-if="state.verifyStep === 'expired'">
          <section class="glass-panel panel verify-panel">
            <div class="verify-expired-card">
              <AppIcon name="hourglass" :size="48" class="expired-icon" />
              <h2>验证码已过期</h2>
              <p>验证有效期为 10 分钟。重新发起验证即可。</p>
              <button class="ui-btn primary" :disabled="state.verifying" @click="handleStartVerify">
                {{ state.verifying ? '发起中...' : '重新发起验证' }}
              </button>
            </div>
          </section>
        </template>

        <!-- 验证失败 -->
        <template v-else-if="state.verifyStep === 'failed'">
          <section class="glass-panel panel verify-panel">
            <div class="verify-failed-card">
              <AppIcon name="warning" :size="48" class="failed-icon" />
              <h2>验证失败</h2>
              <p>{{ verifyFailureMessage }}</p>
              <p v-if="verifyRetryMeta.maxRetries > 0" class="retry-meta">
                已重试 {{ verifyRetryMeta.retryCount }}/{{ verifyRetryMeta.maxRetries }} 次
              </p>
              <p v-if="verifyConflictMessage" class="conflict-meta">
                冲突信息：{{ verifyConflictMessage }}
              </p>
              <button class="ui-btn primary" :disabled="state.verifying" @click="handleForceVerify">
                {{ state.verifying ? '发起中...' : '重新发起验证' }}
              </button>
            </div>
          </section>
        </template>

        <!-- 会话已取消 -->
        <template v-else-if="state.verifyStep === 'cancelled'">
          <section class="glass-panel panel verify-panel">
            <div class="verify-cancelled-card">
              <AppIcon name="clockRotate" :size="44" class="cancelled-icon" />
              <h2>验证会话已取消</h2>
              <p>你可以随时重新发起正版验证。</p>
              <button class="ui-btn primary" :disabled="state.verifying" @click="handleStartVerify">
                {{ state.verifying ? '发起中...' : '重新发起验证' }}
              </button>
            </div>
          </section>
        </template>

        <!-- 等待验证 -->
        <template v-else-if="state.verifyStep === 'waiting'">
          <section class="glass-panel panel verify-panel">
            <div class="verify-waiting-header">
              <div class="pulse-ring">
                <AppIcon name="shield" :size="40" />
              </div>
              <div>
                <h2>等待正版验证</h2>
                <p>请在游戏中完成以下操作：</p>
              </div>
            </div>

            <div class="verify-instructions">
              <div class="step">
                <span class="step-num">1</span>
                <div>
                  <strong>启动 Minecraft Java 版</strong>
                  <p>使用与「<code>{{ state.binding.verifySession?.mcUsername }}</code>」相同的账号登录游戏</p>
                </div>
              </div>
              <div class="step">
                <span class="step-num">2</span>
                <div>
                  <strong>连接服务器</strong>
                  <p>在「服务器地址」中输入：<code class="server-hint">{{ serverAddressHint }}</code></p>
                  <p class="step-note">输入服务器地址后直接连接，无需修改任何选项</p>
                </div>
              </div>
              <div class="step">
                <span class="step-num">3</span>
                <div>
                  <strong>等待自动验证</strong>
                  <p>成功连接后，页面将自动检测验证结果</p>
                </div>
              </div>
            </div>

            <div class="verify-code-display">
              <span class="verify-code-label">本次验证码</span>
              <span class="verify-code-value">{{ state.binding.verifySession?.code }}</span>
              <span class="verify-code-expire">
                {{ verifyCountdown > 0 ? `${verifyCountdown}s 后过期` : '已过期' }}
              </span>
            </div>

            <div class="verify-actions">
              <button class="ui-btn secondary" :disabled="state.verifying" @click="loadBinding">
                <AppIcon name="refresh" :size="16" />
                刷新状态
              </button>
              <button class="ui-btn ghost" @click="handleCancelVerify">
                取消
              </button>
            </div>

            <div class="auto-polling-notice">
              <AppIcon name="clockRotate" :size="14" />
              页面每 3 秒自动刷新验证状态
            </div>
          </section>
        </template>

        <!-- 未验证：CTA -->
        <template v-else-if="!isVerified">
          <section class="glass-panel panel verify-panel">
            <div class="verify-cta-card">
              <div class="verify-cta-header">
                <AppIcon name="shield" :size="40" class="cta-icon" />
                <div>
                  <h2>发起正版验证</h2>
                  <p>验证后，你将证明自己是「<strong>{{ mcUsername }}</strong>」的真实持有者。</p>
                </div>
              </div>

              <div class="verify-benefits">
                <div class="benefit-item">
                  <AppIcon name="checkCircle" :size="16" />
                  <span>证明你是该 Mojang 账号的所有者</span>
                </div>
                <div class="benefit-item">
                  <AppIcon name="checkCircle" :size="16" />
                  <span>正版玩家可享服务器专属权限</span>
                </div>
                <div class="benefit-item">
                  <AppIcon name="checkCircle" :size="16" />
                  <span>皮肤站身份与游戏账号绑定更紧密</span>
                </div>
              </div>

              <button
                class="ui-btn primary block verify-cta-btn"
                :disabled="state.verifying"
                @click="handleStartVerify"
              >
                <AppIcon name="shield" :size="18" />
                {{ state.verifying ? '生成验证码...' : '开始正版验证' }}
              </button>
            </div>
          </section>
        </template>

        <!-- 已验证 -->
        <template v-else>
          <section class="glass-panel panel verify-panel">
            <div class="already-verified-card">
              <AppIcon name="gem" :size="48" class="verified-icon" />
              <h2>当前账号已完成正版验证</h2>
              <p>你是「<strong>{{ mcUsername }}</strong>」的验证持有者。</p>
              <div v-if="state.binding.mcUuid" class="verified-details">
                <div class="detail-row">
                  <span class="detail-label">游戏名</span>
                  <span class="detail-value">{{ mcUsername }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Mojang UUID</span>
                  <code class="detail-value">{{ state.binding.mcUuid }}</code>
                </div>
              </div>
              <button class="ui-btn secondary" @click="reverify">
                <AppIcon name="refresh" :size="16" />
                重新发起验证
              </button>
            </div>
          </section>
        </template>

        <!-- 解绑操作 -->
        <section class="glass-panel panel unlink-panel">
          <div class="unlink-header">
            <div>
              <h3>解除游戏角色绑定</h3>
              <p class="unlink-desc">解绑后服务器将无法自动识别你的身份，需重新注册或绑定。</p>
              <div class="unlink-reason">
                <label class="input-label" for="unlink-reason">解绑原因（可选）</label>
                <input
                  id="unlink-reason"
                  v-model="unlinkForm.reason"
                  class="ui-input block"
                  type="text"
                  maxlength="180"
                  placeholder="例如：换号、误绑修复、临时停用"
                  :disabled="state.unlinking"
                />
                <span class="input-hint">该信息会写入安全审计记录，最多 180 个字符</span>
              </div>
            </div>
            <button class="ui-btn danger" :disabled="state.unlinking" @click="openUnlinkModal">
              解除绑定
            </button>
          </div>
        </section>

      </template>

      <section class="glass-panel panel history-panel">
        <div class="history-header">
          <div>
            <h3>绑定与验证历史</h3>
            <p class="history-desc">展示最近操作和验证会话状态，便于追踪冲突与失败原因。</p>
          </div>
          <button class="ui-btn ghost" :disabled="state.loading || state.historyLoading" @click="loadBinding">
            <AppIcon name="refresh" :size="14" />
            {{ state.historyLoading ? '刷新中...' : '刷新历史' }}
          </button>
        </div>
        <div class="history-grid">
          <article class="history-card">
            <h4>绑定操作记录</h4>
            <ul v-if="state.bindingHistory.length" class="history-list">
              <li v-for="item in state.bindingHistory" :key="`binding-${item.id}`" class="history-item">
                <div class="history-main">
                  <span class="history-action">{{ item.label || bindingActionLabel(item.action) }}</span>
                  <time class="history-time">{{ formatIsoTime(item.at) }}</time>
                </div>
                <p class="history-meta">
                  <span v-if="item.mcUsername">角色：{{ item.mcUsername }}</span>
                  <span v-if="item.reason">原因：{{ item.reason }}</span>
                  <span v-if="item.conflictCode">冲突：{{ item.conflictCode }}</span>
                </p>
              </li>
            </ul>
            <p v-else class="history-empty">暂无绑定记录</p>
          </article>

          <article class="history-card">
            <h4>验证会话记录</h4>
            <ul v-if="state.verifyHistory.length" class="history-list">
              <li v-for="item in state.verifyHistory" :key="`verify-${item.id}`" class="history-item">
                <div class="history-main">
                  <span class="history-action">{{ item.label || verifyStatusLabel(item.status) }}</span>
                  <time class="history-time">{{ formatUnixTime(item.timeline?.createdAt ?? item.createdAt) }}</time>
                </div>
                <p class="history-meta">
                  <span v-if="item.mcUsername">角色：{{ item.mcUsername }}</span>
                  <span>重试：{{ item.retryCount ?? item.retries ?? 0 }}/{{ item.maxRetries ?? 0 }}</span>
                  <span v-if="item.failureReason">原因：{{ item.failureReason }}</span>
                  <span v-if="item.conflictCode">冲突：{{ item.conflictCode }}</span>
                </p>
              </li>
            </ul>
            <p v-else class="history-empty">暂无验证会话记录</p>
          </article>
        </div>
      </section>

    </template>

    <!-- ========== 解绑确认弹窗 ========== -->
    <ConfirmDialog
      :visible="unlinkModal.visible"
      title="解除游戏角色绑定"
      :message="unlinkConfirmMessage"
      confirm-text="解除绑定"
      cancel-text="保留"
      variant="danger"
      :loading="state.unlinking"
      @confirm="confirmUnlink"
      @cancel="closeUnlinkModal"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useMcBinding } from '@/features/mc-binding/useMcBinding';
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';

const auth = useAuthStore();
const {
  state,
  isLinked,
  isVerified,
  mcUsername,
  verifyFailureReason,
  verifyConflictCode,
  verifyRetryMeta,
  loadBinding,
  linkMc,
  unlinkMc,
  startVerify,
  restartVerifyWithForce,
  abortVerify
} = useMcBinding();

/** 解绑弹窗 */
const unlinkModal = reactive({ visible: false });
const unlinkForm = reactive({ reason: '' });
function openUnlinkModal() { unlinkModal.visible = true; }
function closeUnlinkModal() { unlinkModal.visible = false; }
async function confirmUnlink() {
  try {
    await unlinkMc(unlinkForm.reason || undefined);
    unlinkForm.reason = '';
    closeUnlinkModal();
  } catch {
    // handled in hook
  }
}

/** 绑定表单 */
const bindForm = reactive({ username: '', inviteCode: '', totpCode: '' });
async function handleBind() {
  const name = bindForm.username.trim();
  if (!name) return;
  try {
    await linkMc(name, bindForm.inviteCode || undefined, bindForm.totpCode || undefined);
    bindForm.username = '';
    bindForm.inviteCode = '';
    bindForm.totpCode = '';
  } catch {
    // handled in hook
  }
}

/** 验证流程 */
async function handleStartVerify() {
  try { await startVerify(); startPolling(); } catch { /* handled in hook */ }
}
async function handleForceVerify() {
  try { await restartVerifyWithForce(); startPolling(); } catch { /* handled in hook */ }
}
async function handleCancelVerify() {
  await abortVerify();
  stopPolling();
}
function reverify() {
  handleForceVerify();
}

const serverAddressHint = computed(() =>
  typeof window !== 'undefined' ? window.location.hostname : 'your-server.com'
);
const unlinkConfirmMessage = computed(() => {
  const reason = unlinkForm.reason.trim();
  if (!reason) {
    return `确定要解除「${mcUsername.value || '当前角色'}」的绑定吗？解绑后皮肤站将无法识别该游戏角色。`;
  }
  return `确定要解除「${mcUsername.value || '当前角色'}」的绑定吗？本次解绑原因将记录为：${reason}`;
});

const verifyFailureMessage = computed(() => {
  const reason = String(verifyFailureReason.value || '').trim().toLowerCase();
  const map: Record<string, string> = {
    verify_failed: '插件回调了验证失败，请检查游戏内登录账号后重试。',
    verification_failed: '验证未通过，请确认使用正确的 Mojang 账号连接服务器。',
    not_joined: '未检测到该账号在有效期内连接服务器，请重新发起后尽快进服。',
    timeout: '验证超时，请重新发起后在 10 分钟内完成连接。',
    user_cancelled: '本次验证由你主动取消。',
    superseded_by_new_session: '旧会话已被新会话替换，请按新验证码完成验证。',
    session_conflict: '检测到并发验证会话冲突，请重新发起验证。',
    session_username_mismatch: '回调账号与当前会话不一致，已拒绝本次回调。',
  };
  return map[reason] || (reason ? `验证失败：${reason}` : '验证失败，请重新发起。');
});

const verifyConflictMessage = computed(() => {
  const code = String(verifyConflictCode.value || '').trim().toLowerCase();
  if (!code) return '';
  const map: Record<string, string> = {
    plugin_verify_failed: '插件端返回失败状态',
    session_replaced: '旧会话已被替换',
    session_username_mismatch: '会话用户名不一致',
    no_active_session: '回调到达时会话已结束',
    session_not_active: '会话状态非进行中',
  };
  return map[code] || code;
});

function formatIsoTime(value?: string | null) {
  const text = String(value || '').trim();
  if (!text) return '未知时间';
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  return new Date(ms).toLocaleString();
}

function formatUnixTime(value?: number | null) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return '未知时间';
  return new Date(ms).toLocaleString();
}

function bindingActionLabel(action?: string | null) {
  const key = String(action || '').trim().toLowerCase();
  const map: Record<string, string> = {
    link_minecraft: '绑定角色',
    unlink_minecraft: '解绑角色',
    verify_init: '发起验证',
    verify_cancel: '取消验证',
    verify_success: '验证成功',
    verify_failed: '验证失败',
    verify_callback_conflict: '验证回调冲突',
  };
  return map[key] || key || '未知操作';
}

function verifyStatusLabel(status?: string | null) {
  const key = String(status || '').trim().toLowerCase();
  const map: Record<string, string> = {
    pending: '进行中',
    succeeded: '已成功',
    failed: '已失败',
    cancelled: '已取消',
    expired: '已过期',
  };
  return map[key] || key || '未知状态';
}

/** 验证码倒计时 */
const verifyCountdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  stopPolling();
  const expiresAt = Number(state.binding.verifyState?.expiresAt || state.binding.verifySession?.expiresAt || 0);
  verifyCountdown.value = expiresAt > 0 ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 600;
  countdownTimer = setInterval(() => { if (verifyCountdown.value > 0) verifyCountdown.value--; }, 1000);
  pollingTimer = setInterval(async () => {
    await loadBinding();
    if (
      state.verifyStep === 'success' ||
      state.verifyStep === 'expired' ||
      state.verifyStep === 'failed' ||
      state.verifyStep === 'cancelled'
    ) {
      stopPolling();
    }
  }, 3000);
}

function stopPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

onMounted(async () => {
  await loadBinding();
  if (state.verifyStep === 'waiting') startPolling();
});
onUnmounted(() => stopPolling());
</script>

<style scoped>
/* 未登录 */
.unauth-notice {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  padding: 60px 24px; text-align: center; color: var(--text-secondary);
}

/* 加载骨架 */
.loading-panel { padding: 32px; display: flex; flex-direction: column; gap: 16px; }

/* 绑定状态总览 */
.status-overview { padding: 28px 32px; }
.bind-status-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px; margin-bottom: 28px;
}
.status-card {
  display: flex; align-items: center; gap: 14px; padding: 18px 20px;
  border-radius: 12px; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}
.status-card.is-linked { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.05); }
.status-card.is-verified { border-color: rgba(74,222,128,0.4); background: rgba(74,222,128,0.07); }
.status-icon-wrap { color: var(--text-secondary); flex-shrink: 0; }
.status-card.is-linked .status-icon-wrap, .status-card.is-verified .status-icon-wrap { color: #4ade80; }
.status-label { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.status-value { font-size: 1rem; font-weight: 600; }
.mc-name { color: var(--accent, #7c3aed); }
.muted { color: var(--text-secondary); font-weight: 400; }
.verified-badge { color: #4ade80; }
.unverified-badge { color: var(--text-secondary); }
.vla-badge { color: #60a5fa; }

/* 超级登录说明 */
.unified-login-explainer { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 24px; }
.unified-login-explainer h3 { font-size: 0.75rem; font-weight: 600; margin-bottom: 14px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.explainer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.explain-item { display: flex; gap: 10px; align-items: flex-start; font-size: 0.875rem; color: var(--text-secondary); }
.explain-item > :first-child { flex-shrink: 0; margin-top: 2px; color: var(--accent, #7c3aed); }
.explain-item strong { display: block; color: var(--text-primary); margin-bottom: 3px; font-size: 0.9rem; }
.explain-item p { line-height: 1.5; }

/* 绑定表单 */
.bind-form-panel { padding: 28px 32px; }
.section-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
.section-desc { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.6; }
.bind-form { display: flex; flex-direction: column; gap: 18px; max-width: 480px; }
.input-label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }
.optional-tag { font-weight: 400; color: var(--text-secondary); font-size: 0.8rem; }
.input-hint { display: block; font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; }
.bind-note { display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: var(--text-secondary); padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.bind-note :first-child { flex-shrink: 0; margin-top: 1px; }

/* 验证面板 */
.verify-panel { padding: 28px 32px; }

/* 等待验证 */
.verify-waiting-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.pulse-ring {
  width: 64px; height: 64px; border-radius: 50%;
  background: rgba(124,58,237,0.15); border: 2px solid rgba(124,58,237,0.4);
  display: flex; align-items: center; justify-content: center;
  color: var(--accent, #7c3aed); flex-shrink: 0;
  animation: pulse-ring 2s ease-in-out infinite;
}
@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
  50% { box-shadow: 0 0 0 10px rgba(124,58,237,0); }
}
.verify-waiting-header h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
.verify-waiting-header p { font-size: 0.875rem; color: var(--text-secondary); }

.verify-instructions { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; }
.step { display: flex; gap: 12px; align-items: flex-start; }
.step-num {
  width: 24px; height: 24px; border-radius: 50%; background: var(--accent, #7c3aed);
  color: white; font-size: 0.75rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.step strong { display: block; font-size: 0.9rem; margin-bottom: 3px; }
.step p { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5; }
.step-note { margin-top: 3px; font-style: italic; }
.server-hint {
  font-family: monospace; background: rgba(124,58,237,0.1);
  border: 1px solid rgba(124,58,237,0.2); padding: 1px 6px; border-radius: 4px;
}

.verify-code-display {
  display: flex; align-items: center; gap: 14px; padding: 16px 20px;
  border-radius: 10px; background: rgba(124,58,237,0.08);
  border: 1px solid rgba(124,58,237,0.2); margin-bottom: 20px;
}
.verify-code-label { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; }
.verify-code-value { font-size: 1.4rem; font-weight: 800; letter-spacing: 0.2em; color: var(--accent, #7c3aed); }
.verify-code-expire { font-size: 0.75rem; color: var(--text-secondary); margin-left: auto; }
.verify-actions { display: flex; gap: 10px; margin-bottom: 12px; }
.auto-polling-notice { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-secondary); }

/* 验证成功 */
.verify-success-card, .already-verified-card {
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 24px;
}
.success-icon, .verified-icon { color: #4ade80; }
.uuid-display { font-size: 0.8rem; color: var(--text-secondary); }

/* 验证过期 */
.verify-expired-card {
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 24px;
}
.expired-icon { color: #fb923c; }

/* 验证失败 / 取消 */
.verify-failed-card, .verify-cancelled-card {
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 24px;
}
.failed-icon { color: #f87171; }
.cancelled-icon { color: #60a5fa; }
.retry-meta, .conflict-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.conflict-meta {
  word-break: break-all;
}

/* CTA 卡片 */
.verify-cta-card { display: flex; flex-direction: column; gap: 20px; }
.verify-cta-header { display: flex; gap: 16px; align-items: center; }
.cta-icon { color: var(--accent, #7c3aed); flex-shrink: 0; }
.verify-cta-header h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
.verify-cta-header p { font-size: 0.875rem; color: var(--text-secondary); }
.verify-benefits { display: flex; flex-direction: column; gap: 8px; }
.benefit-item { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; color: var(--text-secondary); }
.benefit-item :first-child { color: #4ade80; flex-shrink: 0; }
.verify-cta-btn { font-size: 1rem; padding: 12px 24px; gap: 8px; }

/* 已验证详情 */
.verified-details { width: 100%; max-width: 360px; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; }
.detail-row { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.detail-row:last-child { border-bottom: none; }
.detail-label { font-size: 0.8rem; color: var(--text-secondary); }
.detail-value { font-size: 0.8rem; font-weight: 500; }

/* 解绑 */
.unlink-panel { padding: 20px 24px; }
.unlink-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.unlink-header h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 4px; }
.unlink-desc { font-size: 0.8rem; color: var(--text-secondary); }
.unlink-reason { margin-top: 12px; max-width: 420px; }
.ui-btn.danger { color: #f87171; border-color: rgba(248,113,113,0.3); }
.ui-btn.danger:hover { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.5); }

/* 历史 */
.history-panel { padding: 24px 28px; }
.history-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.history-header h3 { font-size: 0.98rem; font-weight: 700; margin-bottom: 4px; }
.history-desc { font-size: 0.8rem; color: var(--text-secondary); }
.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.history-card {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  padding: 14px;
}
.history-card h4 {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--text-secondary);
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-item {
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
  padding: 10px;
}
.history-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.history-action { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.history-time { font-size: 0.75rem; color: var(--text-secondary); }
.history-meta {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.history-empty { font-size: 0.8rem; color: var(--text-secondary); }

/* 响应式 */
@media (max-width: 600px) {
  .status-overview, .bind-form-panel, .verify-panel, .unlink-panel, .history-panel { padding: 20px 18px; }
  .verify-cta-header { flex-direction: column; align-items: flex-start; }
  .unlink-header { flex-direction: column; align-items: flex-start; }
  .bind-status-grid { grid-template-columns: 1fr; }
}
</style>
