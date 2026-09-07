import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../server/src/app';

const { cronSecret } = vi.hoisted(() => {
  process.env.DATA_STORE_MODE = 'memory';
  process.env.CRON_SECRET = 'outbox-cron-secret-for-integration-tests';
  return { cronSecret: process.env.CRON_SECRET };
});

const cronPath = '/api/v1/internal/outbox/run';

describe('outbox cron endpoint', () => {
  afterAll(async () => {
    delete process.env.DATA_STORE_MODE;
    delete process.env.CRON_SECRET;
    await app.close();
  });

  it('rejects unauthenticated requests before attempting any delivery', async () => {
    const response = await app.inject({ method: 'POST', url: cronPath });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'CRON_AUTH_REQUIRED' });
  });

  it('fails closed instead of running a non-durable local queue', async () => {
    const response = await app.inject({
      method: 'GET', url: cronPath,
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'OUTBOX_NOT_DURABLE' });
  });
});
