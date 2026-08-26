import { z } from 'zod';
import { SlaStatus } from './common';

export interface SlaInstance {
  id: string;
  findingId: string;
  startDate: string;
  deadlineDate: string;
  closedDate?: string;
  slaStatus: SlaStatus;
  daysRemaining: number;
  isOverdue: boolean;
  overdueDays: number;
  lastEvaluatedAt: string;
}

export interface SlaExtensionRequest {
  id: string;
  findingId: string;
  currentDeadline: string;
  requestedDeadline: string;
  reason: string;
  evidenceDriveUrl?: string;
  requestedByUserId: string;
  requestedByName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedByUserId?: string;
  decidedByName?: string;
  decisionNotes?: string;
  createdAt: string;
  decidedAt?: string;
}

export const CreateSlaExtensionRequestSchema = z.object({
  requestedDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày YYYY-MM-DD'),
  reason: z.string().min(10, 'Lý do xin gia hạn bắt buộc tối thiểu 10 ký tự'),
  evidenceDriveUrl: z.string().url().optional(),
});
export type CreateSlaExtensionRequestDTO = z.infer<typeof CreateSlaExtensionRequestSchema>;

export const DecideSlaExtensionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});
export type DecideSlaExtensionDTO = z.infer<typeof DecideSlaExtensionSchema>;
