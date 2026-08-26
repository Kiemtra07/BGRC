import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  backfillLocalState,
  readLocalStateFile,
} from '../../db/backfill-local-state';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function writeSnapshot(data: Record<string, unknown>): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-backfill-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'local-state.json');
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    savedAt: '2026-08-26T00:00:00.000Z',
    data,
  }), 'utf8');
  return filePath;
}

describe('local-json to Postgres backfill', () => {
  it('reads the UTF-8 envelope and reports collection counts without exposing record data', () => {
    const filePath = writeSnapshot({
      findings: [{ id: 'finding-1', customerName: 'Nguyễn Văn An' }],
      workflowEvents: [{ id: 'event-1' }, { id: 'event-2' }],
      idempotencyRecords: { first: { response: 'Đã duyệt' } },
    });

    const parsed = readLocalStateFile(filePath);

    expect(parsed.data).toMatchObject({ findings: [{ customerName: 'Nguyễn Văn An' }] });
    expect(parsed.summary).toEqual({ findings: 1, idempotencyRecords: 1, workflowEvents: 2 });
  });

  it('fails closed for a malformed or unsupported local-state envelope', () => {
    const filePath = writeSnapshot({ findings: [] });
    fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 2, data: {} }), 'utf8');

    expect(() => readLocalStateFile(filePath)).toThrow(/LOCAL_STATE_BACKFILL_INVALID/);
  });

  it('supports dry-run and refuses to overwrite an existing Postgres snapshot without force', async () => {
    const data = { findings: [{ id: 'finding-1' }] };
    let existing = true;
    let saved: unknown;
    const target = {
      hasSnapshot: async () => existing,
      save: async (value: unknown) => {
        saved = structuredClone(value);
        existing = true;
      },
    };

    await expect(backfillLocalState({ data, target, dryRun: true })).resolves.toEqual({ written: false });
    expect(saved).toBeUndefined();
    await expect(backfillLocalState({ data, target })).rejects.toThrow(/BACKFILL_TARGET_NOT_EMPTY/);
    await expect(backfillLocalState({ data, target, force: true })).resolves.toEqual({ written: true });
    expect(saved).toEqual(data);
  });
});
