import { z } from 'zod';
import { BusinessLine, RiskLevel, WorkflowStatus, SlaStatus } from './common';
import { EvidenceObject } from './evidence';
import { WorkflowEvent } from './workflow';

export type FindingSubItemStatus = 'OPEN' | 'ACCEPTED' | 'RETURNED';

export interface FindingSubItem {
  id: string;
  findingId: string;
  content: string;
  order: number;
  status: FindingSubItemStatus;
  reviewerNote?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The approval route resolved for one finding at submit time. It is derived automatically from the
 * report type's workflow tier plus role scope inside the finding's branch — never picked by hand on
 * the finding. IDs are still persisted so a later role or organisational change cannot silently
 * redirect an in-flight approval. `requiresBranchLeaderApproval` is derived from `isSpecialCase`
 * (or a THREE_TIER report type), not a manual toggle.
 */
export interface FindingApprovalRoute {
  branchControllerUserId?: string;
  branchLeaderUserId?: string;
  internalApproverUserId?: string;
  requiresBranchLeaderApproval: boolean;
  assignedByUserId?: string;
  assignedAt?: string;
}

export interface Finding {
  id: string;
  campaignId?: string;
  channelId: string;
  channelCode: string;
  channelName: string;
  channelVersionId: string;
  workflowVersionId: string;
  slaPolicyVersionId: string;
  
  // Core Customer & Branch Data
  cif: string;
  customerName: string;
  clusterName: string;
  branchCode: string;
  branchName: string;
  department?: string;
  decisionNo?: string;
  auditDate?: string;
  inspectorName?: string;
  creditBalance: number;
  loanGroup?: string;
  collateralValue?: number;
  loanPurpose?: string;
  officerName?: string;
  deptHeadName?: string;

  // Core Finding & Error Data
  errorCode: string;
  errorGroup?: string;
  errorTitle: string;
  description: string;
  quantity: number;
  exposureAmount: number; // Triệu đồng

  /**
   * Provenance from the upstream CoPlus inspection record. A finding here is the remediation of a
   * sai sót raised in a Tiểu biên bản, so it carries the team, record and grading it came from.
   */
  inspectionTeamCode?: string;   // Mã đoàn kiểm tra, ví dụ 117.2026.1
  sourceRecordCode?: string;     // Mã TBB nguồn, ví dụ 117.TBBTD.2026.2
  businessLine?: BusinessLine;   // Loại nghiệp vụ: Tín dụng / Phi tín dụng
  riskLevel?: RiskLevel;         // Mức độ rủi ro do đoàn kiểm tra chấm
  penaltyProposalCode?: string;  // Đề xuất xử phạt, ví dụ 1.1.2
  referenceDocument?: string;    // Văn bản dẫn chiếu

  // Status & Versioning (P0-01, P0-02, P0-06, P0-08)
  workflowStatus: WorkflowStatus;
  slaStatus: SlaStatus;
  version: number;
  deadlineDate: string;
  isOverdue: boolean;
  resolutionNotes?: string;
  
  // Rejection projection (P0-09)
  rejectedFromStage?: string;
  rejectionReason?: string;
  rejectedByUserName?: string;
  rejectedAt?: string;

  // Route resolved automatically at submit time (see FindingApprovalRoute).
  approvalRoute?: FindingApprovalRoute;

  /**
   * Dấu sao — hồ sơ thuộc trường hợp đặc biệt (lỗi hoặc khách hàng đặc biệt). Khi bật, tuyến duyệt
   * tự động chèn bước Lãnh đạo chi nhánh "đẩy lệnh" = một bước phê duyệt bắt buộc trước khi hồ sơ
   * lên Hội sở. Khác với `isPriority` trên WorkspaceTarget (ghim cá nhân của người dùng): cờ này
   * gắn với hồ sơ và điều hướng quy trình phê duyệt.
   */
  isSpecialCase?: boolean;

  // Dynamic Custom Payload
  dynamicPayload?: Record<string, any>;
  evidenceRequired?: boolean;
  presentationMode?: 'CASE_REVIEW' | 'EXCEL_GRID' | 'FORM_ONLY';

  // Sub-resources
  evidenceCount: number;
  evidences?: EvidenceObject[];
  history?: WorkflowEvent[];
  subItems?: FindingSubItem[];

  createdAt: string;
  updatedAt: string;
}

export interface FindingFilterQuery {
  campaignId?: string;
  channelId?: string;
  clusterName?: string;
  branchCode?: string;
  workflowStatus?: WorkflowStatus;
  slaStatus?: SlaStatus;
  search?: string;
  cif?: string;
  errorCode?: string;
  page?: number;
  limit?: number;
}

export interface CustomerCase {
  cif: string;
  customerName: string;
  clusterName: string;
  branchCode: string;
  branchName: string;
  department?: string;
  officerName?: string;
  deptHeadName?: string;
  creditBalance: number;
  totalExposureAmount: number;
  totalFindings: number;
  openFindings: number;
  findings: Finding[];
}

export interface WorkspaceFinding extends Finding {
  isFollowing: boolean;
}

export type WorkspaceTargetType = 'CLUSTER' | 'BRANCH' | 'CUSTOMER';

export interface WorkspaceTarget {
  id: string;
  targetType: WorkspaceTargetType;
  targetKey: string;
  label: string;
  clusterName: string;
  branchCode?: string;
  branchName?: string;
  cif?: string;
  customerName?: string;
  representativeFindingId?: string;
  channelId?: string;
  matchedFindingCount: number;
  createdAt: string;
  isPriority?: boolean;
  prioritizedAt?: string;
}

export interface MyWorkQueue {
  actionable: WorkspaceFinding[];
  following: WorkspaceFinding[];
  accepted: WorkspaceTarget[];
  watchTargets: WorkspaceTarget[];
}

export interface FindingFollowResult {
  findingId: string;
  isFollowing: boolean;
}

export const WorkspaceTargetCommandSchema = z.object({
  targetType: z.enum(['CLUSTER', 'BRANCH', 'CUSTOMER']),
  clusterName: z.string().trim().min(1).max(200).optional(),
  branchCode: z.string().trim().min(1).max(50).optional(),
  cif: z.string().trim().min(1).max(100).optional(),
}).superRefine((value, context) => {
  if (value.targetType === 'CLUSTER' && !value.clusterName) context.addIssue({ code: z.ZodIssueCode.custom, path: ['clusterName'], message: 'Cụm địa bàn là bắt buộc.' });
  if (value.targetType === 'BRANCH' && !value.branchCode) context.addIssue({ code: z.ZodIssueCode.custom, path: ['branchCode'], message: 'Chi nhánh là bắt buộc.' });
  if (value.targetType === 'CUSTOMER' && (!value.branchCode || !value.cif)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['cif'], message: 'Khách hàng và chi nhánh là bắt buộc.' });
});

export type WorkspaceTargetCommandDTO = z.infer<typeof WorkspaceTargetCommandSchema>;

export const SetWorkspacePrioritySchema = z.object({
  isPriority: z.boolean(),
});

export type SetWorkspacePriorityDTO = z.infer<typeof SetWorkspacePrioritySchema>;

export const CreateFindingSubItemSchema = z.object({
  content: z.string().trim().min(5).max(1000),
});

export const ReviewFindingSubItemsSchema = z.object({
  decisions: z.array(z.object({
    subItemId: z.string().min(1),
    decision: z.enum(['ACCEPT', 'RETURN']),
  })).min(1),
  reviewNote: z.string().trim().min(5).max(2000),
});

export type CreateFindingSubItemDTO = z.infer<typeof CreateFindingSubItemSchema>;
export type ReviewFindingSubItemsDTO = z.infer<typeof ReviewFindingSubItemsSchema>;
