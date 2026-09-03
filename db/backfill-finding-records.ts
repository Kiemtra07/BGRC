import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvidenceObject, Finding } from '../shared/contracts';
import { assertDatabaseConfigured, pool } from '../server/src/adapters/postgres';
import {
  PostgresPoolLike,
  PostgresStateRepository,
} from '../server/src/repositories/postgres-state';
import { PostgresFindingRecords } from '../server/src/repositories/finding-records';

export interface FindingBackfillState {
  findings?: Finding[];
  evidences?: EvidenceObject[];
}

export interface FindingRecordsSource {
  hasSnapshot(): Promise<boolean>;
  load(fallback: FindingBackfillState): Promise<FindingBackfillState>;
}

export interface FindingRecordsTarget {
  sync(
    findings: readonly Finding[],
    evidenceCountById: ReadonlyMap<string, number>,
  ): Promise<{ upserted: number; deleted: number }>;
}

export interface FindingBackfillResult {
  findingCount: number;
  evidenceCount: number;
  availableEvidenceCount: number;
  written: boolean;
  upserted: number;
  deleted: number;
}

export function availableEvidenceCounts(evidences: readonly EvidenceObject[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const evidence of evidences) {
    if (evidence.status !== 'AVAILABLE') continue;
    counts.set(evidence.findingId, (counts.get(evidence.findingId) ?? 0) + 1);
  }
  return counts;
}

export async function backfillFindingRecords(options: {
  source: FindingRecordsSource;
  target: FindingRecordsTarget;
  dryRun?: boolean;
}): Promise<FindingBackfillResult> {
  if (!(await options.source.hasSnapshot())) {
    throw new Error(
      'FINDING_RECORDS_BACKFILL_SNAPSHOT_MISSING — không có app_state_snapshots/primary; '
      + 'dừng để tránh xoá bảng chiếu hiện có.',
    );
  }

  const state = await options.source.load({ findings: [], evidences: [] });
  const findings = Array.isArray(state.findings) ? state.findings : [];
  const evidences = Array.isArray(state.evidences) ? state.evidences : [];
  const evidenceCountById = availableEvidenceCounts(evidences);
  const availableEvidenceCount = [...evidenceCountById.values()].reduce((sum, count) => sum + count, 0);
  if (options.dryRun) {
    return {
      findingCount: findings.length,
      evidenceCount: evidences.length,
      availableEvidenceCount,
      written: false,
      upserted: 0,
      deleted: 0,
    };
  }

  const sync = await options.target.sync(findings, evidenceCountById);
  return {
    findingCount: findings.length,
    evidenceCount: evidences.length,
    availableEvidenceCount,
    written: true,
    ...sync,
  };
}

async function runCli(): Promise<void> {
  assertDatabaseConfigured();
  const source = new PostgresStateRepository<FindingBackfillState>({
    pool: pool as unknown as PostgresPoolLike,
  });
  const target = new PostgresFindingRecords({ pool: pool as unknown as PostgresPoolLike });
  const result = await backfillFindingRecords({
    source,
    target,
    dryRun: process.argv.includes('--dry-run'),
  });

  console.log(`Finding records source: app_state_snapshots/primary`);
  console.log(`- findings: ${result.findingCount}`);
  console.log(`- evidences: ${result.evidenceCount}`);
  console.log(`- available evidences: ${result.availableEvidenceCount}`);
  if (result.written) {
    console.log(`Backfill finding_records hoàn tất: upserted=${result.upserted}; deleted=${result.deleted}.`);
  } else {
    console.log('Backfill finding_records dry-run: không ghi Postgres.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
