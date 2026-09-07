import { describe, expect, it } from 'vitest';
import { completeIdempotencyClaim, MemoryIdempotencyStore } from '../../server/src/repositories/idempotency-store';

describe('atomic idempotency claims', () => {
  it('claims once, reports concurrent work, replays completed work, and releases failures', async () => {
    const records = {};
    const store = new MemoryIdempotencyStore(() => records);

    const claim = await store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' });
    expect(claim).toMatchObject({ state: 'CLAIMED', claimToken: expect.any(String) });
    if (claim.state !== 'CLAIMED') throw new Error('Expected claim');
    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'IN_PROGRESS' });
    await expect(store.claim('key-1', 'hash-b', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'CONFLICT' });

    await store.put('key-1', { requestHash: 'hash-a', claimToken: claim.claimToken, response: { ok: true } }, { method: 'POST', path: '/test', status: 201 });
    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toMatchObject({ state: 'REPLAY', record: { response: { ok: true } } });

    await expect(store.release('key-1', 'hash-a')).resolves.toBeUndefined();
    await expect(store.claim('key-1', 'hash-a', { method: 'POST', path: '/test' })).resolves.toEqual({ state: 'REPLAY', record: expect.anything() });
  });

  it('allows a failed request to release its pending claim', async () => {
    const records = {};
    const store = new MemoryIdempotencyStore(() => records);
    const claim = await store.claim('key-2', 'hash-a', { method: 'POST', path: '/test' });
    if (claim.state !== 'CLAIMED') throw new Error('Expected claim');
    await store.release('key-2', 'hash-a', claim.claimToken);
    await expect(store.claim('key-2', 'hash-a', { method: 'POST', path: '/test' })).resolves.toMatchObject({ state: 'CLAIMED' });
  });

  it('does not complete a claim after it has been released', async () => {
    const records = {};
    const store = new MemoryIdempotencyStore(() => records);
    const claim = await store.claim('key-released', 'hash-a', { method: 'POST', path: '/test' });
    if (claim.state !== 'CLAIMED') throw new Error('Expected claim');
    await store.release('key-released', 'hash-a', claim.claimToken);

    await expect(store.put('key-released', { requestHash: 'hash-a', response: { ok: true } }, { method: 'POST', path: '/test', status: 201 }))
      .rejects.toThrow('IDEMPOTENCY_CLAIM_LOST');
  });

  it('recovers a stale in-memory claim after the crash timeout', async () => {
    const records = {
      'key-3': { requestHash: 'hash-a', response: undefined, status: 102, storedAt: new Date(Date.now() - 3 * 60_000).toISOString() },
    };
    const store = new MemoryIdempotencyStore(() => records);
    await expect(store.claim('key-3', 'hash-a', { method: 'POST', path: '/test' })).resolves.toMatchObject({ state: 'CLAIMED' });
  });

  it('rejects completion by an old lease after the same key and hash are reclaimed', async () => {
    const records: Record<string, any> = {};
    const store = new MemoryIdempotencyStore(() => records);
    const oldClaim = await store.claim('key-lease', 'hash-a', { method: 'POST', path: '/test' });
    if (oldClaim.state !== 'CLAIMED') throw new Error('Expected old claim');
    records['key-lease'].storedAt = new Date(Date.now() - 3 * 60_000).toISOString();
    const newClaim = await store.claim('key-lease', 'hash-a', { method: 'POST', path: '/test' });
    if (newClaim.state !== 'CLAIMED') throw new Error('Expected new claim');

    await expect(store.put('key-lease', { requestHash: 'hash-a', claimToken: oldClaim.claimToken, response: { stale: true } }, { method: 'POST', path: '/test', status: 200 }))
      .rejects.toThrow('IDEMPOTENCY_CLAIM_LOST');
    await expect(store.put('key-lease', { requestHash: 'hash-a', claimToken: newClaim.claimToken, response: { current: true } }, { method: 'POST', path: '/test', status: 200 }))
      .resolves.toBeUndefined();
  });

  it('includes the opaque lease token in PostgreSQL completion guard', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    await completeIdempotencyClaim({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [], rowCount: 1 };
      },
      release: () => undefined,
    }, 'key-pg', { requestHash: 'hash-pg', claimToken: 'lease-current', response: { ok: true } }, {
      method: 'POST', path: '/test', status: 201,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/claim_token = \$7/i);
    expect(calls[0].params).toContain('lease-current');
  });
});
