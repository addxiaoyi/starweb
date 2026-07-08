/**
 * 审核中心类型定义
 */

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type ReviewAction = 'approve' | 'reject';

export type ReviewHistoryAction = 'submit' | 'approve' | 'reject' | 'reopen' | 'resubmit';

export interface SkinFileInfo {
  url: string;
  size: number;
  filename: string;
}

export interface ReviewHistoryItem {
  id: string;
  action: ReviewHistoryAction | string;
  statusBefore?: SubmissionStatus | string;
  statusAfter?: SubmissionStatus | string;
  operatorId?: string;
  operatorName?: string;
  note?: string;
  at: string;
}

export interface ReviewRecord {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  tags: string[];
  skinFile: SkinFileInfo;
  capeFile: SkinFileInfo | null;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewerId?: string;
  reviewerName?: string;
  reviewNote?: string;
  reviewVersion?: number;
  history?: ReviewHistoryItem[];
}

export interface ReviewForm {
  action: ReviewAction;
  note: string;
}

export interface ReviewListResponse {
  records: ReviewRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReviewActionResponse {
  ok: boolean;
  id: string;
  status: SubmissionStatus;
  reviewVersion: number;
  reviewedAt?: string | null;
  reviewerId?: string;
  reviewerName?: string;
  reviewNote?: string;
  transition?: {
    from?: SubmissionStatus | string;
    to?: SubmissionStatus | string;
    action?: ReviewAction | string;
  };
  notify?: {
    queued?: boolean;
    notificationId?: string;
  };
}

export interface ReviewReopenResponse {
  ok: boolean;
  id: string;
  status: SubmissionStatus;
  reviewVersion: number;
  reopenedAt: string;
  transition?: {
    from?: SubmissionStatus | string;
    to?: SubmissionStatus | string;
    action?: 'reopen' | string;
  };
  notify?: {
    queued?: boolean;
    notificationId?: string;
  };
}

export interface ReviewHistoryResponse {
  items: ReviewHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}
