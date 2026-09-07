import { describe, expect, it } from 'vitest';
import { createStagedImportCheckpointEvent } from '../../server/src/modules/ingestion/staged-import-background';

describe('staged import background checkpoint', () => {
  it('creates one durable event for the current checkpoint', () => {
    expect(createStagedImportCheckpointEvent({
      batchId: 'batch-42',
      userId: 'user-input',
      checkpointRowNumber: 250,
      maxRows: 250,
      remainingRows: 750,
    })).toEqual({
      eventType: 'STAGED_IMPORT_CHECKPOINT',
      aggregateType: 'IMPORT_BATCH',
      aggregateId: 'batch-42',
      payload: { batchId: 'batch-42', userId: 'user-input', maxRows: 250, checkpointRowNumber: 250 },
      dedupeKey: 'staged-import:batch-42:250',
    });
  });

  it('does not queue a completed batch', () => {
    expect(createStagedImportCheckpointEvent({
      batchId: 'batch-42',
      userId: 'user-input',
      checkpointRowNumber: 1_000,
      maxRows: 250,
      remainingRows: 0,
    })).toBeNull();
  });
});
