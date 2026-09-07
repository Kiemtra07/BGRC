import { describe, expect, it, vi } from 'vitest';

const runStagedImportBackgroundCheckpoint = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../server/src/app', () => ({ runStagedImportBackgroundCheckpoint }));

import { buildEvidenceScannerCallbackUrl, deliverOutboxEvent } from '../../server/src/worker/outbox-runner';

describe('buildEvidenceScannerCallbackUrl', () => {
  it('preserves the configured callback path when it is missing a trailing slash', () => {
    const callbackUrl = buildEvidenceScannerCallbackUrl(
      new URL('https://audit.example/api/v1/internal/evidence-scans'),
      'evidence/a b',
    );

    expect(callbackUrl.toString()).toBe(
      'https://audit.example/api/v1/internal/evidence-scans/evidence%2Fa%20b/complete',
    );
  });

  it('dispatches a staged-import checkpoint to the durable import command', async () => {
    const payload = { batchId: 'batch-42', userId: 'user-input', maxRows: 250, checkpointRowNumber: 250 };
    await deliverOutboxEvent({
      id: 'outbox-42', eventType: 'STAGED_IMPORT_CHECKPOINT', aggregateType: 'IMPORT_BATCH', aggregateId: 'batch-42',
      payload, retryCount: 0, dedupeKey: 'staged-import:batch-42:250',
    });
    expect(runStagedImportBackgroundCheckpoint).toHaveBeenCalledWith(payload);
  });
});
