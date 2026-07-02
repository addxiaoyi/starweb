<template>
  <div class="ztjkPage">
    <div class="backgroundDecoration">
      <div class="gradientCircle circle1"></div>
      <div class="gradientCircle circle2"></div>
    </div>

    <div class="sectionContainer page-shell">
      <div class="sectionHeader page-hero">
        <h1 class="sectionDescription page-hero__title">
          服务器状态监控
        </h1>
        <p class="subtitle page-hero__subtitle" data-typography="prose">
          实时监控所有服务器状态，支持趋势图与容量分析
        </p>
        <div class="dashboardEntry" v-if="myDashboardLink">
          <RouterLink class="dashboardEntryBtn ui-btn" :to="myDashboardLink">进入我的仪表盘</RouterLink>
        </div>
      </div>

      <section class="overviewGrid" aria-label="核心指标">
        <article class="overviewCard ui-card">
          <p class="overviewLabel">在线服务器</p>
          <p class="overviewValue">{{ onlineServerCount }} / {{ servers.length }}</p>
          <p class="overviewHint">可用率 {{ availabilityRate }}%</p>
        </article>

        <article class="overviewCard">
          <p class="overviewLabel">当前在线玩家</p>
          <p class="overviewValue">{{ totalPlayersOnline }} / {{ totalPlayersMax }}</p>
          <p class="overviewHint">容量占用 {{ capacityUsagePercent }}%</p>
        </article>

        <article class="overviewCard">
          <p class="overviewLabel">平均延迟</p>
          <p class="overviewValue">{{ averagePing }}ms</p>
          <p class="overviewHint">在线服延迟均值</p>
        </article>

        <article class="overviewCard">
          <p class="overviewLabel">趋势窗口</p>
          <p class="overviewValue">{{ snapshotCount }}</p>
          <p class="overviewHint">最近 {{ HISTORY_LIMIT }} 次采样</p>
        </article>
      </section>

      <section class="chartGrid" aria-label="图表看板">
        <article class="chartCard ui-card">
          <header class="chartHeader">
            <h2>玩家在线趋势</h2>
            <span>{{ totalPlayersOnline }} 人</span>
          </header>
          <div class="lineChart" role="img" aria-label="玩家在线趋势图">
            <div class="lineArea" :style="{ clipPath: playerTrendClipPath }"></div>
            <div class="lineDots">
              <span
                v-for="(value, idx) in normalizedPlayersTrend"
                :key="`player-dot-${idx}`"
                :style="{ left: `${(idx / Math.max(1, normalizedPlayersTrend.length - 1)) * 100}%`, bottom: `${value}%` }"
              />
            </div>
          </div>
          <footer class="chartFooter">近 {{ snapshotCount }} 个采样点，峰值 {{ playerTrendPeak }} 人</footer>
        </article>

        <article class="chartCard">
          <header class="chartHeader">
            <h2>延迟趋势</h2>
            <span>{{ averagePing }}ms</span>
          </header>
          <div class="lineChart lineChart--ping" role="img" aria-label="服务器延迟趋势图">
            <div class="lineArea" :style="{ clipPath: pingTrendClipPath }"></div>
            <div class="lineDots">
              <span
                v-for="(value, idx) in normalizedPingTrend"
                :key="`ping-dot-${idx}`"
                :style="{ left: `${(idx / Math.max(1, normalizedPingTrend.length - 1)) * 100}%`, bottom: `${value}%` }"
              />
            </div>
          </div>
          <footer class="chartFooter">近 {{ snapshotCount }} 个采样点，峰值 {{ pingTrendPeak }}ms</footer>
        </article>

        <article class="chartCard chartCard--full ui-card">
          <header class="chartHeader">
            <h2>分服容量对比</h2>
            <span>按当前在线人数</span>
          </header>
          <div class="barChart">
            <div v-for="server in servers" :key="`bar-${server.id}`" class="barRow">
              <div class="barMeta">
                <span>{{ server.name }}</span>
                <span>{{ server.players.online }} / {{ server.players.max }}</span>
              </div>
              <div class="barTrack">
                <div class="barFill" :style="{ width: `${getServerCapacityPercent(server)}%`, backgroundColor: server.color || '#60a5fa' }"></div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="serverStatusSection">
        <ServerWidget
          :servers-data="servers"
          :show-dashboard="true"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { devLog } from '@/shared/utils/devLog';
import { getMinecraftServerStatus, type MinecraftServerStatus } from '@/shared/utils/minecraftServerUtils';
import ServerWidget, { type ServerData } from '@/components/organisms/ServerWidget.vue';
import { getWensetConfig } from '@/shared/config/wenset';
import { useAuthStore } from '@/stores/auth';

const config = getWensetConfig();
const auth = useAuthStore();
const HISTORY_LIMIT = 24;

const servers = ref<ServerData[]>([
  {
    id: 2,
    name: '综合线路',
    label: 'Backup Line',
    ip: config.server.javaIp,
    port: 25565,
    emoji: '🛡️',
    type: 'backup',
    color: '#10b981',
    status: 'unknown',
    online: false,
    ping: 0,
    players: { online: 0, max: 0 },
    version: '',
    motd: null,
    loading: true
  },
  {
    id: 4,
    name: 'StarMC 枪战',
    label: 'Gun PVP',
    ip: config.server.gunIp,
    port: 25565,
    emoji: '🔫',
    type: 'pvp',
    color: '#ef4444',
    status: 'unknown',
    online: false,
    ping: 0,
    players: { online: 0, max: 0 },
    version: '',
    motd: null,
    loading: true
  }
]);

const playerTrend = ref<number[]>([]);
const pingTrend = ref<number[]>([]);

const pushHistory = (bucket: number[], value: number) => {
  bucket.push(Math.max(0, Math.round(value)));
  if (bucket.length > HISTORY_LIMIT) bucket.shift();
};

const normalizeSeries = (series: number[]) => {
  if (!series.length) return [0];
  const max = Math.max(...series, 1);
  return series.map((value) => Math.round((value / max) * 100));
};

const buildClipPath = (series: number[]) => {
  if (!series.length) return 'polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)';

  const points = series
    .map((value, idx) => {
      const x = (idx / Math.max(1, series.length - 1)) * 100;
      const y = 100 - value;
      return `${x}% ${y}%`;
    })
    .join(', ');

  return `polygon(0% 100%, ${points}, 100% 100%)`;
};

const onlineServerCount = computed(() => servers.value.filter((server) => server.online).length);
const totalPlayersOnline = computed(() => servers.value.reduce((sum, server) => sum + (server.online ? server.players.online : 0), 0));
const totalPlayersMax = computed(() => servers.value.reduce((sum, server) => sum + (server.players.max || 0), 0));
const availabilityRate = computed(() => {
  if (!servers.value.length) return 0;
  return Math.round((onlineServerCount.value / servers.value.length) * 100);
});
const capacityUsagePercent = computed(() => {
  if (!totalPlayersMax.value) return 0;
  return Math.round((totalPlayersOnline.value / totalPlayersMax.value) * 100);
});
const averagePing = computed(() => {
  const onlinePings = servers.value.filter((server) => server.online && typeof server.ping === 'number').map((server) => server.ping || 0);
  if (!onlinePings.length) return 0;
  return Math.round(onlinePings.reduce((sum, ping) => sum + ping, 0) / onlinePings.length);
});

const normalizedPlayersTrend = computed(() => normalizeSeries(playerTrend.value));
const normalizedPingTrend = computed(() => normalizeSeries(pingTrend.value));

const playerTrendClipPath = computed(() => buildClipPath(normalizedPlayersTrend.value));
const pingTrendClipPath = computed(() => buildClipPath(normalizedPingTrend.value));

const playerTrendPeak = computed(() => (playerTrend.value.length ? Math.max(...playerTrend.value) : 0));
const pingTrendPeak = computed(() => (pingTrend.value.length ? Math.max(...pingTrend.value) : 0));
const snapshotCount = computed(() => Math.max(playerTrend.value.length, pingTrend.value.length));
const myDashboardLink = computed(() => {
  const uid = String(auth.user?.id || '').trim();
  return uid ? `/dashboard/${uid}` : '';
});

const getServerCapacityPercent = (server: ServerData) => {
  if (!server.players.max) return 0;
  return Math.min(100, Math.round((server.players.online / server.players.max) * 100));
};

let updateTimer: ReturnType<typeof setInterval> | null = null;

const updateAllServers = async () => {
  const updatePromises = servers.value.map(async (server, index) => {
    try {
      servers.value[index].loading = true;
      const result = await getMinecraftServerStatus(server.ip, server.port) as MinecraftServerStatus;

      if (result.online) {
        servers.value[index].status = 'online';
        servers.value[index].online = true;
        const pingMatch = result.delay.match(/(\d+)/);
        servers.value[index].ping = pingMatch ? parseInt(pingMatch[1], 10) : 0;
        servers.value[index].players = {
          online: result.players.online,
          max: result.players.max
        };
        servers.value[index].version = result.version || '';
        servers.value[index].motd = result.motd || null;
      } else {
        servers.value[index].status = 'offline';
        servers.value[index].online = false;
        servers.value[index].ping = 0;
        servers.value[index].players = { online: 0, max: 0 };
        servers.value[index].version = '';
        servers.value[index].motd = null;
      }
    } catch (error) {
      devLog(`Failed to update server status for ${server.ip}:`, error);
      servers.value[index].status = 'offline';
      servers.value[index].online = false;
      servers.value[index].ping = 0;
      servers.value[index].players = { online: 0, max: 0 };
      servers.value[index].version = '';
      servers.value[index].motd = null;
    } finally {
      servers.value[index].loading = false;
    }
  });

  await Promise.allSettled(updatePromises);

  pushHistory(playerTrend.value, totalPlayersOnline.value);
  pushHistory(pingTrend.value, averagePing.value);
};

onMounted(() => {
  updateAllServers();
  updateTimer = setInterval(() => {
    updateAllServers();
  }, 15000);
});

onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer);
  }
});
</script>

<style scoped lang="scss">
.ztjkPage {
  position: relative;
  min-height: 100vh;
  width: 100%;
  overflow-x: hidden;
  background: #0f0f13;
  color: #fff;
  padding-bottom: 50px;

  background-image:
    linear-gradient(30deg, #1a1a20 12%, transparent 12.5%, transparent 87%, #1a1a20 87.5%, #1a1a20),
    linear-gradient(150deg, #1a1a20 12%, transparent 12.5%, transparent 87%, #1a1a20 87.5%, #1a1a20),
    linear-gradient(30deg, #1a1a20 12%, transparent 12.5%, transparent 87%, #1a1a20 87.5%, #1a1a20),
    linear-gradient(150deg, #1a1a20 12%, transparent 12.5%, transparent 87%, #1a1a20 87.5%, #1a1a20),
    linear-gradient(60deg, #1a1a2077 25%, transparent 25.5%, transparent 75%, #1a1a2077 75%, #1a1a2077),
    linear-gradient(60deg, #1a1a2077 25%, transparent 25.5%, transparent 75%, #1a1a2077 75%, #1a1a2077);
  background-size: 80px 140px;
  background-position: 0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px;
}

.backgroundDecoration {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
    opacity: 0.4;
    mix-blend-mode: overlay;
  }

  .gradientCircle {
    position: absolute;
    filter: blur(120px);
    opacity: 0.1;
    border-radius: 50%;
  }

  .circle1 {
    width: 800px;
    height: 800px;
    background: radial-gradient(circle, #10b981, transparent 70%);
    top: -200px;
    right: -200px;
  }

  .circle2 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #3b82f6, transparent 70%);
    bottom: -150px;
    left: -150px;
  }
}

.sectionContainer {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 100px 20px 40px;
}

.sectionHeader {
  margin-bottom: 28px;
  text-align: center;
}

.sectionDescription {
  font-family: 'Minecraft', sans-serif;
  font-size: clamp(2rem, 4.5vw, 3rem);
  color: #fff;
  margin: 0;
  letter-spacing: 2px;
}

.subtitle {
  color: #94a3b8;
  font-size: 1.1rem;
  margin-top: 1rem;
}

.dashboardEntry {
  margin-top: 14px;
}

.dashboardEntryBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(56, 189, 248, 0.55);
  color: #dff6ff;
  text-decoration: none;
  background: rgba(14, 116, 144, 0.2);
  transition: all 0.2s ease;
}

.dashboardEntryBtn:hover {
  border-color: rgba(125, 211, 252, 0.85);
  background: rgba(14, 116, 144, 0.32);
}

.overviewGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.overviewCard {
  padding: 16px;
  border-radius: 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  backdrop-filter: blur(8px);
}

.overviewCard,
.chartCard {
  box-shadow: var(--shadow-1);
}

.overviewLabel {
  color: var(--brand-primary);
  font-size: 0.82rem;
  margin: 0 0 10px;
}

.overviewValue {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
}

.overviewHint {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.chartGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.chartCard {
  padding: 16px;
  border-radius: 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  backdrop-filter: blur(8px);
}

.chartCard--full {
  grid-column: 1 / -1;
}

.chartHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 1rem;
    color: #e2e8f0;
    font-weight: 700;
  }

  span {
    color: #93c5fd;
    font-size: 0.82rem;
  }
}

.lineChart {
  position: relative;
  height: 130px;
  border-radius: 10px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  background: linear-gradient(to top, rgba(14, 116, 144, 0.2), rgba(15, 23, 42, 0.4));
  overflow: hidden;
}

.lineChart--ping {
  border-color: rgba(248, 113, 113, 0.35);
  background: linear-gradient(to top, rgba(127, 29, 29, 0.2), rgba(15, 23, 42, 0.4));
}

.lineArea {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.48), rgba(2, 132, 199, 0.1));
}

.lineChart--ping .lineArea {
  background: linear-gradient(180deg, rgba(248, 113, 113, 0.52), rgba(185, 28, 28, 0.08));
}

.lineDots {
  position: absolute;
  inset: 0;

  span {
    position: absolute;
    width: 7px;
    height: 7px;
    transform: translate(-50%, 50%);
    border-radius: 50%;
    background: #f8fafc;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.45);
  }
}

.lineChart--ping .lineDots span {
  box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.45);
}

.chartFooter {
  margin-top: 10px;
  color: #94a3b8;
  font-size: 0.76rem;
}

.barChart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.barMeta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.82rem;
  color: #cbd5e1;
}

.barTrack {
  height: 10px;
  border-radius: 999px;
  background: rgba(51, 65, 85, 0.7);
  overflow: hidden;
}

.barFill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.5s ease;
}

.serverStatusSection {
  margin-top: 12px;
}

@media (max-width: 1024px) {
  .overviewGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chartGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .sectionContainer {
    padding: 80px 15px 30px;
  }

  .sectionDescription {
    font-size: 2rem;
    letter-spacing: 2px;
  }

  .subtitle {
    font-size: 1rem;
    margin-top: 0.5rem;
  }

  .overviewGrid {
    grid-template-columns: 1fr;
  }
}
</style>
