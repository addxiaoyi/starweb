<template>
  <div class="mc-reset-view">
    <div class="mc-reset-card ui-card">
      <h1>重置游戏密码</h1>
      <p class="desc">未登录也可通过邮箱验证码重置 Minecraft 进服密码。</p>

      <section class="block">
        <h2>1) 申请验证码</h2>
        <form @submit.prevent="requestCode">
          <label for="request-email">
            绑定邮箱（推荐）
            <input id="request-email" class="ui-input" v-model.trim="requestForm.email" type="email" placeholder="you@example.com" autocomplete="email" />
          </label>
          <label for="request-linked-mc-username">
            或游戏角色名
            <input id="request-linked-mc-username" class="ui-input" v-model.trim="requestForm.linkedMcUsername" type="text" placeholder="MinecraftName" autocomplete="username" />
          </label>
          <button class="ui-btn" :disabled="loadingRequest || resendCooldown > 0">
            {{ loadingRequest ? '发送中...' : resendCooldown > 0 ? `可重发 (${resendCooldown}s)` : '发送验证码' }}
          </button>
          <p v-if="requestMsg" class="msg success" role="status" aria-live="polite">{{ requestMsg }}</p>
          <p v-if="requestError" class="msg error" role="alert" aria-live="assertive">{{ requestError }}</p>
        </form>
      </section>

      <section class="block">
        <h2>2) 提交验证码并改密</h2>
        <form @submit.prevent="confirmReset">
          <label for="confirm-mc-username">
            游戏角色名
            <input id="confirm-mc-username" class="ui-input" v-model.trim="confirmForm.mcUsername" type="text" required placeholder="MinecraftName" autocomplete="username" />
          </label>
          <label for="confirm-code">
            验证码
            <input
              id="confirm-code"
              class="ui-input"
              v-model.trim="confirmForm.code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              required
              placeholder="6位数字"
              autocomplete="one-time-code"
            />
          </label>
          <label for="confirm-new-password">
            新密码
            <div class="password-input-row">
              <input
                id="confirm-new-password"
                class="ui-input"
                v-model="confirmForm.newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                required
                minlength="6"
                maxlength="128"
                placeholder="至少6位"
                autocomplete="new-password"
              />
              <button
                class="toggle-btn ui-btn small"
                type="button"
                :aria-label="showNewPassword ? '隐藏新密码' : '显示新密码'"
                :aria-pressed="showNewPassword ? 'true' : 'false'"
                @click="showNewPassword = !showNewPassword"
              >
                {{ showNewPassword ? '隐藏' : '显示' }}
              </button>
            </div>
          </label>
          <label for="confirm-confirm-password">
            确认新密码
            <div class="password-input-row">
              <input
                id="confirm-confirm-password"
                class="ui-input"
                v-model="confirmForm.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                required
                minlength="6"
                maxlength="128"
                placeholder="再次输入新密码"
                autocomplete="new-password"
              />
              <button
                class="toggle-btn ui-btn small"
                type="button"
                :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'"
                :aria-pressed="showConfirmPassword ? 'true' : 'false'"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                {{ showConfirmPassword ? '隐藏' : '显示' }}
              </button>
            </div>
          </label>

          <ul class="password-rules">
            <li :class="{ ok: passwordRules.lengthOk }">长度 6 ~ 128</li>
            <li :class="{ ok: passwordRules.hasLower }">包含小写字母</li>
            <li :class="{ ok: passwordRules.hasUpper }">包含大写字母</li>
            <li :class="{ ok: passwordRules.hasDigit }">包含数字</li>
            <li :class="{ ok: passwordRules.confirmMatch }">两次输入一致</li>
          </ul>

          <div class="password-meter-wrap">
            <div class="password-meter">
              <div class="password-meter-fill" :class="`is-${passwordStrength.level}`" :style="{ width: `${passwordStrength.score}%` }"></div>
            </div>
            <div class="password-meter-label">密码强度：{{ passwordStrength.label }}</div>
          </div>

          <button class="ui-btn" :disabled="loadingConfirm">{{ loadingConfirm ? '提交中...' : '确认重置' }}</button>
          <p v-if="message" class="msg success" role="status" aria-live="polite">{{ message }}</p>
          <p v-if="error" class="msg error" role="alert" aria-live="assertive">{{ error }}</p>
          <p v-if="redirectCountdown !== null" class="msg info">
            {{ redirectCountdown }} 秒后自动跳转到皮肤站，也可
            <button class="link-btn ui-btn small" type="button" @click="goSkinNow">立即前往</button>
          </p>
        </form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

type ApiError = { message?: string; error?: string; code?: string; retryAfterSec?: number }

const loadingRequest = ref(false)
const loadingConfirm = ref(false)
const message = ref('')
const error = ref('')
const requestMsg = ref('')
const requestError = ref('')
const redirectCountdown = ref<number | null>(null)
const resendCooldown = ref(0)
const lastRequestId = ref('')
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const router = useRouter()
let redirectTimer: ReturnType<typeof setInterval> | null = null
let resendCooldownTimer: ReturnType<typeof setInterval> | null = null

function clearRedirectTimer() {
  if (redirectTimer) {
    clearInterval(redirectTimer)
    redirectTimer = null
  }
}

function startRedirectCountdown(seconds = 5) {
  clearRedirectTimer()
  redirectCountdown.value = seconds
  redirectTimer = setInterval(() => {
    if (redirectCountdown.value == null) return
    if (redirectCountdown.value <= 1) {
      clearRedirectTimer()
      redirectCountdown.value = null
      router.push('/skin')
      return
    }
    redirectCountdown.value -= 1
  }, 1000)
}

function clearResendCooldownTimer() {
  if (resendCooldownTimer) {
    clearInterval(resendCooldownTimer)
    resendCooldownTimer = null
  }
}

function startResendCooldown(seconds = 60) {
  clearResendCooldownTimer()
  resendCooldown.value = seconds
  resendCooldownTimer = setInterval(() => {
    if (resendCooldown.value <= 1) {
      resendCooldown.value = 0
      clearResendCooldownTimer()
      return
    }
    resendCooldown.value -= 1
  }, 1000)
}

function goSkinNow() {
  clearRedirectTimer()
  redirectCountdown.value = null
  router.push('/skin')
}

const requestForm = ref({
  email: '',
  linkedMcUsername: ''
})

const confirmForm = ref({
  mcUsername: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

const passwordRules = computed(() => {
  const pw = confirmForm.value.newPassword
  return {
    lengthOk: pw.length >= 6 && pw.length <= 128,
    hasLower: /[a-z]/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasDigit: /\d/.test(pw),
    confirmMatch: pw.length > 0 && pw === confirmForm.value.confirmPassword
  }
})

const passwordStrength = computed(() => {
  const pw = confirmForm.value.newPassword
  let pts = 0
  if (pw.length >= 6) pts += 20
  if (pw.length >= 10) pts += 20
  if (/[A-Z]/.test(pw)) pts += 20
  if (/[a-z]/.test(pw)) pts += 15
  if (/\d/.test(pw)) pts += 15
  if (/[^A-Za-z0-9]/.test(pw)) pts += 10
  const score = Math.min(100, pts)
  if (score < 40) return { level: 'weak', label: '弱', score }
  if (score < 75) return { level: 'medium', label: '中', score }
  return { level: 'strong', label: '强', score }
})

function applyServerRetryAfter(seconds: number | null | undefined) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0))
  if (sec > 0) {
    startResendCooldown(sec)
  }
}

function mapConfirmError(status: number, payload: ApiError) {
  if (payload.message) return payload.message
  const c = String(payload.code || payload.error || '').trim()
  if (c === 'bad_code') return '验证码错误，请检查后重试'
  if (c === 'expired') return '验证码已过期，请重新申请'
  if (c === 'too_many_attempts') return '验证码尝试次数过多，请重新申请'
  if (c === 'no_challenge') return '请先申请验证码'
  if (c === 'plugin_reject') return '插件侧拒绝改密，请确认角色已注册并启用写接口'
  if (c === 'bad_password') return '密码格式不符合要求（长度 6~128）'
  if (status === 429) return '请求过于频繁，请稍后重试'
  if (status >= 500) return '服务器繁忙，请稍后再试'
  return '重置失败'
}

async function requestCode() {
  message.value = ''
  error.value = ''
  requestMsg.value = ''
  requestError.value = ''
  redirectCountdown.value = null
  clearRedirectTimer()
  lastRequestId.value = ''
  if (resendCooldown.value > 0) {
    requestError.value = `请等待 ${resendCooldown.value} 秒后再试`
    return
  }
  if (!requestForm.value.email && !requestForm.value.linkedMcUsername) {
    requestError.value = '请至少填写邮箱或游戏角色名'
    return
  }
  loadingRequest.value = true
  try {
    const r = await fetch('/api/public/mc-game-password/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestForm.value)
    })
    const j = (await r.json().catch(() => ({}))) as ApiError & { requestId?: string }
    lastRequestId.value = j.requestId || r.headers.get('x-request-id') || ''
    const retryAfterHeader = Number(r.headers.get('retry-after') || '')
    const retryAfterSec = Number(j.retryAfterSec) || (Number.isFinite(retryAfterHeader) ? retryAfterHeader : 0)
    if (!r.ok) {
      if (r.status === 429 && retryAfterSec > 0) {
        applyServerRetryAfter(retryAfterSec)
      }
      requestError.value = j.message || (r.status === 429 ? `请求过于频繁，请在 ${retryAfterSec || 60} 秒后重试` : '发送验证码失败')
      if (lastRequestId.value) requestError.value += `（请求ID: ${lastRequestId.value}）`
      return
    }
    requestMsg.value = j.message || '若信息匹配，将收到验证码邮件'
    if (lastRequestId.value) requestMsg.value += `（请求ID: ${lastRequestId.value}）`
    startResendCooldown(60)
  } catch {
    requestError.value = '网络异常，请稍后重试'
  } finally {
    loadingRequest.value = false
  }
}

async function confirmReset() {
  message.value = ''
  error.value = ''
  redirectCountdown.value = null
  clearRedirectTimer()
  lastRequestId.value = ''

  if (!confirmForm.value.mcUsername.trim()) {
    error.value = '请填写游戏角色名'
    return
  }
  if (!/^\d{6}$/.test(confirmForm.value.code)) {
    error.value = '验证码需为 6 位数字'
    return
  }
  if (confirmForm.value.newPassword.length < 6 || confirmForm.value.newPassword.length > 128) {
    error.value = '密码长度需在 6 ~ 128 位之间'
    return
  }
  if (confirmForm.value.newPassword !== confirmForm.value.confirmPassword) {
    error.value = '两次输入的新密码不一致'
    return
  }

  loadingConfirm.value = true
  try {
    const r = await fetch('/api/public/mc-game-password/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcUsername: confirmForm.value.mcUsername,
        code: confirmForm.value.code,
        newPassword: confirmForm.value.newPassword
      })
    })
    const j = (await r.json().catch(() => ({}))) as ApiError & { requestId?: string }
    lastRequestId.value = j.requestId || r.headers.get('x-request-id') || ''
    if (!r.ok) {
      error.value = mapConfirmError(r.status, j)
      if (lastRequestId.value) error.value += `（请求ID: ${lastRequestId.value}）`
      return
    }
    message.value = j.message || '密码已重置'
    if (lastRequestId.value) message.value += `（请求ID: ${lastRequestId.value}）`
    startRedirectCountdown(5)
  } catch {
    error.value = '网络异常，请稍后重试'
  } finally {
    loadingConfirm.value = false
  }
}

onUnmounted(() => {
  clearRedirectTimer()
  clearResendCooldownTimer()
})
</script>

<style scoped>
.mc-reset-view { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.mc-reset-card { width: min(720px, 100%); background: var(--surface-2, #121722); border: 1px solid var(--border-subtle, #2a3242); border-radius: 14px; padding: 20px; }
.desc { color: var(--text-secondary, #9aa4b2); margin-bottom: 12px; }
.block { border-top: 1px solid var(--border-subtle, #2a3242); padding-top: 12px; margin-top: 12px; }
form { display: grid; gap: 10px; }
label { display: grid; gap: 6px; color: var(--text-primary, #d9e0ea); font-size: 14px; }


input:focus-visible,
button:focus-visible,
.link-btn:focus-visible {
  outline: 2px solid #7aa2ff;
  outline-offset: 2px;
}

.password-input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.toggle-btn {
  color: #c7d2fe;
  font-size: 12px;
  padding: 8px 10px;
}

.password-rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.password-rules li {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #94a3b8;
}

.password-rules li.ok {
  border-color: #16a34a;
  color: #86efac;
}

.msg { margin-top: 12px; }
.msg.success { color: #8ef0b1; }
.msg.error { color: #ff9ca8; }
.msg.info { color: #9ec6ff; }

.link-btn {
  border: none;
  background: transparent;
  color: #7aa2ff;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.password-meter-wrap {
  display: grid;
  gap: 6px;
}

.password-meter {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: #20293a;
  border: 1px solid #2a3242;
}

.password-meter-fill {
  height: 100%;
  transition: width 180ms ease;
}

.password-meter-fill.is-weak { background: #ef4444; }
.password-meter-fill.is-medium { background: #f59e0b; }
.password-meter-fill.is-strong { background: #10b981; }

.password-meter-label {
  color: var(--text-secondary, #9aa4b2);
  font-size: 12px;
}

/* 触控目标最小 44px（iOS / Material 规范） */
.toggle-btn {
  min-height: 44px;
  min-width: 44px;
}

/* 移动端适配 */
@media (max-width: 480px) {
  .mc-reset-view { padding: 16px; }
  .mc-reset-card { padding: 16px; }
  .ui-btn { width: 100%; }
  .password-input-row .ui-btn { width: auto; }
}

/* 超窄屏（≤360px）：密码规则改为单列，避免溢出 */
@media (max-width: 360px) {
  .password-rules {
    grid-template-columns: 1fr;
  }
}
</style>
