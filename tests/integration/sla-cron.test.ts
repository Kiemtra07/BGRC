import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../server/src/app';

const { cronSecret } = vi.hoisted(() => {
  process.env.DATA_STORE_MODE = 'memory';
  process.env.CRON_SECRET = 'cron-secret-for-integration-tests';
  return { cronSecret: process.env.CRON_SECRET };
});
const cronPath = '/api/v1/internal/sla/run';

describe('SLA cron endpoint', () => {
  afterAll(async () => {
    delete process.env.DATA_STORE_MODE;
    delete process.env.CRON_SECRET;
    await app.close();
  });

  it('rejects missing and incorrect bearer credentials', async () => {
    const missing = await app.inject({ method: 'POST', url: cronPath });
    const incorrect = await app.inject({
      method: 'POST',
      url: cronPath,
      headers: { authorization: 'Bearer incorrect-secret' },
    });

    expect(missing.statusCode).toBe(401);
    expect(incorrect.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ code: 'CRON_AUTH_REQUIRED' });
    expect(incorrect.json()).toMatchObject({ code: 'CRON_AUTH_REQUIRED' });
  });

  it('evaluates and persists SLA through the documented POST endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: cronPath,
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      maintenance: {
        databaseActivity: true,
        dataStore: { mode: 'memory', durable: false },
      },
      evaluatedCount: expect.any(Number),
      updatedCount: expect.any(Number),
      overdueCount: expect.any(Number),
      dueSoonCount: expect.any(Number),
    });
  });

  it('also accepts the GET method used by Vercel Cron', async () => {
    const response = await app.inject({
      method: 'GET',
      url: cronPath,
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, evaluatedCount: expect.any(Number) });
  });

  it('fails closed when the server secret is absent', async () => {
    delete process.env.CRON_SECRET;
    const response = await app.inject({ method: 'GET', url: cronPath });
    process.env.CRON_SECRET = cronSecret;

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'CRON_NOT_CONFIGURED' });
  });
});
