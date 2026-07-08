import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftServiceImpl } from '../../../src/services/impl/MinecraftServiceImpl';

type FetchMock = ReturnType<typeof vi.fn>;

global.fetch = vi.fn() as unknown as typeof fetch;

describe('MinecraftServiceImpl', () => {
  let service: MinecraftServiceImpl;

  beforeEach(() => {
    service = new MinecraftServiceImpl();
    vi.clearAllMocks();
  });

  it('should fetch and transform server status correctly', async () => {
    const mockResponse = {
      online: true,
      players: {
        online: 10,
        max: 100,
        list: [{ name: 'Player1', uuid: 'uuid1' }]
      },
      motd: {
        clean: ['A Minecraft Server']
      },
      version: '1.20.4'
    };

    const fetchMock = global.fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const status = await service.getServerStatus('mc.example.com');

    expect(status.online).toBe(true);
    expect(status.players.online).toBe(10);
    expect(status.clean_motd).toBe('A Minecraft Server');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry primary, try fallback, then return offline when all requests fail', async () => {
    const fetchMock = global.fetch as unknown as FetchMock;
    fetchMock.mockRejectedValue(new Error('Network Error'));

    const status = await service.getServerStatus('mc.example.com');

    expect(status.online).toBe(false);
    expect(status.success).toBe(false);
    expect(status.status).toBe('offline');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  }, 10000);

  it('should return cached data if fresh', async () => {
    const mockResponse = { online: true };
    const fetchMock = global.fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    await service.getServerStatus('mc.example.com');
    await service.getServerStatus('mc.example.com');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
