import type { MinecraftServerStatus } from '../../types/minecraft';

export interface MinecraftApi {
  getServerStatus(host: string, port?: number, type?: 'java' | 'bedrock', signal?: AbortSignal | null): Promise<MinecraftServerStatus>;
}
