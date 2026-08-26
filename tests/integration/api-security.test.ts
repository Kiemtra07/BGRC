import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('API security boundaries', () => {
  afterAll(async () => {
    await app.close();
  });

  it('keeps health public but requires an authenticated local user elsewhere', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const findings = await app.inject({ method: 'GET', url: '/api/v1/findings' });

    expect(health.statusCode).toBe(200);
    expect(findings.statusCode).toBe(401);
    expect(findings.json()).toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  });

  it('rejects an unknown x-user-id instead of silently becoming admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { 'x-user-id': 'user-does-not-exist' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_LOCAL_USER' });
  });

  it('blocks non-admin users from admin APIs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { 'x-user-id': 'user-branch-635' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
  });

  it('serves the persisted workflow audit trail only to administrators', async () => {
    const [adminResponse, branchResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/admin/audit-events', headers: adminHeaders }),
      app.inject({ method: 'GET', url: '/api/v1/admin/audit-events', headers: { 'x-user-id': 'user-branch-635' } }),
    ]);

    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'SUBMIT_BRANCH', findingId: 'find-002', cif: '10849201', errorCode: 'TD02.05' }),
    ]));
    expect(branchResponse.statusCode).toBe(403);
    expect(branchResponse.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
  });

  it('validates admin user provisioning payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { 'x-user-id': 'user-admin' },
      payload: {
        email: 'not-an-email',
        fullName: 'X',
        portal: 'BRANCH',
        roles: ['UNRECOGNIZED_ROLE'],
        primaryRole: 'UNRECOGNIZED_ROLE',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not disclose a finding outside the branch data scope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-002',
      headers: { 'x-user-id': 'user-branch-635' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'FINDING_NOT_FOUND' });
  });

  it('returns 422 for an invalid workflow command body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-001/actions/submit-branch',
      headers: { 'x-user-id': 'user-branch-635' },
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('preserves the workflow domain status for optimistic locking conflicts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-001/actions/submit-branch',
      headers: { 'x-user-id': 'user-branch-635', 'idempotency-key': 'version-conflict-find-001' },
      payload: {
        expectedVersion: 999,
        resolutionNotes: 'Đã bổ sung đủ chứng từ theo yêu cầu.',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('requires an idempotency key for every valid workflow mutation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-003/actions/internal-waive',
      headers: { 'x-user-id': 'user-admin' },
      payload: { expectedVersion: 999, decisionNumber: 'CV-KTNB-TEST' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('does not grant business workflow authority to a configuration administrator', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-approve',
      headers: { ...adminHeaders, 'idempotency-key': 'admin-must-not-approve' },
      payload: { expectedVersion: 999, notes: 'Admin không được thay Kiểm soát chi nhánh ra quyết định.' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not allow branch submission without available evidence metadata', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/findings',
      headers: adminHeaders,
      payload: {
        channelId: 'chan-audit-bgs',
        cif: 'NO-EVIDENCE-01',
        customerName: 'Khách hàng chưa có minh chứng',
        clusterName: 'Cụm Tây Nguyên',
        branchCode: '635',
        branchName: 'Chi nhánh Nam Buôn Hồ',
        department: 'Phòng QLKH 1',
        errorCode: 'TD98.01',
        errorTitle: 'Chưa bổ sung minh chứng',
        description: 'Hồ sơ kiểm thử bắt buộc phải có minh chứng trước khi gửi.',
        exposureAmount: 10,
      },
    });
    expect(created.statusCode).toBe(200);

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/findings/${created.json().id}/actions/submit-branch`,
      headers: { 'x-user-id': 'user-branch-635', 'idempotency-key': 'no-evidence-submit-01' },
      payload: { expectedVersion: 1, resolutionNotes: 'Đã giải trình nhưng chưa có tệp minh chứng.' },
    });
    expect(submitted.statusCode).toBe(422);
    expect(submitted.json()).toMatchObject({ code: 'EVIDENCE_REQUIRED_FOR_WORKFLOW' });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/findings/${created.json().id}`,
      headers: { 'x-user-id': 'user-branch-635' },
    });
    expect(detail.json()).toMatchObject({ workflowStatus: 'PENDING', version: 1 });
  });

  it('blocks branch control from mutating another branch finding', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-reject',
      headers: { 'x-user-id': 'user-branch-controller-635' },
      payload: {
        expectedVersion: 2,
        reason: 'Hồ sơ ngoài phạm vi chi nhánh đang phụ trách.',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'FINDING_NOT_FOUND' });
  });

  it('rejects an unknown branch code instead of falling back to a branch name', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Kiểm soát phạm vi sai mã',
        email: 'scope-mismatch@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_CONTROLLER'],
        primaryRole: 'BRANCH_CONTROLLER',
        branchCode: '999',
        branchName: 'Chi nhánh Nam Buôn Hồ',
        department: 'Phòng Kiểm soát chi nhánh',
        isActive: true,
      },
    });
    expect(created.statusCode).toBe(422);
    expect(created.json()).toMatchObject({ code: 'BRANCH_ASSIGNMENT_INVALID' });
  });

  it('replays the first successful response for the same idempotency key', async () => {
    const controller = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Kiểm soát Chi nhánh 428 - Idempotency',
        email: 'controller.428.idempotency@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_CONTROLLER'],
        primaryRole: 'BRANCH_CONTROLLER',
        branchCode: '428',
        branchName: 'Chi nhánh Bình Tây Sài Gòn',
        department: 'Phòng Kiểm soát chi nhánh',
        isActive: true,
      },
    });
    expect(controller.statusCode).toBe(200);

    const headers = {
      'x-user-id': controller.json().user.id,
      'idempotency-key': 'approve-find-002-once',
    };
    const payload = {
      expectedVersion: 2,
      notes: 'Kiểm soát đồng ý hồ sơ có minh chứng hợp lệ.',
    };

    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-002',
      headers: adminHeaders,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-approve',
      headers,
      payload,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-approve',
      headers,
      payload,
    });
    const detail = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-002',
      headers: adminHeaders,
    });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(detail.json().history).toHaveLength(before.json().history.length + 1);
  });
});
