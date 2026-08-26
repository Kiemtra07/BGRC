import { describe, expect, it } from 'vitest';
import {
  RuntimeRequestLock,
  shouldHydrateRuntimeStatePerRequest,
} from '../../server/src/state/runtime-request-lock';

describe('RuntimeRequestLock', () => {
  it('serializes concurrent requests and allows an idempotent release', async () => {
    const lock = new RuntimeRequestLock();
    const releaseFirst = await lock.acquire();
    let secondEntered = false;
    const second = lock.acquire().then(release => {
      secondEntered = true;
      return release;
    });

    await Promise.resolve();
    expect(secondEntered).toBe(false);

    releaseFirst();
    releaseFirst();
    const releaseSecond = await second;
    expect(secondEntered).toBe(true);
    releaseSecond();
  });

  it('hydrates only business requests that use the Postgres runtime', () => {
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/findings')).toBe(true);
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'local-json' }, '/api/v1/findings')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/health')).toBe(false);
    expect(shouldHydrateRuntimeStatePerRequest({ DATA_STORE_MODE: 'postgres' }, '/api/v1/ready')).toBe(false);
  });
});
