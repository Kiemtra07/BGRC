import { describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const headers = { 'x-user-id': 'user-internal-supervisor' };

describe('priority monitoring API', () => {
  it('stars a watched customer without accepting the work', async () => {
    const watched = await app.inject({
      method: 'PUT', url: '/api/v1/workspace/watch-targets', headers,
      payload: { targetType: 'CUSTOMER', branchCode: '635', cif: '10482910' },
    });
    expect(watched.statusCode).toBe(200);

    const starred = await app.inject({
      method: 'PATCH', url: `/api/v1/workspace/watch-targets/${watched.json().id}/priority`, headers,
      payload: { isPriority: true },
    });
    expect(starred.statusCode).toBe(200);
    expect(starred.json().isPriority).toBe(true);

    const queue = await app.inject({ method: 'GET', url: '/api/v1/workspace/my-work', headers });
    expect(queue.json().watchTargets.find((item: { id: string }) => item.id === watched.json().id).isPriority).toBe(true);
    expect(queue.json().accepted.some((item: { targetKey: string }) => item.targetKey === watched.json().targetKey)).toBe(false);
  });

  it('prevents one user from starring another user watch target', async () => {
    const watched = await app.inject({
      method: 'PUT', url: '/api/v1/workspace/watch-targets', headers,
      payload: { targetType: 'BRANCH', branchCode: '635' },
    });
    const forbidden = await app.inject({
      method: 'PATCH', url: `/api/v1/workspace/watch-targets/${watched.json().id}/priority`,
      headers: { 'x-user-id': 'user-branch-controller-635' }, payload: { isPriority: true },
    });
    expect(forbidden.statusCode).toBe(404);
  });

  it('unstars without removing the watch target', async () => {
    const watched = await app.inject({
      method: 'PUT', url: '/api/v1/workspace/watch-targets', headers,
      payload: { targetType: 'CLUSTER', clusterName: 'Cụm Tây Nguyên' },
    });
    await app.inject({ method: 'PATCH', url: `/api/v1/workspace/watch-targets/${watched.json().id}/priority`, headers, payload: { isPriority: true } });
    const unstarred = await app.inject({ method: 'PATCH', url: `/api/v1/workspace/watch-targets/${watched.json().id}/priority`, headers, payload: { isPriority: false } });
    expect(unstarred.statusCode).toBe(200);
    expect(unstarred.json().isPriority).toBe(false);

    const queue = await app.inject({ method: 'GET', url: '/api/v1/workspace/my-work', headers });
    expect(queue.json().watchTargets.some((item: { id: string }) => item.id === watched.json().id)).toBe(true);
  });
});
