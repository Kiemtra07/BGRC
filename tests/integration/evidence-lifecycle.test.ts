import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

let branchInputId = '';
let branchControllerId = '';

describe('evidence lifecycle API', () => {
  beforeAll(async () => {
    const [branchInput, branchController] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: { 'x-user-id': 'user-admin' },
        payload: {
          fullName: 'Cán bộ thay thế tài liệu CN 428',
          email: 'evidence.input.428@bank.com.vn',
          portal: 'BRANCH',
          roles: ['BRANCH_INPUT'],
          primaryRole: 'BRANCH_INPUT',
          branchCode: '428',
          department: 'Phòng QLKH 2',
          isActive: true,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: { 'x-user-id': 'user-admin' },
        payload: {
          fullName: 'Kiểm soát tài liệu CN 428',
          email: 'evidence.controller.428@bank.com.vn',
          portal: 'BRANCH',
          roles: ['BRANCH_CONTROLLER'],
          primaryRole: 'BRANCH_CONTROLLER',
          branchCode: '428',
          department: 'Phòng Kiểm soát chi nhánh',
          isActive: true,
        },
      }),
    ]);

    expect(branchInput.statusCode, branchInput.body).toBe(200);
    expect(branchController.statusCode, branchController.body).toBe(200);
    branchInputId = branchInput.json().user.id;
    branchControllerId = branchController.json().user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks evidence after the branch has submitted the finding', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/findings/find-002/evidence/evi-001',
      headers: { 'x-user-id': branchInputId },
      payload: { reason: 'Thay thế tài liệu trước khi chuyển duyệt.' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EVIDENCE_LOCKED_AFTER_SUBMISSION');
  });

  it('allows branch input to revoke evidence after the finding is returned', async () => {
    const returned = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-reject',
      headers: { 'x-user-id': branchControllerId, 'idempotency-key': 'return-evidence-find-002' },
      payload: { expectedVersion: 2, reason: 'Tài liệu chưa đúng, yêu cầu chi nhánh thay thế.' },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().workflowStatus).toBe('REJECTED');

    const uploadSession = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/evidence/upload-session',
      headers: { 'x-user-id': branchInputId },
      payload: {
        fileName: 'Biên bản kiểm tra.pdf',
        mimeType: 'application/pdf',
        fileSize: 10 * 1024 * 1024 + 1,
        sha256Checksum: 'a'.repeat(64),
      },
    });
    expect(uploadSession.statusCode, uploadSession.body).toBe(200);
    expect(uploadSession.json()).toEqual({ uploadMode: 'local' });

    const revoked = await app.inject({
      method: 'DELETE',
      url: '/api/v1/findings/find-002/evidence/evi-001',
      headers: { 'x-user-id': branchInputId },
      payload: { reason: 'Thu hồi để tải tài liệu thay thế.' },
    });
    expect(revoked.statusCode).toBe(204);

    const detail = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-002',
      headers: { 'x-user-id': branchInputId },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().evidenceCount).toBe(0);
    expect(detail.json().evidences).toEqual([]);
  });
});
