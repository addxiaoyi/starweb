import { describe, expect, it, vi } from 'vitest';
import {
  apiFetchWithAuth,
  buildSuperTokensAuthHeaders,
  escapeHtmlContent,
  sanitizeHtml,
} from '../../../src/shared/utils/security';

describe('security utils - SuperTokens headers', () => {
  it('should build cookie-mode headers and preserve extra headers', () => {
    const rawHeaders = buildSuperTokensAuthHeaders('token-123', {
      'Content-Type': 'application/json',
      'X-Trace-Id': 'trace-1',
    });
    const headers = new Headers(rawHeaders);

    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('st-access-token')).toBeNull();
    expect(headers.get('st-auth-mode')).toBeNull();
    expect(headers.get('rid')).toBe('session');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-trace-id')).toBe('trace-1');
  });

  it('should only return the session marker and extra headers when token is missing', () => {
    const rawHeaders = buildSuperTokensAuthHeaders('', {
      'Content-Type': 'application/json',
    });
    const headers = new Headers(rawHeaders);

    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('st-access-token')).toBeNull();
    expect(headers.get('rid')).toBe('session');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('apiFetchWithAuth should merge auth headers into fetch init', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);

    await apiFetchWithAuth('/api/demo', 'abc-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(init?.method).toBe('POST');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('st-access-token')).toBeNull();
    expect(headers.get('rid')).toBe('session');
    expect(headers.get('content-type')).toBe('application/json');

    fetchSpy.mockRestore();
  });
});

describe('security utils - HTML sanitization', () => {
  it('removes scriptable markup and event handlers', () => {
    const html = sanitizeHtml('<p onclick="alert(1)">hello</p><img src="x" onerror="alert(1)"><script>alert(1)</script>');

    expect(html).toContain('<p>hello</p>');
    expect(html).toContain('<img src="x">');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('escapes text fragments before they are reassembled into v-html content', () => {
    expect(escapeHtmlContent('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});
