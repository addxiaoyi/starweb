import { devWarn } from '@/shared/utils/devLog';
import type { MinecraftApi } from '../api/MinecraftApi';
import type { MinecraftServerStatus, MinecraftPlayer } from '../../types/minecraft';

interface McSrvStatData {
  online: boolean;
  version?: string;
  protocol?: string | number;
  players?: {
    online: number;
    max: number;
    list?: Array<string | { name: string; uuid: string }>;
  };
  motd?: {
    raw: string[];
    clean: string[];
    html: string[];
  };
  software?: string;
}

interface McStatusIoData {
  online: boolean;
  host: string;
  port: number;
  ip_address?: string;
  retrieved_at?: number;
  version?: {
    name_raw?: string;
    name_clean?: string;
    name_html?: string;
    protocol?: number;
  };
  players?: {
    online: number;
    max: number;
    list?: Array<{ uuid: string; name_raw: string; name_clean: string; name_html: string }>;
  };
  motd?: {
    raw: string;
    clean: string;
    html: string;
  };
  icon?: string;
  mods?: unknown[];
  software?: string;
  plugins?: unknown[];
}

export class MinecraftServiceImpl implements MinecraftApi {
  private static CACHE_TTL = 60000;
  private cache = new Map<string, { data: MinecraftServerStatus; timestamp: number }>();

  async getServerStatus(host: string, port: number = 25565, type: 'java' | 'bedrock' = 'java', signal?: AbortSignal | null): Promise<MinecraftServerStatus> {
    const cacheKey = `${type}:${host}:${port}`;
    const cached = this.getFreshCache(cacheKey);
    if (cached) return cached;

    try {
      // Try primary API (mcsrvstat.us)
      const primaryResult = await this.fetchMcSrvStat(host, port, type, signal);
      if (primaryResult.online) {
        this.setCache(cacheKey, primaryResult);
        return primaryResult;
      }

      // If primary reports offline, try fallback API (mcstatus.io)
      devWarn(`[MinecraftService] Primary API reported offline for ${host}:${port}, trying fallback...`);
      const fallbackResult = await this.fetchMcStatusIo(host, port, type, signal);
      this.setCache(cacheKey, fallbackResult);
      return fallbackResult;

    } catch (error) {
      devWarn(`[MinecraftService] Primary API failed for ${host}:${port}, trying fallback...`, error);
      try {
        const fallbackResult = await this.fetchMcStatusIo(host, port, type, signal);
        this.setCache(cacheKey, fallbackResult);
        return fallbackResult;
      } catch (fallbackError) {
        console.error(`[MinecraftService] All APIs failed for ${host}:${port}`, fallbackError);
        const offlineStatus: MinecraftServerStatus = {
          success: false,
          online: false,
          host: host,
          port: port,
          status: 'offline',
          type: type,
          version: 'Unknown',
          protocol: 0,
          gamemode: '',
          levelname: '',
          players_online: 0,
          players_max: 0,
          players: { online: 0, max: 0, sample: [] },
          motd: { raw: [], clean: [], html: [] },
          software: '',
          clean_motd: '',
          description: '',
          delay: '0ms',
          mod_info: { modList: [] },
          processed: '0ms'
        };
        return offlineStatus;
      }
    }
  }

  private async fetchMcSrvStat(host: string, port: number, type: 'java' | 'bedrock', signal?: AbortSignal | null): Promise<MinecraftServerStatus> {
    let retries = 2;
    while (retries >= 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          throw new Error('Request aborted');
        }
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }

      try {
        let apiUrl = '';
        if (type === 'bedrock') {
           apiUrl = port === 19132 ? `https://api.mcsrvstat.us/bedrock/3/${host}` : `https://api.mcsrvstat.us/bedrock/3/${host}:${port}`;
        } else {
           apiUrl = port === 25565 ? `https://api.mcsrvstat.us/3/${host}` : `https://api.mcsrvstat.us/3/${host}:${port}`;
        }
        
        const response = await fetch(apiUrl, {
          signal: controller.signal,
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API Request failed with status ${response.status}`);
        }

        const data = await response.json() as McSrvStatData;
        return this.transformData(data, host, port, type);

      } catch (error) {
        clearTimeout(timeoutId);
        if (retries === 0) throw error;
        retries--;
        await new Promise(r => setTimeout(r, 1000)); // Backoff
      }
    }
    throw new Error('Unreachable code');
  }

  private async fetchMcStatusIo(host: string, port: number, type: 'java' | 'bedrock', signal?: AbortSignal | null): Promise<MinecraftServerStatus> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          throw new Error('Request aborted');
        }
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
    }

    try {
      const apiUrl = type === 'bedrock' 
        ? `https://api.mcstatus.io/v2/status/bedrock/${host}:${port}`
        : `https://api.mcstatus.io/v2/status/java/${host}:${port}`;

      const response = await fetch(apiUrl, {
        signal: controller.signal,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API Request failed with status ${response.status}`);
      }

      const data = await response.json() as McStatusIoData;
      return this.transformMcStatusIoData(data, host, port, type);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private transformMcStatusIoData(data: McStatusIoData, host: string, port: number, type: 'java' | 'bedrock'): MinecraftServerStatus {
    const isOnline = data.online === true;
    
    // Extract players
    const playersSample: MinecraftPlayer[] = (data.players && data.players.list) ? 
      data.players.list.map((player) => ({
        name: player.name_clean || player.name_raw || 'Unknown',
        uuid: player.uuid || null
      })) : [];

    return {
      success: true,
      online: isOnline,
      host: host,
      port: port,
      status: isOnline ? 'online' : 'offline',
      type: type === 'bedrock' ? 'Bedrock' : 'Java',
      version: data.version?.name_clean || data.version?.name_raw || 'Unknown',
      protocol: data.version?.protocol || 0,
      gamemode: '',
      levelname: '',
      players_online: data.players?.online || 0,
      players_max: data.players?.max || 0,
      players: {
        online: data.players?.online || 0,
        max: data.players?.max || 0,
        sample: playersSample
      },
      motd: {
        raw: data.motd?.raw ? [data.motd.raw] : [],
        clean: data.motd?.clean ? [data.motd.clean] : [],
        html: data.motd?.html ? [data.motd.html] : []
      },
      software: data.software || '',
      clean_motd: data.motd?.clean || '',
      description: data.motd?.clean || '',
      delay: '0ms',
      mod_info: { modList: data.mods || [] },
      processed: '0ms'
    };
  }

  private transformData(data: McSrvStatData, host: string, port: number, type: 'java' | 'bedrock'): MinecraftServerStatus {
    const isOnline = data.online === true;
    const playersSample: MinecraftPlayer[] = (data.players && data.players.list) ? 
      data.players.list.map((player) => {
        if (typeof player === 'string') {
          return { name: player, uuid: null };
        } else if (player && typeof player === 'object') {
          return { 
            name: player.name || 'Unknown', 
            uuid: player.uuid || null 
          };
        }
        return { name: 'Unknown', uuid: null };
      }) : [];

    const delay = this.formatAdjustedLatency(0); // API doesn't return latency directly usually, mimicking original util

    return {
      success: true,
      online: isOnline,
      host: host,
      port: port,
      status: isOnline ? 'online' : 'offline',
      type: type === 'bedrock' ? 'Bedrock' : 'Java',
      version: data.version || '',
      protocol: data.protocol || '',
      gamemode: '',
      levelname: '',
      players_online: data.players?.online || 0,
      players_max: data.players?.max || 0,
      players: { 
        online: data.players?.online || 0,
        max: data.players?.max || 0,
        sample: playersSample 
      },
      software: data.software || '',
      clean_motd: data.motd?.clean?.[0] || '',
      description: data.motd?.clean?.[0] || '',
      motd: data.motd || null,
      delay: delay,
      mod_info: { modList: [] },
      processed: delay
    };
  }

  private getFreshCache(key: string): MinecraftServerStatus | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MinecraftServiceImpl.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: MinecraftServerStatus): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private formatAdjustedLatency(raw: unknown): string {
    if (raw === undefined || raw === null) return '10ms';
    const num = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (isNaN(num)) return String(raw);
    const adjusted = Math.max(10, num - 53);
    return `${adjusted}ms`;
  }
}
