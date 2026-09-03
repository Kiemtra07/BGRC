import { describe, expect, it } from 'vitest';
import type { EvidenceObject } from '../../shared/contracts';
import { backfillFindingRecords } from '../../db/backfill-finding-records';

const sourceState = {
  findings: [
    { id: 'a' },
    { id: 'b' },
  ],
  evidences: [
    { findingId: 'a', status: 'AVAILABLE' },
    { findingId: 'a', status: 'REVOKED' },
    { findingId: 'b', status: 'AVAILABLE' },
  ] as EvidenceObject[],
};

describe('backfill bảng finding_records', () => {
  it('dry-run đọc snapshot và đếm minh chứng khả dụng nhưng không ghi', async () => {
    let writes = 0;
    const result = await backfillFindingRecords({
      source: {
        hasSnapshot: async () => true,
        load: async () => sourceState,
      },
      target: {
        sync: async () => {
          writes += 1;
          return { upserted: 2, deleted: 0 };
        },
      },
      dryRun: true,
    });

    expect(result).toMatchObject({ findingCount: 2, availableEvidenceCount: 2, written: false });
    expect(writes).toBe(0);
  });

  it('ghi đúng snapshot hiện có và không tính minh chứng đã thu hồi', async () => {
    let received: unknown;
    const result = await backfillFindingRecords({
      source: {
        hasSnapshot: async () => true,
        load: async () => sourceState,
      },
      target: {
        sync: async (findings, evidenceCounts) => {
          received = { findings, evidenceCounts: [...evidenceCounts.entries()] };
          return { upserted: 2, deleted: 0 };
        },
      },
    });

    expect(result).toMatchObject({ findingCount: 2, availableEvidenceCount: 2, written: true });
    expect(received).toEqual({
      findings: sourceState.findings,
      evidenceCounts: [['a', 1], ['b', 1]],
    });
  });

  it('dừng an toàn khi chưa có snapshot nguồn', async () => {
    await expect(backfillFindingRecords({
      source: {
        hasSnapshot: async () => false,
        load: async () => sourceState,
      },
      target: { sync: async () => ({ upserted: 0, deleted: 0 }) },
    })).rejects.toThrow(/FINDING_RECORDS_BACKFILL_SNAPSHOT_MISSING/);
  });
});
