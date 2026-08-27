import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('P0 HTTP contracts', () => {
  afterAll(async () => {
    await app.close();
  });

  it('returns a bounded paginated findings envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/findings?page=1&limit=2',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      page: 1,
      limit: 2,
      total: 4,
      hasMore: true,
    });
    expect(response.json().items).toHaveLength(2);
  });

  it('reports the configured durable data-store mode in readiness', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });

    const expectedDataStoreMode = process.env.DATA_STORE_MODE === 'postgres' ? 'postgres' : 'local-json';

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'DEGRADED',
      ready: true,
      checks: {
        dataStore: { mode: expectedDataStoreMode, durable: true },
        evidenceStorage: { mode: 'local', durable: true },
        auth: { mode: 'local-credential-session', productionSafe: false },
      },
    });
  });

  it('uses an RFC 7807-style problem response for forbidden access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { 'x-user-id': 'user-branch-635' },
    });

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      type: 'https://audit-bgs.local/problems/forbidden',
      title: 'Không đủ quyền thực hiện',
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
