import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore, type User } from '@/stores/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('should start with no user and logged out', () => {
    const store = useAuthStore();
    expect(store.user).toBeNull();
    expect(store.isLoggedIn).toBe(false);
  });

  it('should set and clear user', () => {
    const store = useAuthStore();
    const testUser: User = {
      uuid: '123-456',
      username: 'testuser',
      email: 'test@example.com',
    };

    store.setUser(testUser);
    expect(store.user).toEqual(testUser);
    expect(store.isLoggedIn).toBe(true);

    store.logout();
    expect(store.user).toBeNull();
    expect(store.isLoggedIn).toBe(false);
  });

  it('should identify admin role correctly', () => {
    const store = useAuthStore();

    store.setUser({ uuid: '1', username: 'user1', role: 'admin' });
    expect(store.canReviewSubmissions).toBe(true);

    store.setUser({ uuid: '2', username: 'user2', role: 'user' });
    expect(store.canReviewSubmissions).toBe(false);
  });

  it('should identify reviewer role correctly', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'reviewer', role: 'reviewer' });

    expect(store.canReviewSubmissions).toBe(true);
  });

  it('should identify moderator role correctly', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'mod', role: 'moderator' });

    expect(store.canReviewSubmissions).toBe(true);
  });

  it('should identify staff role correctly', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'staff', role: 'staff' });

    expect(store.canReviewSubmissions).toBe(true);
  });

  it('should support roles array', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'user', roles: ['reviewer', 'viewer'] });

    expect(store.canReviewSubmissions).toBe(true);
  });

  it('should return false when no user is set', () => {
    const store = useAuthStore();
    store.setUser(null);

    expect(store.canReviewSubmissions).toBe(false);
  });

  it('should handle case-insensitive role matching', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'user', role: 'ADMIN' });

    expect(store.canReviewSubmissions).toBe(true);
  });

  it('should prefer backend permission capabilities when available', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'plain-user', role: 'user' });
    store.setPermissions({
      roles: ['user'],
      capabilities: {
        canReviewSubmissions: true,
        canManageUsers: false,
      },
    });

    expect(store.canReviewSubmissions).toBe(true);
    expect(store.canManageUsers).toBe(false);
  });

  it('should clear permissions on logout', () => {
    const store = useAuthStore();
    store.setUser({ uuid: '1', username: 'admin', role: 'admin' });
    store.setPermissions({
      roles: ['admin'],
      capabilities: { canManageUsers: true },
    });

    store.logout();
    expect(store.permissions).toBeNull();
    expect(store.canManageUsers).toBe(false);
  });
});
