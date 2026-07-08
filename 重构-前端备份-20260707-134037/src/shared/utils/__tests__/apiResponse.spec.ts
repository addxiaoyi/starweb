import { describe, expect, it } from 'vitest';
import { normalizePagedResponse, parseApiError } from '../apiResponse';

describe('apiResponse utils', () => {
  it('parseApiError should prefer message', () => {
    expect(parseApiError({ message: '参数错误', code: 'validation_error' }, '请求失败')).toBe(
      '参数错误'
    );
  });

  it('parseApiError should fallback to code when message is missing', () => {
    expect(parseApiError({ code: 'forbidden' }, '请求失败')).toBe('请求失败 [forbidden]');
  });

  it('normalizePagedResponse should normalize root pagination', () => {
    const result = normalizePagedResponse<{ id: number }>(
      {
        items: [{ id: 1 }],
        total: 13,
        page: 99,
        pageSize: 5,
      },
      { page: 1, pageSize: 20 }
    );

    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(13);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it('normalizePagedResponse should respect explicit pagination object', () => {
    const result = normalizePagedResponse<{ id: number }>(
      {
        items: [{ id: 2 }],
        pagination: {
          total: 40,
          page: 2,
          pageSize: 10,
          totalPages: 4,
          hasMore: true,
          hasPrev: true,
        },
      },
      { page: 1, pageSize: 20 }
    );

    expect(result.total).toBe(40);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.pagination.totalPages).toBe(4);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
  });
});
