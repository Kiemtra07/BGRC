import { describe, expect, it } from 'vitest';
import {
  approvalCandidatesForFinding,
  approvalStageForStatus,
  approvalStagesHeldBy,
  eligibleRecipientsForStage,
  pinStageApprover,
  resolveApprovalRoute,
  selectIndependentApprover,
} from '../../server/src/modules/workflow/approval-assignment';
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

  describe('choosing the recipient of the next step', () => {
    const user = (id: string, role: UserProfile['roles'][number]) =>
      ({ id, roles: [role], isActive: true, branchCode: '635', scopes: [{ scopeType: 'ALL' }] }) as UserProfile;
    const submitter = user('submitter', 'BRANCH_INPUT');
    const controllerA = user('controller-a', 'BRANCH_CONTROLLER');
    const controllerB = user('controller-b', 'BRANCH_CONTROLLER');
    const leader = user('leader', 'BRANCH_LEADER');
    const headOffice = user('head-office', 'INTERNAL_APPROVER');
    const everyone = [submitter, controllerA, controllerB, leader, headOffice];
    const finding = { branchCode: '635', isSpecialCase: true } as Pick<Finding, 'branchCode' | 'isSpecialCase'>;

    it('maps a waiting status to the stage that owns it', () => {
      expect(approvalStageForStatus('SUBMITTED_BRANCH')).toBe('BRANCH_CONTROLLER');
      expect(approvalStageForStatus('SUBMITTED_BRANCH_LEADER')).toBe('BRANCH_LEADER');
      expect(approvalStageForStatus('SUBMITTED_INTERNAL')).toBe('INTERNAL_APPROVER');
      expect(approvalStageForStatus('PENDING')).toBeUndefined();
    });

    it('never offers the person forwarding or anyone who already holds an earlier step', () => {
      const route = { branchControllerUserId: controllerA.id, branchLeaderUserId: leader.id, requiresBranchLeaderApproval: true, assignedByUserId: submitter.id };

      expect(eligibleRecipientsForStage(finding, 'BRANCH_CONTROLLER', submitter.id, undefined, everyone).map(item => item.id))
        .toEqual([controllerA.id, controllerB.id]);
      expect(eligibleRecipientsForStage(finding, 'BRANCH_CONTROLLER', controllerA.id, route, everyone).map(item => item.id))
        .toEqual([controllerB.id]);
      expect(eligibleRecipientsForStage(finding, 'INTERNAL_APPROVER', leader.id, route, everyone).map(item => item.id))
        .toEqual([headOffice.id]);
    });

    it('uses the controller the submitter picked instead of the first one in the list', () => {
      expect(resolveApprovalRoute(finding, 'TWO_TIER', submitter, everyone, '2026-09-07T00:00:00.000Z', { controllerUserId: controllerB.id }))
        .toMatchObject({ branchControllerUserId: controllerB.id, branchLeaderUserId: leader.id });
    });

    it('keeps earlier picks and the reassignment history when a returned finding is submitted again', () => {
      const history = [{
        stage: 'BRANCH_CONTROLLER' as const, assignedUserId: controllerB.id, assignedByUserId: 'admin',
        reason: 'Giao thay trong thời gian nghỉ phép.', assignedAt: '2026-09-01T00:00:00.000Z',
      }];
      const previous = { branchControllerUserId: controllerB.id, internalApproverUserId: headOffice.id, requiresBranchLeaderApproval: false, assignmentHistory: history };

      expect(resolveApprovalRoute(finding, 'TWO_TIER', submitter, everyone, '2026-09-07T00:00:00.000Z', { previous }))
        .toMatchObject({ branchControllerUserId: controllerB.id, internalApproverUserId: headOffice.id, assignmentHistory: history });
    });

    it('drops an earlier pick that is no longer eligible', () => {
      const previous = { branchControllerUserId: 'left-the-branch', requiresBranchLeaderApproval: false };

      expect(resolveApprovalRoute(finding, 'TWO_TIER', submitter, everyone, '2026-09-07T00:00:00.000Z', { previous })?.branchControllerUserId)
        .toBe(controllerA.id);
    });

    it('pins the recipient without disturbing who submitted the finding', () => {
      const route = { branchControllerUserId: controllerA.id, requiresBranchLeaderApproval: true, assignedByUserId: submitter.id };

      expect(pinStageApprover(route, 'BRANCH_LEADER', leader.id, '2026-09-07T00:00:00.000Z'))
        .toEqual({ ...route, branchLeaderUserId: leader.id });
      expect(pinStageApprover(undefined, 'INTERNAL_APPROVER', headOffice.id, '2026-09-07T00:00:00.000Z'))
        .toMatchObject({ internalApproverUserId: headOffice.id, requiresBranchLeaderApproval: false });
    });
  });

  describe('approval stages a user still holds', () => {
    const route = { branchControllerUserId: 'controller', branchLeaderUserId: 'leader', internalApproverUserId: 'head-office', requiresBranchLeaderApproval: true };
    const finding = (workflowStatus: Finding['workflowStatus'], overrides: Partial<Finding> = {}) =>
      ({ id: `f-${workflowStatus}`, workflowStatus, approvalRoute: route, ...overrides }) as Finding;

    it('counts the waiting stage and the pinned stages still ahead of it', () => {
      const waitingAtController = [finding('SUBMITTED_BRANCH')];

      expect(approvalStagesHeldBy(waitingAtController, 'controller')).toEqual([
        expect.objectContaining({ stage: 'BRANCH_CONTROLLER', isCurrentStage: true }),
      ]);
      expect(approvalStagesHeldBy(waitingAtController, 'leader')).toEqual([
        expect.objectContaining({ stage: 'BRANCH_LEADER', isCurrentStage: false }),
      ]);
      expect(approvalStagesHeldBy(waitingAtController, 'head-office')).toEqual([
        expect.objectContaining({ stage: 'INTERNAL_APPROVER', isCurrentStage: false }),
      ]);
    });

    it('drops stages that are already behind the finding', () => {
      const waitingAtLeader = [finding('SUBMITTED_BRANCH_LEADER')];

      expect(approvalStagesHeldBy(waitingAtLeader, 'controller')).toEqual([]);
      expect(approvalStagesHeldBy(waitingAtLeader, 'leader')).toEqual([
        expect.objectContaining({ stage: 'BRANCH_LEADER', isCurrentStage: true }),
      ]);
    });

    it('ignores the leader step when the route does not go through the branch leader', () => {
      const withoutLeader = [finding('SUBMITTED_BRANCH', { approvalRoute: { ...route, requiresBranchLeaderApproval: false } })];

      expect(approvalStagesHeldBy(withoutLeader, 'leader')).toEqual([]);
    });

    it('ignores findings that are back with the branch or already closed', () => {
      const idle = [finding('PENDING'), finding('REJECTED'), finding('WAIVED_RESOLVED')];

      expect(approvalStagesHeldBy(idle, 'controller')).toEqual([]);
      expect(approvalStagesHeldBy(idle, 'head-office')).toEqual([]);
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
