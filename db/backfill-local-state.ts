import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDatabaseConfigured, pool } from '../server/src/adapters/postgres';
import {
  PostgresPoolLike,
  PostgresStateRepository,
} from '../server/src/repositories/postgres-state';
import type { WorkflowEvent } from '../shared/contracts';

interface LocalStateEnvelope<T> {
  schemaVersion: number;
  savedAt: string;
  data: T;
}

export interface BackfillTarget<T> {
  hasSnapshot(): Promise<boolean>;
  save(data: T): Promise<void>;
}

export interface BackfillOptions<T> {
  data: T;
  target: BackfillTarget<T>;
  dryRun?: boolean;
  force?: boolean;
}

function collectionCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 1;
}

export function readLocalStateFile<T extends Record<string, unknown>>(filePath: string): {
  data: T;
  summary: Record<string, number>;
} {
  const resolvedPath = path.resolve(filePath);
  let envelope: LocalStateEnvelope<T>;
  try {
    envelope = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as LocalStateEnvelope<T>;
  } catch (error) {
    throw new Error(
      `LOCAL_STATE_BACKFILL_INVALID — Không thể đọc ${resolvedPath}: ${error instanceof Error ? error.message : 'invalid JSON'}`,
    );
  }
  if (
    envelope.schemaVersion !== 1
    || !Number.isFinite(Date.parse(envelope.savedAt))
    || !envelope.data
    || typeof envelope.data !== 'object'
    || Array.isArray(envelope.data)
  ) {
    throw new Error(`LOCAL_STATE_BACKFILL_INVALID — Envelope ${resolvedPath} không đúng schemaVersion 1.`);
  }

  const summary = Object.fromEntries(
    Object.keys(envelope.data)
      .sort((left, right) => left.localeCompare(right))
      .map(key => [key, collectionCount(envelope.data[key])]),
  );
  return { data: structuredClone(envelope.data), summary };
}

export async function backfillLocalState<T>(options: BackfillOptions<T>): Promise<{ written: boolean }> {
  if (options.dryRun) return { written: false };
  if (await options.target.hasSnapshot() && !options.force) {
    throw new Error(
      'BACKFILL_TARGET_NOT_EMPTY — Postgres đã có app state; dùng --force chỉ sau khi đã backup và xác nhận ghi đè.',
    );
  }
  const data = structuredClone(options.data);
  if (
    options.target instanceof PostgresStateRepository
    && data
    && typeof data === 'object'
    && !Array.isArray(data)
  ) {
    const snapshot = data as Record<string, unknown>;
    const workflowEvents = Array.isArray(snapshot.workflowEvents)
      ? snapshot.workflowEvents as WorkflowEvent[]
      : [];
    delete snapshot.workflowEvents;
    await options.target.saveWithWorkflowEvents(snapshot as T, workflowEvents);
  } else {
    await options.target.save(data);
  }
  return { written: true };
}

async function runCli(): Promise<void> {
  const fileArgument = process.argv.find(argument => argument.startsWith('--file='));
  const filePath = fileArgument?.slice('--file='.length)
    || process.env.LOCAL_STATE_FILE
    || path.join(process.cwd(), 'data', 'local-state.json');
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const parsed = readLocalStateFile<Record<string, unknown>>(filePath);

  console.log(`Backfill source: ${path.resolve(filePath)}`);
  for (const [key, count] of Object.entries(parsed.summary)) console.log(`- ${key}: ${count}`);
  if (dryRun) {
    console.log('Backfill dry-run: dữ liệu UTF-8 hợp lệ; không kết nối và không ghi Postgres.');
    return;
  }

  assertDatabaseConfigured();
  const repository = new PostgresStateRepository<Record<string, unknown>>({
    pool: pool as unknown as PostgresPoolLike,
  });
  const workflowEvents = Array.isArray(parsed.data.workflowEvents)
    ? parsed.data.workflowEvents as WorkflowEvent[]
    : [];
  await backfillLocalState({ data: parsed.data, target: repository, force });
  console.log(
    `Backfill hoàn tất: app_state_snapshots/primary đã được ghi bền vững; ${workflowEvents.length} workflow event đã vào ledger.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
