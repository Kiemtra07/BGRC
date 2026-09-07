import type { FindingApprovalAssignment } from '../../../shared/contracts';
import type { PostgresClientLike } from './postgres-state';

export interface ApprovalAssignmentHistoryWrite {
  eventId: string;
  findingId: string;
  assignment: FindingApprovalAssignment;
}

/** Inserts canonical reassignment history using the caller's existing state transaction. */
export async function insertApprovalAssignmentHistory(
  client: PostgresClientLike,
  entries: readonly ApprovalAssignmentHistoryWrite[],
): Promise<void> {
  if (!entries.length) return;
  const params: unknown[] = [];
  const values = entries.map((entry, index) => {
    const offset = index * 9;
    params.push(
      entry.eventId,
      entry.findingId,
      entry.assignment.stage,
      entry.assignment.previousUserId ?? null,
      entry.assignment.assignedUserId,
      entry.assignment.assignedByUserId,
      entry.assignment.reason,
      entry.assignment.assignedAt,
      entry.assignment.validUntil ?? null,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::timestamptz, $${offset + 9}::timestamptz)`;
  });
  await client.query(
    `INSERT INTO approval_assignment_history(
       event_id, finding_id, stage, previous_user_id, assigned_user_id,
       assigned_by_user_id, reason, assigned_at, valid_until
     ) VALUES ${values.join(', ')}
     ON CONFLICT (event_id) DO NOTHING`,
    params,
  );
}
