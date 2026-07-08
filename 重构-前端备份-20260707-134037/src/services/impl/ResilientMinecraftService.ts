import { devWarn } from '@/shared/utils/devLog';
import type { MinecraftApi } from '../api/MinecraftApi';
import type { MinecraftServerStatus } from '../../types/minecraft';

export class ResilientMinecraftService implements MinecraftApi {
  constructor(
    private readonly primary: MinecraftApi,
    private readonly fallback: MinecraftApi
  ) {}

  async getServerStatus(host: string, port: number = 25565, type: 'java' | 'bedrock' = 'java', signal?: AbortSignal | null): Promise<MinecraftServerStatus> {
    try {
      return await this.primary.getServerStatus(host, port, type, signal);
    } catch (error) {
      devWarn(`[ResilientService] Primary service failed for ${host}:${port}. Falling back to secondary.`, error);
      return await this.fallback.getServerStatus(host, port, type, signal);
    }
  }
}
