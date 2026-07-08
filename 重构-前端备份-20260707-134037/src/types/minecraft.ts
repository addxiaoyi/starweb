export interface MinecraftPlayer {
  name: string;
  uuid: string | null;
}

export interface MinecraftServerStatus {
  success: boolean;
  online: boolean;
  host: string;
  port: number;
  status: 'online' | 'offline';
  type: string;
  version: string;
  protocol: string | number;
  gamemode: string;
  levelname: string;
  players_online: number;
  players_max: number;
  players: {
    online: number;
    max: number;
    sample: MinecraftPlayer[];
  };
  motd?: {
    raw: string[];
    clean: string[];
    html: string[];
  } | null;
  software: string;
  clean_motd: string;
  description: string;
  delay: string;
  mod_info: {
    modList: unknown[];
  };
  processed: string;
  message?: string;
}

// ============ 超级联合登录：Minecraft 绑定 & 正版验证 ============

/** 当前绑定状态 */
export interface McBindingStatus {
  ok?: boolean;
  linked: boolean;
  mcUsername: string | null;
  mcUuid: string | null;
  verifiedMojang: boolean;
  vlaLinked: boolean;
  /** 当前验证码会话（无则为 null） */
  verifySession: McVerifySessionInfo | null;
  /** 状态机扩展字段（兼容旧版本可为空） */
  verifyState?: McVerifyStateInfo | null;
}

export interface McVerifySessionInfo {
  id?: string | null;
  code: string;
  serverId?: string | null;
  mcUsername: string;
  verified: boolean;
  expired: boolean;
  createdAt?: number | null;
  expiresAt?: number | null;
  retryCount?: number;
  maxRetries?: number;
}

export type McVerifyStateStatus =
  | 'pending'
  | 'succeeded'
  | 'expired'
  | 'cancelled'
  | 'failed'
  | null;

export interface McVerifyStateInfo {
  status: McVerifyStateStatus;
  failureReason?: string | null;
  conflictCode?: string | null;
  retryCount?: number;
  maxRetries?: number;
  createdAt?: number | null;
  expiresAt?: number | null;
  hasActiveSession?: boolean;
  lastState?: {
    id?: string;
    code?: string;
    serverId?: string;
    mcUsername?: string;
    createdAt?: number;
    expiresAt?: number;
    status?: McVerifyStateStatus;
    failureReason?: string | null;
    conflictCode?: string | null;
    retries?: number;
    maxRetries?: number;
    verified?: boolean;
    mojangUuid?: string | null;
    finishedAt?: number | null;
  } | null;
}

/** 发起验证响应 */
export interface McVerifyInitResponse {
  ok: boolean;
  code: string;
  serverId: string;
  expiresInSeconds: number;
  instructions: string;
  state?: {
    sessionId?: string;
    status?: McVerifyStateStatus;
    retryCount?: number;
    maxRetries?: number;
    expiresAt?: number;
    remainingInitQuota?: number;
  };
}

export interface McBindingHistoryItem {
  id: string;
  at: string;
  action: string;
  label?: string;
  mcUsername?: string | null;
  reason?: string | null;
  conflictCode?: string | null;
  source?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface McVerifyHistoryItem {
  id: string;
  code?: string;
  serverId?: string;
  mcUsername?: string;
  createdAt?: number | null;
  expiresAt?: number | null;
  finishedAt?: number | null;
  status?: McVerifyStateStatus;
  label?: string;
  verified?: boolean;
  mojangUuid?: string | null;
  failureReason?: string | null;
  conflictCode?: string | null;
  retries?: number;
  retryCount?: number;
  maxRetries?: number;
  timeline?: {
    createdAt?: number | null;
    expiresAt?: number | null;
    finishedAt?: number | null;
  } | null;
}

export interface McPagedResult<TItem> {
  ok?: boolean;
  success?: boolean;
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
}
