import type { MinecraftApi } from './api/MinecraftApi';
import { MinecraftServiceImpl } from './impl/MinecraftServiceImpl';
import { MockMinecraftServiceImpl } from './impl/MockMinecraftServiceImpl';
import { ResilientMinecraftService } from './impl/ResilientMinecraftService';

export class ServiceFactory {
  private static instance: ServiceFactory;
  private minecraftService: MinecraftApi;

  private constructor() {
    const realService = new MinecraftServiceImpl();
    const mockService = new MockMinecraftServiceImpl();
    
    // Use Resilient wrapper: Try Real first, then Mock
    this.minecraftService = new ResilientMinecraftService(realService, mockService);
  }

  public static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  public getMinecraftService(): MinecraftApi {
    return this.minecraftService;
  }
}
