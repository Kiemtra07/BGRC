import { describe, expect, it } from 'vitest';
import { flushPendingEventIds } from '../../server/src/state/security-event-queue';

describe('security event queue flushing', () => {
  it('keeps all events pending when the ledger append fails', async () => {
    const pending = [{ id: 'sec-1' }, { id: 'sec-2' }];
    await expect(flushPendingEventIds(pending, async () => { throw new Error('ledger unavailable'); })).rejects.toThrow('ledger unavailable');
    expect(pending).toEqual([{ id: 'sec-1' }, { id: 'sec-2' }]);
  });

  it('returns only the snapshot ids proven appended', async () => {
    const pending = [{ id: 'sec-1' }, { id: 'sec-2' }];
    let appended: readonly { id: string }[] = [];
    const flushed = await flushPendingEventIds(pending, async events => { appended = events; });
    expect([...flushed]).toEqual(['sec-1', 'sec-2']);
    expect(appended).toEqual(pending);
  });
});
