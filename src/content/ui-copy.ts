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

/**
 * Sự kiện an ninh nằm chung dòng thời gian với sự kiện workflow trong màn hình Nhật ký xử lý.
 * Đây là những hành vi không chạm vào máy trạng thái hồ sơ nhưng lại quyết định ai vào được hệ
 * thống và dữ liệu đi ra ngoài bằng đường nào.
 */
export const securityEventLabels: Record<string, string> = {
  AUTH_LOGIN_SUCCEEDED: 'Đăng nhập thành công',
  AUTH_LOGIN_FAILED: 'Đăng nhập thất bại',
  AUTH_LOGIN_THROTTLED: 'Chặn đăng nhập (khoá tạm)',
  AUTH_LOGOUT: 'Đăng xuất',
  AUTH_OIDC_LOGIN_SUCCEEDED: 'Đăng nhập Google',
  AUTH_OIDC_LOGIN_REJECTED: 'Từ chối đăng nhập Google',
  ADMIN_USER_CREATED: 'Cấp tài khoản',
  ADMIN_USER_PASSWORD_RESET: 'Đặt lại mật khẩu',
  ADMIN_GOOGLE_DRIVE_CONNECTED: 'Đấu nối Google Drive',
  DATA_REPORT_EXPORTED: 'Xuất báo cáo',
  DATA_EVIDENCE_DOWNLOADED: 'Tải minh chứng',
};
