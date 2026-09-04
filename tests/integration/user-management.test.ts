import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('Admin user organization management', () => {
  afterAll(async () => {
    await app.close();
  });

  it('returns the admin catalog in one authenticated bootstrap response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/bootstrap',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      users: expect.any(Array),
      orgUnits: expect.any(Array),
      channels: expect.any(Array),
    });
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

    const unassigned = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ nội bộ chờ phân luồng',
        email: 'internal.assignment.pending@bank.com.vn',
        portal: 'INTERNAL',
        roles: ['INTERNAL_OFFICER'],
        primaryRole: 'INTERNAL_OFFICER',
        isActive: true,
      },
    });
    expect(unassigned.statusCode).toBe(200);
    expect(unassigned.json().user.scopes).toEqual([]);

    const blockedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/findings',
      headers: { 'x-user-id': unassigned.json().user.id },
      payload: {
        channelId: 'chan-audit-bgs', cif: 'UNASSIGNED-01', customerName: 'Khách chưa phân luồng',
        clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
        errorCode: 'TD99.01', errorTitle: 'Không được tạo khi chưa phân luồng',
        description: 'Tài khoản phải bị chặn thao tác nghiệp vụ cho đến khi được phân luồng.', exposureAmount: 1,
      },
    });
    expect(blockedCreate.statusCode).toBe(403);
    expect(blockedCreate.json()).toMatchObject({ code: 'USER_ASSIGNMENT_REQUIRED' });
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

  it('preserves partial cluster and branch routing until a department is selected', async () => {
    const clusterOnly = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ theo cụm trước',
        email: 'branch.cluster-only.directory@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_INPUT'],
        primaryRole: 'BRANCH_INPUT',
        clusterName: 'Cụm Tây Nguyên',
        isActive: true,
      },
    });

    expect(clusterOnly.statusCode).toBe(200);
    expect(clusterOnly.json().user).toMatchObject({
      clusterName: 'Cụm Tây Nguyên',
      orgUnitId: 'org-cluster-tn',
      scopes: [{ scopeType: 'CLUSTER', clusterName: 'Cụm Tây Nguyên' }],
    });
    expect(clusterOnly.json().user).not.toHaveProperty('branchCode');

    const branchOnly = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ theo chi nhánh trước',
        email: 'branch.branch-only.directory@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_INPUT'],
        primaryRole: 'BRANCH_INPUT',
        clusterName: 'Cụm Tây Nguyên',
        branchCode: '635',
        isActive: true,
      },
    });

    expect(branchOnly.statusCode).toBe(200);
    expect(branchOnly.json().user).toMatchObject({
      clusterName: 'Cụm Tây Nguyên',
      branchCode: '635',
      branchName: 'Chi nhánh Nam Buôn Hồ',
      orgUnitId: 'org-br-635',
      scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ' }],
    });
    expect(branchOnly.json().user).not.toHaveProperty('department');
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

  it('allows an unassigned user to open, then assigns and moves the user through the hierarchy', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Cán bộ chờ phân luồng',
        email: 'branch.assignment.lifecycle@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_INPUT'],
        primaryRole: 'BRANCH_INPUT',
        isActive: true,
      },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().user).toMatchObject({ scopes: [] });
    expect(created.json().user).not.toHaveProperty('branchCode');
    expect(created.json().user).not.toHaveProperty('department');

    const assigned = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${created.json().user.id}`,
      headers: adminHeaders,
      payload: {
        clusterId: 'org-cluster-tn',
        branchCode: '635',
        departmentId: 'org-dept-635-qlkh1',
      },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().user).toMatchObject({
      clusterName: 'Cụm Tây Nguyên',
      branchCode: '635',
      branchName: 'Chi nhánh Nam Buôn Hồ',
      department: 'Phòng QLKH 1',
      orgUnitId: 'org-dept-635-qlkh1',
      scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }],
    });

    const profileOnlyUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${created.json().user.id}`,
      headers: adminHeaders,
      payload: { fullName: 'Cán bộ đã phân luồng và đổi tên' },
    });
    expect(profileOnlyUpdate.statusCode).toBe(200);
    expect(profileOnlyUpdate.json().user).toMatchObject({
      fullName: 'Cán bộ đã phân luồng và đổi tên',
      clusterName: 'Cụm Tây Nguyên',
      branchCode: '635',
      department: 'Phòng QLKH 1',
      scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }],
    });

    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${created.json().user.id}`,
      headers: adminHeaders,
      payload: {
        clusterId: 'org-cluster-hcm',
        branchCode: '428',
        departmentId: 'org-dept-428-qlkh2',
      },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().user).toMatchObject({
      clusterName: 'Cụm TP. Hồ Chí Minh',
      branchCode: '428',
      branchName: 'Chi nhánh Bình Tây Sài Gòn',
      department: 'Phòng QLKH 2',
      orgUnitId: 'org-dept-428-qlkh2',
    });
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
