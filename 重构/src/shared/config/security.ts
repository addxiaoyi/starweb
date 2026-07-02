import { getWensetConfig } from './wenset';

export interface SecurityConfig {
  TRUSTED_DOMAINS: string[];
  ALLOWED_EXTERNAL_RESOURCES: {
    IMAGES: string[];
    IFRAMES: string[];
    API: string[];
  };
  CSP_POLICY: Record<string, string>;
  SANITIZE_CONFIG: {
    ALLOWED_TAGS: string[];
    ALLOWED_ATTR: string[];
    FORBID_TAGS: string[];
    FORBID_ATTR: string[];
  };
  RATE_LIMITING: {
    MAX_REQUESTS_PER_MINUTE: number;
    MAX_LOGIN_ATTEMPTS: number;
    LOCKOUT_DURATION: number;
  };
  SESSION_CONFIG: {
    COOKIE_SAMESITE: 'Strict' | 'Lax' | 'None';
    COOKIE_SECURE: boolean;
    COOKIE_HTTPONLY: boolean;
    SESSION_TIMEOUT: number;
    CSRF_TOKEN_EXPIRY: number;
  };
}

export const SECURITY_CONFIG: SecurityConfig = {
  TRUSTED_DOMAINS: [
    'starmc.top',
    'star-mc.top',
    'fansmc.com',
    '43.248.187.86',
    'localhost',
    '127.0.0.1'
  ],
  
  ALLOWED_EXTERNAL_RESOURCES: {
    IMAGES: [
      'https://www.fansmc.com/svg/',
      'https://api.mcsrvstat.us/',
      '/images/'
    ],
    IFRAMES: [
      'http://43.248.187.86:49299',
      'http://43.248.187.86:35417',
      'http://43.248.187.86:41644',
      'http://43.248.187.86:43219',
      'https://www.bilibili.com'
    ],
    API: [
      'https://mcping.me/',
      'https://api.mcsrvstat.us/',
      'http://43.248.187.86:49299',
      'http://43.248.187.86:41644'
    ]
  },
  
  CSP_POLICY: {
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self' 'unsafe-inline' https://fonts.googleapis.com",
    'img-src': "'self' data: blob: https:",
    'font-src': "'self' data: https://fonts.gstatic.com",
    'connect-src': "'self' ws: wss: https://api.mcsrvstat.us https://api.mcstatus.io https://api.allorigins.win https://api.rss2json.com https://v1.hitokoto.cn",
    'media-src': "'self' data: blob: https:",
    'object-src': "'none'",
    'frame-src': "'self' https://player.bilibili.com https://live.bilibili.com",
    'worker-src': "'self' blob:",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'self'",
    'upgrade-insecure-requests': ""
  },
  
  SANITIZE_CONFIG: {
    ALLOWED_TAGS: ['div', 'span', 'b', 'i', 'u', 's', 'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'img'],
    ALLOWED_ATTR: ['class', 'alt', 'title', 'src', 'width', 'height', 'loading'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['srcdoc', 'style', 'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'oninput', 'onchange', 'onsubmit']
  },
  
  RATE_LIMITING: {
    MAX_REQUESTS_PER_MINUTE: 60,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000
  },
  
  SESSION_CONFIG: {
    COOKIE_SAMESITE: 'Strict',
    COOKIE_SECURE: true,
    COOKIE_HTTPONLY: true,
    SESSION_TIMEOUT: 30 * 60 * 1000,
    CSRF_TOKEN_EXPIRY: 24 * 60 * 60 * 1000
  }
};

export function isTrustedDomain(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const parsed = new URL(url);
    if (SECURITY_CONFIG.TRUSTED_DOMAINS.includes(parsed.hostname)) {
      return true;
    }
    
    // Check against wenset config dynamically
    const config = getWensetConfig();
    const configDomains = new Set<string>();
    
    const addDomain = (u: string) => {
      try {
        if (!u) return;
        if (u.includes(',')) {
          u.split(',').forEach(sub => {
            const trimmed = sub.trim();
            if (trimmed.startsWith('http')) {
               configDomains.add(new URL(trimmed).hostname);
            }
          });
        } else if (u.startsWith('http')) {
          configDomains.add(new URL(u).hostname);
        } else {
          // Assume it might be a domain/IP if it looks like one, but safer to skip if not http
          // For server IPs like 'mc.star-mc.top', they are domains but not URLs.
          // We should add them directly, stripping port if exists.
          const domain = u.split(':')[0];
          configDomains.add(domain.toLowerCase());
        }
      } catch (_e) {
        // Ignore invalid URLs
      }
    };

    if (config.urls) Object.values(config.urls).forEach(v => typeof v === 'string' && addDomain(v));
    if (config.server) { addDomain(config.server.javaIp); addDomain(config.server.modIp); }
    if (config.maps) Object.values(config.maps).forEach(v => typeof v === 'string' && addDomain(v));
    if (config.social) Object.values(config.social).forEach(v => typeof v === 'string' && addDomain(v));
    if (config.links) Object.values(config.links).forEach(v => typeof v === 'string' && addDomain(v));
    if (config.contacts && config.contacts.qqGroupLink) addDomain(config.contacts.qqGroupLink);

    return configDomains.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isAllowedResource(url: string, type: keyof SecurityConfig['ALLOWED_EXTERNAL_RESOURCES'] = 'IMAGES'): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  const allowedResources = SECURITY_CONFIG.ALLOWED_EXTERNAL_RESOURCES[type] || [];
  if (allowedResources.some(allowedUrl => url.startsWith(allowedUrl))) {
    return true;
  }
  
  // Dynamic check from config
  const config = getWensetConfig();
  const dynamicAllowed: string[] = [];
  
  if (type === 'IFRAMES') {
    if (config.maps) Object.values(config.maps).forEach(u => u && dynamicAllowed.push(u));
    if (config.urls.dashboard) dynamicAllowed.push(config.urls.dashboard);
    if (config.urls.liveStream) dynamicAllowed.push(config.urls.liveStream);
    if (config.urls.promoVideo && config.urls.bilibiliPlayer) {
      dynamicAllowed.push(`${config.urls.bilibiliPlayer}/player.html?bvid=${config.urls.promoVideo}`);
    }
    if (config.urls.bilibiliPlayer) dynamicAllowed.push(config.urls.bilibiliPlayer);
    if (config.urls.bilibiliLive) dynamicAllowed.push(config.urls.bilibiliLive);
  } else if (type === 'API') {
    if (config.urls.wikiApiBase) dynamicAllowed.push(config.urls.wikiApiBase);
    if (config.urls.hitokoto) config.urls.hitokoto.split(',').forEach(u => dynamicAllowed.push(u.trim()));
    if (config.urls.corsProxies) config.urls.corsProxies.split(',').forEach(u => dynamicAllowed.push(u.trim()));
  }
  
  return dynamicAllowed.some(allowedUrl => url.startsWith(allowedUrl));
}

export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  return token.length === 64; // Simple validation for 32-byte hex string
}
