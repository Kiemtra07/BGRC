import { describe, expect, it } from 'vitest';
import { MemoryIdempotencyStore } from '../../server/src/repositories/idempotency-store';

describe('atomic idempotency claims', () => {
  it('claims once, reports concurrent work, replays completed work, and releases failures', async () => {
    const records = {};
    const store = new MemoryIdempotencyStore(() => records);

    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'CLAIMED' });
    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'IN_PROGRESS' });
    await expect(store.claim('key-1', 'hash-b', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'CONFLICT' });

    await store.put('key-1', { requestHash: 'hash-a', response: { ok: true } }, { method: 'POST', path: '/test', status: 201 });
    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toMatchObject({ state: 'REPLAY', record: { response: { ok: true } } });

    await expect(store.release('key-1', 'hash-a')).resolves.toBeUndefined();
    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'REPLAY', record: expect.anything() });
  });

  it('allows a failed request to release its pending claim', async () => {
    const records = {};
    const store = new MemoryIdempotencyStore(() => records);
    await store.claim('key-2', 'hash-a', { method: 'POST', path: '/test' });
    await store.release('key-2', 'hash-a');
    await expect(store.claim('key-2', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'CLAIMED' });
  });

  it('does not complete a claim after it has been released', async () => {
    const records = {};
    const store = new MemoryIdempotencyStore(() => records);
    await store.claim('key-released', 'hash-a', { method: 'POST', path: '/test' });
    await store.release('key-released', 'hash-a');

    await expect(store.put('key-released', { requestHash: 'hash-a', response: { ok: true } }, { method: 'POST', path: '/test', status: 201 }))
      .rejects.toThrow('IDEMPOTENCY_CLAIM_LOST');
  });

  it('recovers a stale in-memory claim after the crash timeout', async () => {
    const records = {
      'key-3': { requestHash: 'hash-a', response: undefined, status: 102, storedAt: new Date(Date.now() - 3 * 60_000).toISOString() },
    };
    const store = new MemoryIdempotencyStore(() => records);
    await expect(store.claim('key-3', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'CLAIMED' });
  });
});
