<template>
  <div class="web-vitals-dashboard">
    <h2 class="dashboard-title">性能监控</h2>
    
    <div class="metrics-grid">
      <!-- LCP -->
      <div class="metric-card" :class="lcpStatus">
        <div class="metric-header">
          <span class="metric-name">LCP</span>
          <span class="metric-badge" :class="lcpStatus">{{ lcpStatusText }}</span>
        </div>
        <div class="metric-value">{{ formatMetric(lcp) }}</div>
        <div class="metric-desc">最大内容绘制</div>
        <div class="metric-threshold">
          <div class="threshold-bar">
            <div class="threshold-fill" :style="{ width: lcpPercent + '%', background: lcpColor }"></div>
          </div>
          <div class="threshold-labels">
            <span>0s</span>
            <span>2.5s</span>
            <span>4s</span>
          </div>
        </div>
      </div>

      <!-- FID / INP -->
      <div class="metric-card" :class="inpStatus">
        <div class="metric-header">
          <span class="metric-name">INP</span>
          <span class="metric-badge" :class="inpStatus">{{ inpStatusText }}</span>
        </div>
        <div class="metric-value">{{ formatMetric(inp, 'ms') }}</div>
        <div class="metric-desc">交互到下一次绘制</div>
        <div class="metric-threshold">
          <div class="threshold-bar">
            <div class="threshold-fill" :style="{ width: inpPercent + '%', background: inpColor }"></div>
          </div>
          <div class="threshold-labels">
            <span>0ms</span>
            <span>200ms</span>
            <span>500ms</span>
          </div>
        </div>
      </div>

      <!-- CLS -->
      <div class="metric-card" :class="clsStatus">
        <div class="metric-header">
          <span class="metric-name">CLS</span>
          <span class="metric-badge" :class="clsStatus">{{ clsStatusText }}</span>
        </div>
        <div class="metric-value">{{ cls.toFixed(3) }}</div>
        <div class="metric-desc">累积布局偏移</div>
        <div class="metric-threshold">
          <div class="threshold-bar">
            <div class="threshold-fill" :style="{ width: clsPercent + '%', background: clsColor }"></div>
          </div>
          <div class="threshold-labels">
            <span>0</span>
            <span>0.1</span>
            <span>0.25</span>
          </div>
        </div>
      </div>

      <!-- TTFB -->
      <div class="metric-card" :class="ttfbStatus">
        <div class="metric-header">
          <span class="metric-name">TTFB</span>
          <span class="metric-badge" :class="ttfbStatus">{{ ttfbStatusText }}</span>
        </div>
        <div class="metric-value">{{ formatMetric(ttfb, 'ms') }}</div>
        <div class="metric-desc">首字节时间</div>
        <div class="metric-threshold">
          <div class="threshold-bar">
            <div class="threshold-fill" :style="{ width: ttfbPercent + '%', background: ttfbColor }"></div>
          </div>
          <div class="threshold-labels">
            <span>0ms</span>
            <span>800ms</span>
            <span>1800ms</span>
          </div>
        </div>
      </div>

      <!-- FCP -->
      <div class="metric-card" :class="fcpStatus">
        <div class="metric-header">
          <span class="metric-name">FCP</span>
          <span class="metric-badge" :class="fcpStatus">{{ fcpStatusText }}</span>
        </div>
        <div class="metric-value">{{ formatMetric(fcp) }}</div>
        <div class="metric-desc">首次内容绘制</div>
        <div class="metric-threshold">
          <div class="threshold-bar">
            <div class="threshold-fill" :style="{ width: fcpPercent + '%', background: fcpColor }"></div>
          </div>
          <div class="threshold-labels">
            <span>0s</span>
            <span>1.8s</span>
            <span>3s</span>
          </div>
        </div>
      </div>

      <!-- 综合评分 -->
      <div class="metric-card overall" :class="overallStatus">
        <div class="metric-header">
          <span class="metric-name">综合评分</span>
          <span class="metric-badge" :class="overallStatus">{{ overallStatusText }}</span>
        </div>
        <div class="metric-value large">{{ overallScore }}</div>
        <div class="metric-desc">Core Web Vitals</div>
        <div class="metric-hint">
          基于 LCP、INP、CLS 计算
        </div>
      </div>
    </div>

    <!-- 历史趋势 -->
    <div class="trends-section" v-if="showTrends">
      <h3 class="section-title">历史趋势</h3>
      <div class="trends-chart">
        <div
          v-for="(point, index) in trendData"
          :key="index"
          class="trend-bar"
          :style="{ height: point.score + '%', background: point.color }"
          :title="`${point.time}: ${point.score}`"
        ></div>
      </div>
      <div class="trend-labels">
        <span v-for="(point, index) in trendData" :key="index">
          {{ point.label }}
        </span>
      </div>
    </div>

    <!-- 优化建议 -->
    <div class="suggestions-section" v-if="suggestions.length > 0">
      <h3 class="section-title">优化建议</h3>
      <ul class="suggestions-list">
        <li
          v-for="(suggestion, index) in suggestions"
          :key="index"
          class="suggestion-item"
          :class="suggestion.priority"
        >
          <AppIcon name="warning" :size="18" />
          <span class="suggestion-text">{{ suggestion.text }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppIcon from '@/components/atoms/AppIcon.vue';
import { getWebVitalsData, type WebVitalsMetrics } from '@/shared/utils/reportWebVitals';

// 指标数据
const lcp = ref(0);
const inp = ref(0);
const cls = ref(0);
const ttfb = ref(0);
const fcp = ref(0);

// 阈值配置
const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  ttfb: { good: 800, poor: 1800 },
  fcp: { good: 1800, poor: 3000 },
};

// 计算状态
function getStatus(value: number, thresholds: { good: number; poor: number }) {
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-improvement';
  return 'poor';
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    good: '良好',
    'needs-improvement': '需改进',
    poor: '较差',
  };
  return map[status] || status;
}

function getColor(status: string) {
  const map: Record<string, string> = {
    good: '#4ade80',
    'needs-improvement': '#fbbf24',
    poor: '#f87171',
  };
  return map[status] || '#9ca3af';
}

function getPercent(value: number, max: number) {
  return Math.min((value / max) * 100, 100);
}

// LCP
const lcpStatus = computed(() => getStatus(lcp.value, THRESHOLDS.lcp));
const lcpStatusText = computed(() => getStatusText(lcpStatus.value));
const lcpColor = computed(() => getColor(lcpStatus.value));
const lcpPercent = computed(() => getPercent(lcp.value, 4000));

// INP
const inpStatus = computed(() => getStatus(inp.value, THRESHOLDS.inp));
const inpStatusText = computed(() => getStatusText(inpStatus.value));
const inpColor = computed(() => getColor(inpStatus.value));
const inpPercent = computed(() => getPercent(inp.value, 500));

// CLS
const clsStatus = computed(() => getStatus(cls.value, THRESHOLDS.cls));
const clsStatusText = computed(() => getStatusText(clsStatus.value));
const clsColor = computed(() => getColor(clsStatus.value));
const clsPercent = computed(() => getPercent(cls.value, 0.25));

// TTFB
const ttfbStatus = computed(() => getStatus(ttfb.value, THRESHOLDS.ttfb));
const ttfbStatusText = computed(() => getStatusText(ttfbStatus.value));
const ttfbColor = computed(() => getColor(ttfbStatus.value));
const ttfbPercent = computed(() => getPercent(ttfb.value, 1800));

// FCP
const fcpStatus = computed(() => getStatus(fcp.value, THRESHOLDS.fcp));
const fcpStatusText = computed(() => getStatusText(fcpStatus.value));
const fcpColor = computed(() => getColor(fcpStatus.value));
const fcpPercent = computed(() => getPercent(fcp.value, 3000));

// 综合评分
const overallScore = computed(() => {
  const scores = [
    lcpStatus.value === 'good' ? 100 : lcpStatus.value === 'needs-improvement' ? 50 : 0,
    inpStatus.value === 'good' ? 100 : inpStatus.value === 'needs-improvement' ? 50 : 0,
    clsStatus.value === 'good' ? 100 : clsStatus.value === 'needs-improvement' ? 50 : 0,
  ];
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
});

const overallStatus = computed(() => {
  if (overallScore.value >= 90) return 'good';
  if (overallScore.value >= 50) return 'needs-improvement';
  return 'poor';
});

const overallStatusText = computed(() => getStatusText(overallStatus.value));

// 格式化指标值
function formatMetric(value: number, unit = 's'): string {
  if (unit === 's') {
    return value < 1000 ? `${value.toFixed(0)}ms` : `${(value / 1000).toFixed(2)}s`;
  }
  return `${Math.round(value)}${unit}`;
}

// 趋势数据（模拟）
const showTrends = ref(false);
const trendData = ref([
  { time: '10:00', score: 85, color: '#4ade80', label: '10:00' },
  { time: '11:00', score: 78, color: '#fbbf24', label: '11:00' },
  { time: '12:00', score: 92, color: '#4ade80', label: '12:00' },
  { time: '13:00', score: 88, color: '#4ade80', label: '13:00' },
  { time: '14:00', score: 75, color: '#fbbf24', label: '14:00' },
  { time: '15:00', score: 95, color: '#4ade80', label: '15:00' },
]);

// 优化建议
const suggestions = computed(() => {
  const list: { text: string; priority: 'high' | 'medium' | 'low'; icon: string }[] = [];
  
  if (lcpStatus.value !== 'good') {
    list.push({
      text: '优化 LCP：压缩图片、使用 CDN、启用预加载',
      priority: lcpStatus.value === 'poor' ? 'high' : 'medium',
      icon: 'image',
    });
  }
  
  if (inpStatus.value !== 'good') {
    list.push({
      text: '优化 INP：减少主线程阻塞、优化事件处理',
      priority: inpStatus.value === 'poor' ? 'high' : 'medium',
      icon: 'zap',
    });
  }
  
  if (clsStatus.value !== 'good') {
    list.push({
      text: '优化 CLS：为图片设置尺寸、避免插入内容',
      priority: clsStatus.value === 'poor' ? 'high' : 'medium',
      icon: 'layout',
    });
  }
  
  return list;
});

onMounted(() => {
  // 获取 Web Vitals 数据
  const data = getWebVitalsData();
  if (data) {
    lcp.value = data.lcp || 0;
    inp.value = data.inp || 0;
    cls.value = data.cls || 0;
    ttfb.value = data.ttfb || 0;
    fcp.value = data.fcp || 0;
  }
});
</script>

<style scoped lang="scss">
.web-vitals-dashboard {
  padding: 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}

.dashboard-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 20px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.metric-card {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  transition: all 0.2s;

  &.good {
    border-color: rgba(74, 222, 128, 0.3);
  }

  &.needs-improvement {
    border-color: rgba(251, 191, 36, 0.3);
  }

  &.poor {
    border-color: rgba(248, 113, 113, 0.3);
  }

  &.overall {
    background: linear-gradient(135deg, rgba(124, 140, 255, 0.1), rgba(92, 109, 232, 0.1));
  }
}

.metric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.metric-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.metric-badge {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 12px;

  &.good {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }

  &.needs-improvement {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  &.poor {
    background: rgba(248, 113, 113, 0.15);
    color: #f87171;
  }
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;

  &.large {
    font-size: 36px;
  }
}

.metric-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 12px;
}

.metric-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.metric-threshold {
  margin-top: 8px;
}

.threshold-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.threshold-fill {
  height: 100%;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.threshold-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

// 趋势
.trends-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 16px;
}

.trends-chart {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 100px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.trend-bar {
  flex: 1;
  min-width: 20px;
  border-radius: 4px 4px 0 0;
  transition: all 0.2s;

  &:hover {
    opacity: 0.8;
  }
}

.trend-labels {
  display: flex;
  justify-content: space-around;
  margin-top: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

// 建议
.suggestions-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);

  &.high {
    border-left: 3px solid #f87171;
  }

  &.medium {
    border-left: 3px solid #fbbf24;
  }

  &.low {
    border-left: 3px solid #4ade80;
  }

  svg {
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }
}
</style>
