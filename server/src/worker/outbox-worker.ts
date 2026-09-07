import type { OutboxEvent, PostgresOutbox } from '../repositories/outbox';

export interface OutboxDeliveryStore {
  claim(workerId: string, leaseMs: number, limit: number): Promise<OutboxEvent[]>;
  markDelivered(id: string, workerId: string): Promise<void>;
  markFailed(id: string, workerId: string, errorMessage: string, retryDelayMs: number, maxAttempts: number): Promise<void>;
}

export interface OutboxWorkerOptions {
  workerId: string;
  leaseMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
}

export type OutboxDelivery = (event: OutboxEvent) => Promise<void>;

export function outboxRetryDelayMs(retryCount: number, baseRetryMs: number, maxRetryMs: number): number {
  return Math.min(maxRetryMs, baseRetryMs * (2 ** Math.max(0, retryCount)));
}

/**
 * Generic worker: provider delivery is injected so provider-specific code cannot alter the queue
 * protocol. At-least-once is intentional; dedupe_key must be sent to providers that support it.
 */
export class OutboxWorker {
  private readonly leaseMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;

  public constructor(
    private readonly store: OutboxDeliveryStore | PostgresOutbox,
    private readonly deliver: OutboxDelivery,
    options: OutboxWorkerOptions,
  ) {
    this.leaseMs = options.leaseMs ?? 10 * 60_000;
    this.batchSize = options.batchSize ?? 20;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseRetryMs = options.baseRetryMs ?? 60_000;
    this.maxRetryMs = options.maxRetryMs ?? 60 * 60_000;
    this.workerId = options.workerId;
  }

  private readonly workerId: string;

  public async runOnce(): Promise<{ claimed: number; delivered: number; failed: number }> {
    const events = await this.store.claim(this.workerId, this.leaseMs, this.batchSize);
    let delivered = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.deliver(event);
        await this.store.markDelivered(event.id, this.workerId);
        delivered += 1;
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'delivery failed';
        await this.store.markFailed(
          event.id,
          this.workerId,
          detail,
          outboxRetryDelayMs(event.retryCount, this.baseRetryMs, this.maxRetryMs),
          this.maxAttempts,
        );
        failed += 1;
      }
    }
    return { claimed: events.length, delivered, failed };
  }
}
