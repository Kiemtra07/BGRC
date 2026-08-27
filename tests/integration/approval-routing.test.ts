import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

describe('named approval routing', () => {
  afterAll(async () => {
    await app.close();
  });

  it('returns only active approvers eligible for the finding branch dropdown', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-001/approval-candidates',
      headers: { 'x-user-id': 'user-branch-635' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().branchControllers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'user-branch-controller-635', branchCode: '635', isActive: true }),
    ]));
    expect(response.json().branchControllers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ branchCode: '428' }),
    ]));
  });

  it('rejects a route that names a controller outside the finding branch', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/findings/find-001/approval-route',
      headers: { 'x-user-id': 'user-branch-635' },
      payload: {
        branchControllerUserId: 'user-branch-controller-102',
        requiresBranchLeaderApproval: false,
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'ROUTE_CONTROLLER_INVALID' });
  });
});
