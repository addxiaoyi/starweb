import { devWarn } from '@/shared/utils/devLog';
import { MinecraftApi } from '../api/MinecraftApi';
import type { MinecraftServerStatus } from '../../types/minecraft';

export class MockMinecraftServiceImpl implements MinecraftApi {
  async getServerStatus(host: string, port: number = 25565, type: 'java' | 'bedrock' = 'java', signal?: AbortSignal | null): Promise<MinecraftServerStatus> {
    devWarn(`[Mock Service] Returning mock data for ${type}:${host}:${port}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const isOnline = Math.random() > 0.1; // 90% chance online

    if (!isOnline) {
      return {
        success: false,
        online: false,
        host,
        port,
        status: 'offline',
        type: type === 'bedrock' ? 'Bedrock' : 'Java',
        version: '',
        protocol: '',
        gamemode: '',
        levelname: '',
        players_online: 0,
        players_max: 0,
        players: { online: 0, max: 0, sample: [] },
        software: '',
        clean_motd: '',
        description: 'Mock Server Offline',
        delay: '0ms',
        mod_info: { modList: [] },
        processed: '0ms',
        message: 'Mock Connection Failed'
      };
    }

    return {
      success: true,
      online: true,
      host,
      port,
      status: 'online',
      type: type === 'bedrock' ? 'Bedrock' : 'Java',
      version: '1.20.4',
      protocol: 765,
      gamemode: 'Survival',
      levelname: 'world',
      players_online: Math.floor(Math.random() * 100),
      players_max: 1000,
      players: { 
        online: Math.floor(Math.random() * 100), 
        max: 1000, 
        sample: [] 
      },
      software: 'Paper',
      clean_motd: 'StarMC Development Server',
      description: 'StarMC Development Server',
      motd: null,
      delay: '20ms',
      mod_info: { modList: [] },
      processed: '20ms'
    };
  }
}
