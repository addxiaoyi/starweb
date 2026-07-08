/**
 * 日志脱敏工具
 * 防止敏感信息泄露到日志中
 */

/**
 * 敏感字段模式
 */
const SENSITIVE_PATTERNS = {
  // 认证相关
  password: /password|pwd|passwd|pass/i,
  token: /token|access_token|refresh_token|jwt/i,
  secret: /secret|api_key|apikey|app_secret/i,
  
  // 个人信息
  email: /email|mail/i,
  phone: /phone|mobile|tel/i,
  idCard: /id_card|idcard|identity/i,
  
  // 支付相关
  creditCard: /credit_card|card_number|cvv|cvc/i,
  bankAccount: /bank_account|account_number/i,
  
  // 其他敏感信息
  ssn: /ssn|social_security/i,
  address: /address|street|city/i,
  name: /full_name|real_name|username/i,
} as const

/**
 * 脱敏配置
 */
export interface SanitizeConfig {
  /** 是否保留部分信息 */
  partial: boolean
  /** 保留的字符数（开头） */
  keepStart: number
  /** 保留的字符数（结尾） */
  keepEnd: number
  /** 替换字符 */
  maskChar: string
  /** 自定义敏感字段 */
  customFields?: string[]
  /** 完全移除的字段 */
  removeFields?: string[]
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SanitizeConfig = {
  partial: true,
  keepStart: 3,
  keepEnd: 3,
  maskChar: '*',
}

/**
 * 脱敏字符串
 */
export function maskString(
  value: string,
  config: Partial<SanitizeConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  if (!value || value.length <= cfg.keepStart + cfg.keepEnd) {
    return cfg.maskChar.repeat(value?.length || 0)
  }
  
  const start = value.slice(0, cfg.keepStart)
  const end = value.slice(-cfg.keepEnd)
  const middleLength = value.length - cfg.keepStart - cfg.keepEnd
  const middle = cfg.maskChar.repeat(Math.min(middleLength, 10))
  
  return `${start}${middle}${end}`
}

/**
 * 脱敏对象
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  config: Partial<SanitizeConfig> = {}
): T {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const result: Record<string, unknown> = { ...obj }
  
  for (const key of Object.keys(result)) {
    const value = result[key]
    
    // 检查是否完全移除
    if (cfg.removeFields?.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      delete result[key]
      continue
    }
    
    // 检查是否为敏感字段
    const isSensitive = Object.values(SENSITIVE_PATTERNS).some(pattern => 
      pattern.test(key)
    ) || cfg.customFields?.some(field => 
      key.toLowerCase().includes(field.toLowerCase())
    )
    
    if (isSensitive && typeof value === 'string') {
      result[key] = maskString(value, cfg)
    } else if (isSensitive && typeof value === 'object' && value !== null) {
      // 递归处理嵌套对象
      result[key] = sanitizeObject(value as Record<string, unknown>, cfg)
    }
  }
  
  return result as T
}

/**
 * 脱敏 URL
 * 移除查询参数中的敏感信息
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const sensitiveParams = ['token', 'api_key', 'secret', 'password', 'auth']
    
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '***')
      }
    })
    
    return urlObj.toString()
  } catch {
    // 如果 URL 解析失败，尝试正则替换
    return url.replace(/([?&])(token|api_key|secret|password|auth)=[^&]*/gi, '$1$2=***')
  }
}

/**
 * 脱敏错误对象
 */
export function sanitizeError(error: Error): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
  
  // 脱敏 stack trace 中的路径信息
  if (sanitized.stack && typeof sanitized.stack === 'string') {
    sanitized.stack = sanitized.stack
      .split('\n')
      .map(line => {
        // 隐藏绝对路径
        return line.replace(/\([\w]:\\[^)]+\)/g, '(...)')
          .replace(/at \/[^\s]+/g, 'at /...')
      })
      .join('\n')
  }
  
  return sanitized
}

/**
 * 脱敏 HTTP 请求/响应
 */
export function sanitizeHttpData(data: {
  url?: string
  headers?: Record<string, string>
  body?: unknown
  params?: Record<string, string>
}): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  
  if (data.url) {
    sanitized.url = sanitizeUrl(data.url)
  }
  
  if (data.headers) {
    sanitized.headers = sanitizeObject(data.headers, {
      customFields: ['authorization', 'cookie', 'x-api-key'],
    })
  }
  
  if (data.body && typeof data.body === 'object') {
    sanitized.body = sanitizeObject(data.body as Record<string, unknown>)
  }
  
  if (data.params) {
    sanitized.params = sanitizeObject(data.params)
  }
  
  return sanitized
}

/**
 * 创建安全的日志记录器
 */
export function createSafeLogger(
  baseLogger: Console = console,
  config: Partial<SanitizeConfig> = {}
) {
  const sanitize = (args: unknown[]): unknown[] => {
    return args.map(arg => {
      if (typeof arg === 'string') {
        // 检查字符串中是否包含敏感信息
        let sanitized = arg
        Object.entries(SENSITIVE_PATTERNS).forEach(([type, pattern]) => {
          if (pattern.test(arg)) {
            sanitized = sanitized.replace(
              new RegExp(`(${type}[:=]\\s*)([^\\s,}]+)`, 'gi'),
              `$1${DEFAULT_CONFIG.maskChar.repeat(8)}`
            )
          }
        })
        return sanitized
      }
      
      if (arg && typeof arg === 'object') {
        return sanitizeObject(arg as Record<string, unknown>, config)
      }
      
      return arg
    })
  }
  
  return {
    log: (...args: unknown[]) => baseLogger.log(...sanitize(args)),
    info: (...args: unknown[]) => baseLogger.info(...sanitize(args)),
    warn: (...args: unknown[]) => baseLogger.warn(...sanitize(args)),
    error: (...args: unknown[]) => baseLogger.error(...sanitize(args)),
    debug: (...args: unknown[]) => baseLogger.debug?.(...sanitize(args)),
  }
}

/**
 * 审计日志记录器
 * 记录操作日志，自动脱敏
 */
export interface AuditLogEntry {
  /** 操作类型 */
  action: string
  /** 操作对象 */
  resource: string
  /** 操作结果 */
  result: 'success' | 'failure' | 'denied'
  /** 用户 ID */
  userId?: string
  /** 用户 IP */
  ip?: string
  /** 请求 ID */
  requestId?: string
  /** 时间戳 */
  timestamp: string
  /** 额外数据（会被脱敏） */
  metadata?: Record<string, unknown>
  /** 错误信息 */
  error?: string
}

/**
 * 审计日志队列
 */
const auditLogQueue: AuditLogEntry[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

/**
 * 记录审计日志
 */
export function logAudit(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  const sanitizedEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    metadata: entry.metadata ? sanitizeObject(entry.metadata) : undefined,
    error: entry.error ? maskString(entry.error, { keepStart: 10, keepEnd: 0 }) : undefined,
  }
  
  auditLogQueue.push(sanitizedEntry)
  
  // 开发环境直接输出
  if (import.meta.env?.DEV) {
    console.log('[AUDIT]', sanitizedEntry)
  }
}

/**
 * 获取审计日志队列
 */
export function getAuditLogs(): AuditLogEntry[] {
  return [...auditLogQueue]
}

/**
 * 清空审计日志队列
 */
export function clearAuditLogs(): void {
  auditLogQueue.length = 0
}

/**
 * 配置自动刷新
 */
export function setupAuditLogFlush(
  flushFn: (logs: AuditLogEntry[]) => Promise<void> | void,
  intervalMs: number = 60000
): () => void {
  if (flushTimer) {
    clearInterval(flushTimer)
  }
  
  flushTimer = setInterval(async () => {
    if (auditLogQueue.length > 0) {
      const logs = getAuditLogs()
      clearAuditLogs()
      await flushFn(logs)
    }
  }, intervalMs)
  
  // 返回清理函数
  return () => {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }
  }
}
