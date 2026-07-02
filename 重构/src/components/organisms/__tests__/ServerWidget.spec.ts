import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ServerWidget from '../ServerWidget.vue';

vi.mock('gsap', () => ({
  gsap: {
    from: vi.fn(),
  },
}));

vi.mock('@/shared/utils/BlockParticle', () => ({
  blockParticle: {
    emit: vi.fn(),
  },
}));

describe('ServerWidget', () => {
  it('renders correctly', () => {
    const wrapper = mount(ServerWidget, {
      props: {
        serversData: [],
      },
      global: {
        stubs: {
          OptimizedImage: true,
          SkeletonLoader: true,
        },
      },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('displays offline message when server is offline', async () => {
    const wrapper = mount(ServerWidget, {
      props: {
        serversData: [
          {
            id: 1,
            name: 'Test Server',
            label: 'Survival',
            ip: '127.0.0.1',
            online: false,
            loading: false,
            players: { online: 0, max: 100 },
            version: '1.20',
          },
        ],
      },
      global: {
        stubs: {
          OptimizedImage: true,
          SkeletonLoader: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Server Offline');
  });

  it('displays online stats when server is online', async () => {
    const wrapper = mount(ServerWidget, {
      props: {
        serversData: [
          {
            id: 1,
            name: 'Test Server',
            label: 'Survival',
            ip: '127.0.0.1',
            online: true,
            loading: false,
            players: { online: 50, max: 100 },
            version: '1.20',
            ping: 20,
          },
        ],
      },
      global: {
        stubs: {
          OptimizedImage: true,
          SkeletonLoader: true,
        },
      },
    });

    expect(wrapper.text()).toContain('50 / 100');
    expect(wrapper.text()).toContain('20ms');
  });
});
