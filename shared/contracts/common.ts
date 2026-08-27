import { z } from 'zod';

export type PortalType = 'INTERNAL' | 'BRANCH';

export type UserRole = 
  | 'ADMIN' 
  | 'SUPERVISOR' 
  | 'INTERNAL_APPROVER' 
  | 'INTERNAL_OFFICER' 
  | 'BRANCH_CONTROLLER' 
  | 'BRANCH_LEADER'
  | 'BRANCH_INPUT' 
  | 'VIEWER';

export type DataScopeType = 'ALL' | 'CLUSTER' | 'BRANCH' | 'DEPARTMENT';

export type WorkflowStatus = 
  | 'PENDING'             // Chờ chi nhánh khắc phục
  | 'SUBMITTED_BRANCH'    // Chi nhánh đã nộp -> Chờ Kiểm soát chi nhánh
  | 'SUBMITTED_BRANCH_LEADER' // Kiểm soát chi nhánh đồng ý -> Chờ Lãnh đạo chi nhánh
  | 'SUBMITTED_INTERNAL'  // Kiểm soát chi nhánh đồng ý -> Chờ Khối Nội Bộ phê duyệt
  | 'REJECTED'            // Bị trả về yêu cầu bổ sung
  | 'WAIVED_RESOLVED';    // Khối Nội Bộ đã phê duyệt bỏ lỗi (Trạng thái cuối)

export type SlaStatus = 
  | 'ON_TRACK'   // Còn hạn (> 3 ngày)
  | 'DUE_SOON'   // Sắp đến hạn (1 - 3 ngày)
  | 'OVERDUE'    // Quá hạn
  | 'CLOSED';    // Đã đóng khi finding hoàn tất

export type EvidenceStatus = 'PENDING_UPLOAD' | 'AVAILABLE' | 'FAILED' | 'REVOKED';

/**
 * Risk grade and business line carried over verbatim from the CoPlus inspection record, so a
 * finding lifted from a Tiểu biên bản keeps the grading the inspection team assigned to it.
 */
export const RISK_LEVELS = ['CAO', 'TRUNG_BINH', 'THAP'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const BUSINESS_LINES = ['TIN_DUNG', 'PHI_TIN_DUNG'] as const;
export type BusinessLine = (typeof BUSINESS_LINES)[number];

export const riskLevelLabels: Record<RiskLevel, string> = {
  CAO: 'Cao',
  TRUNG_BINH: 'Trung bình',
  THAP: 'Thấp',
};

export const businessLineLabels: Record<BusinessLine, string> = {
  TIN_DUNG: 'Tín dụng',
  PHI_TIN_DUNG: 'Phi tín dụng',
};

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface IdempotencyHeader {
  'idempotency-key'?: string;
}

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
