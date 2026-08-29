import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('Admin user organization management', () => {
  afterAll(async () => {
    await app.close();
  });

  it('returns internal teams and enriches seeded users with team membership', async () => {
    const [orgResponse, userResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/admin/org-units', headers: adminHeaders }),
      app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: adminHeaders }),
    ]);

    expect(orgResponse.statusCode).toBe(200);
    expect(orgResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'org-team-credit-audit',
        type: 'INTERNAL_TEAM',
        name: 'Nhóm Kiểm toán Tín dụng 01',
      }),
    ]));
    expect(userResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'user-internal-officer',
        internalTeamId: 'org-team-credit-audit',
        internalTeamName: 'Nhóm Kiểm toán Tín dụng 01',
        teamRole: 'MEMBER',
      }),
    ]));
  });

  it('rejects an operational internal user without a team', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ chưa có nhóm',
        email: 'internal.without.team@bank.com.vn',
        portal: 'INTERNAL',
        roles: ['INTERNAL_OFFICER'],
        primaryRole: 'INTERNAL_OFFICER',
        teamRole: 'MEMBER',
        isActive: true,
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creates a branch user under the canonical cluster and branch hierarchy', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ Chi nhánh 635 mới',
        email: 'branch.635.directory@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_INPUT'],
        primaryRole: 'BRANCH_INPUT',
        clusterName: 'Tên cụm không được tin cậy từ trình duyệt',
        branchCode: '635',
        branchName: 'Tên chi nhánh không được tin cậy từ trình duyệt',
        department: 'Phòng QLKH 1',
        isActive: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      clusterName: 'Cụm Tây Nguyên',
      branchCode: '635',
      branchName: 'Chi nhánh Nam Buôn Hồ',
      department: 'Phòng QLKH 1',
      primaryRole: 'BRANCH_INPUT',
      // Capture staff are confined to their own Phòng/PGD. This used to be 'BRANCH', which stored
      // departmentName and never enforced it, so one phòng could read every phòng in the branch.
      scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }],
    });
  });

  it('rejects a branch user assigned to a non-existent branch', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ sai chi nhánh',
        email: 'branch.unknown.directory@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_CONTROLLER'],
        primaryRole: 'BRANCH_CONTROLLER',
        branchCode: '999',
        branchName: 'Chi nhánh không tồn tại',
        department: 'Phòng Kiểm soát chi nhánh',
        isActive: true,
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'BRANCH_ASSIGNMENT_INVALID' });
  });

  it('allows only one active control lead in an internal team', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Trưởng nhóm Tuân thủ 01',
        email: 'lead.compliance.01@bank.com.vn',
        portal: 'INTERNAL',
        roles: ['INTERNAL_APPROVER'],
        primaryRole: 'INTERNAL_APPROVER',
        internalTeamId: 'org-team-compliance',
        teamRole: 'LEAD',
        isActive: true,
      },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Trưởng nhóm Tuân thủ trùng',
        email: 'lead.compliance.duplicate@bank.com.vn',
        portal: 'INTERNAL',
        roles: ['INTERNAL_APPROVER'],
        primaryRole: 'INTERNAL_APPROVER',
        internalTeamId: 'org-team-compliance',
        teamRole: 'LEAD',
        isActive: true,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().user).toMatchObject({
      internalTeamName: 'Nhóm Giám sát Tuân thủ 01',
      teamRole: 'LEAD',
    });
    // Tài khoản tạo qua API phải đăng nhập được ngay: không truyền mật khẩu thì hệ thống cấp tạm.
    expect(first.json().temporaryPassword).toEqual(expect.any(String));
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: 'INTERNAL_TEAM_LEAD_EXISTS' });
  });

  it('exposes an admin-only password reset email action', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/user-internal-officer/password-reset-email',
      headers: adminHeaders,
    });

    // The test runtime has no Supabase mail adapter; the route must still exist and fail honestly
    // instead of silently pretending an email was sent.
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'SUPABASE_AUTH_NOT_CONFIGURED' });
  });
});
