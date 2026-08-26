import { describe, it, expect } from 'vitest';
import { WorkflowCommandService } from '../../server/src/modules/workflow/workflow-service';
import { Finding, UserProfile } from '../../shared/contracts';

describe('WorkflowCommandService (P0 Decision Invariants)', () => {
  const service = new WorkflowCommandService();

  const mockBranchUser: UserProfile = {
    id: 'user-branch-635',
    username: 'canbo.635',
    email: 'canbo@bank.com',
    fullName: 'Cán bộ CN 635',
    portal: 'BRANCH',
    roles: ['BRANCH_INPUT'],
    primaryRole: 'BRANCH_INPUT',
    branchCode: '635',
    isActive: true,
    scopes: [{ scopeType: 'BRANCH', branchName: 'CN Nam Buôn Hồ' }],
  };

  const mockBranchController: UserProfile = {
    id: 'user-branch-controller-635',
    username: 'kiemsoat.635',
    email: 'kiemsoat.635@bank.com',
    fullName: 'Cán bộ Kiểm soát Chi nhánh Nam Buôn Hồ',
    portal: 'BRANCH',
    roles: ['BRANCH_CONTROLLER'],
    primaryRole: 'BRANCH_CONTROLLER',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'Phòng Kiểm soát chi nhánh',
    isActive: true,
    scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ' }],
  };

  const mockInternalUser: UserProfile = {
    id: 'user-internal',
    username: 'kiemtoan.vien',
    email: 'auditor@bank.com',
    fullName: 'Kiểm toán viên Nội bộ',
    portal: 'INTERNAL',
    roles: ['INTERNAL_APPROVER', 'SUPERVISOR'],
    primaryRole: 'INTERNAL_APPROVER',
    isActive: true,
    scopes: [{ scopeType: 'ALL' }],
  };

  const initialFinding: Finding = {
    id: 'find-test-01',
    channelId: 'chan-audit-bgs',
    channelCode: 'AUDIT_BGS',
    channelName: 'Kiểm toán Tín dụng BGS',
    channelVersionId: 'v1',
    workflowVersionId: 'wf-v1',
    slaPolicyVersionId: 'sla-v1',
    cif: '12345678',
    customerName: 'Công ty Test',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    creditBalance: 1000,
    errorCode: 'TD01.01',
    errorTitle: 'Thiếu chứng từ',
    description: 'Chi tiết sai sót',
    quantity: 1,
    exposureAmount: 500,
    workflowStatus: 'PENDING',
    slaStatus: 'ON_TRACK',
    version: 1,
    deadlineDate: '2026-09-01',
    isOverdue: false,
    evidenceCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('P0-03 & P0-08: Branch user submits finding -> moves to SUBMITTED_BRANCH and increments version', () => {
    const updated = service.executeSubmitBranch(initialFinding, {
      expectedVersion: 1,
      resolutionNotes: 'Đã bổ sung đầy đủ hóa đơn GTGT theo yêu cầu kiểm toán.',
    }, mockBranchUser);

    expect(updated.workflowStatus).toBe('SUBMITTED_BRANCH');
    expect(updated.version).toBe(2);
    expect(updated.resolutionNotes).toBe('Đã bổ sung đầy đủ hóa đơn GTGT theo yêu cầu kiểm toán.');
  });

  it('routes a one-tier report directly to Phê duyệt HT', () => {
    const updated = service.executeSubmitBranch(initialFinding, {
      expectedVersion: 1,
      resolutionNotes: 'Đã hoàn tất hồ sơ theo luồng gọn.',
    }, mockBranchUser, 'ONE_TIER');

    expect(updated.workflowStatus).toBe('SUBMITTED_INTERNAL');
    expect(updated.version).toBe(2);
  });

  it('P0-08: Throws version conflict (409) if expectedVersion does not match', () => {
    expect(() => {
      service.executeSubmitBranch(initialFinding, {
        expectedVersion: 99,
        resolutionNotes: 'Đã giải trình.',
      }, mockBranchUser);
    }).toThrow(/VERSION_CONFLICT/);
  });

  it('P0-03: Branch controller approves -> moves to SUBMITTED_INTERNAL', () => {
    const findingInBranch: Finding = { ...initialFinding, workflowStatus: 'SUBMITTED_BRANCH', version: 2 };
    const updated = service.executeBranchControlApprove(findingInBranch, { expectedVersion: 2 }, mockBranchController);

    expect(updated.workflowStatus).toBe('SUBMITTED_INTERNAL');
    expect(updated.version).toBe(3);
  });

  it('P0-04: Branch control reject -> moves to REJECTED and records rejection projection', () => {
    const findingInBranch: Finding = { ...initialFinding, workflowStatus: 'SUBMITTED_BRANCH', version: 2 };
    const updated = service.executeBranchControlReject(findingInBranch, {
      expectedVersion: 2,
      reason: 'Hóa đơn chưa có chữ ký người bán, đề nghị thu thập lại.',
    }, mockBranchController);

    expect(updated.workflowStatus).toBe('REJECTED');
    expect(updated.rejectedFromStage).toBe('BRANCH_CONTROL_REVIEW');
    expect(updated.rejectionReason).toBe('Hóa đơn chưa có chữ ký người bán, đề nghị thu thập lại.');
    expect(updated.version).toBe(3);
  });

  it('P0-04: Internal reject returns to Branch (REJECTED) and must be resubmitted via Branch Control', () => {
    const findingInInternal: Finding = { ...initialFinding, workflowStatus: 'SUBMITTED_INTERNAL', version: 3 };
    const updated = service.executeInternalReject(findingInInternal, {
      expectedVersion: 3,
      reason: 'Chưa đủ điều kiện theo Điều 12 Quyết định 456.',
    }, mockInternalUser);

    expect(updated.workflowStatus).toBe('REJECTED');
    expect(updated.rejectedFromStage).toBe('INTERNAL_REVIEW');
  });

  it('P0-05: Internal waive moves finding to terminal state WAIVED_RESOLVED and closes SLA', () => {
    const findingInInternal: Finding = { ...initialFinding, workflowStatus: 'SUBMITTED_INTERNAL', version: 3 };
    const updated = service.executeInternalWaive(findingInInternal, {
      expectedVersion: 3,
      decisionNumber: 'CV-KTNB-2026/99',
    }, mockInternalUser);

    expect(updated.workflowStatus).toBe('WAIVED_RESOLVED');
    expect(updated.slaStatus).toBe('CLOSED');

    // Terminal invariant check
    expect(() => {
      service.executeSubmitBranch(updated, { expectedVersion: 4, resolutionNotes: 'Reopen attempt' }, mockBranchUser);
    }).toThrow(/FINDING_IS_TERMINAL/);
  });
});
