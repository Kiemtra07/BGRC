import { describe, expect, it } from 'vitest';
import { reassignApprovalStage } from '../../server/src/modules/workflow/approval-assignment';

describe('approval route reassignment', () => {
  it('preserves the former assignee, reason and administrator in route history', () => {
    const reassigned = reassignApprovalStage({
      branchControllerUserId: 'controller-a',
      requiresBranchLeaderApproval: false,
      assignedByUserId: 'branch-input',
      assignedAt: '2026-09-05T10:00:00.000Z',
    }, 'BRANCH_CONTROLLER', 'controller-b', {
      actorUserId: 'admin-1',
      reason: 'Người phụ trách cũ đang nghỉ phép.',
      assignedAt: '2026-09-05T11:00:00.000Z',
      validUntil: '2026-09-12T11:00:00.000Z',
    });

    expect(reassigned.branchControllerUserId).toBe('controller-b');
    expect(reassigned.assignmentHistory).toEqual([{
      stage: 'BRANCH_CONTROLLER',
      previousUserId: 'controller-a',
      assignedUserId: 'controller-b',
      assignedByUserId: 'admin-1',
      reason: 'Người phụ trách cũ đang nghỉ phép.',
      assignedAt: '2026-09-05T11:00:00.000Z',
      validUntil: '2026-09-12T11:00:00.000Z',
    }]);
  });
});
