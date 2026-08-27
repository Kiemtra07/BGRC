import { z } from 'zod';
import { WorkflowStatus, UserRole } from './common';

export const workflowCommands = [
  'SET_APPROVAL_ROUTE',
  'SUBMIT_BRANCH',
  'BRANCH_CONTROL_APPROVE',
  'BRANCH_CONTROL_REJECT',
  'BRANCH_LEADER_APPROVE',
  'BRANCH_LEADER_REJECT',
  'INTERNAL_WAIVE',
  'INTERNAL_REJECT',
  'REVIEW_SUB_ITEMS',
] as const;

export type WorkflowCommand = typeof workflowCommands[number];

export interface WorkflowEvent {
  id: string;
  findingId: string;
  command: WorkflowCommand;
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  notes?: string;
  rejectionReason?: string;
  rejectedFromStage?: string;
  evidenceSnapshot?: Array<{ id: string; fileName: string; driveUrl: string }>;
  createdAt: string;
}

export const SubmitBranchCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  resolutionNotes: z.string().min(5, 'Giải trình khắc phục bắt buộc tối thiểu 5 ký tự'),
});
export type SubmitBranchCommandDTO = z.infer<typeof SubmitBranchCommandSchema>;

export const BranchControlApproveCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  notes: z.string().optional(),
});
export type BranchControlApproveCommandDTO = z.infer<typeof BranchControlApproveCommandSchema>;

export const BranchControlRejectCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().min(5, 'Lý do trả về bắt buộc tối thiểu 5 ký tự'),
});
export type BranchControlRejectCommandDTO = z.infer<typeof BranchControlRejectCommandSchema>;

export const BranchLeaderApproveCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  notes: z.string().optional(),
});
export type BranchLeaderApproveCommandDTO = z.infer<typeof BranchLeaderApproveCommandSchema>;

export const BranchLeaderRejectCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().min(5, 'Lý do trả về bắt buộc tối thiểu 5 ký tự'),
});
export type BranchLeaderRejectCommandDTO = z.infer<typeof BranchLeaderRejectCommandSchema>;

export const SetFindingApprovalRouteSchema = z.object({
  branchControllerUserId: z.string().trim().min(1),
  branchLeaderUserId: z.string().trim().min(1).optional(),
  internalApproverUserId: z.string().trim().min(1).optional(),
  requiresBranchLeaderApproval: z.boolean(),
}).superRefine((value, context) => {
  if (value.requiresBranchLeaderApproval && !value.branchLeaderUserId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['branchLeaderUserId'], message: 'Cần chọn lãnh đạo chi nhánh cho tuyến duyệt này.' });
  }
});
export type SetFindingApprovalRouteDTO = z.infer<typeof SetFindingApprovalRouteSchema>;

export const InternalWaiveCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  decisionNumber: z.string().min(2, 'Số công văn/quyết định bỏ lỗi bắt buộc'),
  notes: z.string().optional(),
});
export type InternalWaiveCommandDTO = z.infer<typeof InternalWaiveCommandSchema>;

export const InternalRejectCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().min(5, 'Lý do từ chối bỏ lỗi bắt buộc tối thiểu 5 ký tự'),
  regulatoryBasis: z.string().optional(),
});
export type InternalRejectCommandDTO = z.infer<typeof InternalRejectCommandSchema>;
