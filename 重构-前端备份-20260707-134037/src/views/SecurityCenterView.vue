<template>
  <div class="security-center-view page-shell">
    <header class="page-hero">
      <h1 class="page-hero__title">安全中心</h1>
      <p class="page-hero__subtitle">设备会话、风险评分、告警、MFA 与审计</p>
      <div class="shortcut-hint" v-if="showShortcutHint" role="status" aria-live="polite">
        <span>调查快捷键：<strong>J</strong>/<strong>K</strong> 切候选，<strong>C</strong> 复制差异摘要</span>
        <button class="ui-btn small" aria-label="隐藏快捷键提示" @click="showShortcutHint = false">隐藏</button>
      </div>
    </header>

    <section class="glass-panel panel ui-card" v-if="!auth.isLoggedIn">
      <p>请先登录后查看安全中心。</p>
    </section>

    <template v-else>
    <section class="security-quick-stats">
      <div class="quick-stat">
        <span class="quick-stat__label">风险评分</span>
        <strong class="quick-stat__value">{{ center?.risk?.score ?? 0 }}</strong>
      </div>
      <div class="quick-stat">
        <span class="quick-stat__label">未读告警</span>
        <strong class="quick-stat__value">{{ center?.unreadAlerts ?? 0 }}</strong>
      </div>
      <div class="quick-stat">
        <span class="quick-stat__label">活跃会话</span>
        <strong class="quick-stat__value">{{ sessionStats.active }}</strong>
      </div>
    </section>

    <section>
      <!-- 初始加载骨架屏 -->
      <template v-if="isInitialLoading">
        <section class="glass-panel panel skeleton-panel" aria-busy="true" aria-label="正在加载安全中心数据">
          <div class="skeleton-row">
            <div class="skeleton-block skeleton-block--sm"></div>
            <div class="skeleton-block skeleton-block--sm"></div>
            <div class="skeleton-block skeleton-block--sm"></div>
          </div>
        </section>
        <section class="glass-panel panel skeleton-panel" aria-hidden="true">
          <div class="skeleton-block skeleton-block--title"></div>
          <div class="skeleton-kpi-grid">
            <div v-for="n in 8" :key="n" class="skeleton-block skeleton-block--kpi"></div>
          </div>
        </section>
        <section class="glass-panel panel skeleton-panel" aria-hidden="true">
          <div class="skeleton-block skeleton-block--title"></div>
          <div class="skeleton-list">
            <div v-for="n in 4" :key="n" class="skeleton-block skeleton-block--item"></div>
          </div>
        </section>
      </template>

      <section class="glass-panel panel" v-if="center">
        <div class="row">
          <div>
            <div class="label">风险评分</div>
            <div class="value">{{ center.risk?.score ?? 0 }} / 100</div>
          </div>
          <div>
            <div class="label">风险等级</div>
            <div class="value" :class="`risk-${center.risk?.level || 'low'}`">{{ center.risk?.level || 'low' }}</div>
          </div>
          <button class="metric-clickable" type="button" @click="applyReadFilter('unread')">
            <div class="label">未读告警</div>
            <div class="value">{{ center.unreadAlerts ?? 0 }}</div>
          </button>
        </div>

        <div class="timeline-wrap" v-if="timelineRows.length > 0">
          <h4>风险时间线（最近 7 天）</h4>
          <ul class="timeline-list">
            <li v-for="row in timelineRows" :key="row.day">
              <button class="timeline-item clickable timeline-button" type="button" @click="selectTimelineDay(row.day)">
                <span class="timeline-day">{{ row.day }}</span>
                <span class="timeline-count">总 {{ row.total }} / 高风险 {{ row.high }}</span>
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section class="glass-panel panel" v-if="center">
        <div class="panel-head"><h3>详细安全概览</h3></div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">可疑事件数</div>
            <div class="kpi-value">{{ center.risk?.suspicious ?? 0 }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">未知 IP 事件</div>
            <div class="kpi-value">{{ center.risk?.unknownIp ?? 0 }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">活跃会话</div>
            <div class="kpi-value">{{ sessionStats.active }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">已下线会话</div>
            <div class="kpi-value">{{ sessionStats.revoked }}</div>
          </div>
          <button class="kpi-card clickable" @click="applyLevelFilter('high')" type="button">
            <div class="kpi-label">高风险告警</div>
            <div class="kpi-value">{{ alertStats.high }}</div>
          </button>
          <button class="kpi-card clickable" @click="applyLevelFilter('medium')" type="button">
            <div class="kpi-label">中风险告警</div>
            <div class="kpi-value">{{ alertStats.medium }}</div>
          </button>
          <button class="kpi-card clickable" @click="applyLevelFilter('low')" type="button">
            <div class="kpi-label">低风险告警</div>
            <div class="kpi-value">{{ alertStats.low }}</div>
          </button>
          <button class="kpi-card clickable" type="button" @click="applyReadFilter('unread')">
            <div class="kpi-label">未读告警</div>
            <div class="kpi-value">{{ center.unreadAlerts ?? 0 }}</div>
          </button>
          <div class="kpi-card">
            <div class="kpi-label">审计日志总量</div>
            <div class="kpi-value">{{ center?.auditLogs?.length ?? 0 }}</div>
          </div>
        </div>

        <div class="split-grid">
          <div>
            <h4 class="sub-title">最常见审计动作（Top 8）</h4>
            <ul class="compact-list" v-if="auditActionTop.length">
              <li v-for="item in auditActionTop" :key="item.action" class="compact-item">
                <span>{{ item.action }}</span>
                <strong>{{ item.count }}</strong>
              </li>
            </ul>
            <p v-else class="muted">暂无审计动作</p>
          </div>
          <div>
            <h4 class="sub-title">最近审计记录</h4>
            <ul class="compact-list" v-if="recentAuditLogs.length">
              <li v-for="l in recentAuditLogs" :key="l.id" class="compact-item stack">
                <span>{{ l.action }}</span>
                <small class="muted">{{ l.at }}</small>
                <button class="ui-btn small" @click="openAuditDetail(l)">查看详情</button>
              </li>
            </ul>
            <p v-else class="muted">暂无审计记录</p>
          </div>
          <div>
            <h4 class="sub-title">地区分布（Top 6）</h4>
            <ul class="compact-list" v-if="ipGeoTop.length">
              <li v-for="item in ipGeoTop" :key="item.label" class="compact-item">
                <span>{{ item.label }}</span>
                <strong>{{ item.count }}</strong>
              </li>
            </ul>
            <p v-else class="muted">暂无地区分布数据</p>
          </div>
        </div>

        <div class="split-grid">
          <div>
            <h4 class="sub-title">告警处置率趋势（近 7 天）</h4>
            <ul class="compact-list" v-if="alertHandlingTrend.length">
              <li v-for="row in alertHandlingTrend" :key="row.day" class="compact-item">
                <span>{{ row.day }}</span>
                <strong>{{ row.rate }}%</strong>
              </li>
            </ul>
            <p v-else class="muted">暂无处置趋势</p>
          </div>
          <div>
            <h4 class="sub-title">会话寿命分析</h4>
            <ul class="compact-list">
              <li class="compact-item"><span>平均寿命</span><strong>{{ sessionLifetime.avgMinutes }} 分钟</strong></li>
              <li class="compact-item"><span>中位寿命</span><strong>{{ sessionLifetime.medianMinutes }} 分钟</strong></li>
              <li class="compact-item"><span>样本会话数</span><strong>{{ sessionLifetime.count }}</strong></li>
            </ul>
          </div>
          <div>
            <h4 class="sub-title">异常 IP 候选（Top 6）</h4>
            <ul class="compact-list" v-if="abnormalIpTop.length">
              <li v-for="item in abnormalIpTop" :key="item.ip" class="compact-item">
                <span>{{ item.ip }}</span>
                <strong>{{ item.count }}</strong>
              </li>
            </ul>
            <p v-else class="muted">暂无异常 IP</p>
          </div>
        </div>

        <div class="split-grid charts-grid">
          <div>
            <h4 class="sub-title">处置率折线（文本图）</h4>
            <div v-if="alertHandlingTrend.length" class="sparkline-wrap">
              <div v-for="row in alertHandlingTrend" :key="`spark-${row.day}`" class="spark-row">
                <span class="spark-label">{{ row.day.slice(5) }}</span>
                <div class="spark-track"><div class="spark-fill" :style="{ width: `${row.rate}%` }"></div></div>
                <span class="spark-value">{{ row.rate }}%</span>
              </div>
            </div>
            <p v-else class="muted">暂无折线数据</p>
          </div>

          <div>
            <h4 class="sub-title">告警等级占比</h4>
            <div class="donut-wrap" v-if="alertLevelRatio.total > 0">
              <div class="donut">
                <div class="donut-center">{{ alertLevelRatio.total }}</div>
              </div>
              <ul class="compact-list">
                <li class="compact-item"><span>高风险</span><strong>{{ alertLevelRatio.high }}%</strong></li>
                <li class="compact-item"><span>中风险</span><strong>{{ alertLevelRatio.medium }}%</strong></li>
                <li class="compact-item"><span>低风险</span><strong>{{ alertLevelRatio.low }}%</strong></li>
              </ul>
            </div>
            <p v-else class="muted">暂无占比数据</p>
          </div>

          <div>
            <h4 class="sub-title">会话寿命分布</h4>
            <div class="sparkline-wrap" v-if="sessionLifetimeBuckets.total > 0">
              <div class="spark-row">
                <span class="spark-label">0-10m</span>
                <div class="spark-track"><div class="spark-fill" :style="{ width: `${sessionLifetimeBuckets.p0_10}%` }"></div></div>
                <span class="spark-value">{{ sessionLifetimeBuckets.p0_10 }}%</span>
              </div>
              <div class="spark-row">
                <span class="spark-label">10-60m</span>
                <div class="spark-track"><div class="spark-fill" :style="{ width: `${sessionLifetimeBuckets.p10_60}%` }"></div></div>
                <span class="spark-value">{{ sessionLifetimeBuckets.p10_60 }}%</span>
              </div>
              <div class="spark-row">
                <span class="spark-label">1h+</span>
                <div class="spark-track"><div class="spark-fill" :style="{ width: `${sessionLifetimeBuckets.p60}%` }"></div></div>
                <span class="spark-value">{{ sessionLifetimeBuckets.p60 }}%</span>
              </div>
            </div>
            <p v-else class="muted">暂无寿命分布数据</p>
          </div>
        </div>
      </section>

      <section class="glass-panel panel" v-if="center">
        <div class="panel-head"><h3>风险解释（规则命中）</h3></div>
        <ul class="compact-list">
          <li class="compact-item"><span>风险评分</span><strong>{{ center?.risk?.score ?? 0 }}</strong></li>
          <li class="compact-item"><span>风险等级</span><strong>{{ center?.risk?.level ?? 'low' }}</strong></li>
          <li class="compact-item"><span>可疑事件（命中 fail/reject/ban/risk）</span><strong>{{ center?.risk?.suspicious ?? 0 }}</strong></li>
          <li class="compact-item"><span>未知 IP 事件</span><strong>{{ center?.risk?.unknownIp ?? 0 }}</strong></li>
          <li class="compact-item"><span>高风险阈值</span><strong>{{ rules?.highRiskThreshold ?? center?.rules?.highRiskThreshold ?? '-' }}</strong></li>
          <li class="compact-item"><span>中风险阈值</span><strong>{{ rules?.mediumRiskThreshold ?? center?.rules?.mediumRiskThreshold ?? '-' }}</strong></li>
          <li class="compact-item"><span>高风险强制 MFA</span><strong>{{ (rules?.requireMfaOnHighRisk ?? center?.rules?.requireMfaOnHighRisk) ? '开启' : '关闭' }}</strong></li>
        </ul>
      </section>

      <section class="glass-panel panel">
        <div class="panel-head"><h3>MFA（TOTP）</h3></div>
        <div class="grid">
          <button class="ui-btn" @click="setupTotp">获取密钥</button>
          <input class="ui-input" v-model="totpCode" placeholder="输入 6 位验证码" aria-label="TOTP 验证码" inputmode="numeric" autocomplete="one-time-code" />
          <button class="ui-btn" @click="enableTotp">启用 TOTP</button>
          <button class="ui-btn danger" @click="disableTotp">关闭 TOTP</button>
          <input class="ui-input" v-model="recoveryCode" placeholder="恢复码（可选，用于关闭）" aria-label="恢复码（可选）" autocomplete="one-time-code" />
          <button class="ui-btn" @click="rotateRecoveryCodes">轮换恢复码</button>
        </div>
        <p class="muted" v-if="otpauthUrl">otpauth: {{ otpauthUrl }}</p>
        <div v-if="recoveryCodes.length" class="codes">
          <div class="code" v-for="c in recoveryCodes" :key="c">{{ c }}</div>
        </div>
      </section>

      <section class="glass-panel panel">
        <div class="panel-head">
          <h3>会话管理</h3>
          <div class="actions">
            <button class="ui-btn" @click="registerSession">登记当前会话</button>
            <button class="ui-btn danger" @click="revokeAll">一键下线全部</button>
          </div>
        </div>
        <ul class="list" v-if="center?.sessions?.length">
          <li class="item" v-for="s in center.sessions" :key="s.id">
            <div>
              <div class="main">{{ s.deviceId || 'unknown-device' }}</div>
              <div class="sub">{{ s.ip || 'no-ip' }} · {{ s.lastSeenAt || s.createdAt }}</div>
            </div>
            <button class="ui-btn small" :disabled="s.active === false" @click="revokeOne(s.id)">
              {{ s.active === false ? '已下线' : '下线' }}
            </button>
          </li>
        </ul>
        <p v-else class="muted">暂无会话</p>
      </section>

      <section class="glass-panel panel" ref="alertSectionRef">
        <div class="panel-head">
          <h3>安全告警</h3>
          <div class="actions">
            <select v-model="alertRange" class="input-select ui-input" @change="alertPage = 1; loadCenter()">
              <option value="7d">近7天</option>
              <option value="30d">近30天</option>
              <option value="all">全部时间</option>
            </select>
            <select v-model="alertLevelFilter" class="input-select ui-input">
              <option value="all">全部等级</option>
              <option value="high">高风险</option>
              <option value="medium">中风险</option>
              <option value="low">低风险</option>
            </select>
            <select v-model="alertReadFilter" class="input-select ui-input">
              <option value="all">全部状态</option>
              <option value="unread">仅未读</option>
              <option value="read">仅已读</option>
            </select>
            <button class="ui-btn" @click="markAllAlertsRead">全部已读</button>
            <button class="ui-btn" @click="exportCsv">导出审计 CSV</button>
            <button class="ui-btn" @click="exportWeeklyReport">导出安全周报 CSV</button>
          </div>
        </div>
        <div class="actions quick-filters">
          <button class="ui-btn small" @click="applyLevelFilter('all')">全部({{ alertStats.total }})</button>
          <button class="ui-btn small" @click="applyLevelFilter('high')">高风险({{ alertStats.high }})</button>
          <button class="ui-btn small" @click="applyLevelFilter('medium')">中风险({{ alertStats.medium }})</button>
          <button class="ui-btn small" @click="applyLevelFilter('low')">低风险({{ alertStats.low }})</button>
          <button class="ui-btn small" @click="applyReadFilter('unread')">仅未读({{ center?.unreadAlerts ?? 0 }})</button>
          <button class="ui-btn small" @click="resetAllFilters">重置筛选</button>
        </div>

        <div class="actions" v-if="selectedTimelineDay" style="margin-bottom: 8px;">
          <span class="muted">当前按日期筛选：{{ selectedTimelineDay }}</span>
          <button class="ui-btn small" @click="clearTimelineDay">清除日期筛选</button>
        </div>

        <ul class="list" v-if="filteredAlerts.length">
          <li class="item" v-for="a in filteredAlerts" :key="a.id">
            <div>
              <div class="main">{{ a.title }}</div>
              <div class="sub">{{ a.level }} · {{ a.at }} · {{ a.read ? '已读' : '未读' }} · 归属地：{{ inferGeo(a) }}</div>
            </div>
            <div class="actions">
              <button class="ui-btn small" @click="openAlertDetail(a)">详情</button>
              <button class="ui-btn small" v-if="!a.read" @click="markAlertRead(a.id)">标记已读</button>
            </div>
          </li>
        </ul>
        <p v-else class="muted">暂无告警</p>
        <div class="pager">
          <button class="ui-btn small" :disabled="alertPage <= 1" @click="changeAlertPage(-1)">上一页</button>
          <span class="muted">第 {{ alertPage }} 页 / 共 {{ totalAlertPages }} 页（{{ center?.totalAlerts ?? 0 }} 条）</span>
          <button class="ui-btn small" :disabled="!(center?.hasMoreAlerts)" @click="changeAlertPage(1)">下一页</button>
        </div>
      </section>

      <section class="glass-panel panel" v-if="isAdmin">
        <div class="panel-head"><h3>管理员规则</h3><button class="ui-btn" @click="saveRules">保存规则</button></div>
        <div class="grid" v-if="rules">
          <label>失败权重 <input v-model.number="rules.failWeight" type="number" /></label>
          <label>未知IP权重 <input v-model.number="rules.unknownIpWeight" type="number" /></label>
          <label>高风险阈值 <input v-model.number="rules.highRiskThreshold" type="number" /></label>
          <label>中风险阈值 <input v-model.number="rules.mediumRiskThreshold" type="number" /></label>
          <label><input v-model="rules.requireMfaOnHighRisk" type="checkbox" /> 高风险强制二次验证</label>
          <label><input v-model="rules.enableWebhookReplay" type="checkbox" /> 启用 webhook 回放</label>
        </div>
      </section>

      <section class="glass-panel panel" v-if="isAdmin">
        <div class="panel-head">
          <h3>Webhook 队列</h3>
          <div class="actions">
            <button class="ui-btn" @click="loadWebhookQueue">刷新</button>
            <button class="ui-btn" @click="batchReplay('failed')">批量回放失败</button>
            <button class="ui-btn" @click="batchReplay('pending')">批量回放待发送</button>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom: 10px;">
          <div class="kpi-card"><div class="kpi-label">总队列</div><div class="kpi-value">{{ webhookHealth.total }}</div></div>
          <div class="kpi-card"><div class="kpi-label">已发送</div><div class="kpi-value">{{ webhookHealth.sent }}</div></div>
          <div class="kpi-card"><div class="kpi-label">待发送</div><div class="kpi-value">{{ webhookHealth.pending }}</div></div>
          <div class="kpi-card"><div class="kpi-label">失败</div><div class="kpi-value">{{ webhookHealth.failed }}</div></div>
          <div class="kpi-card"><div class="kpi-label">已回放</div><div class="kpi-value">{{ webhookHealth.replayed }}</div></div>
          <div class="kpi-card"><div class="kpi-label">平均重试</div><div class="kpi-value">{{ webhookHealth.avgAttempts }}</div></div>
        </div>
        <ul class="list" v-if="webhookQueue.length">
          <li class="item" v-for="q in webhookQueue" :key="q.id">
            <div>
              <div class="main">{{ q.title }} ({{ q.status }})</div>
              <div class="sub">eventId: {{ q.eventId }} · attempts: {{ q.attempts }} · idem: {{ q.idempotencyKey?.slice(0, 10) || '-' }} · next: {{ q.nextRetryAt || '-' }}</div>
            </div>
            <button class="ui-btn small" @click="replayWebhook(q.id)">回放</button>
          </li>
        </ul>
        <p v-else class="muted">暂无队列项</p>
      </section>

      <section class="glass-panel panel" v-if="isAdmin">
        <div class="panel-head">
          <h3>Geo 缓存</h3>
          <div class="actions">
            <button class="ui-btn" @click="loadGeoCache">刷新</button>
            <button class="ui-btn danger" @click="clearGeoCache()">清空缓存</button>
          </div>
        </div>
        <ul class="list" v-if="geoCache.length">
          <li class="item" v-for="g in geoCache" :key="g.ip">
            <div>
              <div class="main">{{ g.ip }}</div>
              <div class="sub">{{ g.label }} · {{ g.updatedAt }}</div>
            </div>
            <button class="ui-btn small" @click="clearGeoCache(g.ip)">删除</button>
          </li>
        </ul>
        <p v-else class="muted">暂无 Geo 缓存</p>
      </section>
      <div v-if="alertDetailVisible" class="drawer-mask" @click="closeAlertDetail">
        <aside
          class="drawer"
          ref="alertDrawerRef"
          role="dialog"
          aria-modal="true"
          aria-label="告警详情"
          tabindex="-1"
          @click.stop
          @keydown="onDrawerKeydown"
        >
          <div class="panel-head">
            <h3>告警详情</h3>
            <div class="actions">
              <button class="ui-btn small" @click="copyText(alertDetailJson, '已复制告警 JSON')">复制JSON</button>
              <button class="btn small" @click="copyText(String(selectedAlert?.id || ''), '已复制告警ID')">复制ID</button>
              <button class="btn small" @click="jumpToRelatedAudit">关联审计</button>
              <button class="btn small" @click="closeAlertDetail">关闭</button>
            </div>
          </div>
          <div v-if="relatedAuditCandidates.length" class="candidate-box">
            <div class="panel-head">
              <h4 class="sub-title">关联审计候选（Top {{ relatedAuditCandidates.length }}）</h4>
              <select v-model="auditCandidateSort" class="input-select ui-input small-select">
                <option value="score">按分数</option>
                <option value="time">按时间</option>
              </select>
            </div>
            <ul class="compact-list">
              <li v-for="c in sortedRelatedAuditCandidates" :key="c.row?.id || c.row?.at" class="compact-item stack">
                <span>{{ c.row?.action || 'unknown' }} · {{ c.row?.at || '-' }}</span>
                <small class="muted">score {{ c.score }} ｜ 命中：{{ c.reasons.join('、') || '无' }}</small>
                <button class="btn small" @click="openAuditDetail(c.row)">打开</button>
              </li>
            </ul>
          </div>
          <div class="compare-wrap" v-if="selectedAlert && selectedAudit">
            <div>
              <h4 class="sub-title">告警 vs 审计（关键字段）</h4>
              <ul class="compact-list">
                <li class="compact-item"><span>时间差(分钟)</span><strong>{{ compareSummary.timeDiffMinutes }}</strong></li>
                <li class="compact-item"><span>等级一致</span><strong>{{ compareSummary.levelMatch ? '是' : '否' }}</strong></li>
                <li class="compact-item"><span>地区一致</span><strong>{{ compareSummary.geoMatch ? '是' : '否' }}</strong></li>
                <li class="compact-item"><span>IP一致</span><strong>{{ compareSummary.ipMatch ? '是' : '否' }}</strong></li>
              </ul>
              <button class="btn small" @click="copyCompareSummary">复制差异摘要</button>
            </div>
            <div class="dual-json">
              <div>
                <h4 class="sub-title">告警 JSON</h4>
                <pre class="json-view">{{ alertDetailJson }}</pre>
              </div>
              <div>
                <h4 class="sub-title">审计 JSON</h4>
                <pre class="json-view">{{ auditDetailJson }}</pre>
              </div>
            </div>
          </div>
          <pre class="json-view" v-else>{{ alertDetailJson }}</pre>
        </aside>
      </div>

      <div v-if="auditDetailVisible" class="drawer-mask" @click="closeAuditDetail">
        <aside
          class="drawer"
          ref="auditDrawerRef"
          role="dialog"
          aria-modal="true"
          aria-label="审计详情"
          tabindex="-1"
          @click.stop
          @keydown="onDrawerKeydown"
        >
          <div class="panel-head">
            <h3>审计详情</h3>
            <div class="actions">
              <button class="btn small" @click="copyText(auditDetailJson, '已复制审计 JSON')">复制JSON</button>
              <button class="btn small" @click="copyText(String(selectedAudit?.id || ''), '已复制审计ID')">复制ID</button>
              <button class="btn small" @click="jumpToRelatedAlert">关联告警</button>
              <button class="btn small" @click="closeAuditDetail">关闭</button>
            </div>
          </div>
          <div v-if="relatedAlertCandidates.length" class="candidate-box">
            <div class="panel-head">
              <h4 class="sub-title">关联告警候选（Top {{ relatedAlertCandidates.length }}）</h4>
              <select v-model="alertCandidateSort" class="input-select ui-input small-select">
                <option value="score">按分数</option>
                <option value="time">按时间</option>
              </select>
            </div>
            <ul class="compact-list">
              <li v-for="c in sortedRelatedAlertCandidates" :key="c.row?.id || c.row?.at" class="compact-item stack">
                <span>{{ c.row?.title || 'unknown' }} · {{ c.row?.at || '-' }}</span>
                <small class="muted">score {{ c.score }} ｜ 命中：{{ c.reasons.join('、') || '无' }}</small>
                <button class="btn small" @click="openAlertDetail(c.row)">打开</button>
              </li>
            </ul>
          </div>
          <pre class="json-view">{{ auditDetailJson }}</pre>
        </aside>
      </div>
    </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppStatePanel from '@/components/atoms/AppStatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { apiFetchWithAuth, apiJsonWithAuth } from '@/shared/utils/security'

interface SecurityAlertPayload {
  ip?: string
  lastIp?: string
}

interface SecurityAlert {
  id?: string
  title?: string
  level?: string
  at?: string
  read?: boolean
  geo?: string
  payload?: SecurityAlertPayload
}

interface SecurityAuditDetail {
  riskLevel?: string
  geo?: string
  ip?: string
  lastIp?: string
}

interface SecurityAuditLog {
  id?: string
  action?: string
  at?: string
  detail?: SecurityAuditDetail
}

interface SecuritySession {
  id?: string
  active?: boolean
  deviceId?: string
  ip?: string
  lastSeenAt?: string
  createdAt?: string
  revokedAt?: string
}

interface SecurityRisk {
  score?: number
  level?: string
  suspicious?: number
  unknownIp?: number
}

interface SecurityRules {
  failWeight?: number
  unknownIpWeight?: number
  highRiskThreshold?: number
  mediumRiskThreshold?: number
  requireMfaOnHighRisk?: boolean
  enableWebhookReplay?: boolean
}

interface SecurityCenterData {
  risk?: SecurityRisk
  unreadAlerts?: number
  totalAlerts?: number
  hasMoreAlerts?: boolean
  pageSize?: number
  alerts?: SecurityAlert[]
  sessions?: SecuritySession[]
  auditLogs?: SecurityAuditLog[]
  rules?: SecurityRules
}

interface AnalyticsSummaryData {
  totals?: {
    sessions?: number
    activeSessions?: number
    alerts?: number
  }
  levels?: {
    high?: number
    medium?: number
    low?: number
  }
}

interface AnalyticsTrendPoint {
  day: string
  total: number
  unread: number
  high: number
}

interface AnalyticsTrendResponse {
  points?: AnalyticsTrendPoint[]
}

interface AnalyticsTopSourcesResponse {
  topIps?: Array<{ ip?: string; count?: number }>
  topGeos?: Array<{ geo?: string; count?: number }>
}

interface TotpSetupResponse {
  otpauthUrl?: string
}

interface TotpCodeResponse {
  recoveryCodes?: string[]
}

interface WebhookQueueItem {
  id: string
  title?: string
  status?: string
  eventId?: string
  attempts?: number
  idempotencyKey?: string
  nextRetryAt?: string
}

interface GeoCacheItem {
  ip: string
  label: string
  updatedAt: string
}

interface AdminRulesResponse {
  rules?: SecurityRules
}

interface WebhookQueueResponse {
  items?: WebhookQueueItem[]
}

interface GeoCacheResponse {
  items?: GeoCacheItem[]
}

interface RelatedCandidate<T> {
  row: T
  score: number
  reasons: string[]
}

const auth = useAuthStore()
const isLoggedIn = computed(() => auth.isLoggedIn);
const toast = useToastStore()
const center = ref<SecurityCenterData | null>(null)
const isInitialLoading = ref(true)
const analyticsSummary = ref<AnalyticsSummaryData | null>(null)
const analyticsTrend = ref<AnalyticsTrendPoint[]>([])
const analyticsTopSources = ref<{ topIps: Array<{ ip: string; count: number }>; topGeos: Array<{ geo: string; count: number }> }>({ topIps: [], topGeos: [] })
const rules = ref<SecurityRules | null>(null)
const webhookQueue = ref<WebhookQueueItem[]>([])
const geoCache = ref<GeoCacheItem[]>([])
const alertSectionRef = ref<HTMLElement | null>(null)
const totpCode = ref('')
const recoveryCode = ref('')
const recoveryCodes = ref<string[]>([])
const otpauthUrl = ref('')
const alertLevelFilter = ref<'all' | 'high' | 'medium' | 'low'>('all')
const quickFilter = ref<'all' | 'high' | 'medium' | 'low' | 'unread'>('all')
const alertReadFilter = ref<'all' | 'read' | 'unread'>('all')
const alertRange = ref<'7d' | '30d' | 'all'>('7d')
const selectedTimelineDay = ref('')
const alertDetailVisible = ref(false)
const alertDetailJson = ref('')
const selectedAlert = ref<SecurityAlert | null>(null)
const relatedAuditCandidates = ref<Array<RelatedCandidate<SecurityAuditLog>>>([])
const auditCandidateSort = ref<'score' | 'time'>('score')
const auditDetailVisible = ref(false)
const auditDetailJson = ref('')
const selectedAudit = ref<SecurityAuditLog | null>(null)
const relatedAlertCandidates = ref<Array<RelatedCandidate<SecurityAlert>>>([])
const alertCandidateSort = ref<'score' | 'time'>('score')
const alertDrawerRef = ref<HTMLElement | null>(null)
const auditDrawerRef = ref<HTMLElement | null>(null)
const lastFocusedBeforeDrawer = ref<HTMLElement | null>(null)

const sortedRelatedAuditCandidates = computed(() => {
  const list = [...relatedAuditCandidates.value]
  if (auditCandidateSort.value === 'time') {
    return list.sort((a, b) => {
      const ta = Date.parse(String(a?.row?.at || '')) || 0
      const tb = Date.parse(String(b?.row?.at || '')) || 0
      return tb - ta
    })
  }
  return list.sort((a, b) => b.score - a.score)
})

const sortedRelatedAlertCandidates = computed(() => {
  const list = [...relatedAlertCandidates.value]
  if (alertCandidateSort.value === 'time') {
    return list.sort((a, b) => {
      const ta = Date.parse(String(a?.row?.at || '')) || 0
      const tb = Date.parse(String(b?.row?.at || '')) || 0
      return tb - ta
    })
  }
  return list.sort((a, b) => b.score - a.score)
})

const compareSummary = computed(() => {
  const a = selectedAlert.value || {}
  const d = selectedAudit.value || {}
  const aAt = Date.parse(String(a?.at || '')) || 0
  const dAt = Date.parse(String(d?.at || '')) || 0
  const timeDiffMinutes = (aAt > 0 && dAt > 0) ? Math.round(Math.abs(aAt - dAt) / 60000) : -1
  const alertLevel = String(a?.level || '').toLowerCase()
  const auditLevel = String(d?.detail?.riskLevel || '').toLowerCase()
  const alertGeo = String(a?.geo || '')
  const auditGeo = String(d?.detail?.geo || '')
  const alertIp = String(a?.payload?.ip || a?.payload?.lastIp || '')
  const auditIp = String(d?.detail?.ip || d?.detail?.lastIp || '')
  return {
    timeDiffMinutes,
    levelMatch: Boolean(alertLevel && auditLevel && alertLevel === auditLevel),
    geoMatch: Boolean(alertGeo && auditGeo && alertGeo === auditGeo),
    ipMatch: Boolean(alertIp && auditIp && alertIp === auditIp)
  }
})

const alertPage = ref(1)
const alertPageSize = ref(50)
const showShortcutHint = ref(true)

const totalAlertPages = computed(() => {
  const total = Number(center.value?.totalAlerts || 0)
  const size = Number(center.value?.pageSize || alertPageSize.value || 50)
  return Math.max(1, Math.ceil(total / size))
})

const sessionStats = computed(() => {
  const fromSummary = analyticsSummary.value?.totals
  if (fromSummary) {
    const total = Number(fromSummary.sessions || 0)
    const active = Number(fromSummary.activeSessions || 0)
    return { active, revoked: Math.max(0, total - active), total }
  }
  const sessions = Array.isArray(center.value?.sessions) ? center.value.sessions : []
  const active = sessions.filter((s) => s?.active !== false).length
  const revoked = sessions.length - active
  return { active, revoked, total: sessions.length }
})

const alertStats = computed(() => {
  const fromSummary = analyticsSummary.value?.levels
  const totalFromSummary = analyticsSummary.value?.totals?.alerts
  if (fromSummary) {
    const high = Number(fromSummary.high || 0)
    const medium = Number(fromSummary.medium || 0)
    const low = Number(fromSummary.low || 0)
    const total = Number(totalFromSummary ?? (high + medium + low))
    return { high, medium, low, total }
  }
  const items = Array.isArray(center.value?.alerts) ? center.value.alerts : []
  let high = 0
  let medium = 0
  let low = 0
  for (const a of items) {
    const lv = String(a?.level || '').toLowerCase()
    if (lv === 'high') high += 1
    else if (lv === 'medium') medium += 1
    else low += 1
  }
  return { high, medium, low, total: items.length }
})

const recentAuditLogs = computed(() => {
  const logs = Array.isArray(center.value?.auditLogs) ? center.value.auditLogs : []
  return logs.slice(0, 8)
})

const auditActionTop = computed(() => {
  const logs = Array.isArray(center.value?.auditLogs) ? center.value.auditLogs : []
  const map = new Map<string, number>()
  for (const l of logs) {
    const action = String(l?.action || 'unknown')
    map.set(action, (map.get(action) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

const ipGeoTop = computed(() => {
  const fromApi = analyticsTopSources.value?.topGeos
  if (Array.isArray(fromApi) && fromApi.length > 0) {
    return fromApi.slice(0, 6).map((x) => ({ label: String(x?.geo || '未知地区'), count: Number(x?.count || 0) }))
  }
  const items = Array.isArray(center.value?.alerts) ? center.value.alerts : []
  const map = new Map<string, number>()
  for (const a of items) {
    const key = String(a?.geo || '未知地区')
    map.set(key, (map.get(key) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
})

const webhookHealth = computed(() => {
  const list = webhookQueue.value || []
  const total = list.length
  const sent = list.filter((x) => x?.status === 'sent').length
  const failed = list.filter((x) => x?.status === 'failed').length
  const pending = list.filter((x) => x?.status === 'pending').length
  const replayed = list.filter((x) => x?.status === 'replayed').length
  const avgAttempts = total ? (list.reduce((s: number, x) => s + Number(x?.attempts || 0), 0) / total) : 0
  return { total, sent, failed, pending, replayed, avgAttempts: avgAttempts.toFixed(2) }
})

const alertHandlingTrend = computed(() => {
  const alerts = Array.isArray(center.value?.alerts) ? center.value.alerts : []
  const dayMap = new Map<string, { day: string; total: number; read: number }>()
  for (const a of alerts) {
    const day = String(a?.at || '').slice(0, 10) || 'unknown'
    const prev = dayMap.get(day) || { day, total: 0, read: 0 }
    prev.total += 1
    if (a?.read) prev.read += 1
    dayMap.set(day, prev)
  }
  return Array.from(dayMap.values())
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 7)
    .map((r) => ({ ...r, rate: r.total ? Math.round((r.read / r.total) * 100) : 0 }))
})

const sessionLifetime = computed(() => {
  const sessions = Array.isArray(center.value?.sessions) ? center.value.sessions : []
  const mins: number[] = []
  for (const s of sessions) {
    const start = Date.parse(String(s?.createdAt || ''))
    const end = Date.parse(String(s?.revokedAt || s?.lastSeenAt || ''))
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    mins.push(Math.round((end - start) / 60000))
  }
  mins.sort((a, b) => a - b)
  const count = mins.length
  const avgMinutes = count ? Math.round(mins.reduce((a, b) => a + b, 0) / count) : 0
  const medianMinutes = count ? mins[Math.floor(count / 2)] : 0
  return { count, avgMinutes, medianMinutes }
})

const abnormalIpTop = computed(() => {
  const alerts = Array.isArray(center.value?.alerts) ? center.value.alerts : []
  const map = new Map<string, number>()
  for (const a of alerts) {
    const lv = String(a?.level || '').toLowerCase()
    if (lv !== 'high') continue
    const ip = String(a?.payload?.ip || a?.payload?.lastIp || '').trim()
    if (!ip) continue
    map.set(ip, (map.get(ip) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
})

const alertLevelRatio = computed(() => {
  const total = Math.max(1, Number(alertStats.value.total || 0))
  const high = Math.round((Number(alertStats.value.high || 0) / total) * 100)
  const medium = Math.round((Number(alertStats.value.medium || 0) / total) * 100)
  const low = Math.max(0, 100 - high - medium)
  return { total: Number(alertStats.value.total || 0), high, medium, low }
})

const sessionLifetimeBuckets = computed(() => {
  const sessions = Array.isArray(center.value?.sessions) ? center.value.sessions : []
  let c0_10 = 0
  let c10_60 = 0
  let c60 = 0
  for (const s of sessions) {
    const start = Date.parse(String(s?.createdAt || ''))
    const end = Date.parse(String(s?.revokedAt || s?.lastSeenAt || ''))
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    const minutes = (end - start) / 60000
    if (minutes < 10) c0_10 += 1
    else if (minutes < 60) c10_60 += 1
    else c60 += 1
  }
  const total = c0_10 + c10_60 + c60
  if (!total) return { total: 0, p0_10: 0, p10_60: 0, p60: 0 }
  return {
    total,
    p0_10: Math.round((c0_10 / total) * 100),
    p10_60: Math.round((c10_60 / total) * 100),
    p60: Math.round((c60 / total) * 100)
  }
})

const filteredAlerts = computed(() => {
  const items = Array.isArray(center.value?.alerts) ? center.value.alerts : []
  const now = Date.now()
  return items.filter((a) => {
    const levelOk = alertLevelFilter.value === 'all' ? true : String(a?.level || '') === alertLevelFilter.value
    const readOk = alertReadFilter.value === 'all'
      ? true
      : alertReadFilter.value === 'read'
        ? Boolean(a?.read)
        : !a?.read
    let rangeOk = true
    if (alertRange.value !== 'all') {
      const days = alertRange.value === '7d' ? 7 : 30
      const at = Date.parse(String(a?.at || ''))
      rangeOk = Number.isFinite(at) ? (now - at <= days * 86400000) : false
    }
    let dayOk = true
    if (selectedTimelineDay.value) {
      dayOk = String(a?.at || '').slice(0, 10) === selectedTimelineDay.value
    }
    return levelOk && readOk && rangeOk && dayOk
  })
})

const timelineRows = computed(() => {
  if (Array.isArray(analyticsTrend.value) && analyticsTrend.value.length > 0) {
    return analyticsTrend.value.slice(0, 7).map((x) => ({ day: x.day, total: Number(x.total || 0), high: Number(x.high || 0) }))
  }
  const logs = Array.isArray(center.value?.auditLogs) ? center.value.auditLogs : []
  const dayMap = new Map<string, { day: string; total: number; high: number }>()
  for (const l of logs) {
    const day = String(l?.at || '').slice(0, 10) || 'unknown'
    const prev = dayMap.get(day) || { day, total: 0, high: 0 }
    prev.total += 1
    const riskLevel = String(l?.detail?.riskLevel || '')
    if (riskLevel === 'high') prev.high += 1
    dayMap.set(day, prev)
  }
  return Array.from(dayMap.values()).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 7)
})

const inferGeo = (alert: SecurityAlert) => {
  if (alert?.geo) return String(alert.geo)
  const rawIp = String(alert?.payload?.ip || alert?.payload?.lastIp || '').trim()
  if (!rawIp) return '未知地区'
  if (rawIp.startsWith('10.') || rawIp.startsWith('192.168.') || rawIp.startsWith('127.')) return '内网/本机'
  return '公网（待接入 GeoIP）'
}

const isAdmin = computed(() => {
  const u = auth.user
  if (!u) return false
  const roles = new Set([...(Array.isArray(u.roles) ? u.roles : []), ...(u.role ? [u.role] : [])].map((r) => String(r).toLowerCase()))
  return roles.has('admin')
})

const loadAnalytics = async () => {
  if (!isLoggedIn.value) return
  const [s, t, top] = await Promise.all([
    apiJsonWithAuth<AnalyticsSummaryData>('/api/security/analytics/summary'),
    apiJsonWithAuth<AnalyticsTrendResponse>(`/api/security/analytics/trend?days=${alertRange.value === '7d' ? 7 : alertRange.value === '30d' ? 30 : 90}`),
    apiJsonWithAuth<AnalyticsTopSourcesResponse>('/api/security/analytics/top-sources?limit=10')
  ])
  if (s.response.ok) analyticsSummary.value = s.data
  if (t.response.ok) analyticsTrend.value = Array.isArray(t.data?.points) ? t.data.points : []
  if (top.response.ok) analyticsTopSources.value = {
    topIps: Array.isArray(top.data?.topIps)
      ? top.data.topIps.map((item) => ({ ip: String(item?.ip || ''), count: Number(item?.count || 0) }))
      : [],
    topGeos: Array.isArray(top.data?.topGeos)
      ? top.data.topGeos.map((item) => ({ geo: String(item?.geo || ''), count: Number(item?.count || 0) }))
      : []
  }
}

const loadCenter = async () => {
  if (!isLoggedIn.value) return
  const { response, data } = await apiJsonWithAuth(`/api/security/center?page=${alertPage.value}&pageSize=${alertPageSize.value}`)
  if (response.ok) center.value = data
  await loadAnalytics()
}

const changeAlertPage = async (delta: -1 | 1) => {
  const next = alertPage.value + delta
  if (next < 1) return
  if (delta > 0 && !(center.value?.hasMoreAlerts)) return

  const prevPage = alertPage.value
  alertPage.value = next
  try {
    await loadCenter()
  } catch {
    alertPage.value = prevPage
    toast.addToast({ message: '切换页面失败，请稍后重试', type: 'error' })
  }
}

const markAlertRead = async (id: string) => {
  try {
    const r = await apiFetchWithAuth('/api/security/alerts/read', null, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
    })
    if (!r.ok) throw new Error('bad_status')
    toast.addToast({ message: '告警已标记为已读', type: 'success' })
    await loadCenter()
  } catch {
    toast.addToast({ message: '标记失败，请稍后重试', type: 'error' })
  }
}

const markAllAlertsRead = async () => {
  try {
    const r = await apiFetchWithAuth('/api/security/alerts/read-all', null, { method: 'POST' })
    if (!r.ok) throw new Error('bad_status')
    toast.addToast({ message: '已全部标记为已读', type: 'success' })
    await loadCenter()
  } catch {
    toast.addToast({ message: '批量标记失败', type: 'error' })
  }
}

const setupTotp = async () => {
  const { response, data } = await apiJsonWithAuth<TotpSetupResponse>('/api/user/totp/setup', null, { method: 'POST' })
  if (response.ok) otpauthUrl.value = String(data?.otpauthUrl || '')
}

const enableTotp = async () => {
  const { response, data } = await apiJsonWithAuth<TotpCodeResponse>('/api/user/totp/enable', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode.value })
  })
  if (response.ok) recoveryCodes.value = Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : []
  await loadCenter()
}

const disableTotp = async () => {
  await apiFetchWithAuth('/api/user/totp/disable', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode.value, recoveryCode: recoveryCode.value })
  })
  await loadCenter()
}

const rotateRecoveryCodes = async () => {
  const { response, data } = await apiJsonWithAuth<TotpCodeResponse>('/api/user/totp/recovery-codes/rotate', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode.value })
  })
  if (response.ok) recoveryCodes.value = Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : []
}

const registerSession = async () => {
  await apiFetchWithAuth('/api/security/session/register', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: navigator.userAgent.slice(0, 40) })
  })
  await loadCenter()
}

const revokeOne = async (sessionId: string) => {
  await apiFetchWithAuth('/api/security/session/revoke', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, totpCode: totpCode.value })
  })
  await loadCenter()
}

const revokeAll = async () => {
  await apiFetchWithAuth('/api/security/session/revoke-all', null, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totpCode: totpCode.value })
  })
  await loadCenter()
}

const exportCsv = async () => {
  const resp = await apiFetchWithAuth('/api/security/export.csv', null)
  if (!resp.ok) return
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `security-audit-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const scrollToAlertSection = () => {
  alertSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const applyLevelFilter = (lv: 'all' | 'high' | 'medium' | 'low') => {
  quickFilter.value = lv
  alertLevelFilter.value = lv
  alertPage.value = 1
  scrollToAlertSection()
}

const applyReadFilter = (rv: 'all' | 'read' | 'unread') => {
  quickFilter.value = rv === 'unread' ? 'unread' : 'all'
  alertReadFilter.value = rv
  alertPage.value = 1
  scrollToAlertSection()
}

const selectTimelineDay = (day: string) => {
  selectedTimelineDay.value = String(day || '').trim()
  alertPage.value = 1
  scrollToAlertSection()
}

const clearTimelineDay = () => {
  selectedTimelineDay.value = ''
  scrollToAlertSection()
}

const resetAllFilters = () => {
  quickFilter.value = 'all'
  alertLevelFilter.value = 'all'
  alertReadFilter.value = 'all'
  alertRange.value = '7d'
  selectedTimelineDay.value = ''
  alertPage.value = 1
  loadCenter()
  scrollToAlertSection()
}

const copyText = async (text: string, successMsg: string) => {
  try {
    await navigator.clipboard.writeText(String(text || ''))
    toast.addToast({ message: successMsg, type: 'success' })
  } catch {
    toast.addToast({ message: '复制失败，请手动复制', type: 'error' })
  }
}

const getFocusableElements = (container: HTMLElement | null): HTMLElement[] => {
  if (!container) return []
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',')
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
}

const focusDrawer = (type: 'alert' | 'audit') => {
  const drawer = type === 'alert' ? alertDrawerRef.value : auditDrawerRef.value
  if (!drawer) return
  const focusables = getFocusableElements(drawer)
  if (focusables.length > 0) {
    focusables[0].focus()
  } else {
    drawer.focus()
  }
}

const restoreFocusAfterDrawer = () => {
  const target = lastFocusedBeforeDrawer.value
  if (target && typeof target.focus === 'function') {
    target.focus()
  }
}

const onDrawerKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (alertDetailVisible.value) {
      closeAlertDetail()
      return
    }
    if (auditDetailVisible.value) {
      closeAuditDetail()
      return
    }
  }

  if (e.key !== 'Tab') return

  const drawer = (e.currentTarget as HTMLElement) || null
  const focusables = getFocusableElements(drawer)
  if (focusables.length === 0) {
    e.preventDefault()
    drawer?.focus()
    return
  }

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null

  if (e.shiftKey) {
    if (!active || active === first || !drawer?.contains(active)) {
      e.preventDefault()
      last.focus()
    }
    return
  }

  if (!active || active === last || !drawer?.contains(active)) {
    e.preventDefault()
    first.focus()
  }
}

const openAlertDetail = (alert: SecurityAlert) => {
  if (!alertDetailVisible.value && !auditDetailVisible.value) {
    lastFocusedBeforeDrawer.value = document.activeElement as HTMLElement | null
  }
  selectedAlert.value = alert || null
  alertDetailJson.value = JSON.stringify(alert || {}, null, 2)
  alertDetailVisible.value = true
  nextTick(() => focusDrawer('alert'))
}

const closeAlertDetail = () => {
  alertDetailVisible.value = false
  selectedAlert.value = null
  if (!auditDetailVisible.value) {
    nextTick(() => restoreFocusAfterDrawer())
  }
}

const openAuditDetail = (audit: SecurityAuditLog) => {
  if (!alertDetailVisible.value && !auditDetailVisible.value) {
    lastFocusedBeforeDrawer.value = document.activeElement as HTMLElement | null
  }
  selectedAudit.value = audit || null
  auditDetailJson.value = JSON.stringify(audit || {}, null, 2)
  auditDetailVisible.value = true
  nextTick(() => focusDrawer('audit'))
}

const closeAuditDetail = () => {
  auditDetailVisible.value = false
  selectedAudit.value = null
  if (!alertDetailVisible.value) {
    nextTick(() => restoreFocusAfterDrawer())
  }
}

const jumpToRelatedAudit = () => {
  if (!selectedAlert.value) {
    toast.addToast({ message: '当前无可关联告警上下文', type: 'info' })
    return
  }
  const alertAt = Date.parse(String(selectedAlert.value?.at || '')) || 0
  const alertGeo = String(selectedAlert.value?.geo || '')
  const alertLevel = String(selectedAlert.value?.level || '').toLowerCase()

  const candidates = (Array.isArray(center.value?.auditLogs) ? center.value.auditLogs : [])
    .map((a) => {
      const reasons: string[] = []
      const at = Date.parse(String(a?.at || '')) || 0
      const dMin = alertAt > 0 && at > 0 ? Math.abs(at - alertAt) / 60000 : 999999
      let score = 0
      if (dMin <= 10) {
        score += 5
        reasons.push('时间≤10m')
      } else if (dMin <= 60) {
        score += 3
        reasons.push('时间≤60m')
      }
      const action = String(a?.action || '').toLowerCase()
      if (action.includes('security') || action.includes('session') || action.includes('risk')) {
        score += 2
        reasons.push('动作关键词')
      }
      const riskLevel = String(a?.detail?.riskLevel || '').toLowerCase()
      if (riskLevel && riskLevel === alertLevel) {
        score += 2
        reasons.push('风险等级一致')
      }
      const geo = String(a?.detail?.geo || '')
      if (geo && alertGeo && geo === alertGeo) {
        score += 1
        reasons.push('地区一致')
      }
      return { row: a, score, reasons }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (candidates.length > 0) {
    relatedAuditCandidates.value = candidates
    openAuditDetail(candidates[0].row)
  } else {
    relatedAuditCandidates.value = []
    toast.addToast({ message: '未找到可关联的审计记录（时间/动作/风险未命中）', type: 'info' })
  }
}

const jumpToRelatedAlert = () => {
  if (!selectedAudit.value) {
    toast.addToast({ message: '当前无可关联审计上下文', type: 'info' })
    return
  }
  const auditAt = Date.parse(String(selectedAudit.value?.at || '')) || 0
  const auditRisk = String(selectedAudit.value?.detail?.riskLevel || '').toLowerCase()
  const auditGeo = String(selectedAudit.value?.detail?.geo || '')

  const candidates = (Array.isArray(center.value?.alerts) ? center.value.alerts : [])
    .map((a) => {
      const at = Date.parse(String(a?.at || '')) || 0
      const dMin = auditAt > 0 && at > 0 ? Math.abs(at - auditAt) / 60000 : 999999
      let score = 0
      const reasons: string[] = []
      if (dMin <= 10) score += 5
      else if (dMin <= 60) score += 3
      if (dMin <= 10) reasons.push('时间≤10m')
      else if (dMin <= 60) reasons.push('时间≤60m')
      const lv = String(a?.level || '').toLowerCase()
      if (auditRisk && lv === auditRisk) score += 2
      if (auditRisk && lv === auditRisk) reasons.push('风险等级一致')
      const geo = String(a?.geo || '')
      if (auditGeo && geo && geo === auditGeo) score += 1
      if (auditGeo && geo && geo === auditGeo) reasons.push('地区一致')
      return { row: a, score, reasons }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (candidates.length > 0) {
    relatedAlertCandidates.value = candidates
    openAlertDetail(candidates[0].row)
  } else {
    relatedAlertCandidates.value = []
    toast.addToast({ message: '未找到可关联的告警记录（时间/等级/地区未命中）', type: 'info' })
  }
}

const copyCompareSummary = () => {
  const s = compareSummary.value
  const lines = [
    `时间差(分钟): ${s.timeDiffMinutes}`,
    `等级一致: ${s.levelMatch ? '是' : '否'}`,
    `地区一致: ${s.geoMatch ? '是' : '否'}`,
    `IP一致: ${s.ipMatch ? '是' : '否'}`
  ]
  copyText(lines.join('\n'), '已复制差异摘要')
}

const exportWeeklyReport = () => {
  const rows = [
    ['指标', '值'],
    ['风险评分', String(center.value?.risk?.score ?? 0)],
    ['风险等级', String(center.value?.risk?.level ?? 'low')],
    ['未读告警', String(center.value?.unreadAlerts ?? 0)],
    ['总告警', String(center.value?.totalAlerts ?? 0)],
    ['高风险告警', String(alertStats.value.high)],
    ['中风险告警', String(alertStats.value.medium)],
    ['低风险告警', String(alertStats.value.low)],
    ['活跃会话', String(sessionStats.value.active)],
    ['已下线会话', String(sessionStats.value.revoked)],
    ['平均会话寿命(分钟)', String(sessionLifetime.value.avgMinutes)],
    ['中位会话寿命(分钟)', String(sessionLifetime.value.medianMinutes)],
    ['Webhook 总队列', String(webhookHealth.value.total)],
    ['Webhook 失败数', String(webhookHealth.value.failed)],
    ['Webhook 平均重试', String(webhookHealth.value.avgAttempts)],
  ]
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `security-weekly-report-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const loadRules = async () => {
  if (!isAdmin.value) return
  try {
    const { response, data } = await apiJsonWithAuth<AdminRulesResponse>('/api/security/admin/rules')
    if (response.ok) rules.value = data?.rules || null
  } catch {
    toast.addToast({ message: '加载安全规则失败', type: 'error' })
  }
}

const saveRules = async () => {
  if (!rules.value) return
  try {
    const resp = await apiFetchWithAuth('/api/security/admin/rules', null, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules.value)
    })
    if (!resp.ok) throw new Error('bad_status')
    toast.addToast({ message: '安全规则已保存', type: 'success' })
    await loadCenter()
  } catch {
    toast.addToast({ message: '保存安全规则失败', type: 'error' })
  }
}

const loadWebhookQueue = async () => {
  if (!isAdmin.value) return
  try {
    const { response, data } = await apiJsonWithAuth<WebhookQueueResponse>('/api/security/webhook-queue')
    if (response.ok) webhookQueue.value = Array.isArray(data?.items) ? data.items : []
  } catch {
    toast.addToast({ message: '加载 Webhook 队列失败', type: 'error' })
  }
}

const loadGeoCache = async () => {
  if (!isAdmin.value) return
  try {
    const { response, data } = await apiJsonWithAuth<GeoCacheResponse>('/api/security/admin/geo-cache')
    if (response.ok) geoCache.value = Array.isArray(data?.items) ? data.items : []
  } catch {
    toast.addToast({ message: '加载 Geo 缓存失败', type: 'error' })
  }
}

const clearGeoCache = async (ip?: string) => {
  const ok = globalThis.confirm(ip ? `确认删除 Geo 缓存：${ip} ?` : '确认清空全部 Geo 缓存？')
  if (!ok) return
  try {
    const r = await apiFetchWithAuth('/api/security/admin/geo-cache/clear', null, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ip ? { ip } : {})
    })
    if (!r.ok) throw new Error('bad_status')
    toast.addToast({ message: ip ? '已删除 Geo 缓存项' : '已清空 Geo 缓存', type: 'success' })
    await loadGeoCache()
  } catch {
    toast.addToast({ message: 'Geo 缓存操作失败', type: 'error' })
  }
}

const replayWebhook = async (id: string) => {
  try {
    const r = await apiFetchWithAuth('/api/security/webhook-replay', null, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
    })
    if (!r.ok) throw new Error('bad_status')
    toast.addToast({ message: 'Webhook 已重新投递', type: 'success' })
    await loadWebhookQueue()
  } catch {
    toast.addToast({ message: 'Webhook 重投失败', type: 'error' })
  }
}

const batchReplay = async (mode: 'failed' | 'pending') => {
  try {
    const r = await apiFetchWithAuth('/api/security/webhook-replay-batch', null, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode })
    })
    if (!r.ok) throw new Error('bad_status')
    toast.addToast({ message: '批量重投已提交', type: 'success' })
    await loadWebhookQueue()
  } catch {
    toast.addToast({ message: '批量重投失败', type: 'error' })
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  const key = String(e.key || '').toLowerCase()
  if (key === 'c' && selectedAlert.value && selectedAudit.value) {
    e.preventDefault()
    copyCompareSummary()
    return
  }

  const activeAudit = sortedRelatedAuditCandidates.value
  const activeAlert = sortedRelatedAlertCandidates.value

  if (key === 'j') {
    e.preventDefault()
    if (auditDetailVisible.value && activeAlert.length > 0) {
      const idx = activeAlert.findIndex((x) => x.row?.id === selectedAlert.value?.id)
      const next = activeAlert[(idx + 1 + activeAlert.length) % activeAlert.length]
      if (next) openAlertDetail(next.row)
      return
    }
    if (alertDetailVisible.value && activeAudit.length > 0) {
      const idx = activeAudit.findIndex((x) => x.row?.id === selectedAudit.value?.id)
      const next = activeAudit[(idx + 1 + activeAudit.length) % activeAudit.length]
      if (next) openAuditDetail(next.row)
    }
    return
  }

  if (key === 'k') {
    e.preventDefault()
    if (auditDetailVisible.value && activeAlert.length > 0) {
      const idx = activeAlert.findIndex((x) => x.row?.id === selectedAlert.value?.id)
      const prev = activeAlert[(idx - 1 + activeAlert.length) % activeAlert.length]
      if (prev) openAlertDetail(prev.row)
      return
    }
    if (alertDetailVisible.value && activeAudit.length > 0) {
      const idx = activeAudit.findIndex((x) => x.row?.id === selectedAudit.value?.id)
      const prev = activeAudit[(idx - 1 + activeAudit.length) % activeAudit.length]
      if (prev) openAuditDetail(prev.row)
    }
  }
}

onMounted(async () => {
  try {
    await loadCenter()
    await loadRules()
    await loadWebhookQueue()
    await loadGeoCache()
  } finally {
    isInitialLoading.value = false
  }
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.panel { margin-bottom: 16px; padding: 16px; }
.security-quick-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.quick-stat { border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px 14px; background: rgba(255,255,255,.03); }
.quick-stat__label { display: block; font-size: 12px; opacity: .8; margin-bottom: 6px; }
.quick-stat__value { font-size: 22px; font-weight: 700; }
.shortcut-hint { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px dashed var(--border-subtle); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.label { font-size: 12px; opacity: .8; }
.value { font-size: 20px; font-weight: 700; }
.risk-low { color: #5fdd8f; }
.risk-medium { color: #f4c25d; }
.risk-high { color: #ff7b7b; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 8px; }
.main { font-weight: 600; }
.sub { font-size: 12px; opacity: .8; }
.ui-btn:focus-visible, .input-select:focus-visible, input:focus-visible, .metric-clickable:focus-visible, .timeline-item.clickable:focus-visible, .kpi-card.clickable:focus-visible {
  outline: 2px solid #7aa2ff;
  outline-offset: 2px;
}
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.code { padding: 6px 8px; border: 1px dashed var(--border-subtle); border-radius: 6px; font-family: ui-monospace, Menlo, Consolas, monospace; }
.timeline-wrap { margin-top: 14px; }
.timeline-list { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.timeline-item { display: flex; justify-content: space-between; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px 10px; }
.skeleton-panel { pointer-events: none; }
.skeleton-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.skeleton-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.skeleton-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.skeleton-block {
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(255,255,255,.06) 25%, rgba(255,255,255,.12) 50%, rgba(255,255,255,.06) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite;
}
.skeleton-block--sm { height: 60px; }
.skeleton-block--title { height: 20px; width: 140px; margin-bottom: 4px; border-radius: 4px; }
.skeleton-block--kpi { height: 60px; }
.skeleton-block--item { height: 44px; }
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-block { animation: none; background: rgba(255,255,255,.08); }
}
.timeline-day { font-weight: 600; }
.timeline-count { font-size: 12px; opacity: .85; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.kpi-card { border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px; background: rgba(255,255,255,.03); }
.kpi-label { font-size: 12px; opacity: .8; }
.kpi-value { font-size: 20px; font-weight: 700; }
.split-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.charts-grid { margin-top: 14px; }
.sub-title { margin: 0 0 8px 0; font-size: 14px; }
.compact-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.compact-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px 10px; }
.compact-item.stack { flex-direction: column; align-items: flex-start; }
.sparkline-wrap { display: flex; flex-direction: column; gap: 8px; }
.spark-row { display: grid; grid-template-columns: 56px 1fr 44px; align-items: center; gap: 8px; }
.spark-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,.12); overflow: hidden; }
.spark-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #60a5fa, #22d3ee); }
.spark-label, .spark-value { font-size: 12px; opacity: .85; }
.donut-wrap { display: grid; grid-template-columns: 84px 1fr; gap: 10px; align-items: center; }
.donut { width: 84px; height: 84px; border-radius: 50%; background: conic-gradient(#ef4444 0deg, #f59e0b 120deg, #22c55e 360deg); display: grid; place-items: center; }
.donut-center { width: 48px; height: 48px; border-radius: 50%; background: rgba(20,20,24,.95); display: grid; place-items: center; font-size: 12px; }
.input-select { border: 1px solid var(--border-subtle); border-radius: 8px; background: rgba(255,255,255,.06); color: var(--text-primary); padding: 8px; }
.pager { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.drawer-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; z-index: 999; }
.drawer { width: min(920px, 92vw); max-height: 82vh; overflow: auto; background: #11131a; border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px; }
.json-view { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.55; }
.small-select { min-width: 96px; font-size: 12px; padding: 6px 8px; }
.candidate-box { margin-bottom: 10px; }
.compare-wrap { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.dual-json { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.metric-clickable { all: unset; display: block; cursor: pointer; }
.clickable { cursor: pointer; }
.muted { opacity: .75; }
@media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .split-grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) { .row, .grid, .codes, .kpi-grid { grid-template-columns: 1fr; } .pager { flex-direction: column; align-items: stretch; } }
</style>
