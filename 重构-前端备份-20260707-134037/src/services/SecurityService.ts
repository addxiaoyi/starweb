import { devLog, devWarn } from '@/shared/utils/devLog';

export interface SecurityEvent {
  timestamp: string;
  ip: string; // Simulated client IP
  userAgent: string;
  type: 'CONTEXT_MENU' | 'DRAG_DROP' | 'KEY_SHORTCUT' | 'DEV_TOOLS' | 'DOWNLOAD_ATTEMPT';
  details: string;
}
class SecurityService {
  private static instance: SecurityService;
  private isActive = false;
  private logQueue: SecurityEvent[] = [];
  private lastReportTime: Record<string, number> = {};
  
  private constructor() {} 

  public static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  public init() {
    if (this.isActive || import.meta.env.SSR) return;
    this.isActive = true;
    this.attachListeners();
    this.startDetectionLoops();
    devLog('[SecurityService] Advanced Protection Active');
  }

  private attachListeners() {
    document.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('dragstart', this.handleDragStart);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('selectstart', this.handleSelectStart);
  }

  private startDetectionLoops() {
    // 说明：显式 debugger 语句会被 lint 拦截，当前仅保留非侵入式探测方案。

    // 控制台尺寸变化探测 (不完全准确但有参考价值)
    let lastWidth = window.outerWidth - window.innerWidth;
    let lastHeight = window.outerHeight - window.innerHeight;
    window.addEventListener('resize', () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (
        (widthDiff > threshold && widthDiff !== lastWidth) ||
        (heightDiff > threshold && heightDiff !== lastHeight)
      ) {
        this.logEvent('DEV_TOOLS', 'Console likely opened (window resize)');
      }
      lastWidth = widthDiff;
      lastHeight = heightDiff;
    });
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    this.logEvent('CONTEXT_MENU', `Blocked right-click at (${e.clientX}, ${e.clientY})`);
  };

  private handleDragStart = (e: DragEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    this.logEvent('DRAG_DROP', `Blocked drag on <${target.tagName.toLowerCase()}>`);
  };

  private handleSelectStart = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
      (e.ctrlKey && (e.key === 'U' || e.key === 'S'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.logEvent('DEV_TOOLS', `Blocked shortcut: ${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`);
    }
  };

  private async logEvent(type: SecurityEvent['type'], details: string) {
    const now = Date.now();
    const rateLimitKey = `${type}_${details.slice(0, 20)}`;
    
    // 客户端限流：相同类型的事件 10 秒内只上报一次
    if (this.lastReportTime[rateLimitKey] && now - this.lastReportTime[rateLimitKey] < 10000) {
      return;
    }
    this.lastReportTime[rateLimitKey] = now;

    // 脱敏处理
    const sanitizedDetails = details
      .replace(/[0-9]{17,19}/g, '***ID***') // 屏蔽类似 QQ 号/身份证的长数字
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***EMAIL***');

    const event: SecurityEvent = {
      timestamp: new Date().toISOString(),
      ip: 'masked', 
      userAgent: navigator.userAgent,
      type,
      details: sanitizedDetails
    };
    
    this.logQueue.push(event);
    devWarn(`[Security Alert] ${type}: ${sanitizedDetails}`);

    // 上报到后端（远程 API 可能不可用，静默降级）
    try {
      const resp = await fetch('/api/security/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true // 确保页面关闭时也能尝试发送
      });
      // 忽略 500 等服务器错误（远程 API 可能暂时不可用）
      if (!resp.ok) return;
    } catch (_err) {
      // 网络错误静默处理
    }
  }

  public reportEvent(type: SecurityEvent['type'], details: string) {
    void this.logEvent(type, details);
  }
  
  public getLogs() {
    return this.logQueue;
  }
}

export const securityService = SecurityService.getInstance();
