import type { EnqueueOutboxEvent } from '../../repositories/outbox';

export interface StagedImportCheckpointJob {
  batchId: string;
  userId: string;
  checkpointRowNumber: number;
  maxRows: number;
  remainingRows: number;
}

/**
 * One outbox event represents exactly one checkpoint. The checkpoint row number is part of the
 * dedupe key so an at-least-once worker replay cannot schedule a second event for the same slice.
 */
export function createStagedImportCheckpointEvent(job: StagedImportCheckpointJob): EnqueueOutboxEvent | null {
  if (job.remainingRows <= 0) return null;
  return {
    eventType: 'STAGED_IMPORT_CHECKPOINT',
    aggregateType: 'IMPORT_BATCH',
    aggregateId: job.batchId,
    payload: { batchId: job.batchId, userId: job.userId, maxRows: job.maxRows, checkpointRowNumber: job.checkpointRowNumber },
    dedupeKey: `staged-import:${job.batchId}:${job.checkpointRowNumber}`,
  };
}
