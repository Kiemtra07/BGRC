import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalStateRepository } from '../../server/src/repositories/local-state';
import { shouldHydrateRuntimeStatePerRequest } from '../../server/src/state/runtime-request-lock';

interface Store {
  findings: Array<{ id: string; title: string }>;
}

/**
 * Regression for stale reads on Vercel. Two repositories bound to one snapshot file stand
 * in for two serverless instances sharing a single Postgres state row: instance 1 writes,
 * instance 2 still holds its cold-start snapshot until the onRequest read-through hook
 * re-hydrates it from the shared store.
 */
describe('serverless read-through re-hydration', () => {
  const seed: Store = { findings: [{ id: 'f-1', title: 'ban đầu' }] };
  let dir: string;
  let filePath: string;
  const instance = () =>
    createLocalStateRepository<Store>({ filePath, dataStoreMode: 'local-json', persistenceEnabled: true });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stale-read-'));
    filePath = join(dir, 'state.json');
    instance().save(seed);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('instance 2 sees instance 1 writes after the hook re-hydrates (mode=postgres)', () => {
    const instanceOne = instance();
    const instanceTwo = instance();

    let instanceTwoState = instanceTwo.load(seed); // cold start
    expect(instanceTwoState.findings.map(f => f.title)).toEqual(['ban đầu']);

    instanceOne.update(seed, latest => {
      latest.findings[0].title = 'đã cập nhật';
      latest.findings.push({ id: 'f-2', title: 'mới' });
    });

    // Before instance 2's cold-start snapshot is corrected it still returns stale data.
    expect(instanceTwoState.findings.map(f => f.title)).toEqual(['ban đầu']);

    // onRequest hook decision for a plain GET business route, then the read-through load.
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/findings', 'GET')).toBe(true);
    instanceTwoState = instanceTwo.load(instanceTwoState);

    expect(instanceTwoState.findings.map(f => f.id)).toEqual(['f-1', 'f-2']);
    expect(instanceTwoState.findings[0].title).toBe('đã cập nhật');
  });

  it('does not re-hydrate under local-json / memory so single-instance tests keep their snapshot', () => {
    const instanceTwo = instance();
    const instanceTwoState = instanceTwo.load(seed);

    instance().update(seed, latest => {
      latest.findings[0].title = 'đã cập nhật';
    });

    for (const mode of ['local-json', 'memory', undefined]) {
      expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: mode }, '/api/v1/findings', 'GET')).toBe(false);
    }

    // The hook skips the load(), so the cold-start snapshot is intentionally left untouched.
    expect(instanceTwoState.findings[0].title).toBe('ban đầu');
  });

  it('skips the internal cron endpoint and every write method even under postgres', () => {
    const postgres = { DATA_STORE_MODE: 'postgres' } as NodeJS.ProcessEnv;
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/internal/sla/run', 'GET')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/internal/sla/run', 'POST')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/findings', 'POST')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/findings', 'PATCH')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/findings', 'DELETE')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/health', 'GET')).toBe(false);
    // A normal GET read still re-hydrates.
    expect(shouldHydrateRuntimeStatePerRequest(postgres, '/api/v1/findings?status=OPEN', 'GET')).toBe(true);
  });
});
