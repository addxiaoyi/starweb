import DOMPurify, { type Config } from 'dompurify';

const purifyConfig: Config = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'br',
    'strong', 'em', 'b', 'i', 'u', 's',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre',
    'img'
  ],
  ALLOWED_ATTR: ['class', 'alt', 'title', 'src', 'width', 'height', 'loading'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['srcdoc', 'style', 'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'oninput', 'onchange', 'onsubmit'],
  SANITIZE_DOM: true,
  SAFE_FOR_TEMPLATES: true,
  KEEP_CONTENT: true
};

export function escapeHtmlContent(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  return DOMPurify.sanitize(html, purifyConfig);
}

export function sanitizeText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return escapeHtmlContent(text)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeHtmlAttribute(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function validateInput(input: string | null | undefined, maxLength: number = 1000): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  if (input.length > maxLength) {
    return false;
  }
  
  const dangerousPatterns = [
    /<script[^>]*>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/gi
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(input));
}

/**
 * 构建 SuperTokens 认证头（HTTP-only Cookie 模式）
 * 
 * 注意：后端已改用 HTTP-only SameSite=strict Cookie 存储 session，
 * 浏览器会自动随请求发送，无需手动设置 Authorization header。
 * 
 * 此函数保留用于向后兼容和特殊场景（如 CORS 预检请求）。
 * 对于同源请求，Cookie 会自动发送。
 */
export function buildSuperTokensAuthHeaders(
  _token: string | null | undefined,
  extra?: HeadersInit
): HeadersInit {
  const h = new Headers(extra || undefined);
  
  // HTTP-only Cookie 模式下不需要手动设置 token
  // 仅保留必要的 SuperTokens 标识头
  h.set('rid', 'session');
  
  return Object.fromEntries(h.entries());
}

export function apiFetchWithAuth(
  input: RequestInfo | URL,
  token?: string | null,
  init?: RequestInit
): Promise<Response> {
  const mergedInit: RequestInit = {
    ...(init || {}),
    headers: buildSuperTokensAuthHeaders(token, init?.headers)
  };
  return fetch(input, mergedInit);
}

export async function apiJsonWithAuth<T = unknown>(
  input: RequestInfo | URL,
  token?: string | null,
  init?: RequestInit
): Promise<{ response: Response; data: T | null }> {
  const response = await apiFetchWithAuth(input, token, init);
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  return { response, data };
}

export async function fetchJsonWithHealthFallback<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallback?: T | null
): Promise<T | null> {
  try {
    const healthResp = await fetch('/api/health', { cache: 'no-store' });
    if (!healthResp.ok) {
      return fallback ?? null;
    }
    const response = await fetch(input, init);
    if (!response.ok) {
      return fallback ?? null;
    }
    return (await response.json()) as T;
  } catch {
    return fallback ?? null;
  }
}

export function applySuperTokensAuthHeadersToXhr(
  xhr: XMLHttpRequest,
  token: string | null | undefined,
  extra?: HeadersInit
): void {
  const headers = buildSuperTokensAuthHeaders(token, extra);
  Object.entries(headers).forEach(([key, value]) => {
    xhr.setRequestHeader(key, value);
  });
}
