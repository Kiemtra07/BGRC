import { z } from 'zod';
import { WorkflowStatus } from './common';
import { ApprovalAssignmentStage } from './findings';

/** Một hồ sơ mà người dùng đang giữ ở một bước duyệt. */
export interface OpenApprovalItem {
  findingId: string;
  cif: string;
  customerName: string;
  errorCode: string;
  branchCode?: string;
  branchName: string;
  workflowStatus: WorkflowStatus;
  deadlineDate: string;
  version: number;
  stage: ApprovalAssignmentStage;
  /** `true` khi hồ sơ đang chờ chính bước này; `false` khi bước này còn ở phía sau. */
  isCurrentStage: boolean;
  /** Chỉ có khi đã chọn người nhận: người đó nhận được hồ sơ này hay không. */
  transferable?: boolean;
  blockedReason?: string;
}

export interface HandoverRecipientOption {
  id: string;
  fullName: string;
  department?: string;
  /** Số hồ sơ trong danh sách mà người này đủ điều kiện nhận. */
  eligibleCount: number;
}

export interface UserOpenItems {
  userId: string;
  fullName: string;
  /** Hồ sơ trong phạm vi của người đang xem, tối đa `HANDOVER_MAX_ITEMS`. */
  items: OpenApprovalItem[];
  /** Mọi hồ sơ người này đang giữ, kể cả hồ sơ ngoài phạm vi của người xem. */
  total: number;
  hiddenOutOfScope: number;
  recipientOptions: HandoverRecipientOption[];
  /** Mục theo dõi và tiếp nhận cá nhân: không bàn giao theo hồ sơ, chỉ báo để quản trị viên biết. */
  acceptedTargets: number;
  watchTargets: number;
}

export const HANDOVER_MAX_ITEMS = 500;

export const HandoverItemSchema = z.object({
  findingId: z.string().trim().min(1).max(120),
  stage: z.enum(['BRANCH_CONTROLLER', 'BRANCH_LEADER', 'INTERNAL_APPROVER']),
  expectedVersion: z.number().int().min(1),
});

export const ExecuteHandoverSchema = z.object({
  fromUserId: z.string().trim().min(1).max(120),
  toUserId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(5, 'Lý do bàn giao bắt buộc tối thiểu 5 ký tự').max(2_000),
  items: z.array(HandoverItemSchema).min(1).max(HANDOVER_MAX_ITEMS),
});
export type ExecuteHandoverDTO = z.infer<typeof ExecuteHandoverSchema> & {
  items: Array<z.infer<typeof HandoverItemSchema> & { stage: ApprovalAssignmentStage }>;
};

export type HandoverSkipCode =
  | 'FINDING_NOT_FOUND'
  | 'HANDOVER_ITEM_CHANGED'
  | 'HANDOVER_RECIPIENT_INELIGIBLE';

export interface HandoverSkippedItem {
  findingId: string;
  stage: ApprovalAssignmentStage;
  code: HandoverSkipCode;
  message: string;
}

export interface HandoverResult {
  moved: number;
  skipped: HandoverSkippedItem[];
  /** Số hồ sơ người cũ còn giữ sau lần bàn giao này, kể cả hồ sơ ngoài phạm vi người thực hiện. */
  remaining: number;
}
