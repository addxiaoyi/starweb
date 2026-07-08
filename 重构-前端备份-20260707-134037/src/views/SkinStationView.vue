<template>
  <div class="skin-station-view">
    <div class="container page-shell">
      <header class="station-header page-hero">
        <p class="page-hero__eyebrow">Skin Station</p>
        <div class="mode-chip starmc-mode-chip" :class="`is-${currentMode}`">
          <div class="mode-chip-main starmc-mode-chip-main">
            <AppIcon :name="currentModeIcon" :size="14" class="mode-chip-icon starmc-mode-chip-icon" />
            <span>{{ currentModeLabel }}</span>
          </div>
          <div class="mode-chip-actions starmc-mode-chip-actions">
            <RouterLink class="mode-chip-link starmc-mode-chip-link" to="/skin/manage">皮肤管理</RouterLink>
            <RouterLink class="mode-chip-link starmc-mode-chip-link" to="/profile">个人中心</RouterLink>
            <RouterLink class="mode-chip-link starmc-mode-chip-link" to="/skin/review">审核预览</RouterLink>
          </div>
        </div>
        <h1 class="starmc-brand-glow page-hero__title">
          <AppIcon name="shirt" :size="28" class="heading-icon" />
          {{ isProfileDashboardMode ? '个人中心仪表盘' : '舵星驿站' }}
        </h1>
        <p class="subtitle page-hero__lede" data-typography="prose">
          <template v-if="isReviewPreviewMode">
            审核模式（线上接口）
          </template>
          <template v-else-if="isProfileDashboardMode">
            查看账号信息、上传记录与安全概览
          </template>
          <template v-else>
            上传并管理你的 Minecraft 皮肤与披风
          </template>
        </p>
      </header>

      <div class="station-grid" :class="{ 'no-preview': !showPreviewSection }">
        <!-- 展示区：3D 预览（仅登录后可见） -->
        <section v-if="showPreviewSection" class="preview-section">
          <div ref="previewCardRef" class="card glass-card preview-card" :class="{ 'is-applied-highlight': previewAppliedHighlight }">
            <h3 class="card-title">
              <AppIcon name="eye" :size="20" class="heading-icon" /> 形象预览
            </h3>
            <p class="card-desc" data-typography="prose">
              当前账号生效外观会实时显示在这里。
            </p>
            <SkinPreview
              :skin-url="currentSkinUrl"
              :cape-url="currentCapeUrl"
              :model="previewSkinModel"
              class="preview-viewport"
            />
            <div class="player-info">
              <span class="username">{{ auth.user?.username }}</span>
              <span class="uuid">{{ auth.user?.uuid }}</span>
            </div>
            <div class="preview-meta">
              <span class="meta-pill starmc-meta-pill"><AppIcon name="cube" :size="14" class="pill-icon starmc-pill-icon" /> {{ uploadType === 'skin' ? '皮肤模式' : '披风模式' }}</span>
              <span class="meta-pill starmc-meta-pill"><AppIcon name="fileImage" :size="14" class="pill-icon starmc-pill-icon" /> PNG</span>
              <span class="meta-pill starmc-meta-pill"><AppIcon name="ruler" :size="14" class="pill-icon starmc-pill-icon" /> 64x64 / 64x32</span>
            </div>
          </div>

          <RouterLink
            to="/skin/library"
            class="card glass-card library-entry-card"
          >
            <div class="library-entry-head">
              <h3 class="card-title">
                <AppIcon name="database" :size="18" class="heading-icon" /> 皮肤库
              </h3>
              <AppIcon name="arrowRight" :size="16" class="library-entry-arrow" />
            </div>
            <p class="card-desc" data-typography="prose">
              检索服务器皮肤数据库，并通过插件同步到线上资源库。
            </p>
            <div class="library-entry-tags">
              <span class="meta-pill starmc-meta-pill"><AppIcon name="grid" :size="14" class="pill-icon starmc-pill-icon" /> 检索</span>
              <span class="meta-pill starmc-meta-pill"><AppIcon name="plug" :size="14" class="pill-icon starmc-pill-icon" /> 插件同步</span>
              <span class="meta-pill starmc-meta-pill"><AppIcon name="refresh" :size="14" class="pill-icon starmc-pill-icon" /> 实时刷新</span>
            </div>
          </RouterLink>
        </section>

        <!-- 选择与上传区 -->
        <section class="action-section">
          <div
            v-if="!auth.isLoggedIn"
            class="auth-required card glass-card"
          >
            <div class="auth-ambient" aria-hidden="true">
              <span class="ambient-orb orb-a"></span>
              <span class="ambient-orb orb-b"></span>
              <span class="ambient-grid"></span>
            </div>
            <AppIcon name="lock" :size="48" class="lock-icon auth-intro intro-1" />
            <h3 class="auth-intro intro-2">账号登录</h3>
            <p class="auth-intro intro-3">登录后即可上传、应用和管理皮肤资源。</p>
            <div class="reset-notice" role="note" aria-live="polite">
              <strong>密码找回入口：</strong>
              <RouterLink class="reset-link" to="/mc-game-password-reset">忘记游戏密码？使用邮箱验证码重置</RouterLink>
            </div>
            <ul class="auth-benefits" data-typography="prose">
              <li>绑定角色后可直接将皮肤应用到游戏账号</li>
              <li>支持皮肤与披风分开上传和管理</li>
              <li>上传记录可用于后续活动与展示位审核</li>
            </ul>
            <div class="auth-tabs auth-intro intro-4">
               <button
                 :class="['tab-btn', { active: authMode === 'login' }]"
                 @click="authMode = 'login'"
               >登录</button>
               <button
                 :class="['tab-btn', { active: authMode === 'register' }]"
                 @click="authMode = 'register'"
               >注册</button>
               <button
                 :class="['tab-btn', { active: authMode === 'verifyCode' }]"
                 @click="authMode = 'verifyCode'"
               >验证码登录</button>
            </div>

            <!-- 密码登录/注册表单 -->
            <form v-if="authMode !== 'verifyCode'" @submit.prevent="handleAuth" class="auth-form auth-intro intro-5">
              <div v-if="isDevAuthFallbackActive" class="dev-auth-badge" role="status" aria-live="polite">
                开发兜底登录模式（dev token）
              </div>
              <div class="input-group">
                <input v-model="authForm.username" class="ui-input" type="text" placeholder="Minecraft ID / 用户名" required aria-label="Minecraft ID 或用户名" autocomplete="username" />
              </div>
              <div class="input-group">
                <input v-model="authForm.password" class="ui-input" type="password" placeholder="密码" required aria-label="密码" autocomplete="current-password" />
              </div>
              <div class="input-group">
                <input v-model="authForm.email" class="ui-input" type="email" placeholder="邮箱地址" aria-label="邮箱地址" autocomplete="email" required />
              </div>
              <button
                type="submit"
                class="mc-button ui-btn primary block submit-btn auth-submit-btn"
                :disabled="isSubmitting"
              >
                {{ isSubmitting ? '处理中...' : (authMode === 'login' ? '登录' : '注册') }}
              </button>
              <button
                v-if="isDev"
                type="button"
                class="mc-button ui-btn secondary block submit-btn demo-login-btn"
                :disabled="isSubmitting"
                @click="handleDemoLogin"
              >
                {{ isSubmitting ? '处理中...' : '一键演示登录（本地）' }}
              </button>
            </form>

            <!-- 验证码登录/注册表单 -->
            <form v-else @submit.prevent="handleVerifyCodeAuth" class="auth-form auth-intro intro-5">
              <div v-if="verifyCodeMode === 'register'" class="input-group">
                <input v-model="verifyCodeForm.password" class="ui-input" type="password" placeholder="设置密码 (6位以上)" required aria-label="设置密码" autocomplete="new-password" />
                <div v-if="verifyCodePasswordStrength" class="password-strength">
                  <div class="strength-bar">
                    <div
                      class="strength-fill"
                      :style="{
                        width: verifyCodePasswordStrength.level === 'weak' ? '33%' : verifyCodePasswordStrength.level === 'medium' ? '66%' : '100%',
                        backgroundColor: verifyCodePasswordStrength.color
                      }"
                    ></div>
                  </div>
                  <span class="strength-label" :style="{ color: verifyCodePasswordStrength.color }">
                    {{ verifyCodePasswordStrength.label }}
                  </span>
                </div>
              </div>
              <div class="input-group">
                <input v-model="verifyCodeForm.email" class="ui-input" type="email" placeholder="邮箱地址" required aria-label="邮箱地址" autocomplete="email" />
              </div>
              <div class="verify-code-row">
                <input v-model="verifyCodeForm.code" class="ui-input verify-code-input" type="tel" placeholder="验证码" maxlength="6" inputmode="numeric" pattern="[0-9]*" required aria-label="验证码" autocomplete="one-time-code" />
                <button
                  type="button"
                  class="mc-button ui-btn secondary verify-code-btn"
                  :disabled="verifyCodeCountdown > 0 || isSendingCode"
                  @click="sendVerifyCode"
                >
                  {{ isSendingCode ? '发送中...' : verifyCodeCountdown > 0 ? `${verifyCodeCountdown}s` : '获取验证码' }}
                </button>
              </div>
              <p v-if="verifyCodeMsg" class="verify-code-msg" :class="{ error: verifyCodeError }">
                {{ verifyCodeMsg }}
              </p>
              <button
                type="submit"
                class="mc-button ui-btn primary block submit-btn auth-submit-btn"
                :disabled="isSubmitting || !verifyCodeForm.code"
              >
                {{ isSubmitting ? '处理中...' : (verifyCodeMode === 'login' ? '验证码登录' : '验证码注册') }}
              </button>
              <div class="verify-code-toggle">
                <button type="button" class="toggle-btn" @click="verifyCodeMode = verifyCodeMode === 'login' ? 'register' : 'login'">
                  {{ verifyCodeMode === 'login' ? '没有账号？验证码注册' : '已有账号？验证码登录' }}
                </button>
              </div>
            </form>
            <!-- GitHub 第三方登录 -->
            <div class="oauth-divider" aria-hidden="true">
              <span>或</span>
            </div>
            <a
              :href="githubAuthUrl"
              class="mc-button ui-btn secondary block github-login-btn"
              :disabled="isSubmitting"
            >
              <AppIcon name="github" :size="18" class="oauth-icon" />
              使用 GitHub 登录
            </a>
            <p class="oauth-note">
              GitHub 登录后需绑定邮箱才能使用皮肤站功能
            </p>
          </div>

          <div v-else class="dashboard card glass-card">
            <div class="card-header">
              <h3 class="card-title">
                <AppIcon name="upload" :size="20" class="heading-icon" /> 资源管理
              </h3>
              <div class="card-header-actions">
                <RouterLink to="/mc-binding" class="mc-button ui-btn small secondary">
                  <AppIcon name="external" :size="14" />
                  账号绑定
                </RouterLink>
                <RouterLink to="/security" class="mc-button ui-btn small secondary">
                  <AppIcon name="shield" :size="14" />
                  安全中心
                </RouterLink>
                <button @click="auth.logout" class="mc-button ui-btn small danger">退出登录</button>
              </div>
            </div>

            <div v-if="isReviewPreviewMode" class="review-preview-notice" :class="{ 'is-readonly': !auth.canReviewSubmissions, 'is-operator': auth.canReviewSubmissions }">
              <p class="review-preview-notice__line">
                {{ reviewEntryEnabled ? '审核入口已启用。' : '审核入口未启用（由环境变量控制）。' }}
              </p>
              <p class="review-preview-notice__line" v-if="auth.canReviewSubmissions">
                当前为可操作模式：你可以执行通过/驳回。
              </p>
              <p class="review-preview-notice__line" v-else>
                当前为只读模式：你可以查看审核状态，但不能执行审核操作。
              </p>
            </div>

            <div v-if="isReviewPreviewMode && reviewEntryEnabled" class="review-panel">
              <div class="review-panel__header">
                <h4>待审核列表</h4>
                <div class="history-actions">
                  <select v-model="reviewFilter" class="history-filter">
                    <option value="pending">仅待审</option>
                    <option value="all">全部（含已处理）</option>
                  </select>
                  <button class="clear-btn" @click="fetchReviewSubmissions">刷新</button>
                  <button class="clear-btn" @click="exportReviewLogsCsv">导出审核日志 CSV</button>
                </div>
              </div>
              <div v-if="reviewLoading" class="review-skeleton" role="status" aria-live="polite">
                <div v-for="i in 3" :key="i" class="review-skeleton-item"></div>
              </div>
              <p v-else-if="reviewError" class="catalog-muted" role="alert" aria-live="assertive">{{ reviewError }}</p>
              <p v-if="!reviewLoading && filteredReviewSubmissions.length === 0" class="history-empty">暂无待审核记录</p>

              <ul v-if="filteredReviewSubmissions.length > 0" class="starmc-list-group review-list">
                <li
                  v-for="item in filteredReviewSubmissions"
                  :key="item.id"
                  class="starmc-list-item review-item"
                  :class="{ active: selectedReviewId === item.id }"
                  @click="selectReviewSubmission(item)"
                >
                  <div class="starmc-list-item__main review-item__main">
                    <p class="starmc-list-item__title">{{ item.title }}</p>
                    <p class="starmc-list-item__desc">投稿人：{{ item.submitter }}</p>
                    <p v-if="item.note" class="starmc-list-item__desc">备注：{{ item.note }}</p>
                  </div>
                  <span class="starmc-badge is-info review-item__meta">{{ item.submittedAt }}</span>
                </li>
              </ul>

              <div class="review-actions" v-if="auth.canReviewSubmissions && selectedReviewId && selectedReviewIsPending">
                <textarea
                  v-model="reviewNote"
                  class="review-note ui-input"
                  placeholder="填写审核备注（驳回时必填）"
                  maxlength="200"
                ></textarea>
                <div class="review-note-meta">
                  <span>剩余 {{ 200 - reviewNote.length }} 字</span>
                  <button class="clear-btn" type="button" @click="reviewNote = ''">清空备注</button>
                </div>
                <div class="review-actions__buttons">
                  <button class="mc-button ui-btn small" :disabled="reviewActionLoading" @click="reviewAction('approve')">
                    {{ reviewActionLoading ? '处理中…' : '通过 (A)' }}
                  </button>
                  <button class="mc-button ui-btn small danger" :disabled="reviewActionLoading" @click="reviewAction('reject')">
                    {{ reviewActionLoading ? '处理中…' : '驳回 (R)' }}
                  </button>
                </div>
                <div class="review-note-meta">
                  <span>快捷键：A=通过，R=驳回（输入框聚焦时不触发）</span>
                </div>
              </div>

              <div v-if="reviewLogs.length > 0" class="review-log">
                <div class="trend-header">最近审核记录</div>
                <ul class="starmc-list-group">
                  <li v-for="log in reviewLogs" :key="log.id" class="starmc-list-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title">{{ log.at }} · {{ log.operator }} · {{ reviewActionLabel(log.action) }}《{{ log.title }}》</p>
                      <p class="starmc-list-item__desc">{{ log.note || '无备注' }}</p>
                    </div>
                    <span class="starmc-badge is-info">审核</span>
                  </li>
                </ul>
              </div>
            </div>

            <div v-if="skinDashboard" class="skin-context-banner">
              <p v-if="!skinDashboard.emailVerified" class="verify-hint">
                <AppIcon name="warning" :size="16" class="inline-warn-icon" />
                请先完成邮箱验证，再上传皮肤、应用外观和选择大厅方案。
              </p>
              <p v-if="skinDashboard.linkedMcUsername" class="link-hint">
                已绑定游戏名：<strong>{{ skinDashboard.linkedMcUsername }}</strong>
              </p>
              <p v-else class="link-hint warn">
                尚未绑定游戏角色；资源仍会保存至账号，进服同步需在资料页完成绑定。
              </p>
              <div
                v-if="skinDashboard.pendingSubmissionCount > 0"
                class="pending-hint"
              >
                审核中投稿：{{ skinDashboard.pendingSubmissionCount }} 条
              </div>
              <button
                v-if="
                  skinDashboard.mojangSkinSyncEnabled &&
                  skinDashboard.linkedMcUsername &&
                  skinDashboard.emailVerified
                "
                type="button"
                class="mc-button ui-btn small sync-mojang-btn"
                :disabled="mojangSyncLoading"
                @click="syncMojangSkin"
              >
                {{ mojangSyncLoading ? '同步中...' : '从 Mojang 同步皮肤' }}
              </button>
            </div>

            <div v-if="showSkinModeSections" class="status-banner" :class="`is-${uploadStatus}`" role="status" aria-live="polite">
              <AppIcon
                :name="uploadStatusIcon"
                :size="18"
                class="status-banner-icon"
                :spin="uploadStatus === 'uploading'"
              />
              <span v-if="uploadStatus === 'uploading'">正在上传，请不要关闭页面</span>
              <span v-else-if="uploadStatus === 'success'">上传成功，预览已更新</span>
              <span v-else-if="uploadStatus === 'error'">{{ uploadError || '上传失败，请重试' }}</span>
              <span v-else>可上传皮肤或披风</span>
              <button
                v-if="uploadStatus === 'error' && lastFailedFile"
                class="retry-btn"
                @click="retryLastUpload"
              >
                失败重传
              </button>
            </div>

            <div v-if="showSkinModeSections" class="dashboard-status">
              <div class="status-block">
                <span class="status-label">当前账号</span>
                <span class="status-value">{{ auth.user?.username || '未知用户' }}</span>
              </div>
              <div class="status-block">
                <span class="status-label">上传类型</span>
                <span class="status-value">{{ uploadType === 'skin' ? '皮肤 (Skin)' : '披风 (Cape)' }}</span>
              </div>
              <div class="status-block" v-if="uploadType === 'skin'">
                <span class="status-label">手臂模型</span>
                <span class="status-value">{{ skinModel }}</span>
              </div>
            </div>

            <div v-if="showProfileModeSections" class="dashboard-status mc-dashboard-panel">
              <div class="status-block">
                <span class="status-label">绑定游戏名</span>
                <span class="status-value">{{ mcAccountDashboard?.linkedName || skinDashboard?.linkedMcUsername || '未绑定' }}</span>
              </div>
              <div class="status-block">
                <span class="status-label">档案数量（VLA）</span>
                <span class="status-value">{{ mcAccountLoading ? '加载中...' : (mcAccountDashboard?.profileCount ?? 0) }}</span>
              </div>
              <div class="status-block">
                <span class="status-label">安全事件（VLA）</span>
                <span class="status-value">{{ mcAccountLoading ? '加载中...' : (mcAccountDashboard?.securityEventCount ?? 0) }}</span>
              </div>
              <div class="status-block" v-if="mcAccountDashboard?.lastSecurityEventAt">
                <span class="status-label">最近安全事件</span>
                <span class="status-value">{{ mcAccountDashboard?.lastSecurityEventAt }}</span>
              </div>
              <div class="status-block" v-if="isDevAuthFallbackActive">
                <span class="status-label">登录模式</span>
                <span class="status-value">DEV Fallback</span>
              </div>
            </div>

            <div v-if="showProfileModeSections" class="dashboard-status mc-dashboard-panel">
              <div class="status-block">
                <span class="status-label">最近档案（VLA）</span>
                <span class="status-value">{{ mcProfiles.length > 0 ? (mcProfiles[0].name || mcProfiles[0].profileName || '已同步') : '暂无' }}</span>
              </div>
              <div class="status-block">
                <span class="status-label">档案更新时间</span>
                <span class="status-value">{{ mcProfiles.length > 0 ? (mcProfiles[0].updatedAt || mcProfiles[0].lastSeenAt || '未知') : '暂无' }}</span>
              </div>
              <div class="status-block">
                <span class="status-label">最新安全事件</span>
                <span class="status-value">{{ mcSecurityEvents.length > 0 ? (mcSecurityEvents[0].type || mcSecurityEvents[0].action || '未知事件') : '暂无' }}</span>
              </div>
              <div class="status-block">
                <span class="status-label">事件来源 IP</span>
                <span class="status-value">{{ mcSecurityEvents.length > 0 ? (mcSecurityEvents[0].ip || '未提供') : '暂无' }}</span>
              </div>
            </div>

            <div v-if="showProfileModeSections" class="dashboard-status mc-dashboard-panel detail-panel">
              <div class="detail-header">玩家详情（来自 @velocity-limbo-auth）</div>

              <div class="detail-grid">
                <div class="status-block">
                  <span class="status-label">玩家 UUID</span>
                  <span class="status-value mono">{{ mcAccountDashboard?.linkedUuid || skinDashboard?.linkedMcUsername || '未绑定' }}</span>
                </div>
                <div class="status-block">
                  <span class="status-label">邮箱验证</span>
                  <span class="status-value">{{ skinDashboard?.emailVerified ? '已验证' : '未验证' }}</span>
                </div>
                <div class="status-block">
                  <span class="status-label">待审核投稿</span>
                  <span class="status-value">{{ skinDashboard?.pendingSubmissionCount ?? 0 }}</span>
                </div>
              </div>

              <div class="detail-list-wrap">
                <h4 class="detail-list-title">最近档案列表</h4>
                <ul v-if="mcProfiles.length > 0" class="starmc-list-group detail-list">
                  <li v-for="(item, idx) in mcProfiles" :key="`profile-${idx}`" class="starmc-list-item detail-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title detail-item-main">{{ item.name || item.profileName || '未命名档案' }}</p>
                      <p class="starmc-list-item__desc detail-item-sub">更新时间：{{ item.updatedAt || item.lastSeenAt || '未知' }}</p>
                    </div>
                  </li>
                </ul>
                <p v-else class="detail-empty">暂无档案数据</p>
              </div>

              <div class="detail-list-wrap">
                <h4 class="detail-list-title">最近安全事件列表</h4>
                <ul v-if="mcSecurityEvents.length > 0" class="starmc-list-group detail-list">
                  <li v-for="(event, idx) in mcSecurityEvents" :key="`event-${idx}`" class="starmc-list-item detail-item" :class="{ 'is-anomaly': !event.ip || /fail|reject|ban|risk/i.test(String(event.type || event.action || '')) }">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title detail-item-main">{{ event.type || event.action || '未知事件' }}</p>
                      <p class="starmc-list-item__desc detail-item-sub">时间：{{ event.createdAt || event.at || '未知' }} ｜ IP：{{ event.ip || '未提供' }} ｜ 设备：{{ event.deviceId || '未提供' }}</p>
                    </div>
                  </li>
                </ul>
                <p v-else class="detail-empty">暂无安全事件</p>
              </div>

              <div class="detail-list-wrap">
                <h4 class="detail-list-title">设备维度（Top 5）</h4>
                <ul v-if="deviceSummary.length > 0" class="starmc-list-group detail-list">
                  <li v-for="(dev, idx) in deviceSummary" :key="`dev-${idx}`" class="starmc-list-item detail-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title detail-item-main">{{ dev.id }}</p>
                      <p class="starmc-list-item__desc detail-item-sub">事件次数：{{ dev.count }} ｜ 最近时间：{{ dev.lastAt || '未知' }}</p>
                    </div>
                  </li>
                </ul>
                <p v-else class="detail-empty">暂无设备数据</p>
              </div>

              <div class="detail-grid">
                <div class="starmc-list-item status-block" :class="`risk-${riskLevel}`">
                  <div class="starmc-list-item__main">
                    <p class="starmc-list-item__title status-label">风险评分</p>
                  </div>
                  <span class="starmc-badge is-warning status-value">{{ riskScore }} / 100（{{ riskLevelLabel }}）</span>
                </div>
              </div>

              <div class="detail-list-wrap">
                <h4 class="detail-list-title">登录轨迹（近 7 条）</h4>
                <ul v-if="loginTimeline.length > 0" class="starmc-list-group detail-list">
                  <li v-for="(line, idx) in loginTimeline" :key="`timeline-${idx}`" class="starmc-list-item detail-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title detail-item-main">{{ line.day }}</p>
                      <p class="starmc-list-item__desc detail-item-sub">总事件：{{ line.total }} ｜ 异常：{{ line.suspicious }}</p>
                    </div>
                  </li>
                </ul>
                <p v-else class="detail-empty">暂无轨迹数据</p>
              </div>

              <div class="detail-actions">
                <button class="clear-btn" type="button" @click="exportPlayerSecurityCsv">导出玩家安全报告 CSV</button>
              </div>
            </div>

            <div v-if="showSkinModeSections" class="upload-area">
              <div class="upload-tabs">
                <button
                  :class="['tab-btn', { active: uploadType === 'skin' }]"
                  @click="uploadType = 'skin'"
                >上传皮肤</button>
                <button
                  :class="['tab-btn', { active: uploadType === 'cape' }]"
                  @click="uploadType = 'cape'"
                >上传披风</button>
              </div>

              <div
                class="dropzone"
                :class="{ 'is-dragover': isDragOver, 'is-uploading': isUploading }"
                @click="triggerFileInput"
                @dragover.prevent="onDragOver"
                @dragleave.prevent="onDragLeave"
                @drop.prevent="onDrop"
              >
                <input
                  type="file"
                  ref="fileInput"
                  style="display: none"
                  accept="image/png"
                  multiple
                  @change="handleFileUpload"
                />
                <AppIcon name="cloudUpload" :size="40" class="upload-icon" />
                <p>{{ isUploading ? '文件上传中，请稍候...' : '点击或拖拽 PNG 文件至此' }}</p>
                <span class="hint">尺寸要求: 64x64 或 64x32</span>
                <span v-if="selectedFileName" class="selected-file">当前文件：{{ selectedFileName }}</span>
              </div>

              <div v-if="isUploading" class="upload-progress">
                <div class="progress-header">
                  <span>上传进度</span>
                  <span>{{ uploadProgress }}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: `${uploadProgress}%` }"></div>
                </div>
              </div>

              <div v-if="uploadQueue.length > 0" class="upload-queue">
                <div class="queue-header">
                  <span>上传队列</span>
                  <div class="queue-header-actions">
                    <select v-model.number="uploadConcurrency" class="history-filter">
                      <option :value="1">串行 (1 路)</option>
                      <option :value="2">并行 (2 路)</option>
                    </select>
                    <select v-model="queuePriorityMode" class="history-filter">
                      <option value="retry-first">重试优先</option>
                      <option value="new-first">新任务优先</option>
                    </select>
                    <span class="queue-tip">
                      {{ queuePriorityMode === 'retry-first' ? '说明：先处理失败重试任务，再处理新任务' : '说明：优先处理最新加入的任务' }}
                    </span>
                    <span>{{ uploadQueue.filter((q) => q.status === 'success').length }}/{{ uploadQueue.length }} 完成</span>
                    <button class="clear-btn" @click="retryAllFailedTasks">重试失败项</button>
                    <button class="clear-btn" @click="clearFinishedTasks">清理已完成</button>
                  </div>
                </div>
                <ul class="starmc-list-group queue-list">
                  <li v-for="task in uploadQueue" :key="task.id" class="starmc-list-item queue-item">
                    <div class="starmc-list-item__main queue-item__main">
                      <p class="starmc-list-item__title queue-name">{{ task.fileName }}</p>
                      <p class="starmc-list-item__desc">队列任务</p>
                    </div>
                    <div class="queue-right">
                      <span class="starmc-badge queue-state" :class="`is-${task.status}`">
                        {{ task.status === 'pending' ? '待上传' : task.status === 'uploading' ? '上传中' : task.status === 'success' ? '完成' : task.status === 'canceled' ? '已取消' : '失败' }}
                      </span>
                      <button v-if="task.status === 'pending' || task.status === 'uploading'" class="queue-btn" @click="cancelTask(task.id)">取消</button>
                      <button v-if="task.status === 'error'" class="queue-btn" @click="retryTask(task.id)">重试</button>
                    </div>
                  </li>
                </ul>
              </div>

              <p v-if="uploadError" class="upload-error">
                <AppIcon name="warning" :size="16" class="inline-warn-icon" /> {{ uploadError }}
              </p>

              <div class="model-select" v-if="uploadType === 'skin'">
                <label>手臂模型:</label>
                <select v-model="skinModel">
                  <option value="auto">自动识别</option>
                  <option value="default">经典 (Steve)</option>
                  <option value="slim">纤细 (Alex)</option>
                </select>
              </div>

              <div class="upload-rules" data-typography="prose">
                <h4><AppIcon name="clipboardList" :size="18" class="heading-icon" /> 上传说明</h4>
                <ul>
                  <li>仅支持 PNG，文件体积建议不超过 2MB。</li>
                  <li>上传前请先确认透明层是否正确。</li>
                  <li>若显示异常，可切换手臂模型后重新上传。</li>
                </ul>
              </div>
            </div>

            <div v-if="showProfileModeSections" class="upload-history">
              <div class="history-header">
                <h4><AppIcon name="clockRotate" :size="18" class="heading-icon" /> 上传记录</h4>
                <div class="history-actions">
                  <input v-model="historySearch" class="history-search ui-input" type="text" placeholder="搜索文件名..." />
                  <select v-model="historyFilter" class="history-filter">
                    <option value="all">全部</option>
                    <option value="skin">仅皮肤</option>
                    <option value="cape">仅披风</option>
                  </select>
                  <select v-model="reportRange" class="history-filter">
                    <option value="last7days">最近7天</option>
                    <option value="thisWeek">本周</option>
                    <option value="lastWeek">上周</option>
                  </select>
                  <button v-if="uploadHistory.length > 0" class="clear-btn" @click="exportHistoryCsv">导出运营周报 CSV</button>
                  <button v-if="uploadHistory.length > 0" class="clear-btn" @click="clearHistory">清空</button>
                </div>
              </div>

              <div class="history-stats">
                <div class="starmc-list-group history-stats__group">
                  <div class="starmc-list-item stats-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title stats-label">总任务</p>
                    </div>
                    <span class="starmc-badge is-info stats-value">{{ historyStats.total }}</span>
                  </div>
                  <div class="starmc-list-item stats-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title stats-label">成功率</p>
                    </div>
                    <span class="starmc-badge is-success stats-value">{{ historyStats.successRate }}%</span>
                  </div>
                  <div class="starmc-list-item stats-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title stats-label">失败/取消</p>
                    </div>
                    <span class="starmc-badge is-warning stats-value">{{ historyStats.failed }}/{{ historyStats.canceled }}</span>
                  </div>
                </div>
              </div>
              <div class="sla-trend" v-if="slaTrend.length > 0">
                <div class="trend-header">近 7 日成功率趋势</div>
                <div class="trend-bars">
                  <div v-for="item in slaTrend" :key="item.dayKey" class="trend-item">
                    <div class="trend-bar-track">
                      <div class="trend-bar-fill" :style="{ height: `${item.rate}%` }"></div>
                    </div>
                    <div class="trend-meta">{{ item.label }} · {{ item.rate }}%</div>
                  </div>
                </div>
              </div>
              <div class="failure-dist" v-if="failureDistribution.length > 0">
                <div class="trend-header">失败原因分布</div>
                <ul class="starmc-list-group">
                  <li v-for="item in failureDistribution" :key="item.code" class="starmc-list-item failure-item">
                    <div class="starmc-list-item__main">
                      <p class="starmc-list-item__title failure-label">{{ item.label }}</p>
                    </div>
                    <span class="starmc-badge is-error failure-value">{{ item.count }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="searchedUploadHistory.length === 0" class="history-empty">暂无上传记录</div>
              <ul v-else class="starmc-list-group history-list">
                <li v-for="record in searchedUploadHistory" :key="record.id" class="starmc-list-item history-item">
                  <div class="starmc-list-item__main history-item__main">
                    <div class="history-main">
                      <span class="starmc-badge history-type">{{ record.type === 'skin' ? '皮肤' : '披风' }}</span>
                      <p class="starmc-list-item__title history-file">{{ record.fileName }}</p>
                    </div>
                    <p class="starmc-list-item__desc history-meta">
                      <span>{{ record.dimension }}</span>
                      <span>{{ record.sizeLabel }}</span>
                      <span>HTTP {{ record.httpStatus || 200 }}</span>
                      <span v-if="record.errorMessage">{{ record.errorMessage }}</span>
                    </p>
                  </div>
                  <span class="starmc-badge history-state" :class="`is-${record.status || 'success'}`">
                    {{ record.status === 'error' ? '失败' : record.status === 'canceled' ? '取消' : '成功' }}
                  </span>
                </li>
              </ul>
            </div>

            <div v-if="showSkinModeSections" class="recent-catalog">
               <h4><AppIcon name="grid" :size="18" class="heading-icon" /> 方案列表</h4>
               <p v-if="catalogLoading" class="catalog-muted">正在加载方案列表...</p>
               <p v-else-if="catalogFetchError" class="catalog-muted">{{ catalogFetchError }}</p>
               <p v-else-if="catalog.length === 0" class="catalog-muted">暂无可用方案</p>
               <div v-else class="catalog-grid">
                 <SkinCatalogCard
                   v-for="item in catalog"
                   :key="item.id"
                   :item="item"
                   @select="selectCatalogItem"
                 />
               </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, watchEffect, nextTick, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import type { User } from '@/stores/auth';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import SkinPreview from '@/components/organisms/Skin/SkinPreview.vue';
import SkinCatalogCard from '@/components/molecules/Skin/SkinCatalogCard.vue';
import type { CatalogItem } from '@/components/molecules/Skin/SkinCatalogCard.vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import type { AppIconName } from '@/components/atoms/appIcons';
import { devWarn } from '@/shared/utils/devLog';
import { apiFetchWithAuth, apiJsonWithAuth, applySuperTokensAuthHeadersToXhr, fetchJsonWithHealthFallback } from '@/shared/utils/security';
import { useSkinApply, useSkinCatalog } from '@/features/skin';

const auth = useAuthStore();
const isLoggedIn = computed(() => auth.isLoggedIn);
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const previewCardRef = ref<HTMLElement | null>(null);
const previewAppliedHighlight = ref(false);

interface SkinDashboardApplied {
  skinAssetId: number;
  capeAssetId: number;
  slot?: string;
  version?: number;
}

interface SkinDashboardPreview {
  skinUrl?: string;
  capeUrl?: string;
  model?: string;
}

interface SkinDashboard {
  emailVerified: boolean;
  linkedMcUsername?: string;
  pendingSubmissionCount: number;
  mojangSkinSyncEnabled: boolean;
  applied?: SkinDashboardApplied;
  preview?: SkinDashboardPreview;
}

interface McAccountDashboard {
  linkedName?: string;
  linkedUuid?: string;
  profileCount: number;
  securityEventCount: number;
  lastSecurityEventAt?: string;
}

interface McProfileItem {
  name?: string;
  profileName?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  deviceId?: string;
  userAgent?: string;
}

interface McSecurityEventItem {
  type?: string;
  action?: string;
  createdAt?: string;
  at?: string;
  ip?: string;
  deviceId?: string;
  userAgent?: string;
  success?: boolean;
}

interface McAccountResponse {
  name?: string;
  username?: string;
  linkedMcUsername?: string;
  uuid?: string;
  playerUuid?: string;
}

interface McProfilesResponse {
  items?: McProfileItem[];
  profiles?: McProfileItem[];
}

interface McSecurityEventsResponse {
  items?: McSecurityEventItem[];
  events?: McSecurityEventItem[];
}

function toAuthUser(input: unknown): User | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<User> & Record<string, unknown>;
  const uuid = typeof candidate.uuid === 'string' ? candidate.uuid.trim() : '';
  const username = typeof candidate.username === 'string' ? candidate.username.trim() : '';
  if (!uuid || !username) return null;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : undefined,
    uuid,
    username,
    email: typeof candidate.email === 'string' ? candidate.email : undefined,
    role: typeof candidate.role === 'string' ? candidate.role : undefined,
    roles: Array.isArray(candidate.roles) ? candidate.roles.map((r) => String(r)) : undefined
  };
}

function extractUserPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  if ('user' in payload) {
    return (payload as { user?: unknown }).user;
  }
  return payload;
}

const isDev = import.meta.env.DEV;
const realtimeRefreshIntervalMs = (() => {
  const raw = Number(import.meta.env.VITE_SKIN_REALTIME_REFRESH_MS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return isDev ? 10000 : 30000;
  }
  return Math.min(Math.max(Math.floor(raw), 5000), 120000);
})();

// 开发模式下可选的 Bearer Token 回退（仅开发环境使用）
const isDevAuthFallbackActive = computed(() => {
  // 注意：生产环境使用 SuperTokens HTTP-only Cookie
  return isDev;
});

// GitHub OAuth 登录 URL（由 SuperTokens ThirdParty 提供）
const githubAuthUrl = computed(() => {
  const base = (import.meta.env.VITE_API_BASE || '') + '/auth';
  const redirect = encodeURIComponent(window.location.origin + '/skin');
  return `${base}/thirdparty/auth/github?redirectToPath=%2Fskin`;
});

const authMode = ref<'login' | 'register' | 'verifyCode'>('login');
const verifyCodeMode = ref<'login' | 'register'>('login');
const verifyCodeCountdown = ref(0);
const isSendingCode = ref(false);
const verifyCodeMsg = ref('');
const verifyCodeError = ref(false);

// 密码强度计算
const verifyCodePasswordStrength = computed(() => {
  const pw = verifyCodeForm.password || '';
  if (pw.length === 0) return null;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 'weak', label: '弱', color: '#ef4444' };
  if (score <= 4) return { level: 'medium', label: '中等', color: '#f59e0b' };
  return { level: 'strong', label: '强', color: '#22c55e' };
});
const verifyCodeForm = reactive({
  email: '',
  code: '',
  password: '',
  challengeId: ''
});
const skinDashboard = ref<SkinDashboard | null>(null);
const mcAccountDashboard = ref<McAccountDashboard | null>(null);
const mcAccountLoading = ref(false);
const mcProfiles = ref<McProfileItem[]>([]);
const mcSecurityEvents = ref<McSecurityEventItem[]>([]);

const deviceSummary = computed(() => {
  const map = new Map<string, { id: string; count: number; lastAt: string }>();
  for (const ev of mcSecurityEvents.value) {
    const id = String(ev.deviceId || ev.userAgent || 'unknown').trim();
    const key = id || 'unknown';
    const at = String(ev.createdAt || ev.at || '');
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { id: key, count: 1, lastAt: at });
    } else {
      prev.count += 1;
      if (at && at > prev.lastAt) prev.lastAt = at;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
});

const riskScore = computed(() => {
  const total = mcSecurityEvents.value.length;
  if (!total) return 0;
  const suspicious = mcSecurityEvents.value.filter((ev) => {
    const t = String(ev.type || ev.action || '').toLowerCase();
    return t.includes('fail') || t.includes('reject') || t.includes('ban') || t.includes('risk');
  }).length;
  const unknownIp = mcSecurityEvents.value.filter((ev) => !String(ev.ip || '').trim()).length;
  const score = Math.min(100, Math.round((suspicious / total) * 70 + (unknownIp / total) * 30));
  return score;
});

const riskLevel = computed<'low' | 'medium' | 'high'>(() => {
  if (riskScore.value >= 70) return 'high';
  if (riskScore.value >= 35) return 'medium';
  return 'low';
});

const riskLevelLabel = computed(() => {
  if (riskLevel.value === 'high') return '高风险';
  if (riskLevel.value === 'medium') return '中风险';
  return '低风险';
});

const loginTimeline = computed(() => {
  const map = new Map<string, { day: string; total: number; suspicious: number }>();
  for (const ev of mcSecurityEvents.value) {
    const raw = String(ev.createdAt || ev.at || '');
    const day = raw ? raw.slice(0, 10) : 'unknown';
    const t = String(ev.type || ev.action || '').toLowerCase();
    const isSuspicious = t.includes('fail') || t.includes('reject') || t.includes('ban') || t.includes('risk');
    const prev = map.get(day) || { day, total: 0, suspicious: 0 };
    prev.total += 1;
    if (isSuspicious) prev.suspicious += 1;
    map.set(day, prev);
  }
  return Array.from(map.values()).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 7);
});

const exportPlayerSecurityCsv = () => {
  const headers = ['时间', '事件', 'IP', '设备', 'UserAgent'];
  const rows = mcSecurityEvents.value.map((ev) => [
    String(ev.createdAt || ev.at || ''),
    String(ev.type || ev.action || '未知事件'),
    String(ev.ip || ''),
    String(ev.deviceId || ''),
    String(ev.userAgent || ''),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `starmc-player-security-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const mojangSyncLoading = ref(false);

const appliedSkinAssetId = ref(0);
const appliedCapeAssetId = ref(0);
const uploadType = ref<'skin' | 'cape'>('skin');
const skinModel = ref<'auto' | 'default' | 'slim'>('auto');
const isSubmitting = ref(false);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadError = ref('');
const isDragOver = ref(false);
const selectedFileName = ref('');
const lastFailedFile = ref<File | null>(null);
const uploadStatus = ref<'idle' | 'uploading' | 'success' | 'error'>('idle');

const uploadStatusIcon = computed<AppIconName>(() => {
  switch (uploadStatus.value) {
    case 'uploading':
      return 'spinner';
    case 'success':
      return 'checkCircle';
    case 'error':
      return 'errorCircle';
    default:
      return 'infoCircle';
  }
});
const historyFilter = ref<'all' | 'skin' | 'cape'>('all');
const isProfileDashboardMode = computed(() => route.path === '/profile');
const isReviewPreviewMode = computed(() => {
  if (isProfileDashboardMode.value) return false;
  return route.path === '/skin/review' || route.query.mode === 'review-preview';
});
const currentMode = computed<'profile' | 'review' | 'station'>(() => {
  if (isReviewPreviewMode.value) return 'review';
  if (isProfileDashboardMode.value) return 'profile';
  return 'station';
});
const currentModeLabel = computed(() => {
  if (currentMode.value === 'review') {
    return reviewEntryEnabled.value ? '当前模式：审核预览' : '当前模式：审核预览（入口未启用）';
  }
  if (currentMode.value === 'profile') return '当前模式：个人中心';
  return '当前模式：皮肤管理';
});
const currentModeIcon = computed<AppIconName>(() => {
  if (currentMode.value === 'review') return 'clipboardList';
  if (currentMode.value === 'profile') return 'eye';
  return 'shirt';
});

const showSkinModeSections = computed(() => !isReviewPreviewMode.value && !isProfileDashboardMode.value);
const showProfileModeSections = computed(() => isProfileDashboardMode.value);
const showPreviewSection = computed(() => auth.isLoggedIn && showSkinModeSections.value);

watchEffect(() => {
  if (isReviewPreviewMode.value) {
    document.title = '投稿审核预览 - StarMC';
    return;
  }
  document.title = isProfileDashboardMode.value ? '个人中心 - StarMC' : '皮肤站 - StarMC';
});

const authForm = ref({
  username: '',
  password: '',
  email: ''
});

const currentSkinUrl = ref<string>('/image/steve.png');
const currentCapeUrl = ref<string | undefined>(undefined);

interface ReviewSubmissionItem {
  id: string;
  title: string;
  submitter: string;
  submittedAt: string;
  skinUrl?: string;
  capeUrl?: string;
  model?: 'auto' | 'default' | 'slim';
  note?: string;
  reviewVersion?: number;
}

interface ReviewAuditLogItem {
  id: string;
  submissionId: string;
  title: string;
  action: string;
  note: string;
  operator: string;
  at: string;
}

interface ReviewAuditLogApiItem {
  id?: string;
  submissionId?: string;
  title?: string;
  action?: string;
  note?: string;
  operator?: string;
  at?: string;
}

interface ReviewActionApiResponse {
  ok?: boolean;
  notify?: {
    queued?: boolean;
    notificationId?: string;
  };
}

interface ReviewedArchiveItem extends ReviewSubmissionItem {
  result: 'approve' | 'reject';
  reviewedAt: string;
}

interface UploadRecord {
  id: string;
  type: 'skin' | 'cape';
  fileName: string;
  dimension: string;
  sizeLabel: string;
  createdAt: string;
  status?: 'success' | 'error' | 'canceled';
  httpStatus?: number;
  errorMessage?: string;
  createdTs?: number;
}

interface UploadTask {
  id: string;
  file: File;
  fileName: string;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'canceled';
  enqueuedAt: number;
  retryCount: number;
}

const HISTORY_KEY = 'starmc-skin-upload-history';
const QUEUE_SNAPSHOT_KEY = 'starmc-skin-upload-queue-snapshot';
const PARALLELISM_KEY = 'starmc-skin-upload-parallelism';
const PRIORITY_MODE_KEY = 'starmc-skin-upload-priority-mode';
const uploadHistory = ref<UploadRecord[]>([]);
const uploadQueue = ref<UploadTask[]>([]);
const activeUploads = ref(0);
const activeXhrMap = new Map<string, XMLHttpRequest>();
const processingQueue = ref(false);
const uploadConcurrency = ref<1 | 2>(1);
const queuePriorityMode = ref<'retry-first' | 'new-first'>('retry-first');
const historySearch = ref('');
const reportRange = ref<'last7days' | 'thisWeek' | 'lastWeek'>('last7days');
const filteredUploadHistory = computed(() => {
  if (historyFilter.value === 'all') {
    return uploadHistory.value;
  }
  return uploadHistory.value.filter((item) => item.type === historyFilter.value);
});
const searchedUploadHistory = computed(() => {
  const keyword = historySearch.value.trim().toLowerCase();
  if (!keyword) return filteredUploadHistory.value;
  return filteredUploadHistory.value.filter((item) => item.fileName.toLowerCase().includes(keyword));
});
const historyStats = computed(() => {
  const total = uploadHistory.value.length;
  const success = uploadHistory.value.filter((item) => (item.status || 'success') === 'success').length;
  const failed = uploadHistory.value.filter((item) => item.status === 'error').length;
  const canceled = uploadHistory.value.filter((item) => item.status === 'canceled').length;
  const successRate = total ? Math.round((success / total) * 100) : 0;
  return { total, success, failed, canceled, successRate };
});
const slaTrend = computed(() => {
  const now = Date.now();
  const rows = Array.from({ length: 7 }).map((_, idx) => {
    const date = new Date(now - (6 - idx) * 86400000);
    const dayKey = date.toISOString().slice(0, 10);
    return {
      dayKey,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      total: 0,
      success: 0
    };
  });
  const bucket = new Map(rows.map((r) => [r.dayKey, r]));
  uploadHistory.value.forEach((item) => {
    const ts = item.createdTs || Date.parse(item.createdAt) || 0;
    if (!ts) return;
    const key = new Date(ts).toISOString().slice(0, 10);
    const row = bucket.get(key);
    if (!row) return;
    row.total += 1;
    if ((item.status || 'success') === 'success') row.success += 1;
  });
  return rows.map((r) => ({
    ...r,
    rate: r.total ? Math.round((r.success / r.total) * 100) : 0
  }));
});
const failureDistribution = computed(() => {
  const map = new Map<string, number>();
  uploadHistory.value.forEach((item) => {
    if (item.status !== 'error') return;
    const code = String(item.httpStatus || 0);
    map.set(code, (map.get(code) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({
      code,
      count,
      label: code === '0' ? '网络/中断' : `HTTP ${code}`
    }));
});


const reviewLoading = ref(false);
const reviewError = ref('');
const reviewSubmissions = ref<ReviewSubmissionItem[]>([]);
const selectedReviewId = ref('');
const reviewActionLoading = ref(false);
const reviewNote = ref('');
const reviewFilter = ref<'pending' | 'all'>('pending');
const reviewedArchive = ref<ReviewedArchiveItem[]>([]);
const reviewEntryEnabled = ref(false);
const reviewLogs = ref<ReviewAuditLogItem[]>([]);
const REVIEW_ARCHIVE_KEY = 'starmc-review-archive';
const filteredReviewSubmissions = computed(() => reviewSubmissions.value);
const selectedReviewSubmission = computed(() => {
  return filteredReviewSubmissions.value.find((item) => item.id === selectedReviewId.value) || null;
});
const selectedReviewIsPending = computed(() => {
  if (!selectedReviewId.value) return false;
  return reviewSubmissions.value.some((item) => item.id === selectedReviewId.value);
});

const previewSkinModel = computed<'auto' | 'default' | 'slim'>(() => {
  if (isReviewPreviewMode.value) {
    const selected = selectedReviewSubmission.value;
    if (selected?.model === 'slim') return 'slim';
    if (selected?.model === 'default') return 'default';
    return 'auto';
  }
  const m = skinDashboard.value?.preview?.model;
  if (m === 'slim') return 'slim';
  if (m === 'default') return 'default';
  return 'auto';
});

function reviewActionLabel(action: string) {
  const normalized = String(action || '').trim().toLowerCase();
  if (normalized === 'approve') return '通过';
  if (normalized === 'reject') return '驳回';
  if (normalized === 'reopen') return '回退待审';
  if (normalized === 'resubmit') return '作者重提';
  return normalized ? normalized.toUpperCase() : '未知动作';
}

function reviewNotifyReceiptText(notify?: { queued?: boolean; notificationId?: string }) {
  if (!notify || notify.queued === undefined) return '';
  if (notify.queued) {
    const id = String(notify.notificationId || '').trim();
    return id ? `（通知已入队：${id}）` : '（通知已入队）';
  }
  return '（通知未入队）';
}

function formatReviewLogTime(value: string) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms) || ms <= 0) return String(value || '');
  return new Date(ms).toLocaleString();
}

async function fetchReviewLogs() {
  if (!isReviewPreviewMode.value || !auth.canReviewSubmissions) {
    reviewLogs.value = [];
    return;
  }
  try {
    const { response, data } = await apiJsonWithAuth<{ items?: ReviewAuditLogApiItem[] }>(
      '/api/skins/submissions/audit-logs?page=1&pageSize=20',
      null,
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('bad_status');
    const rows = Array.isArray(data?.items) ? data.items : [];
    reviewLogs.value = rows.map((row) => {
      const atRaw = String(row?.at || '');
      return {
        id: String(row?.id || ''),
        submissionId: String(row?.submissionId || ''),
        title: String(row?.title || row?.submissionId || '未命名投稿'),
        action: String(row?.action || ''),
        note: String(row?.note || ''),
        operator: String(row?.operator || '审核员'),
        at: formatReviewLogTime(atRaw),
      };
    });
  } catch {
    reviewLogs.value = [];
  }
}


async function fetchReviewSubmissions() {
  if (!isReviewPreviewMode.value) return;
  reviewLoading.value = true;
  reviewError.value = '';
  try {
    const qs = reviewFilter.value === 'all' ? 'all' : 'pending';
    const { response, data } = await apiJsonWithAuth<{ items?: ReviewSubmissionItem[] }>(
      `/api/skins/submissions?status=${qs}`
    );
    if (!response.ok) throw new Error('bad_status');
    reviewSubmissions.value = Array.isArray(data?.items) ? data.items : [];
    await fetchReviewLogs();
  } catch {
    reviewError.value = '待审列表加载失败，请稍后重试';
    reviewSubmissions.value = [];
    await fetchReviewLogs();
  } finally {
    if (reviewSubmissions.value.length > 0) {
      const stillExists = reviewSubmissions.value.some((item) => item.id === selectedReviewId.value);
      if (selectedReviewId.value && stillExists) {
        const current = reviewSubmissions.value.find((item) => item.id === selectedReviewId.value);
        if (current) selectReviewSubmission(current);
      } else {
        selectReviewSubmission(reviewSubmissions.value[0]);
      }
    } else {
      selectedReviewId.value = '';
      currentSkinUrl.value = '/image/steve.png';
      currentCapeUrl.value = undefined;
    }
    reviewLoading.value = false;
  }
}

function selectReviewSubmission(item: ReviewSubmissionItem) {
  selectedReviewId.value = item.id;
  currentSkinUrl.value = item.skinUrl || '/image/steve.png';
  currentCapeUrl.value = item.capeUrl || undefined;
  if (!reviewSubmissions.value.some((pending) => pending.id === item.id)) {
    reviewNote.value = '';
  }
}

async function sendReviewActionWithRetry(
  submissionId: string,
  action: 'approve' | 'reject',
  note: string,
  expectedVersion?: number,
  maxRetries = 2
) {
  const idemKey = `${submissionId}:${action}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const { response, data } = await apiJsonWithAuth<ReviewActionApiResponse>(`/api/skins/submissions/${submissionId}/${action}`, null, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey
        },
        body: JSON.stringify({ note, expectedVersion })
      });
      if (!response.ok) throw new Error(`bad_status_${response.status}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const delay = 300 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('review_action_failed');
}

async function reviewAction(action: 'approve' | 'reject') {
  const selected = selectedReviewSubmission.value;
  if (!selected || reviewActionLoading.value) return;
  if (!selectedReviewIsPending.value) {
    toast.addToast({ message: '该记录已处理，仅支持预览', type: 'info' });
    return;
  }

  if (!auth.canReviewSubmissions) {
    toast.addToast({ message: '仅审核员可执行审核操作', type: 'error' });
    return;
  }

  const actionLabel = action === 'approve' ? '通过' : '驳回';
  if (action === 'reject' && !reviewNote.value.trim()) {
    toast.addToast({ message: '驳回时请填写审核备注', type: 'error' });
    return;
  }
  const confirmed = globalThis.confirm(`确认${actionLabel}投稿《${selected.title}》吗？`);
  if (!confirmed) return;

  reviewActionLoading.value = true;
  try {
    const result = await sendReviewActionWithRetry(selected.id, action, reviewNote.value.trim(), selected.reviewVersion);
    const note = reviewNote.value.trim();
    toast.addToast({ message: `已${actionLabel}该投稿${reviewNotifyReceiptText(result?.notify)}`, type: 'success' });
    reviewedArchive.value.unshift({
      ...selected,
      result: action,
      reviewedAt: new Date().toLocaleString(),
      note: note || selected.note
    });
    reviewedArchive.value = reviewedArchive.value.slice(0, 100);
    localStorage.setItem(REVIEW_ARCHIVE_KEY, JSON.stringify(reviewedArchive.value));

    await fetchReviewSubmissions();
    reviewNote.value = '';
  } catch {
    toast.addToast({ message: '审核请求失败（已自动重试）', type: 'error' });
  } finally {
    reviewActionLoading.value = false;
  }
}

async function exportReviewLogsCsv() {
  if (!auth.canReviewSubmissions) {
    toast.addToast({ message: '仅审核员可导出审核日志', type: 'error' });
    return;
  }
  try {
    const response = await apiFetchWithAuth('/api/skins/submissions/audit-logs/export?limit=5000', null, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`bad_status_${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `starmc-review-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.addToast({ message: '导出审核日志失败', type: 'error' });
  }
}

async function loadMcAccountDashboard() {
  if (!isLoggedIn.value) return;
  mcAccountLoading.value = true;
  try {
    const [detailResp, profilesResp, eventsResp] = await Promise.all([
      apiJsonWithAuth<McAccountResponse>('/api/user/mc-account'),
      apiJsonWithAuth<McProfilesResponse>('/api/user/mc-profiles?limit=20'),
      apiJsonWithAuth<McSecurityEventsResponse>('/api/user/mc-security-events?limit=20'),
    ]);

    if (detailResp.response.status === 401 || profilesResp.response.status === 401 || eventsResp.response.status === 401) {
      auth.logout();
      return;
    }

    if (!detailResp.response.ok && !profilesResp.response.ok && !eventsResp.response.ok) {
      mcAccountDashboard.value = {
        linkedName: skinDashboard.value?.linkedMcUsername,
        linkedUuid: undefined,
        profileCount: 0,
        securityEventCount: 0,
      };
      mcProfiles.value = [];
      mcSecurityEvents.value = [];
      return;
    }

    const profileItems = profilesResp.data?.items || profilesResp.data?.profiles || [];
    const eventItems = eventsResp.data?.items || eventsResp.data?.events || [];

    mcProfiles.value = Array.isArray(profileItems) ? profileItems.slice(0, 5) : [];
    mcSecurityEvents.value = Array.isArray(eventItems) ? eventItems.slice(0, 5) : [];

    mcAccountDashboard.value = {
      linkedName:
        detailResp.data?.name ||
        detailResp.data?.username ||
        detailResp.data?.linkedMcUsername ||
        skinDashboard.value?.linkedMcUsername,
      linkedUuid: detailResp.data?.uuid || detailResp.data?.playerUuid,
      profileCount: Array.isArray(profileItems) ? profileItems.length : 0,
      securityEventCount: Array.isArray(eventItems) ? eventItems.length : 0,
      lastSecurityEventAt:
        Array.isArray(eventItems) && eventItems.length > 0
          ? String(eventItems[0]?.createdAt || eventItems[0]?.at || '')
          : undefined,
    };
  } catch {
    devWarn('mc account dashboard load failed');
  } finally {
    mcAccountLoading.value = false;
  }
}

async function loadPlayerSkinContext() {
  if (!isLoggedIn.value) return;
  try {
    const { response, data } = await apiJsonWithAuth<SkinDashboard>('/api/skins/player/dashboard');
    if (response.status === 401) {
      auth.logout();
      return;
    }
    if (!response.ok || !data) return;
    skinDashboard.value = data;
    if (data.applied) {
      appliedSkinAssetId.value = data.applied.skinAssetId || 0;
      appliedCapeAssetId.value = data.applied.capeAssetId || 0;
    }
    if (data.preview?.skinUrl) {
      currentSkinUrl.value = data.preview.skinUrl;
    } else {
      currentSkinUrl.value = '/image/steve.png';
    }
    currentCapeUrl.value = data.preview?.capeUrl || undefined;
    await loadMcAccountDashboard();
  } catch {
    devWarn('skin dashboard load failed');
  }
}

async function syncMojangSkin() {
  if (!isLoggedIn.value || mojangSyncLoading.value) return;
  mojangSyncLoading.value = true;
  try {
    const { response, data } = await apiJsonWithAuth<{ message?: string }>(
      '/api/skins/player/sync-mojang',
      null,
      {
        method: 'POST'
      }
    );
    if (!response.ok) {
      toast.addToast({ message: data.message || 'Mojang 同步失败', type: 'error' });
      return;
    }
    toast.addToast({ message: data.message || '已完成同步', type: 'success' });
    await refreshRealtimeSkinData();
  } catch {
    toast.addToast({ message: 'Mojang 同步请求失败', type: 'error' });
  } finally {
    mojangSyncLoading.value = false;
  }
}

const {
  catalog,
  catalogLoading,
  catalogFetchError,
  fetchCatalog,
  selectCatalogItem
} = useSkinCatalog({
  isLoggedIn: () => isLoggedIn.value,
  emailVerified: () => Boolean(skinDashboard.value?.emailVerified),
  onSelected: async () => {
    await loadPlayerSkinContext();
  }
});

const { applyAssetsToPlayer } = useSkinApply({
  isLoggedIn: () => isLoggedIn.value,
  userUuid: () => mcAccountDashboard.value?.linkedUuid ?? auth.user?.uuid,
  getAppliedAssetIds: () => ({
    skinAssetId: appliedSkinAssetId.value,
    capeAssetId: appliedCapeAssetId.value
  }),
  setAppliedAssetIds: (ids) => {
    appliedSkinAssetId.value = ids.skinAssetId;
    appliedCapeAssetId.value = ids.capeAssetId;
  },
  onApplied: async () => {
    await loadPlayerSkinContext();
  }
});

watch(
  isLoggedIn,
  async (loggedIn) => {
    await fetchCatalog();
    if (isReviewPreviewMode.value) {
      await fetchReviewSubmissions();
    }
    if (loggedIn) {
      await loadPlayerSkinContext();
    } else {
      skinDashboard.value = null;
      mcAccountDashboard.value = null;
      mcProfiles.value = [];
      mcSecurityEvents.value = [];
      appliedSkinAssetId.value = 0;
      appliedCapeAssetId.value = 0;
      currentSkinUrl.value = '/image/steve.png';
      currentCapeUrl.value = undefined;
    }
  },
  { immediate: true }
);

const realtimeRefreshing = ref(false);
let realtimeRefreshTimer: ReturnType<typeof setInterval> | null = null;

async function refreshRealtimeSkinData() {
  if (!isLoggedIn.value) return;
  if (realtimeRefreshing.value) return;
  realtimeRefreshing.value = true;
  try {
    await Promise.all([fetchCatalog(), loadPlayerSkinContext()]);
    if (isReviewPreviewMode.value) {
      await fetchReviewSubmissions();
    }
  } finally {
    realtimeRefreshing.value = false;
  }
}

const stopRealtimeRefreshTimer = () => {
  if (realtimeRefreshTimer) {
    clearInterval(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
};

const startRealtimeRefreshTimer = () => {
  stopRealtimeRefreshTimer();
  if (!isLoggedIn.value) return;
  realtimeRefreshTimer = setInterval(async () => {
    if (document.hidden) return;
    if (!isLoggedIn.value) return;
    await refreshRealtimeSkinData();
  }, realtimeRefreshIntervalMs);
};

const handleVisibilityRealtimeRefresh = async () => {
  if (!document.hidden && isLoggedIn.value) {
    await refreshRealtimeSkinData();
  }
};

watch(
  () => route.fullPath,
  async () => {
    if (isReviewPreviewMode.value) {
      await fetchReviewSubmissions();
      return;
    }
    if (isLoggedIn.value && (showSkinModeSections.value || showProfileModeSections.value)) {
      await refreshRealtimeSkinData();
    }
  },
  { immediate: true }
);

watch(reviewFilter, async () => {
  if (!isReviewPreviewMode.value) return;
  await fetchReviewSubmissions();
});

watch(
  () => [isLoggedIn.value, isReviewPreviewMode.value],
  () => {
    startRealtimeRefreshTimer();
  },
  { immediate: true }
);

const handleReviewShortcuts = (event: KeyboardEvent) => {
  if (!isReviewPreviewMode.value) return;
  if (!auth.canReviewSubmissions) return;
  if (!selectedReviewId.value) return;
  if (reviewActionLoading.value) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'a') {
    event.preventDefault();
    reviewAction('approve');
  }
  if (key === 'r') {
    event.preventDefault();
    reviewAction('reject');
  }
};

onMounted(async () => {
  globalThis.window.addEventListener('keydown', handleReviewShortcuts);
  document.addEventListener('visibilitychange', handleVisibilityRealtimeRefresh);

  const fromLibraryApplied = route.query.applied === '1' && route.query.from === 'library';
  if (fromLibraryApplied) {
    const appliedName = String(route.query.appliedName || '皮肤资源');
    let toastMsg = `已从皮肤库应用：${appliedName}`;
    const rawMsg = route.query.msg;
    if (typeof rawMsg === 'string' && rawMsg.trim()) {
      try {
        toastMsg = decodeURIComponent(rawMsg);
      } catch {
        toastMsg = rawMsg;
      }
    }
    toast.addToast({ message: toastMsg, type: 'success' });

    await nextTick();
    if (previewCardRef.value) {
      previewCardRef.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
      previewAppliedHighlight.value = true;
      globalThis.window.setTimeout(() => {
        previewAppliedHighlight.value = false;
      }, 1500);
    }

    const nextQuery = { ...route.query } as Record<string, unknown>;
    delete nextQuery.applied;
    delete nextQuery.from;
    delete nextQuery.appliedName;
    delete nextQuery.msg;
    router.replace({ path: route.path, query: nextQuery as Record<string, string> });
  }

  const featureData = await fetchJsonWithHealthFallback<{ reviewEntryEnabled?: boolean }>(
    '/api/public/site-features',
    { cache: 'no-store' },
    { reviewEntryEnabled: false }
  );
  reviewEntryEnabled.value = Boolean(featureData?.reviewEntryEnabled);

  if (!reviewEntryEnabled.value) {
    // 审核入口关闭时退出 review-preview 查询参数，避免触发只读 computed 赋值错误。
    if (route.query.mode === 'review-preview') {
      const nextQuery = { ...route.query } as Record<string, unknown>;
      delete nextQuery.mode;
      router.replace({ path: route.path, query: nextQuery as Record<string, string> });
    }
  }

  const reviewArchiveRaw = localStorage.getItem(REVIEW_ARCHIVE_KEY);
  if (reviewArchiveRaw) {
    try {
      reviewedArchive.value = JSON.parse(reviewArchiveRaw) as ReviewedArchiveItem[];
    } catch {
      reviewedArchive.value = [];
    }
  }

  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw) {
    try {
      uploadHistory.value = JSON.parse(raw) as UploadRecord[];
    } catch {
      uploadHistory.value = [];
    }
  }
  const parallelismRaw = localStorage.getItem(PARALLELISM_KEY);
  if (parallelismRaw === '2') uploadConcurrency.value = 2;
  const priorityRaw = localStorage.getItem(PRIORITY_MODE_KEY);
  if (priorityRaw === 'retry-first' || priorityRaw === 'new-first') {
    queuePriorityMode.value = priorityRaw;
  }

  const queueRaw = localStorage.getItem(QUEUE_SNAPSHOT_KEY);
  if (queueRaw) {
    try {
      const snapshot = JSON.parse(queueRaw) as Array<{ fileName: string; status: string }>;
      if (snapshot.length > 0) {
        toast.addToast({ message: `检测到上次会话队列快照 ${snapshot.length} 条（仅审计，不自动续传）`, type: 'info' });
      }
    } catch {
      // ignore invalid snapshot
    }
  }

  // 通过 session（HTTP-only Cookie）恢复登录态：启动时总是尝试拉一次 /api/user/me
  // - 200：写入 user
  // - 401：确保退出
  // - 其它错误：保持当前 UI（降级模式）
  try {
    const { response, data } = await apiJsonWithAuth<{ user?: unknown }>('/api/user/me');
    if (response.ok) {
      auth.setUser(toAuthUser(data?.user));
    } else if (response.status === 401) {
      auth.logout();
    }
  } catch {
    devWarn('Initial session check failed');
  }
});

watch(
  uploadQueue,
  (queue) => {
    const snapshot = queue.map((item) => ({ fileName: item.fileName, status: item.status }));
    localStorage.setItem(QUEUE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  },
  { deep: true }
);
watch(uploadConcurrency, (val) => {
  localStorage.setItem(PARALLELISM_KEY, String(val));
  processQueue();
});
watch(queuePriorityMode, (val) => {
  localStorage.setItem(PRIORITY_MODE_KEY, val);
  processQueue();
});

// 切换到验证码登录时重置表单
watch(authMode, (mode) => {
  if (mode === 'verifyCode') {
    verifyCodeForm.code = '';
    verifyCodeForm.email = '';
    verifyCodeForm.password = '';
    verifyCodeForm.challengeId = '';
    verifyCodeMsg.value = '';
    verifyCodeError.value = false;
  }
});

onBeforeUnmount(() => {
  globalThis.window.removeEventListener('keydown', handleReviewShortcuts);
  document.removeEventListener('visibilitychange', handleVisibilityRealtimeRefresh);
  stopRealtimeRefreshTimer();
  if (verifyCodeTimer) clearInterval(verifyCodeTimer);
});


const submitAuthRequest = async (mode: 'login' | 'register', username: string, password: string, email?: string) => {
  const normalizedEmail = String(email || '').trim() || `${String(username || '').trim()}@starmc.local`;
  const payload = {
    formFields: [
      { id: 'email', value: normalizedEmail },
      { id: 'password', value: password },
    ],
  };

  // 先探测后端认证能力，避免在未配置 SuperTokens 时反复打到 /auth/signin / /auth/signup 并刷出 500。
  const statusResp = await fetch('/api/auth/status', { credentials: 'include' }).catch(() => null);
  const status = statusResp ? await statusResp.json().catch(() => null) : null;
  if (!statusResp || !statusResp.ok || !status?.supertokens) {
    const fallbackData = { status: 'GENERAL_ERROR', message: status?.message || '登录服务未就绪' };
    return {
      response: {
        ok: false,
        status: 503,
      } as Response,
      data: fallbackData,
    };
  }

  const endpoint = mode === 'login' ? '/auth/signin' : '/auth/signup';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const syncMeAfterAuth = async () => {
  const { response: meResp, data: me } = await apiJsonWithAuth<unknown>('/api/user/me');
  if (meResp.ok) {
    auth.setUser(toAuthUser(extractUserPayload(me)));
  }
};

const handleAuth = async () => {
  isSubmitting.value = true;
  try {
    const { response, data } = await submitAuthRequest(
      authMode.value as 'login' | 'register',
      authForm.value.username,
      authForm.value.password,
      authForm.value.email
    );

    if (!response.ok || data?.status === 'FIELD_ERROR' || data?.status === 'WRONG_CREDENTIALS_ERROR') {
      const reason = data?.message || data?.formFields?.[0]?.error || data?.error || '认证失败';
      toast.addToast({ message: reason, type: 'error' });
      return;
    }

    // 登录成功后，SuperTokens 会通过 HTTP-only Cookie 自动管理 session
    // 不再需要手动存储 token

    try {
      await syncMeAfterAuth();
    } catch {
      // ignore user profile fetch errors
    }

    toast.addToast({ message: '登录成功', type: 'success' });
  } catch {
    toast.addToast({ message: '网络请求失败，请检查后端服务状态', type: 'error' });
  } finally {
    isSubmitting.value = false;
  }
};

const handleDemoLogin = async () => {
  if (!isDev) return;
  isSubmitting.value = true;
  try {
    const seed = Math.floor(Date.now() / 1000).toString(36).slice(-5);
    const username = `demo_${seed}`;
    const password = 'demo123456';
    const email = `${username}@starmc.local`;

    let result = await submitAuthRequest('register', username, password, email);

    if (
      !result.response.ok ||
      result.data?.status === 'FIELD_ERROR' ||
      result.data?.status === 'EMAIL_ALREADY_EXISTS_ERROR'
    ) {
      result = await submitAuthRequest('login', username, password, email);
    }

    if (!result.response.ok || result.data?.status === 'WRONG_CREDENTIALS_ERROR') {
      // SuperTokens 未就绪时（/auth 404），回退到开发本地登录
      if (result.response.status === 404) {
        auth.setUser({
          uuid: `demo-${seed}`,
          username,
          email,
          role: 'admin',
          roles: ['admin']
        });
        authMode.value = 'login';
        authForm.value.username = username;
        authForm.value.password = password;
        authForm.value.email = email;
        toast.addToast({ message: `已使用演示账号登录（开发兜底）：${username}`, type: 'success' });
        return;
      }
      const reason = result.data?.message || result.data?.error || '演示登录失败';
      toast.addToast({ message: reason, type: 'error' });
      return;
    }

    try {
      await syncMeAfterAuth();
    } catch {
      // ignore
    }

    authMode.value = 'login';
    authForm.value.username = username;
    authForm.value.password = password;
    authForm.value.email = email;
    toast.addToast({ message: `已使用演示账号登录：${username}`, type: 'success' });
  } catch {
    toast.addToast({ message: '演示登录失败，请检查后端服务', type: 'error' });
  } finally {
    isSubmitting.value = false;
  }
};

// 验证码登录
let verifyCodeTimer: ReturnType<typeof setInterval> | null = null;

const sendVerifyCode = async () => {
  const email = verifyCodeForm.email.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    verifyCodeMsg.value = '请输入有效的邮箱地址';
    verifyCodeError.value = true;
    return;
  }

  isSendingCode.value = true;
  verifyCodeMsg.value = '';
  verifyCodeError.value = false;

  try {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const resp = await fetch(`${apiBase}/api/auth/verify-code/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        mode: verifyCodeMode.value
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      verifyCodeMsg.value = data.message || '发送失败，请稍后重试';
      verifyCodeError.value = true;
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '60', 10);
        verifyCodeCountdown.value = retryAfter;
        startVerifyCodeCountdown();
      }
      return;
    }

    verifyCodeMsg.value = data.message || '验证码已发送';
    verifyCodeError.value = false;
    verifyCodeCountdown.value = 60;
    verifyCodeForm.challengeId = data.challengeId || '';
    startVerifyCodeCountdown();
  } catch {
    verifyCodeMsg.value = '网络错误，请检查网络连接';
    verifyCodeError.value = true;
  } finally {
    isSendingCode.value = false;
  }
};

const startVerifyCodeCountdown = () => {
  if (verifyCodeTimer) clearInterval(verifyCodeTimer);
  verifyCodeTimer = setInterval(() => {
    if (verifyCodeCountdown.value > 0) {
      verifyCodeCountdown.value--;
    } else {
      if (verifyCodeTimer) clearInterval(verifyCodeTimer);
    }
  }, 1000);
};

const handleVerifyCodeAuth = async () => {
  isSubmitting.value = true;
  verifyCodeMsg.value = '';
  verifyCodeError.value = false;

  try {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const resp = await fetch(`${apiBase}/api/auth/verify-code/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: verifyCodeForm.challengeId,
        email: verifyCodeForm.email.trim(),
        code: verifyCodeForm.code.trim(),
        password: verifyCodeForm.password,
        mode: verifyCodeMode.value
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      const attemptsLeft = typeof data.attemptsLeft === 'number' ? data.attemptsLeft : null;
      if (attemptsLeft !== null && attemptsLeft > 0) {
        verifyCodeMsg.value = `${data.message || '验证码错误'}，还剩 ${attemptsLeft} 次机会`;
      } else {
        verifyCodeMsg.value = data.message || '验证失败，请检查验证码';
      }
      verifyCodeError.value = true;
      toast.addToast({ message: data.message || '验证失败', type: 'error' });
      return;
    }

    toast.addToast({ message: data.message || '登录成功', type: 'success' });

    // SuperTokens Session 已通过 HTTP-only cookie 自动设置
    // 调用 syncMeAfterAuth 获取用户信息（会自动使用 session cookie）
    try {
      await syncMeAfterAuth();
    } catch (syncErr) {
      // 如果 syncMeAfterAuth 失败，忽略（session cookie 已设置）
    }

    // 清除表单
    verifyCodeForm.code = '';
    verifyCodeForm.password = '';
    verifyCodeForm.challengeId = '';
  } catch {
    verifyCodeMsg.value = '网络错误，请检查网络连接';
    verifyCodeError.value = true;
    toast.addToast({ message: '网络错误', type: 'error' });
  } finally {
    isSubmitting.value = false;
  }
};

const fileInput = ref<HTMLInputElement | null>(null);
const triggerFileInput = () => fileInput.value?.click();

const readImageDimension = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.width, height: image.height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸'));
    };
    image.src = url;
  });
};

const validateUploadFile = async (file: File) => {
  if (file.type !== 'image/png') {
    return '仅支持 PNG 文件';
  }
  if (file.size > 2 * 1024 * 1024) {
    return '文件过大，请控制在 2MB 内';
  }
  const { width, height } = await readImageDimension(file);
  const validDims = (width === 64 && height === 64) || (width === 64 && height === 32);
  if (!validDims) {
    return '图片尺寸需为 64x64 或 64x32';
  }
  return '';
};

const formatSize = (size: number) => `${(size / 1024).toFixed(1)} KB`;

const saveHistory = () => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(uploadHistory.value));
};

const clearHistory = () => {
  uploadHistory.value = [];
  saveHistory();
  toast.addToast({ message: '上传记录已清空', type: 'info' });
};

const exportHistoryCsv = () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday=0
  const thisWeekStart = startOfToday - dayOfWeek * 86400000;
  const lastWeekStart = thisWeekStart - 7 * 86400000;
  const last7DaysStart = now.getTime() - 7 * 86400000;
  const rangeStart = reportRange.value === 'thisWeek'
    ? thisWeekStart
    : reportRange.value === 'lastWeek'
      ? lastWeekStart
      : last7DaysStart;
  const rangeEnd = reportRange.value === 'lastWeek' ? thisWeekStart : now.getTime();

  const weeklyRecords = uploadHistory.value.filter((item) => {
    const ts = item.createdTs || Date.parse(item.createdAt) || 0;
    if (!ts) return false;
    return ts >= rangeStart && ts < rangeEnd;
  });
  const weeklyTotal = weeklyRecords.length;
  const weeklySuccess = weeklyRecords.filter((item) => (item.status || 'success') === 'success').length;
  const weeklySla = weeklyTotal ? Math.round((weeklySuccess / weeklyTotal) * 100) : 0;
  const weeklyFailureMap = new Map<string, number>();
  weeklyRecords.forEach((item) => {
    if (item.status !== 'error') return;
    const code = String(item.httpStatus || 0);
    weeklyFailureMap.set(code, (weeklyFailureMap.get(code) || 0) + 1);
  });
  const weeklyFailureSummary = Array.from(weeklyFailureMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${code === '0' ? '网络/中断' : `HTTP ${code}`}:${count}`)
    .join('; ') || '无';
  const rangeLabel = reportRange.value === 'thisWeek'
    ? '本周'
    : reportRange.value === 'lastWeek'
      ? '上周'
      : '最近7天';
  const contextRows = [
    ['周报周期', `${rangeLabel} (${new Date(rangeStart).toLocaleDateString()} - ${new Date(rangeEnd).toLocaleDateString()})`],
    ['SLA(成功率)', `${weeklySla}% (${weeklySuccess}/${weeklyTotal})`],
    ['失败分布摘要', weeklyFailureSummary],
    ['账号', auth.user?.username || '未登录'],
    ['筛选类型', historyFilter.value === 'all' ? '全部' : historyFilter.value === 'skin' ? '仅皮肤' : '仅披风'],
    ['搜索关键词', historySearch.value || '（空）'],
    ['导出时间', new Date().toLocaleString()]
  ];
  const headers = ['类型', '文件名', '尺寸', '体积', '时间'];
  const rows = searchedUploadHistory.value.map((item) => [
    item.type === 'skin' ? '皮肤' : '披风',
    item.fileName,
    item.dimension,
    item.sizeLabel,
    item.createdAt,
    item.status || 'success',
    item.httpStatus || 0,
    item.errorMessage || ''
  ]);
  const extendedHeaders = [...headers, '状态', 'HTTP状态', '错误信息'];
  const csv = [...contextRows, [], extendedHeaders, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `starmc-skin-weekly-report-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const pushHistory = async (
  file: File,
  status: 'success' | 'error' | 'canceled',
  httpStatus: number,
  errorMessage = ''
) => {
  const { width, height } = await readImageDimension(file);
  uploadHistory.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: uploadType.value,
    fileName: file.name,
    dimension: `${width}x${height}`,
    sizeLabel: formatSize(file.size),
    createdAt: new Date().toLocaleString(),
    createdTs: Date.now(),
    status,
    httpStatus,
    errorMessage
  });
  uploadHistory.value = uploadHistory.value.slice(0, 120);
  saveHistory();
};

const mapUploadError = (status: number, message?: string) => {
  if (status === 0) return '网络连接失败，请检查网络或后端服务';
  if (status === 401) return '登录状态失效，请重新登录后上传';
  if (status === 413) return '文件过大，服务器拒绝（413）';
  if (status === 415) return '文件格式不被服务器接受（415）';
  if (status === 422) return message || '文件内容校验失败（422）';
  if (status >= 500) return '服务器繁忙，请稍后重试';
  return message || `上传失败（HTTP ${status}）`;
};

const setTaskStatus = (taskId: string, status: UploadTask['status']) => {
  const task = uploadQueue.value.find((item) => item.id === taskId);
  if (task) task.status = status;
};

const clearFinishedTasks = () => {
  uploadQueue.value = uploadQueue.value.filter((task) => task.status === 'pending' || task.status === 'uploading');
};

const uploadFile = async (file: File, taskId?: string) => {
  if (isReviewPreviewMode.value) {
    toast.addToast({ message: '当前为审核预览模式，已禁用上传', type: 'info' });
    if (taskId) setTaskStatus(taskId, 'canceled');
    return;
  }

  const startedAt = performance.now();
  uploadError.value = '';
  uploadStatus.value = 'idle';
  selectedFileName.value = file.name;
  const validateError = await validateUploadFile(file);
  if (validateError) {
    uploadError.value = validateError;
    uploadStatus.value = 'error';
    if (taskId) setTaskStatus(taskId, 'error');
    toast.addToast({ message: validateError, type: 'error' });
    return;
  }

  if (!isLoggedIn.value || !auth.user?.uuid) {
    const msg = '请先登录后再上传';
    uploadError.value = msg;
    uploadStatus.value = 'error';
    if (taskId) setTaskStatus(taskId, 'error');
    toast.addToast({ message: msg, type: 'error' });
    return;
  }

  isUploading.value = true;
  activeUploads.value += 1;
  if (taskId) setTaskStatus(taskId, 'uploading');
  uploadStatus.value = 'uploading';
  uploadProgress.value = 0;
  lastFailedFile.value = null;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', uploadType.value);
  formData.append('uuid', auth.user?.uuid || '');
  if (uploadType.value === 'skin') {
    formData.append('model', skinModel.value);
  }

  try {
    const endpoint = uploadType.value === 'skin' ? '/api/skin/upload' : '/api/skin/upload-cape';
    const result = await new Promise<{
      ok: boolean;
      data: { url?: string; assetId?: number; message?: string };
      status: number;
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      if (taskId) activeXhrMap.set(taskId, xhr);
      xhr.open('POST', endpoint, true);
      // HTTP-only Cookie 模式下，Cookie 会自动发送
      // 传入 null 保留必要的 SuperTokens headers
      applySuperTokensAuthHeadersToXhr(xhr, null);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          uploadProgress.value = Math.min(99, Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, data, status: xhr.status });
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.onabort = () => reject(new Error('上传已取消'));
      xhr.send(formData);
    });

    uploadProgress.value = 100;
    if (result.ok) {
      const assetId = Number(result.data.assetId) || 0;
      const url =
        typeof result.data.url === 'string' && result.data.url.trim()
          ? result.data.url.trim()
          : '';
      if (uploadType.value === 'skin') {
        if (url) currentSkinUrl.value = url;
        const appliedOk = await applyAssetsToPlayer({ skinAssetId: assetId }, { quiet: true });
        if (appliedOk) {
          toast.addToast({ message: '上传成功并已应用到当前角色', type: 'success' });
        }
      } else {
        if (url) currentCapeUrl.value = url;
        const appliedOk = await applyAssetsToPlayer({ capeAssetId: assetId }, { quiet: true });
        if (appliedOk) {
          toast.addToast({ message: '披风上传成功并已应用', type: 'success' });
        }
      }
      await refreshRealtimeSkinData();
      uploadStatus.value = 'success';
      if (taskId) setTaskStatus(taskId, 'success');
      await pushHistory(file, 'success', result.status);
    } else {
      const msg = mapUploadError(result.status, result.data?.message);
      uploadError.value = msg;
      uploadStatus.value = 'error';
      lastFailedFile.value = file;
      if (taskId) setTaskStatus(taskId, 'error');
      await pushHistory(file, 'error', result.status, msg);
      toast.addToast({ message: msg, type: 'error' });
    }
  } catch (e) {
    const isAbort = e instanceof Error && e.message.includes('取消');
    uploadError.value = isAbort ? '上传已取消' : mapUploadError(0);
    uploadStatus.value = isAbort ? 'idle' : 'error';
    lastFailedFile.value = isAbort ? null : file;
    if (taskId) setTaskStatus(taskId, isAbort ? 'canceled' : 'error');
    await pushHistory(
      file,
      isAbort ? 'canceled' : 'error',
      0,
      isAbort ? '用户取消上传' : uploadError.value
    );
    if (!isAbort) {
      toast.addToast({ message: '上传失败', type: 'error' });
    }
  } finally {
    if (taskId) activeXhrMap.delete(taskId);
    activeUploads.value = Math.max(0, activeUploads.value - 1);
    isUploading.value = activeUploads.value > 0;
    setTimeout(() => {
      if (activeUploads.value === 0) uploadProgress.value = 0;
    }, 800);
    if (fileInput.value) {
      fileInput.value.value = '';
    }
    processQueue();
  }
};

const processQueue = async () => {
  if (processingQueue.value) return;
  processingQueue.value = true;
  try {
    while (activeUploads.value < uploadConcurrency.value) {
      const pendingTasks = uploadQueue.value.filter((task) => task.status === 'pending');
      if (pendingTasks.length === 0) break;
      let nextTask: UploadTask | undefined;
      if (queuePriorityMode.value === 'retry-first') {
        const retried = pendingTasks
          .filter((task) => task.retryCount > 0)
          .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
        nextTask = retried[0] || pendingTasks.sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0];
      } else {
        nextTask = pendingTasks.sort((a, b) => b.enqueuedAt - a.enqueuedAt)[0];
      }
      if (!nextTask) break;
      uploadFile(nextTask.file, nextTask.id);
    }
  } finally {
    processingQueue.value = false;
  }
};

const enqueueFiles = async (files: File[]) => {
  if (!files.length) return;
  if (isReviewPreviewMode.value) {
    toast.addToast({ message: '当前为审核预览模式，不能加入上传队列', type: 'info' });
    return;
  }
  uploadQueue.value.push(
    ...files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      fileName: file.name,
      status: 'pending' as const,
      enqueuedAt: Date.now(),
      retryCount: 0
    }))
  );
  await processQueue();
};

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files ? Array.from(target.files) : [];
  if (!files.length) return;
  await enqueueFiles(files);
};

const onDragOver = () => {
  if (!isUploading.value) {
    isDragOver.value = true;
  }
};

const onDragLeave = () => {
  isDragOver.value = false;
};

const onDrop = async (event: DragEvent) => {
  isDragOver.value = false;
  if (isUploading.value) return;
  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (!files.length) return;
  await enqueueFiles(files);
};

const retryLastUpload = async () => {
  if (!lastFailedFile.value || isUploading.value) return;
  await enqueueFiles([lastFailedFile.value]);
};

const cancelTask = (taskId: string) => {
  const runningXhr = activeXhrMap.get(taskId);
  if (runningXhr) {
    runningXhr.abort();
    setTaskStatus(taskId, 'canceled');
    return;
  }
  setTaskStatus(taskId, 'canceled');
};

const retryTask = async (taskId: string) => {
  const task = uploadQueue.value.find((item) => item.id === taskId);
  if (!task || isUploading.value) return;
  task.status = 'pending';
  task.retryCount += 1;
  await processQueue();
};

const retryAllFailedTasks = async () => {
  let changed = 0;
  uploadQueue.value.forEach((task) => {
    if (task.status === 'error') {
      task.status = 'pending';
      task.retryCount += 1;
      changed++;
    }
  });
  if (changed > 0) {
    toast.addToast({ message: `已重试 ${changed} 个失败任务`, type: 'info' });
    await processQueue();
  }
};


</script>

<style scoped lang="scss">
.skin-station-view {
  min-height: 100vh;
  padding-top: 132px;
  background: radial-gradient(circle at top right, #1a1a2e 0%, #16213e 50%, #0f0f1b 100%);
  position: relative;
  overflow-x: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CiAgPGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz4KPC9zdmc+');
    z-index: 0;
  }
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  position: relative;
  z-index: 1;
}

.station-header {
  text-align: center;
  margin-bottom: 3rem;

  h1 {
    font-size: clamp(2rem, 4vw, 2.8rem);
    color: #fff;
    font-weight: 800;
  }

  .subtitle {
    color: #888;
    font-size: 1.1rem;
    margin-top: 1rem;
  }
}

.mode-chip {
  margin: 0 auto 0.8rem;

  &.is-profile {
    border-color: rgba(99, 102, 241, 0.45);
    color: #c7d2fe;
  }

  &.is-review {
    border-color: rgba(59, 130, 246, 0.45);
    color: #bfdbfe;
  }

  &.is-station {
    border-color: rgba(74, 222, 128, 0.36);
    color: #bbf7d0;
  }
}

.mode-chip-link.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.station-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 3rem;

  &.no-preview {
    grid-template-columns: 1fr;
  }

  @media (max-width: 992px) {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}

.glass-card {
  background: var(--surface-2);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-3);
  padding: 2rem;
  box-shadow: var(--shadow-1);
}

.card-title {
  font-size: 1.1rem;
  color: var(--text-primary);
  margin-bottom: 1.2rem;
  display: flex;
  align-items: center;
  gap: 12px;

  .heading-icon {
    color: var(--brand-primary, #6366f1);
    flex-shrink: 0;
  }
}

.card-desc {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  font-size: 0.95rem;
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-card {
  position: sticky;
  top: 110px;
}

.preview-card.is-applied-highlight {
  animation: preview-applied-glow 1.5s ease;
}

@keyframes preview-applied-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.65), var(--shadow-1);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.18), var(--shadow-1);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0), var(--shadow-1);
  }
}

.library-entry-card {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: transform var(--motion-fast, 160ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

.library-entry-card:hover {
  transform: translateY(-2px);
}

.library-entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.library-entry-head .card-title {
  margin-bottom: 0;
}

.library-entry-arrow {
  color: var(--text-muted);
}

.library-entry-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preview-meta {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.meta-pill {
  font-size: 0.78rem;
}

.meta-pill.starmc-meta-pill {
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
}

.pill-icon.starmc-pill-icon {
  color: var(--text-muted);
}

.heading-icon {
  flex-shrink: 0;
  vertical-align: middle;
}

.page-hero__title .heading-icon {
  color: var(--brand-primary, #6366f1);
}

.inline-warn-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: #fda4af;
}

/* Auth Styles */
.auth-required {
  text-align: center;
  position: relative;
  isolation: isolate;
  overflow: hidden;

  .auth-ambient {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }

  .ambient-orb {
    position: absolute;
    border-radius: 999px;
    filter: blur(20px);
    opacity: 0.45;
    animation: orb-float 6s ease-in-out infinite;
  }

  .orb-a {
    width: 160px;
    height: 160px;
    top: -48px;
    left: -36px;
    background: radial-gradient(circle, rgba(179, 255, 122, 0.58) 0%, rgba(179, 255, 122, 0) 70%);
  }

  .orb-b {
    width: 190px;
    height: 190px;
    right: -50px;
    bottom: -70px;
    background: radial-gradient(circle, rgba(127, 182, 255, 0.52) 0%, rgba(127, 182, 255, 0) 72%);
    animation-delay: 1.8s;
  }

  .ambient-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(233, 255, 202, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(233, 255, 202, 0.08) 1px, transparent 1px);
    background-size: 14px 14px;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.28) 100%);
  }


  .lock-icon {
    display: block;
    margin: 0 auto 1.2rem;
    color: rgba(233, 255, 204, 0.68);
    filter: drop-shadow(0 0 8px rgba(182, 255, 118, 0.3));
  }

  h3 {
    color: var(--text-primary);
    margin-bottom: 0.5rem;
    font-size: 1.08rem;
  }

  p {
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }
}

@keyframes orb-float {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(0, -8px, 0) scale(1.04); }
}

.auth-intro {
  opacity: 0;
  transform: translateY(8px);
  animation: auth-intro-in 420ms steps(10) forwards;
}

.intro-1 { animation-delay: 30ms; }
.intro-2 { animation-delay: 90ms; }
.intro-3 { animation-delay: 150ms; }
.intro-4 { animation-delay: 210ms; }
.intro-5 { animation-delay: 270ms; }

@keyframes auth-intro-in {
  0% {
    opacity: 0;
    transform: translateY(8px);
    filter: saturate(0.9) brightness(0.92);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    filter: saturate(1) brightness(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-required,
  .auth-intro,
  .ambient-orb,
  .auth-submit-btn::before {
    animation: none !important;
    transition: none !important;
  }

  .auth-intro {
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }
}

.reset-notice {
  margin: 0 0 1rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: var(--radius-2);
  background: rgba(99, 102, 241, 0.1);
  color: var(--text-secondary);
  font-size: 0.88rem;
}

.reset-link {
  color: var(--brand-primary, #6366f1);
  font-size: 0.9rem;
  text-decoration: none;
}

.reset-link:hover {
  text-decoration: underline;
}

.auth-benefits {
  text-align: left;
  margin: 0 0 1.2rem;
  padding: 0.8rem 1rem 0.8rem 1.2rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-size: 0.9rem;

  li { margin-bottom: 0.35rem; }
}

.auth-tabs, .upload-tabs {
  display: flex;
  background: linear-gradient(180deg, rgba(21, 34, 16, 0.88), rgba(15, 24, 12, 0.92));
  padding: 5px;
  border-radius: 0;
  margin-bottom: 1.4rem;
  border: 2px solid #1c2b15;
  box-shadow: inset 0 1px 0 rgba(236, 255, 214, 0.18);
}

.tab-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: #bdd4a4;
  padding: 10px;
  border-radius: 0;
  cursor: pointer;
  transition: transform 120ms steps(2), filter 120ms steps(2), background-color 120ms steps(2);
  font-weight: 600;

  &:hover {
    filter: brightness(1.08);
  }

  &.active {
    background: linear-gradient(180deg, #98cb63 0%, #6a973d 100%);
    color: #efffd5;
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.24), inset 0 -2px 0 rgba(0, 0, 0, 0.28);
  }
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dev-auth-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 34px;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 208, 128, 0.45);
  background: linear-gradient(180deg, rgba(120, 79, 18, 0.42) 0%, rgba(84, 54, 8, 0.5) 100%);
  color: #ffe9bf;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-align: center;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
}

.auth-submit-btn {
  position: relative;
  overflow: hidden;
  transform: translateY(0);
  transition: transform 120ms steps(2), filter 120ms steps(2), box-shadow 120ms steps(2);
}

.auth-submit-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.24) 50%, rgba(255, 255, 255, 0) 80%);
  transform: translateX(-120%);
  animation: submit-shimmer 2.8s steps(24) infinite;
  pointer-events: none;
}

.auth-submit-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.auth-submit-btn:active {
  transform: translateY(2px);
}

.auth-submit-btn:disabled {
  filter: grayscale(0.15) brightness(0.9);
}

.auth-submit-btn:disabled::before {
  animation-duration: 4.5s;
  opacity: 0.45;
}

.demo-login-btn {
  margin-top: 0.15rem;
  border-color: rgba(198, 214, 255, 0.42);
  background: linear-gradient(180deg, rgba(82, 111, 186, 0.9) 0%, rgba(54, 80, 150, 0.95) 100%);
}

.demo-login-btn:hover {
  filter: brightness(1.08);
}

/* GitHub OAuth 登录按钮 */
.oauth-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.2rem 0 0.8rem;
  color: var(--text-muted, #9ca3af);
  font-size: 0.8rem;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.12);
  }
}

.github-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(36, 41, 46, 0.95);
  color: #ffffff;
  font-weight: 500;
  transition: all 200ms ease;

  &:hover {
    background: rgba(66, 72, 77, 0.98);
    border-color: rgba(255, 255, 255, 0.35);
    transform: translateY(-1px);
  }

  .oauth-icon {
    font-size: 18px;
  }
}

.oauth-note {
  margin-top: 0.6rem;
  font-size: 0.72rem;
  color: var(--text-muted, #9ca3af);
  text-align: center;
  line-height: 1.4;
}

/* 验证码登录样式 */
.verify-code-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.verify-code-input {
  flex: 1;
  min-width: 0;
}

.verify-code-btn {
  flex-shrink: 0;
  min-width: 100px;
  font-size: 0.8rem;
  padding: 0 0.75rem;
  white-space: nowrap;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* 密码强度指示器 */
.password-strength {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.375rem;
}

.strength-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.strength-label {
  font-size: 0.75rem;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 2rem;
}

.verify-code-msg {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
  text-align: center;

  &.error {
    color: #f87171;
  }
}

.verify-code-toggle {
  margin-top: 0.75rem;
  text-align: center;
}

.toggle-btn {
  background: none;
  border: none;
  color: var(--link-color, #60a5fa);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.25rem;
  transition: opacity 200ms;

  &:hover {
    opacity: 0.8;
  }
}

@keyframes submit-shimmer {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(130%); }
}

.input-group {
  position: relative;

  &::after {
    content: '';
    position: absolute;
    right: 10px;
    top: 50%;
    width: 8px;
    height: 8px;
    transform: translateY(-50%);
    background: #5e744b;
    border: 1px solid #2c3e23;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  }

  &:has(input:focus)::after {
    background: #f4ff8a;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 8px rgba(244, 255, 138, 0.55);
  }

  &:has(input:required:valid)::after {
    background: #9ef07f;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 8px rgba(158, 240, 127, 0.5);
  }
}

.input-group input, .model-select select {
  width: 100%;
  background: linear-gradient(180deg, #2f4624 0%, #273a1f 100%);
  border: 2px solid #1f2f18;
  padding: 12px 28px 12px 14px;
  border-radius: 0;
  color: #f4ffe3;
  outline: none;
  transition: border-color 120ms steps(2), filter 120ms steps(2), transform 120ms steps(2);
  box-shadow: inset 0 1px 0 rgba(238, 255, 215, 0.15);

  &:focus {
    border-color: #b8e183;
    filter: brightness(1.06);
    transform: translateY(-1px);
    background: linear-gradient(180deg, #365028 0%, #2b4121 100%);
  }

  &:focus-visible {
    outline: 2px solid #cbef92;
    outline-offset: 2px;
  }
}

/* Upload Styles */
.dropzone {
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  padding: 3rem;
  text-align: center;
  cursor: pointer;
  transition: all var(--motion-fast, 160ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
  margin-bottom: 1.5rem;

  &:hover {
    border-color: var(--brand-primary, #6366f1);
    background: rgba(255, 255, 255, 0.05);
  }

  .upload-icon {
    display: block;
    margin: 0 auto 1rem;
    color: #555;
  }

  p { color: var(--text-primary); }
  .hint { color: var(--text-muted); font-size: 0.8rem; margin-top: 5px; display: block; }
  .selected-file {
    display: block;
    margin-top: 0.4rem;
    color: var(--text-secondary);
    font-size: 0.8rem;
  }
}

.dropzone.is-dragover {
  border-color: var(--brand-primary, #6366f1);
  background: rgba(99, 102, 241, 0.12);
}

.dropzone.is-uploading {
  cursor: wait;
  opacity: 0.8;
}

.upload-progress {
  margin-bottom: 0.8rem;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
}

.progress-track {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 180ms linear;
}

.upload-error {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  margin: 0 0 0.8rem;
  color: #fda4af;
  font-size: 0.84rem;
}

.upload-queue {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, 0.02);
  padding: 0.65rem 0.8rem;
  margin-bottom: 0.8rem;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 0.78rem;
  margin-bottom: 0.45rem;
}

.queue-header-actions {
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  flex-wrap: wrap;
}

.queue-tip {
  color: var(--text-muted);
  font-size: 0.72rem;
  white-space: nowrap;
}

.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.queue-item {
  align-items: center;
  gap: 0.75rem;
}

.queue-item__main {
  min-width: 0;
}

.queue-right {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.queue-name {
  color: var(--text-primary);
  font-size: 0.82rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-state {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.queue-state.is-uploading { color: #bfdbfe; }
.queue-state.is-success { color: #bbf7d0; }
.queue-state.is-error { color: #fecaca; }
.queue-state.is-canceled { color: #cbd5e1; }

.queue-btn {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  padding: 0.08rem 0.36rem;
  font-size: 0.72rem;
  cursor: pointer;
}

.dashboard-status {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.mc-dashboard-panel {
  border: 1px solid rgba(133, 173, 255, 0.28);
  border-radius: 10px;
  padding: 0.8rem;
  background: linear-gradient(180deg, rgba(23, 36, 64, 0.5) 0%, rgba(14, 22, 40, 0.55) 100%);
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-header {
  font-size: 0.86rem;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.detail-list-wrap {
  border: 1px dashed rgba(170, 196, 255, 0.3);
  border-radius: 8px;
  padding: 0.62rem 0.7rem;
  background: rgba(9, 14, 26, 0.35);
}

.detail-list-title {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.46rem;
}

.detail-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.detail-item {
  gap: 0.18rem;
  padding-bottom: 0;
}

.detail-item.is-anomaly {
  background: rgba(255, 80, 80, 0.12);
  border-left: 3px solid rgba(255, 110, 110, 0.8);
  padding-left: 0.45rem;
}

.status-block.risk-low {
  border-color: rgba(95, 220, 140, 0.55);
  background: rgba(32, 96, 58, 0.38);
}

.status-block.risk-medium {
  border-color: rgba(245, 198, 94, 0.62);
  background: rgba(120, 90, 24, 0.4);
}

.status-block.risk-high {
  border-color: rgba(246, 110, 110, 0.68);
  background: rgba(122, 35, 35, 0.45);
}

.detail-item-main {
  font-size: 0.82rem;
  color: var(--text-primary);
}

.detail-item-sub {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.detail-empty {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.76rem;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  padding: 0.65rem 0.8rem;
  margin-bottom: 0.9rem;
  color: var(--text-secondary);
  font-size: 0.86rem;
  background: rgba(255, 255, 255, 0.03);
}

.status-banner.is-uploading {
  border-color: rgba(59, 130, 246, 0.35);
  color: #bfdbfe;
}

.status-banner.is-success {
  border-color: rgba(34, 197, 94, 0.35);
  color: #bbf7d0;
}

.status-banner.is-error {
  border-color: rgba(239, 68, 68, 0.35);
  color: #fecaca;
}

.retry-btn {
  margin-left: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}

.status-block {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  padding: 0.7rem 0.8rem;
  background: rgba(255, 255, 255, 0.02);
}

.review-preview-notice {
  margin: 0 0 1rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid rgba(59, 130, 246, 0.45);
  border-radius: var(--radius-2);
  background: rgba(59, 130, 246, 0.12);
  color: #bfdbfe;
  font-size: 0.86rem;
}

.review-preview-notice.is-readonly {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.12);
  color: #fde68a;
}

.review-preview-notice.is-operator {
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(34, 197, 94, 0.12);
  color: #bbf7d0;
}

.review-preview-notice__line {
  margin: 0;
}

.review-preview-notice__line + .review-preview-notice__line {
  margin-top: 0.25rem;
}


.review-panel {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, 0.02);
  padding: 0.8rem 0.9rem;
  margin-bottom: 1rem;
}

.review-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;

  h4 {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.92rem;
  }
}

.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.review-item {
  cursor: pointer;
  align-items: stretch;
}

.review-item.active {
  border-color: rgba(99, 102, 241, 0.55);
  background: rgba(99, 102, 241, 0.08);
}

.review-item__main {
  gap: 0.15rem;
}

.review-item__meta {
  align-self: flex-start;
}

.review-actions {
  margin-top: 0.65rem;
  display: flex;
  gap: 0.45rem;
}

.status-label {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 0.2rem;
}

.status-value {
  display: block;
  font-size: 0.88rem;
  color: var(--text-primary);
}

.upload-rules {
  margin-top: 0.8rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  padding: 0.8rem 1rem;
  background: rgba(255, 255, 255, 0.02);

  h4 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
    font-size: 0.92rem;
  }

  ul {
    margin: 0;
    padding-left: 1.2rem;
    color: var(--text-secondary);
    font-size: 0.88rem;
  }
}

.upload-history {
  margin-top: 1rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, 0.02);
  padding: 0.9rem 1rem;

  h4 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.7rem;
    color: var(--text-primary);
    font-size: 0.92rem;
  }
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.7rem;
}

.history-actions {
  display: inline-flex;
  gap: 0.4rem;
}

.history-search {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  padding: 0.18rem 0.35rem;
  font-size: 0.78rem;
  min-width: 120px;
}

.history-filter {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  padding: 0.18rem 0.35rem;
  font-size: 0.78rem;
}

.clear-btn {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  padding: 0.18rem 0.5rem;
  font-size: 0.78rem;
  cursor: pointer;
}

.history-empty {
  color: var(--text-muted);
  font-size: 0.84rem;
}

.history-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
  margin-bottom: 0.75rem;
}

.sla-trend,
.failure-dist {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-1);
  background: rgba(255, 255, 255, 0.02);
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.65rem;
}

.trend-header {
  color: var(--text-secondary);
  font-size: 0.74rem;
  margin-bottom: 0.4rem;
}

.trend-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
}

.trend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.trend-bar-track {
  width: 100%;
  height: 42px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.trend-bar-fill {
  width: 100%;
  min-height: 2px;
  background: linear-gradient(180deg, #818cf8 0%, #6366f1 100%);
}

.trend-meta {
  font-size: 0.63rem;
  color: var(--text-muted);
  white-space: nowrap;
}



.history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-item {
  gap: 0.75rem;
}

.history-item__main {
  min-width: 0;
}

.history-main {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.15rem;
}

.history-type {
  font-size: 0.72rem;
}

.history-file {
  color: var(--text-primary);
  font-size: 0.86rem;
}

.history-state {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.history-state.is-success { color: #bbf7d0; }
.history-state.is-error { color: #fecaca; }
.history-state.is-canceled { color: #cbd5e1; }

.history-meta {
  color: var(--text-muted);
  font-size: 0.75rem;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}


.player-info {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;

  .username { color: var(--text-primary); font-size: 1.2rem; font-weight: 700; margin-bottom: 5px; }
  .uuid { color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-pixel-ui); }
}

.recent-catalog {
  margin-top: 3rem;

  h4 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-primary);
    margin-bottom: 1rem;
  }
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}


.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  .card-title { margin-bottom: 0; }
}

.card-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.skin-context-banner {
  margin: -0.5rem 0 1rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.84rem;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.verify-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  margin: 0;
  color: #fcd34d;
}

.link-hint {
  margin: 0;
  &.warn {
    color: #fda4af;
  }
}

.pending-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.sync-mojang-btn {
  align-self: flex-start;
}

.catalog-muted {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-muted);
}

/* ================= MC 风格重构覆盖 ================= */
.skin-station-view {
  --font-pixel-ui: var(--font-ui), 'Press Start 2P', monospace;

  font-family: var(--font-pixel-ui);
  background:
    linear-gradient(180deg, rgba(20, 30, 16, 0.94), rgba(13, 20, 12, 0.98)),
    repeating-linear-gradient(0deg, rgba(120, 170, 90, 0.06) 0 2px, rgba(0, 0, 0, 0) 2px 4px),
    repeating-linear-gradient(90deg, rgba(120, 170, 90, 0.05) 0 2px, rgba(0, 0, 0, 0) 2px 4px);
}

.skin-station-view :deep(
  h1, h2, h3, h4, h5, h6,
  p, span, label, li, strong,
  a, button, input, select, textarea,
  .status-label, .status-value, .history-meta,
  .history-file, .history-type, .history-state,
  .failure-label, .failure-value, .queue-name,
  .queue-state, .trend-meta, .catalog-title,
  .catalog-tag, .reset-link, .subtitle
) {
  font-family: var(--font-pixel-ui) !important;
  letter-spacing: 0.01em;
}

.skin-station-view :deep(
  p, li, label, .card-desc, .catalog-muted,
  .history-meta, .review-item__meta, .review-item__note,
  .queue-tip, .subtitle
) {
  line-height: 1.7;
}

.skin-station-view::before {
  opacity: 0.3;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 24px 24px;
}

.glass-card,
.auth-required,
.dashboard,
.upload-history,
.upload-queue,
.review-panel,
.upload-rules,
.skin-context-banner,
.status-block,
.stats-item,
.history-item,
.queue-item,
.review-item,
.sla-trend,
.failure-dist {
  border-radius: 0;
  border: 3px solid #1f2f18;
  background: linear-gradient(180deg, rgba(72, 95, 56, 0.9) 0%, rgba(48, 69, 38, 0.94) 100%);
  box-shadow:
    inset 0 2px 0 rgba(187, 220, 145, 0.35),
    inset 0 -2px 0 rgba(0, 0, 0, 0.35),
    0 6px 0 #192614,
    0 12px 24px rgba(0, 0, 0, 0.35);
}

.station-header h1,
.card-title,
.recent-catalog h4,
.upload-rules h4,
.upload-history h4 {
  font-family: var(--font-pixel-latin), var(--font-pixel-cjk);
  letter-spacing: 0.03em;
  line-height: 1.4;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.45);
}

.subtitle,
.card-desc,
.status-label,
.status-value,
.history-meta,
.history-label,
.history-empty,
.catalog-muted,
.queue-tip,
.trend-meta,
.review-item__meta,
.review-item__note,
.failure-label,
.failure-value {
  color: #d6e7bc;
  line-height: 1.5;
}

.auth-tabs,
.upload-tabs {
  border-radius: 0;
  background: #2a3d21;
  border: 2px solid #1f2f18;
}

.tab-btn {
  border-radius: 0;
  font-family: var(--font-pixel-latin), var(--font-pixel-cjk);
  font-size: 0.72rem;
  line-height: 1.35;
}

.tab-btn.active {
  background: linear-gradient(180deg, #8abf56 0%, #69983e 100%);
  color: #efffd5;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.32);
}

.input-group input,
.model-select select,
.history-search,
.history-filter,
.review-note {
  border-radius: 0;
  border: 2px solid #1f2f18;
  background: #2d3f25;
  color: #f3ffe6;
}

.input-group input::placeholder,
.history-search::placeholder,
.review-note::placeholder {
  color: #a9c089;
}

.dropzone {
  border-radius: 0;
  border: 3px dashed #a3c97a;
  background: rgba(38, 56, 30, 0.75);
}

.dropzone:hover,
.dropzone.is-dragover {
  border-color: #cbef92;
  background: rgba(59, 88, 44, 0.85);
}

.progress-track,
.trend-bar-track {
  border-radius: 0;
  border: 2px solid #1f2f18;
  background: #2c3f24;
}

.progress-fill,
.trend-bar-fill {
  background: linear-gradient(180deg, #b5e174 0%, #7eae49 100%);
}

.queue-btn,
.clear-btn,
.retry-btn,
:deep(.mc-button) {
  border-radius: 0;
  border: 2px solid #1e2f12;
  background: linear-gradient(180deg, #88bd53 0%, #658f3a 100%);
  color: #f1ffd9;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.28), inset 0 -2px 0 rgba(0, 0, 0, 0.32), 0 3px 0 #213317;
  font-family: var(--font-pixel-latin), var(--font-pixel-cjk);
  letter-spacing: 0.02em;
  line-height: 1.35;
  min-height: 40px;
  padding: 0 14px;
}

:deep(.mc-button.small) {
  min-height: 34px;
  padding: 0 10px;
  font-size: 0.72rem;
}

.mode-chip-link:focus-visible,
.starmc-mode-chip-link:focus-visible,
.queue-btn:focus-visible,
.clear-btn:focus-visible,
.retry-btn:focus-visible,
:deep(.mc-button:focus-visible) {
  outline: 2px solid #cbef92;
  outline-offset: 2px;
}

.queue-btn:hover,
.clear-btn:hover,
.retry-btn:hover,
:deep(.mc-button:hover) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.queue-btn:active,
.clear-btn:active,
.retry-btn:active,
:deep(.mc-button:active) {
  transform: translateY(2px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(0, 0, 0, 0.35), 0 1px 0 #213317;
}

.history-type,
.history-state,
.meta-pill,
.catalog-tag,
.queue-state {
  border-radius: 0;
  border: 2px solid #1f2f18;
  background: #2f4525;
  color: #def2c2;
}


@media (max-width: 992px) {
  .skin-station-view {
    padding-top: 116px;
  }

  .preview-card {
    position: relative;
    top: auto;
  }

  .dashboard-status {
    grid-template-columns: 1fr;
  }

  .history-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .history-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .trend-bars {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .skin-station-view {
    padding-top: 104px;
  }

  .glass-card {
    padding: 1.2rem;
  }

  .catalog-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .queue-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }

  .history-actions {
    flex-wrap: wrap;
  }

  .trend-bars {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .skin-station-view :deep(
    p, li, label, span, a,
    input, select, textarea,
    .history-meta, .catalog-title, .subtitle
  ) {
    font-size: 0.76rem;
    line-height: 1.75;
    letter-spacing: 0;
  }

  .skin-station-view :deep(button),
  .tab-btn,
  .queue-btn,
  .clear-btn,
  .retry-btn,
  :deep(.mc-button) {
    font-size: 0.68rem;
    line-height: 1.35;
    letter-spacing: 0.01em;
  }
}
</style>
