import type { BusinessLine, RiskLevel } from '../shared/contracts';

export type PortalType = 'INTERNAL' | 'BRANCH';

export type UserRole = 
  | 'ADMIN' 
  | 'SUPERVISOR' 
  | 'INTERNAL_APPROVER' 
  | 'INTERNAL_OFFICER'
  | 'BRANCH_INPUT' 
  | 'BRANCH_CONTROLLER';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  portal: PortalType;
  role: UserRole;
  clusterName?: string;
  branchName?: string;
  branchCode?: string;
  department?: string;
}

export type ErrorStatus = 
  | 'PENDING'             // Tồn đọng / Chưa xử lý
  | 'SUBMITTED_BRANCH'    // Đã đính kèm hồ sơ -> Chờ Kiểm soát chi nhánh
  | 'SUBMITTED_INTERNAL'  // Kiểm soát chi nhánh đồng ý -> Chờ Khối Nội Bộ
  | 'WAIVED_RESOLVED'     // Khối Nội Bộ đã đồng ý bỏ lỗi
  | 'REJECTED';           // Trả về yêu cầu bổ sung hồ sơ

export interface AttachmentFile {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'sheet' | 'image' | 'other';
  fileSize: string;
  driveFileId: string;
  driveUrl: string;
  uploadDate: string;
  uploadedBy: string;
  uploaderRole: UserRole;
  errorId: string;
  customerId: string;
  notes?: string;
}

export interface ApprovalLog {
  id: string;
  timestamp: string;
  action: 'CREATE' | 'ATTACH_FILE' | 'SUBMIT_BRANCH_CONTROL' | 'BRANCH_CONTROL_APPROVE' | 'INTERNAL_WAIVE' | 'REJECT' | 'DELETE_FILE';
  actorName: string;
  actorRole: UserRole;
  notes?: string;
}

export interface AuditError {
  id: string;
  customerId: string;
  errorCode: string; // e.g. TD01.01, TD02.05
  errorGroup: string; // e.g. TD01, TD02
  errorTitle: string;
  description: string;
  quantity: number;
  exposureAmount: number; // Triệu đồng
  status: ErrorStatus;
  deadlineDate?: string;
  isOverdue?: boolean;
  resolutionNotes?: string;
  /** Provenance read from a CoPlus export; see the matching fields on the Finding contract. */
  inspectionTeamCode?: string;
  sourceRecordCode?: string;
  businessLine?: BusinessLine;
  riskLevel?: RiskLevel;
  penaltyProposalCode?: string;
  referenceDocument?: string;
  attachments: AttachmentFile[];
  history: ApprovalLog[];
}

export interface CustomerRecord {
  id: string;
  cif: string;
  customerName: string;
  clusterName: string; // e.g. Cụm Tây Nguyên, Cụm TP.HCM
  branchCode: string; // e.g. 635, 428
  branchName: string; // e.g. Nam Buôn Hồ, Bình Tây Sài Gòn
  department: string; // e.g. PGD Nam Buôn Hồ 1, Phòng QLKH 1
  decisionNo: string; // Số QĐ kiểm tra
  auditDate: string; // Ngày dữ liệu
  inspectorName: string; // Tên cán bộ kiểm tra
  creditBalance: number; // Dư nợ cấp tín dụng (Triệu VNĐ)
  loanGroup: string; // Phân loại nợ (Nhóm 1, Nhóm 2...)
  collateralValue: number; // Giá trị TSBĐ (Triệu VNĐ)
  loanPurpose: string; // Mục đích vay vốn
  officerName: string; // Cán bộ QLKH
  deptHeadName: string; // TP. QLKH
  errors: AuditError[];
  totalErrors: number;
  activeErrors: number;
  resolvedErrors: number;
}

export interface ErrorMasterItem {
  code: string; // e.g. TD01.01
  group: string; // TD01
  groupName: string; // Chưa tuân thủ điều kiện ủy nhiệm...
  title: string;
  description: string;
  referenceDoc: string;
}

export interface EmailScheduleConfig {
  enabled: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'ON_OVERDUE';
  triggerTime: string; // e.g. "08:30"
  daysBeforeDeadline: number;
  recipientClusters: string[];
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  lastSentDate?: string;
  logs: EmailLogEntry[];
}

export interface EmailLogEntry {
  id: string;
  sentAt: string;
  clusterName: string;
  recipientEmail: string;
  subject: string;
  errorCount: number;
  status: 'SUCCESS' | 'FAILED';
}

export interface BatchUploadResult {
  fileName: string;
  totalCustomersFound: number;
  totalErrorsExtracted: number;
  branchDetected: string;
  decisionNoDetected: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
  customers: CustomerRecord[];
  duplicateRowsCount?: number;
}
