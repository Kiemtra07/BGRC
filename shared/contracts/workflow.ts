import { z } from 'zod';
import { WorkflowStatus, UserRole } from './common';

export const workflowCommands = [
  'SET_APPROVAL_ROUTE',
  'SET_SPECIAL_CASE',
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

/**
 * Cờ "dấu sao" đánh dấu hồ sơ thuộc trường hợp đặc biệt (lỗi / khách hàng đặc biệt). Bật cờ này
 * là cách duy nhất để chèn bước Lãnh đạo chi nhánh phê duyệt bắt buộc vào tuyến duyệt hai cấp —
 * không còn chọn tay người duyệt hay tick "Yêu cầu Lãnh đạo CN" trên từng hồ sơ.
 */
export const SetFindingSpecialCaseSchema = z.object({
  isSpecialCase: z.boolean(),
});
export type SetFindingSpecialCaseDTO = z.infer<typeof SetFindingSpecialCaseSchema>;

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

/**
 * A finding's approval route, resolved for display. The server derives it from the report type
 * version pinned on the finding — the same `stages` an administrator edits — so the step names and
 * the branch a user sees on screen are the ones that were configured, not a hard-coded copy.
 */
export type ApprovalStepState = 'DONE' | 'CURRENT' | 'UPCOMING';

export interface FindingApprovalStep {
  stageId: string;
  stageName: string;
  statusCode: WorkflowStatus;
  allowedRoles: UserRole[];
  /** Person resolved for this step when the route was pinned at submit time. */
  assigneeName?: string;
  state: ApprovalStepState;
  /** True when the step exists only because the finding carries the special-case star. */
  conditional: boolean;
  completedAt?: string;
  completedByName?: string;
}

export interface FindingApprovalRouteView {
  findingId: string;
  workflowType: 'ONE_TIER' | 'TWO_TIER' | 'THREE_TIER';
  isSpecialCase: boolean;
  isClosed: boolean;
  /** Name of the stage that sent the finding back; set only while it sits in REJECTED. */
  returnedFromStageName?: string;
  /** Index into `steps`, or -1 once the finding is closed. */
  currentStepIndex: number;
  steps: FindingApprovalStep[];
}
