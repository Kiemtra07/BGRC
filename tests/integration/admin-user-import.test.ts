import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('Admin batch user import', () => {
  afterAll(async () => {
    await app.close();
  });

  it('requires an idempotency key for the batch commit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/imports/commit',
      headers: adminHeaders,
      payload: {
        rows: [{
          rowNumber: 2,
          user: {
            fullName: 'Người dùng thử thiếu khóa',
            email: 'batch.missing.key@bank.com.vn',
            portal: 'INTERNAL',
            roles: ['ADMIN'],
            primaryRole: 'ADMIN',
            isActive: true,
          },
        }],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('creates valid rows, reports business conflicts and replays safely', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: adminHeaders });
    const existingAdmin = before.json().find((user: { id: string }) => user.id === 'user-admin');
    const payload = {
      rows: [
        {
          rowNumber: 2,
          user: {
            fullName: 'Cán bộ nhập lô Chi nhánh 635',
            email: 'batch.branch.635@bank.com.vn',
            portal: 'BRANCH',
            roles: ['BRANCH_INPUT'],
            primaryRole: 'BRANCH_INPUT',
            branchCode: '635',
            department: 'Phòng QLKH 1',
            googleWorkspaceEmail: 'batch.branch.635@workspace.bank.com.vn',
            isActive: true,
          },
        },
        {
          rowNumber: 3,
          user: {
            fullName: 'Email quản trị bị trùng',
            email: existingAdmin.email,
            portal: 'INTERNAL',
            roles: ['ADMIN'],
            primaryRole: 'ADMIN',
            isActive: true,
          },
        },
      ],
    };
    const headers = { ...adminHeaders, 'idempotency-key': 'user-import-batch-635-v1' };

    const first = await app.inject({ method: 'POST', url: '/api/v1/admin/users/imports/commit', headers, payload });
    const replay = await app.inject({ method: 'POST', url: '/api/v1/admin/users/imports/commit', headers, payload });
    const after = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: adminHeaders });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      created: [{ rowNumber: 2, user: { email: 'batch.branch.635@bank.com.vn', googleWorkspaceEmail: 'batch.branch.635@workspace.bank.com.vn' }, temporaryPassword: expect.any(String) }],
      failed: [{ rowNumber: 3, code: 'USER_EMAIL_EXISTS' }],
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(after.json()).toHaveLength(before.json().length + 1);
  });
});
