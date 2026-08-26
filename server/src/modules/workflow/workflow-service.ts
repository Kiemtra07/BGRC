import { 
  WorkflowStatus, 
  SubmitBranchCommandDTO, 
  BranchControlApproveCommandDTO, 
  BranchControlRejectCommandDTO, 
  InternalWaiveCommandDTO, 
  InternalRejectCommandDTO,
  UserProfile,
  Finding
} from '../../../../shared/contracts';

export class WorkflowCommandService {
  public validateTransition(
    finding: Finding,
    command: string,
    user: UserProfile
  ): void {
    // P0-05: Terminal state cannot be modified
    if (finding.workflowStatus === 'WAIVED_RESOLVED') {
      throw new Error('409: FINDING_IS_TERMINAL — Hồ sơ đã được bỏ lỗi vĩnh viễn, không thể chỉnh sửa.');
    }

    switch (command) {
      case 'SUBMIT_BRANCH': {
        if (finding.workflowStatus !== 'PENDING' && finding.workflowStatus !== 'REJECTED') {
          throw new Error(`409: INVALID_TRANSITION — Không thể nộp duyệt từ trạng thái ${finding.workflowStatus}`);
        }
        if (!user.roles.includes('BRANCH_INPUT')) {
          throw new Error('403: FORBIDDEN — Chỉ Cán bộ Chi nhánh mới được thực hiện nộp hồ sơ.');
        }
        break;
      }
      case 'BRANCH_CONTROL_APPROVE': {
        if (finding.workflowStatus !== 'SUBMITTED_BRANCH') {
          throw new Error(`409: INVALID_TRANSITION — Hồ sơ phải ở trạng thái CHỜ KIỂM SOÁT CHI NHÁNH (hiện tại: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes('BRANCH_CONTROLLER')) {
          throw new Error('403: FORBIDDEN — Chỉ Kiểm soát chi nhánh mới có quyền đồng ý xử lý lỗi.');
        }
        break;
      }
      case 'BRANCH_CONTROL_REJECT': {
        if (finding.workflowStatus !== 'SUBMITTED_BRANCH') {
          throw new Error(`409: INVALID_TRANSITION — Hồ sơ phải ở trạng thái CHỜ KIỂM SOÁT CHI NHÁNH (hiện tại: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes('BRANCH_CONTROLLER')) {
          throw new Error('403: FORBIDDEN — Chỉ Kiểm soát chi nhánh mới có quyền chuyển trả hồ sơ.');
        }
        break;
      }
      case 'INTERNAL_WAIVE': {
        if (finding.workflowStatus !== 'SUBMITTED_INTERNAL') {
          throw new Error(`409: INVALID_TRANSITION — Hồ sơ phải được Kiểm soát chi nhánh chuyển lên Khối Nội Bộ trước khi bỏ lỗi (hiện tại: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes('INTERNAL_APPROVER') && !user.roles.includes('SUPERVISOR')) {
          throw new Error('403: FORBIDDEN — Chỉ Khối Nội Bộ / Lãnh đạo mới có quyền phê duyệt bỏ lỗi.');
        }
        break;
      }
      case 'INTERNAL_REJECT': {
        if (finding.workflowStatus !== 'SUBMITTED_INTERNAL') {
          throw new Error(`409: INVALID_TRANSITION — Hồ sơ phải ở trạng thái CHỜ NỘI BỘ DUYỆT (hiện tại: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes('INTERNAL_APPROVER') && !user.roles.includes('SUPERVISOR')) {
          throw new Error('403: FORBIDDEN — Chỉ Khối Nội Bộ mới có quyền từ chối bỏ lỗi.');
        }
        break;
      }
      default:
        throw new Error(`400: UNKNOWN_COMMAND — Lệnh không hợp lệ: ${command}`);
    }
  }

  public executeSubmitBranch(
    finding: Finding,
    dto: SubmitBranchCommandDTO,
    user: UserProfile,
    workflowType: 'ONE_TIER' | 'TWO_TIER' = 'TWO_TIER',
  ): Finding {
    this.validateTransition(finding, 'SUBMIT_BRANCH', user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT — Hồ sơ đã bị cập nhật bởi người khác (version hiện tại: ${finding.version}, expected: ${dto.expectedVersion})`);
    }

    const updated: Finding = {
      ...finding,
      workflowStatus: workflowType === 'ONE_TIER' ? 'SUBMITTED_INTERNAL' : 'SUBMITTED_BRANCH',
      resolutionNotes: dto.resolutionNotes,
      version: finding.version + 1,
      rejectedFromStage: undefined,
      rejectionReason: undefined,
      rejectedByUserName: undefined,
      rejectedAt: undefined,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  }

  public executeBranchControlApprove(finding: Finding, dto: BranchControlApproveCommandDTO, user: UserProfile): Finding {
    this.validateTransition(finding, 'BRANCH_CONTROL_APPROVE', user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT — Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }

    const updated: Finding = {
      ...finding,
      workflowStatus: 'SUBMITTED_INTERNAL',
      version: finding.version + 1,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  }

  public executeBranchControlReject(finding: Finding, dto: BranchControlRejectCommandDTO, user: UserProfile): Finding {
    this.validateTransition(finding, 'BRANCH_CONTROL_REJECT', user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT — Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }

    const updated: Finding = {
      ...finding,
      workflowStatus: 'REJECTED',
      rejectedFromStage: 'BRANCH_CONTROL_REVIEW',
      rejectionReason: dto.reason,
      rejectedByUserName: user.fullName,
      rejectedAt: new Date().toISOString(),
      version: finding.version + 1,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  }

  public executeInternalWaive(finding: Finding, dto: InternalWaiveCommandDTO, user: UserProfile): Finding {
    this.validateTransition(finding, 'INTERNAL_WAIVE', user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT — Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }

    const updated: Finding = {
      ...finding,
      workflowStatus: 'WAIVED_RESOLVED',
      slaStatus: 'CLOSED',
      version: finding.version + 1,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  }

  public executeInternalReject(finding: Finding, dto: InternalRejectCommandDTO, user: UserProfile): Finding {
    this.validateTransition(finding, 'INTERNAL_REJECT', user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT — Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }

    // P0-04: Hồ sơ trả về chi nhánh; khi nộp lại phải qua Kiểm soát chi nhánh.
    const updated: Finding = {
      ...finding,
      workflowStatus: 'REJECTED',
      rejectedFromStage: 'INTERNAL_REVIEW',
      rejectionReason: dto.reason,
      rejectedByUserName: user.fullName,
      rejectedAt: new Date().toISOString(),
      version: finding.version + 1,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  }
}

export const workflowService = new WorkflowCommandService();
