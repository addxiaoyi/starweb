import { ServiceFactory } from '../../services/ServiceFactory';
import type { MinecraftServerStatus, MinecraftPlayer } from '../../types/minecraft';

export type { MinecraftServerStatus, MinecraftPlayer };

export async function getMinecraftServerStatus(
  host: string,
  port: number = 25565,
  type: 'java' | 'bedrock' = 'java',
  signal: AbortSignal | null = null
): Promise<MinecraftServerStatus> {
  const service = ServiceFactory.getInstance().getMinecraftService();
  return service.getServerStatus(host, port, type, signal);
}
