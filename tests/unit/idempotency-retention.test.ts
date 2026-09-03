import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_RETENTION_MS,
  pruneExpiredIdempotencyRecords,
} from '../../server/src/state/idempotency-retention';

const at = (nowMs: number, agoMs: number) => new Date(nowMs - agoMs).toISOString();

describe('idempotency retention', () => {
  const now = Date.parse('2026-09-03T10:00:00.000Z');

  it('keeps records still inside the retry window', () => {
    const records = {
      a: { storedAt: at(now, 60_000) },
      b: { storedAt: at(now, IDEMPOTENCY_RETENTION_MS - 1_000) },
    };
    expect(pruneExpiredIdempotencyRecords(records, now)).toBe(0);
    expect(Object.keys(records)).toEqual(['a', 'b']);
  });

  it('drops records past the retention window', () => {
    const records = {
      fresh: { storedAt: at(now, 1_000) },
      stale: { storedAt: at(now, IDEMPOTENCY_RETENTION_MS + 1_000) },
    };
    expect(pruneExpiredIdempotencyRecords(records, now)).toBe(1);
    expect(Object.keys(records)).toEqual(['fresh']);
  });

  it('drops legacy records that carry no timestamp', () => {
    // Bản ghi ghi trước khi có hạn lưu không có `storedAt`. Giữ chúng lại nghĩa là giữ vĩnh viễn —
    // đúng cái đã làm snapshot phình không giới hạn — nên phải coi là hết hạn.
    const records: Record<string, { storedAt?: string }> = { legacy: {}, fresh: { storedAt: at(now, 1_000) } };
    expect(pruneExpiredIdempotencyRecords(records, now)).toBe(1);
    expect(Object.keys(records)).toEqual(['fresh']);
  });

  it('treats an unparsable timestamp as expired rather than immortal', () => {
    const records = { broken: { storedAt: 'không phải ngày' } };
    expect(pruneExpiredIdempotencyRecords(records, now)).toBe(1);
    expect(Object.keys(records)).toEqual([]);
  });

  it('retains for a full day so a client retry after a long outage still replays', () => {
    expect(IDEMPOTENCY_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });
});
