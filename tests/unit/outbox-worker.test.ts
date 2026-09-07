import { describe, expect, it, vi } from 'vitest';
import { OutboxWorker } from '../../server/src/worker/outbox-worker';

describe('OutboxWorker', () => {
  it('moves a failed delivery back to the queue with bounded exponential backoff', async () => {
    const store = {
      claim: vi.fn().mockResolvedValue([{
        id: 'evt-1', eventType: 'SLA_REMINDER', aggregateType: 'FINDING', aggregateId: 'find-1',
        payload: {}, retryCount: 2,
      }]),
      markDelivered: vi.fn(),
      markFailed: vi.fn(),
    };
    const worker = new OutboxWorker(store, async () => { throw new Error('provider unavailable'); }, {
      workerId: 'worker-test', maxAttempts: 5, baseRetryMs: 1_000, maxRetryMs: 60_000,
    });

    await expect(worker.runOnce()).resolves.toEqual({ claimed: 1, delivered: 0, failed: 1 });
    expect(store.markFailed).toHaveBeenCalledWith('evt-1', 'worker-test', 'provider unavailable', 4_000, 5);
    expect(store.markDelivered).not.toHaveBeenCalled();
  });
});
