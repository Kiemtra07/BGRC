import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const officer = { 'x-user-id': 'user-internal-officer' };
const branchInput = { 'x-user-id': 'user-branch-635' };
const admin = { 'x-user-id': 'user-admin' };

const listFor = async (headers: Record<string, string>) =>
  (await app.inject({ method: 'GET', url: '/api/v1/reports/definitions', headers })).json() as Array<{ id: string; name: string; visibility: string; sharedWithRoles: string[] }>;

describe('quản lý báo cáo đã lưu', () => {
  afterAll(async () => {
    await app.close();
  });

  it('chủ báo cáo đổi tên và thu hồi chia sẻ, người khác không sửa được, quản trị viên xóa được', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/reports/definitions', headers: officer,
      payload: { name: 'Tồn đọng theo chi nhánh', exportColumns: ['dimension.branch'], visibility: 'ROLE_SHARED', sharedWithRoles: ['BRANCH_INPUT'] },
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id as string;
    expect((await listFor(branchInput)).map(item => item.id)).toContain(id);

    const notOwner = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: branchInput, payload: { name: 'Đổi tên trái phép' } });
    expect(notOwner.statusCode, notOwner.body).toBe(403);
    expect(notOwner.json()).toMatchObject({ code: 'REPORT_DEFINITION_NOT_OWNER' });
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/reports/definitions/${id}`, headers: branchInput })).statusCode).toBe(403);

    const renamed = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: officer, payload: { name: 'Tồn đọng chi nhánh (chuẩn)' } });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'Tồn đọng chi nhánh (chuẩn)', visibility: 'ROLE_SHARED', sharedWithRoles: ['BRANCH_INPUT'] });

    const missingRoles = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: officer, payload: { visibility: 'ROLE_SHARED', sharedWithRoles: [] } });
    expect(missingRoles.statusCode).toBe(422);

    const unshared = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: officer, payload: { visibility: 'PRIVATE' } });
    expect(unshared.statusCode, unshared.body).toBe(200);
    expect(unshared.json()).toMatchObject({ visibility: 'PRIVATE', sharedWithRoles: [] });
    expect((await listFor(branchInput)).map(item => item.id)).not.toContain(id);
    const hidden = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: branchInput, payload: { name: 'Không thấy được' } });
    expect(hidden.statusCode).toBe(404);

    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/reports/definitions/${id}`, headers: admin });
    expect(removed.statusCode, removed.body).toBe(204);
    expect((await listFor(admin)).map(item => item.id)).not.toContain(id);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/reports/definitions/${id}`, headers: admin })).statusCode).toBe(404);
  });
});
