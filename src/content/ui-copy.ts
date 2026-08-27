import type { Finding, SlaStatus, UserRole, WorkflowCommand } from '../../shared/contracts';

export const workflowStatusLabels: Record<Finding['workflowStatus'], string> = {
  PENDING: 'Chờ chi nhánh khắc phục',
  SUBMITTED_BRANCH: 'Chờ kiểm soát chi nhánh',
  SUBMITTED_BRANCH_LEADER: 'Chờ lãnh đạo chi nhánh',
  SUBMITTED_INTERNAL: 'Chờ phê duyệt HT',
  REJECTED: 'Chi nhánh cần bổ sung',
  WAIVED_RESOLVED: 'Đã đóng lỗi',
};

export const workflowActionLabels = {
  submitBranch: 'Gửi kiểm soát chi nhánh',
  branchApprove: 'Chuyển phê duyệt HT',
  returnToBranch: 'Trả chi nhánh bổ sung',
  internalApprove: 'Đóng lỗi',
  saveSubItemReview: 'Lưu kết quả kiểm tra',
} as const;

export const slaStatusLabels: Record<SlaStatus, string> = {
  ON_TRACK: 'Đúng hạn',
  DUE_SOON: 'Sắp đến hạn',
  OVERDUE: 'Quá hạn',
  CLOSED: 'Đã đóng',
};

export const userRoleLabels: Record<UserRole, string> = {
  ADMIN: 'Quản trị hệ thống',
  SUPERVISOR: 'Lãnh đạo khối nội bộ',
  INTERNAL_APPROVER: 'Phê duyệt HT',
  INTERNAL_OFFICER: 'Cán bộ kiểm tra',
  BRANCH_CONTROLLER: 'Kiểm soát chi nhánh',
  BRANCH_LEADER: 'Lãnh đạo chi nhánh',
  BRANCH_INPUT: 'Cán bộ chi nhánh',
  VIEWER: 'Chỉ xem',
};

export const workflowEventLabels: Record<WorkflowCommand, string> = {
  SET_APPROVAL_ROUTE: 'Thiết lập tuyến duyệt',
  SUBMIT_BRANCH: workflowActionLabels.submitBranch,
  BRANCH_CONTROL_APPROVE: workflowActionLabels.branchApprove,
  BRANCH_CONTROL_REJECT: workflowActionLabels.returnToBranch,
  BRANCH_LEADER_APPROVE: 'Lãnh đạo chi nhánh chuyển phê duyệt HT',
  BRANCH_LEADER_REJECT: workflowActionLabels.returnToBranch,
  INTERNAL_WAIVE: workflowActionLabels.internalApprove,
  INTERNAL_REJECT: workflowActionLabels.returnToBranch,
  REVIEW_SUB_ITEMS: workflowActionLabels.saveSubItemReview,
};
