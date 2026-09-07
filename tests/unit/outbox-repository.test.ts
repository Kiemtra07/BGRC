import { describe, expect, it } from 'vitest';
import { insertOutboxEvents, PostgresOutbox } from '../../server/src/repositories/outbox';

class FakeClient {
  public readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  public released = false;

  public async query(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push({ sql: normalized, params });
    if (/UPDATE outbox_events/i.test(normalized) && /FOR UPDATE SKIP LOCKED/i.test(normalized)) {
      return {
        rowCount: 1,
        rows: [{
          id: 'outbox-1', event_type: 'SLA_REMINDER', aggregate_type: 'FINDING', aggregate_id: 'find-1',
          payload: { findingId: 'find-1' }, retry_count: 2, dedupe_key: 'sla:find-1:1',
        }],
      };
    }
    if (/SELECT id, event_type/i.test(normalized)) {
      return { rowCount: 1, rows: [{
        id: 'outbox-dead-1', event_type: 'SLA_ESCALATION', aggregate_type: 'FINDING', aggregate_id: 'find-9',
        payload: { findingId: 'find-9' }, retry_count: 5, dedupe_key: 'sla:find-9:overdue',
        status: 'DEAD_LETTER', error_message: 'Webhook timeout', created_at: '2026-09-05T00:00:00.000Z', next_retry_at: null,
      }] };
    }
    if (/FROM outbox_events/i.test(normalized) && /pending_count/i.test(normalized)) {
      return { rowCount: 1, rows: [{
        pending_count: '3', processing_count: '1', dead_letter_count: '2', oldest_pending_age_ms: '45000',
      }] };
    }
    return { rows: [], rowCount: 1 };
  }

  public release(): void { this.released = true; }
}

class FakePool {
  public constructor(public readonly client: FakeClient) {}
  public async connect(): Promise<FakeClient> { return this.client; }
}

describe('PostgresOutbox', () => {
  it('writes a deduplicated event through the caller transaction without opening another one', async () => {
    const client = new FakeClient();

    await insertOutboxEvents(client, [{
      eventType: 'SLA_REMINDER', aggregateType: 'FINDING', aggregateId: 'find-1',
      payload: { findingId: 'find-1' }, dedupeKey: 'sla-reminder:find-1:2026-09-05:1',
    }]);

    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]?.sql).toMatch(/INSERT INTO outbox_events/i);
    expect(client.queries[0]?.sql).toMatch(/ON CONFLICT \(dedupe_key\).*DO NOTHING/i);
  });

  it('claims only due work with SKIP LOCKED and attaches an expiring lease', async () => {
    const client = new FakeClient();
    const outbox = new PostgresOutbox(new FakePool(client));

    await expect(outbox.claim('worker-a', 10 * 60_000, 10)).resolves.toEqual([expect.objectContaining({
      id: 'outbox-1', retryCount: 2, dedupeKey: 'sla:find-1:1',
    })]);

    const claim = client.queries.find(query => /FOR UPDATE SKIP LOCKED/i.test(query.sql));
    expect(claim?.sql).toMatch(/lease_until = NOW\(\) \+ \(\$2 \|\| ' milliseconds'\)::interval/i);
    expect(claim?.params).toEqual(['worker-a', '600000', 10]);
    expect(client.released).toBe(true);
  });

  it('lists delivery state and only requeues dead-letter work', async () => {
    const client = new FakeClient();
    const outbox = new PostgresOutbox(new FakePool(client));

    await expect(outbox.list(20)).resolves.toEqual([expect.objectContaining({
      id: 'outbox-dead-1', status: 'DEAD_LETTER', errorMessage: 'Webhook timeout',
    })]);
    await expect(outbox.retryDeadLetter('outbox-dead-1')).resolves.toBe(true);

    const retry = client.queries.find(query => /WHERE id = \$1 AND status = 'DEAD_LETTER'/i.test(query.sql));
    expect(retry?.params).toEqual(['outbox-dead-1']);
    expect(retry?.sql).toMatch(/status = 'PENDING', retry_count = 0/i);
  });

  it('summarizes backlog state without loading outbox payloads', async () => {
    const client = new FakeClient();
    const outbox = new PostgresOutbox(new FakePool(client));

    await expect(outbox.metrics()).resolves.toEqual({
      pendingCount: 3,
      processingCount: 1,
      deadLetterCount: 2,
      oldestPendingAgeMs: 45_000,
    });

    const summary = client.queries.find(query => /pending_count/i.test(query.sql));
    expect(summary?.sql).toMatch(/status = 'PENDING'/i);
    expect(summary?.sql).toMatch(/status = 'DEAD_LETTER'/i);
    expect(summary?.sql).not.toMatch(/payload/i);
  });
});
