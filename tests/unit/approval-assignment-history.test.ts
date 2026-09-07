import { describe, expect, it } from 'vitest';
import { insertApprovalAssignmentHistory } from '../../server/src/repositories/approval-assignment-history';

describe('approval assignment history repository', () => {
  it('writes an idempotent canonical audit record through the active transaction client', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    await insertApprovalAssignmentHistory({
      query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; },
      release: () => undefined,
    }, [{
      eventId: 'evt-reassign-1',
      findingId: 'find-1',
      assignment: {
        stage: 'BRANCH_CONTROLLER',
        previousUserId: 'user-old',
        assignedUserId: 'user-new',
        assignedByUserId: 'user-admin',
        reason: 'Người phụ trách cũ nghỉ phép.',
        assignedAt: '2026-09-05T00:00:00.000Z',
        validUntil: '2026-09-12T00:00:00.000Z',
      },
    }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO approval_assignment_history');
    expect(calls[0].sql).toContain('ON CONFLICT (event_id) DO NOTHING');
    expect(calls[0].params).toEqual([
      'evt-reassign-1', 'find-1', 'BRANCH_CONTROLLER', 'user-old', 'user-new', 'user-admin',
      'Người phụ trách cũ nghỉ phép.', '2026-09-05T00:00:00.000Z', '2026-09-12T00:00:00.000Z',
    ]);
  });
});
