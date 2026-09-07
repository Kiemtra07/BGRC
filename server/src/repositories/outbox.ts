import type { PostgresClientLike, PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';

export interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  retryCount: number;
  dedupeKey?: string;
}

export interface OutboxEventView extends OutboxEvent {
  status: string;
  errorMessage?: string;
  createdAt: string;
  nextRetryAt?: string;
}

export interface OutboxMetrics {
  pendingCount: number;
  processingCount: number;
  deadLetterCount: number;
  oldestPendingAgeMs: number | null;
}

export interface EnqueueOutboxEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

/**
 * Thêm các delivery vào transaction do caller quản lý. Dùng ở đường ghi nghiệp vụ để snapshot,
 * workflow ledger và outbox cùng commit hoặc cùng rollback; không được tự mở transaction ở đây.
 */
export async function insertOutboxEvents(
  client: PostgresClientLike,
  events: readonly EnqueueOutboxEvent[],
): Promise<void> {
  for (const event of events) {
    await client.query(
      `INSERT INTO outbox_events(event_type, aggregate_type, aggregate_id, payload, dedupe_key)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload), event.dedupeKey],
    );
  }
}

/** Durable delivery queue. Claiming uses SKIP LOCKED so concurrent workers never deliver one row together. */
export class PostgresOutbox {
  public constructor(private readonly pool: PostgresPoolLike) {}

  public async enqueue(event: EnqueueOutboxEvent): Promise<void> {
    await withBackendTransaction(this.pool, client => insertOutboxEvents(client, [event]));
  }

  /** Bounded operational summary; deliberately excludes event payloads and error details. */
  public async metrics(): Promise<OutboxMetrics> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
           COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing_count,
           COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_letter_count,
           EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING'))) * 1000
             AS oldest_pending_age_ms
         FROM outbox_events`,
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      const oldestPendingAgeMs = row?.oldest_pending_age_ms;
      return {
        pendingCount: Number(row?.pending_count ?? 0),
        processingCount: Number(row?.processing_count ?? 0),
        deadLetterCount: Number(row?.dead_letter_count ?? 0),
        oldestPendingAgeMs: oldestPendingAgeMs == null ? null : Math.max(0, Number(oldestPendingAgeMs)),
      };
    });
  }

  public async list(limit: number): Promise<OutboxEventView[]> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
      `SELECT id, event_type, aggregate_type, aggregate_id, payload, retry_count, dedupe_key,
              status, error_message, created_at, next_retry_at
         FROM outbox_events
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
      );
      return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id), eventType: String(row.event_type), aggregateType: String(row.aggregate_type),
      aggregateId: String(row.aggregate_id), payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
      retryCount: Number(row.retry_count ?? 0), status: String(row.status), createdAt: new Date(row.created_at as string | number | Date).toISOString(),
      ...(row.dedupe_key == null ? {} : { dedupeKey: String(row.dedupe_key) }),
      ...(row.error_message == null ? {} : { errorMessage: String(row.error_message) }),
      ...(row.next_retry_at == null ? {} : { nextRetryAt: new Date(row.next_retry_at as string | number | Date).toISOString() }),
      }));
    });
  }

  public async retryDeadLetter(id: string): Promise<boolean> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
      `UPDATE outbox_events
          SET status = 'PENDING', retry_count = 0, next_retry_at = NOW(), error_message = NULL,
              processed_at = NULL, lease_owner = NULL, lease_until = NULL
        WHERE id = $1 AND status = 'DEAD_LETTER'`,
      [id],
      );
      return Number(result.rowCount ?? 0) === 1;
    });
  }

  public async claim(workerId: string, leaseMs: number, limit: number): Promise<OutboxEvent[]> {
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(
        `WITH candidates AS (
           SELECT id
             FROM outbox_events
            WHERE (
              status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            ) OR (
              status = 'PROCESSING' AND lease_until IS NOT NULL AND lease_until <= NOW()
            )
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $3
         )
         UPDATE outbox_events AS event
            SET status = 'PROCESSING',
                lease_owner = $1,
                lease_until = NOW() + ($2 || ' milliseconds')::interval,
                last_attempt_at = NOW()
           FROM candidates
          WHERE event.id = candidates.id
         RETURNING event.id, event.event_type, event.aggregate_type, event.aggregate_id,
                   event.payload, event.retry_count, event.dedupe_key`,
        [workerId, String(leaseMs), limit],
      );
      return result.rows.map(row => ({
        id: String(row.id),
        eventType: String(row.event_type),
        aggregateType: String(row.aggregate_type),
        aggregateId: String(row.aggregate_id),
        payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
        retryCount: Number(row.retry_count ?? 0),
        ...(row.dedupe_key === null || row.dedupe_key === undefined ? {} : { dedupeKey: String(row.dedupe_key) }),
      }));
    });
  }

  public async markDelivered(id: string, workerId: string): Promise<void> {
    await withBackendTransaction(this.pool, async client => {
      await client.query(
        `UPDATE outbox_events
            SET status = 'DELIVERED', processed_at = NOW(), delivered_at = NOW(),
                lease_owner = NULL, lease_until = NULL, error_message = NULL
          WHERE id = $1 AND status = 'PROCESSING' AND lease_owner = $2`,
        [id, workerId],
      );
    });
  }

  public async markFailed(id: string, workerId: string, errorMessage: string, retryDelayMs: number, maxAttempts: number): Promise<void> {
    await withBackendTransaction(this.pool, async client => {
      await client.query(
        `UPDATE outbox_events
            SET retry_count = retry_count + 1,
                status = CASE WHEN retry_count + 1 >= $5 THEN 'DEAD_LETTER' ELSE 'PENDING' END,
                next_retry_at = CASE WHEN retry_count + 1 >= $5 THEN NULL ELSE NOW() + ($4 || ' milliseconds')::interval END,
                error_message = LEFT($3, 1000),
                lease_owner = NULL,
                lease_until = NULL,
                processed_at = CASE WHEN retry_count + 1 >= $5 THEN NOW() ELSE NULL END
          WHERE id = $1 AND status = 'PROCESSING' AND lease_owner = $2`,
        [id, workerId, errorMessage, String(retryDelayMs), maxAttempts],
      );
    });
  }
}
