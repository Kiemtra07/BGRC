import { z } from 'zod';
import { WorkflowStatus, UserRole } from './common';
import { ApprovalAssignmentStage } from './findings';

export const workflowCommands = [
  'SET_APPROVAL_ROUTE',
  'SET_SPECIAL_CASE',
  'HANDOVER_APPROVAL',
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

/**
 * Người nhận ở bước kế tiếp do người đang chuyển hồ sơ chọn. Bỏ trống thì hệ thống dùng người mặc
 * định của bước đó (Hội sở: hàng chờ chung, ai tiếp nhận thì người đó duyệt).
 */
const nextApproverUserId = z.string().trim().min(1).max(120).optional();

/** Người nhận do người nộp chọn cho từng bước của tuyến; bước bỏ trống thì lấy mặc định (Hội sở: hàng chờ chung). */
export const ApproverSelectionsSchema = z.object({
  BRANCH_CONTROLLER: nextApproverUserId,
  BRANCH_LEADER: nextApproverUserId,
  INTERNAL_APPROVER: nextApproverUserId,
});
export type ApproverSelectionsDTO = z.infer<typeof ApproverSelectionsSchema>;

export const SubmitBranchCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  resolutionNotes: z.string().min(5, 'Giải trình khắc phục bắt buộc tối thiểu 5 ký tự'),
  nextApproverUserId,
  approverSelections: ApproverSelectionsSchema.optional(),
});
export type SubmitBranchCommandDTO = z.infer<typeof SubmitBranchCommandSchema>;

export const BranchControlApproveCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  notes: z.string().optional(),
  nextApproverUserId,
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
  nextApproverUserId,
});
export type BranchLeaderApproveCommandDTO = z.infer<typeof BranchLeaderApproveCommandSchema>;

export const BranchLeaderRejectCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().min(5, 'Lý do trả về bắt buộc tối thiểu 5 ký tự'),
});
export type BranchLeaderRejectCommandDTO = z.infer<typeof BranchLeaderRejectCommandSchema>;

/** Dấu sao đánh dấu trường hợp đặc biệt; bật dấu sao là cách duy nhất chèn bước Lãnh đạo chi nhánh vào tuyến hai cấp. */
export const SetFindingSpecialCaseSchema = z.object({
  isSpecialCase: z.boolean(),
  expectedVersion: z.number().int().min(1),
});
export type SetFindingSpecialCaseDTO = z.infer<typeof SetFindingSpecialCaseSchema>;

export const ReassignApprovalRouteSchema = z.object({
  expectedVersion: z.number().int().min(1),
  stage: z.enum(['BRANCH_CONTROLLER', 'BRANCH_LEADER', 'INTERNAL_APPROVER']),
  assigneeUserId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(5).max(2_000),
  validUntil: z.string().datetime({ offset: true }).optional(),
});
export type ReassignApprovalRouteDTO = z.infer<typeof ReassignApprovalRouteSchema> & { stage: ApprovalAssignmentStage };

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

export interface ApprovalRecipientOption {
  id: string;
  fullName: string;
  department?: string;
}

/** Một bước của tuyến duyệt kèm những người có thể nhận ở bước đó, để người nộp chọn trước khi gửi. */
export interface SubmitRouteStep {
  stage: ApprovalAssignmentStage;
  stageName: string;
  options: ApprovalRecipientOption[];
  suggestedUserId?: string;
  allowSharedQueue: boolean;
}

export interface SubmitRouteOptions {
  /** Các bước loại báo cáo bắt buộc; người nộp chỉ đổi được người nhận. */
  steps: SubmitRouteStep[];
  /** Các bước kiểm soát có thể thêm vào, theo thứ tự thêm; thêm bước chỉ làm tuyến chặt hơn, không bỏ được bước bắt buộc. */
  addableSteps: SubmitRouteStep[];
  /** Bước đã được thêm ở lần nộp trước của hồ sơ này, để nộp lại không mất. */
  addedStages: ApprovalAssignmentStage[];
}

/** Ai có thể nhận hồ sơ ở bước kế tiếp khi người dùng hiện tại chuyển nó đi. */
export interface NextApprovalRecipients {
  /** Bước sẽ nhận hồ sơ; vắng mặt khi hồ sơ không còn bước nào để chuyển. */
  stage?: ApprovalAssignmentStage;
  options: ApprovalRecipientOption[];
  /** Người mặc định của bước; vắng mặt ở Hội sở khi chưa ai được chỉ định. */
  suggestedUserId?: string;
  /** Hội sở có hàng chờ chung: để trống người nhận nghĩa là ai tiếp nhận thì người đó duyệt. */
  allowSharedQueue: boolean;
}

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
