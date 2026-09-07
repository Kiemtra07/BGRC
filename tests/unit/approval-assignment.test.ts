import { describe, expect, it } from 'vitest';
import { approvalCandidatesForFinding, resolveApprovalRoute, selectIndependentApprover } from '../../server/src/modules/workflow/approval-assignment';
import type { Finding, UserProfile } from '../../shared/contracts';

describe('approval assignment', () => {
  it('does not assign the submitting user to approve their own finding', () => {
    expect(selectIndependentApprover('user-submit', [
      { id: 'user-submit' },
    ])).toBeUndefined();
  });

  it('selects an eligible approver other than the submitting user', () => {
    expect(selectIndependentApprover('user-submit', [
      { id: 'user-submit' },
      { id: 'user-controller' },
    ])).toBe('user-controller');
  });

  it('resolves only active branch approvers and never falls back to the submitter', () => {
    const submitter = { id: 'user-submit', roles: ['BRANCH_INPUT'], isActive: true, branchCode: '635' } as UserProfile;
    const controller = { id: 'user-controller', roles: ['BRANCH_CONTROLLER'], isActive: true, branchCode: '635' } as UserProfile;
    const inactiveLeader = { id: 'user-leader-disabled', roles: ['BRANCH_LEADER'], isActive: false, branchCode: '635' } as UserProfile;
    const finding = { branchCode: '635', isSpecialCase: true } as Pick<Finding, 'branchCode' | 'isSpecialCase'>;

    expect(approvalCandidatesForFinding(finding, [submitter, controller, inactiveLeader]).branchLeaders).toEqual([]);
    expect(resolveApprovalRoute(finding, 'THREE_TIER', submitter, [submitter, controller, inactiveLeader], '2026-09-07T00:00:00.000Z')).toBeUndefined();
  });

  it('creates a scoped route when every required approver is active and independent', () => {
    const submitter = { id: 'user-submit', roles: ['BRANCH_INPUT'], isActive: true, branchCode: '635' } as UserProfile;
    const controller = { id: 'user-controller', roles: ['BRANCH_CONTROLLER'], isActive: true, branchCode: '635' } as UserProfile;
    const leader = { id: 'user-leader', roles: ['BRANCH_LEADER'], isActive: true, branchCode: '635' } as UserProfile;
    const wrongBranchController = { id: 'user-controller-428', roles: ['BRANCH_CONTROLLER'], isActive: true, branchCode: '428' } as UserProfile;
    const finding = { branchCode: '635', isSpecialCase: true } as Pick<Finding, 'branchCode' | 'isSpecialCase'>;

    expect(resolveApprovalRoute(finding, 'THREE_TIER', submitter, [submitter, controller, leader, wrongBranchController], '2026-09-07T00:00:00.000Z')).toMatchObject({
      branchControllerUserId: controller.id,
      branchLeaderUserId: leader.id,
      requiresBranchLeaderApproval: true,
      assignedByUserId: submitter.id,
    });
  });

  it('excludes internal approvers who cannot read the finding within their assigned scope', () => {
    const finding = {
      branchCode: '635',
      branchName: 'Chi nhánh Nam Buôn Hồ',
      clusterName: 'Cụm Tây Nguyên',
      department: 'Phòng QLKH 1',
    } as Pick<Finding, 'branchCode' | 'branchName' | 'clusterName' | 'department'>;
    const sameBranch = {
      id: 'internal-same-branch', roles: ['INTERNAL_APPROVER'], isActive: true,
      scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635' }],
    } as UserProfile;
    const otherBranch = {
      id: 'internal-other-branch', roles: ['INTERNAL_APPROVER'], isActive: true,
      scopes: [{ scopeType: 'BRANCH', orgUnitCode: '428' }],
    } as UserProfile;
    const otherDepartment = {
      id: 'internal-other-department', roles: ['SUPERVISOR'], isActive: true,
      branchCode: '635',
      scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng Kiểm soát' }],
    } as UserProfile;
    const global = {
      id: 'internal-global', roles: ['SUPERVISOR'], isActive: true,
      scopes: [{ scopeType: 'ALL' }],
    } as UserProfile;

    expect(approvalCandidatesForFinding(finding, [sameBranch, otherBranch, otherDepartment, global]).internalApprovers.map(user => user.id))
      .toEqual(['internal-same-branch', 'internal-global']);
  });
});
