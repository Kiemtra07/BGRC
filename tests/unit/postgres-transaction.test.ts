import { describe, expect, it } from 'vitest';
import type { PostgresClientLike, PostgresPoolLike } from '../../server/src/repositories/postgres-state';
import { withBackendTransaction } from '../../server/src/repositories/postgres-transaction';
import { PostgresWorkflowEventLedger } from '../../server/src/repositories/workflow-event-ledger';
import type { WorkflowEvent } from '../../shared/contracts';

class TransactionClient implements PostgresClientLike {
  public readonly queries: string[] = [];

  public async query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.queries.push(sql.replace(/\s+/g, ' ').trim());
    return { rows: [] };
  }

  public release(): void {}
}

describe('withBackendTransaction', () => {
  it('keeps RLS context transaction-local while combining BEGIN and SET LOCAL', async () => {
    const client = new TransactionClient();
    const pool: PostgresPoolLike = { connect: async () => client };

    await withBackendTransaction(pool, async currentClient => {
      await currentClient.query('SELECT protected_state');
      return 'ok';
    });

    expect(client.queries).toEqual([
      "BEGIN; SET LOCAL app.runtime_role = 'backend'",
      'SELECT protected_state',
      'COMMIT',
    ]);
  });

  it('appends an event batch with one parameterized ledger statement', async () => {
    const client = new TransactionClient();
    const ledger = new PostgresWorkflowEventLedger({ pool: { connect: async () => client } });
    const event: WorkflowEvent = {
      id: 'evt-ledger-001',
      findingId: 'find-ledger-001',
      command: 'SUBMIT_BRANCH',
      fromStatus: 'PENDING',
      toStatus: 'SUBMITTED_BRANCH',
      actorUserId: 'user-ledger-001',
      actorName: 'Người kiểm thử',
      actorRole: 'BRANCH_INPUT',
      evidenceSnapshot: [],
      createdAt: '2026-09-02T00:00:00.000Z',
    };

    await ledger.append([event]);

    expect(client.queries).toHaveLength(3);
    expect(client.queries[1]).toMatch(/INSERT INTO workflow_event_ledger/i);
  });
});
