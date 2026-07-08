export interface LibraryItem {
  id: string;
  name?: string;
  model?: 'auto' | 'default' | 'slim' | string;
  source?: string;
  updatedAt?: string;
  previewUrl?: string;
  skinUrl?: string;
  capeUrl?: string;
  skinAssetId?: number;
  capeAssetId?: number;
  tags?: string[];
}

export interface SkinApplyPayload {
  uuid: string;
  skinAssetId: number;
  capeAssetId: number;
  slot?: string;
}

export interface ApiMessageResponse {
  ok?: boolean;
  message?: string;
  error?: string;
  details?: string;
}

export interface LibrarySyncSnapshot {
  syncedAt?: string;
  version?: string;
  etag?: string;
  lastModified?: string;
  totalItems?: number;
}

export interface LibrarySyncTask {
  id: string;
  type?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  changedCount?: number;
}

export interface LibrarySyncStatusResponse {
  ok?: boolean;
  syncedAt?: string;
  sync?: LibrarySyncSnapshot;
  latest?: LibrarySyncTask | null;
  items?: LibrarySyncTask[];
  realtime?: {
    enabled?: boolean;
    streamPath?: string;
    activeClients?: number;
  };
}
