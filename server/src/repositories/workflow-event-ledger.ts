import type { WorkflowEvent } from '../../../shared/contracts';
import type {
  PostgresClientLike,
  PostgresPoolLike,
} from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';

type EvidenceSnapshot = NonNullable<WorkflowEvent['evidenceSnapshot']>;

/** Ghi nhiều sự kiện trong đúng transaction đang ghi app state. */
export async function insertWorkflowEvents(
  client: PostgresClientLike,
  events: readonly WorkflowEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const params: unknown[] = [];
  const values = events.map((event, index) => {
    const offset = index * 13;
    params.push(
      event.id,
      event.findingId,
      event.command,
      event.fromStatus,
      event.toStatus,
      event.actorUserId,
      event.actorName,
      event.actorRole,
      event.notes ?? null,
      event.rejectionReason ?? null,
      event.rejectedFromStage ?? null,
      JSON.stringify(event.evidenceSnapshot ?? []),
      event.createdAt,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}::jsonb, $${offset + 13}::timestamptz)`;
  });

  await client.query(
    `INSERT INTO workflow_event_ledger(
       event_id, finding_id, command, from_status, to_status, actor_user_id,
       actor_name, actor_role, notes, rejection_reason, rejected_from_stage,
       evidence_snapshot, created_at
     ) VALUES ${values.join(', ')}
     ON CONFLICT (event_id) DO NOTHING`,
    params,
  );
}

export interface WorkflowEventLedgerOptions {
  pool: PostgresPoolLike;
}

export class PostgresWorkflowEventLedger {
  private readonly pool: PostgresPoolLike;

  public constructor(options: WorkflowEventLedgerOptions) {
    this.pool = options.pool;
  }

  public async loadAll(): Promise<WorkflowEvent[]> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        `SELECT event_id, finding_id, command, from_status, to_status, actor_user_id,
                actor_name, actor_role, notes, rejection_reason, rejected_from_stage,
                evidence_snapshot, created_at
           FROM workflow_event_ledger
          ORDER BY created_at ASC, event_id ASC`,
      );
      return result.rows.map(mapWorkflowEvent);
    });
  }

  public async append(events: readonly WorkflowEvent[]): Promise<void> {
    if (events.length === 0) return;
    await withBackendTransaction(this.pool, client => insertWorkflowEvents(client, events));
  }
}

function mapWorkflowEvent(row: Record<string, unknown>): WorkflowEvent {
  const evidenceSnapshot = Array.isArray(row.evidence_snapshot)
    ? row.evidence_snapshot as EvidenceSnapshot
    : [];
  return {
    id: String(row.event_id),
    findingId: String(row.finding_id),
    command: String(row.command) as WorkflowEvent['command'],
    fromStatus: String(row.from_status) as WorkflowEvent['fromStatus'],
    toStatus: String(row.to_status) as WorkflowEvent['toStatus'],
    actorUserId: String(row.actor_user_id),
    actorName: String(row.actor_name),
    actorRole: String(row.actor_role) as WorkflowEvent['actorRole'],
    ...(row.notes === null || row.notes === undefined ? {} : { notes: String(row.notes) }),
    ...(row.rejection_reason === null || row.rejection_reason === undefined
      ? {}
      : { rejectionReason: String(row.rejection_reason) }),
    ...(row.rejected_from_stage === null || row.rejected_from_stage === undefined
      ? {}
      : { rejectedFromStage: String(row.rejected_from_stage) }),
    ...(evidenceSnapshot.length > 0 ? { evidenceSnapshot } : {}),
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}
