import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const admin = { 'x-user-id': 'user-admin' };
const officer = { 'x-user-id': 'user-internal-officer' };

afterAll(async () => {
  await app.close();
});

describe('thêm ý sai sót kiểm phiên bản để gửi lại không nhân đôi dữ liệu', () => {
  const content = 'Chưa đối chiếu số liệu tồn kho với chứng từ nhập xuất.';

  it('từ chối yêu cầu thiếu expectedVersion', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/findings/find-003/sub-items', headers: officer, payload: { content },
    });
    expect(response.statusCode, response.body).toBe(422);
  });

  it('thêm đúng một ý khi gửi lặp cùng phiên bản', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/v1/findings/find-003', headers: admin });
    const expectedVersion = before.json().version as number;
    const countBefore = before.json().subItems.length as number;

    const first = await app.inject({
      method: 'POST', url: '/api/v1/findings/find-003/sub-items', headers: officer, payload: { content, expectedVersion },
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().subItems).toHaveLength(countBefore + 1);

    const retry = await app.inject({
      method: 'POST', url: '/api/v1/findings/find-003/sub-items', headers: officer, payload: { content, expectedVersion },
    });
    expect(retry.statusCode, retry.body).toBe(409);
    expect(retry.json()).toMatchObject({ code: 'VERSION_CONFLICT' });

    const after = await app.inject({ method: 'GET', url: '/api/v1/findings/find-003', headers: admin });
    expect(after.json().subItems).toHaveLength(countBefore + 1);
  });
});

describe('dấu sao trường hợp đặc biệt', () => {
  it('từ chối yêu cầu thiếu expectedVersion hoặc dùng phiên bản cũ', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/findings', headers: officer,
      payload: {
        channelId: 'chan-audit-bgs', campaignId: 'campaign-regular-2026',
        cif: 'GUARD-CIF-001', customerName: 'Khách hàng kiểm tra phiên bản',
        clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
        department: 'Phòng QLKH 1', errorGroup: 'TD01', exposureAmount: 0,
        errorCode: 'GUARD.02', errorTitle: 'Mã lỗi kiểm tra phiên bản', description: 'Nội dung sai sót dùng để kiểm tra phiên bản.',
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const url = `/api/v1/findings/${created.json().id}/special-case`;

    const missing = await app.inject({ method: 'PUT', url, headers: officer, payload: { isSpecialCase: true } });
    expect(missing.statusCode, missing.body).toBe(422);

    const stale = await app.inject({ method: 'PUT', url, headers: officer, payload: { isSpecialCase: true, expectedVersion: created.json().version + 5 } });
    expect(stale.statusCode, stale.body).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('khóa theo mọi hồ sơ của khách hàng, kể cả hồ sơ ngoài phạm vi người đánh dấu', async () => {
    // find-002 (chi nhánh 428, Phòng QLKH 2) đã rời bước chi nhánh. Người chỉ có phạm vi ở phòng khác
    // trong cùng chi nhánh không thấy hồ sơ đó, nhưng vẫn không được đổi luồng duyệt của khách hàng.
    const sibling = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: admin });
    expect(['PENDING', 'REJECTED']).not.toContain(sibling.json().workflowStatus);

    const created = await app.inject({
      method: 'POST', url: '/api/v1/findings', headers: officer,
      payload: {
        channelId: 'chan-audit-bgs', campaignId: 'campaign-regular-2026',
        cif: sibling.json().cif, customerName: sibling.json().customerName,
        clusterName: sibling.json().clusterName, branchCode: '428', branchName: sibling.json().branchName,
        department: 'Phòng Kiểm soát chi nhánh', errorGroup: 'TD01', exposureAmount: 0,
        errorCode: 'GUARD.01', errorTitle: 'Mã lỗi kiểm tra phạm vi', description: 'Nội dung sai sót dùng để kiểm tra phạm vi.',
      },
    });
    expect(created.statusCode, created.body).toBe(200);

    const narrowUser = await app.inject({
      method: 'POST', url: '/api/v1/admin/users', headers: admin,
      payload: {
        fullName: 'Cán bộ phòng kiểm soát 428', email: 'guard.input.428@bank.com.vn', portal: 'BRANCH',
        roles: ['BRANCH_INPUT'], primaryRole: 'BRANCH_INPUT', branchCode: '428',
        branchName: sibling.json().branchName, department: 'Phòng Kiểm soát chi nhánh', isActive: true,
      },
    });
    expect(narrowUser.statusCode, narrowUser.body).toBe(200);

    const flagged = await app.inject({
      method: 'PUT', url: `/api/v1/findings/${created.json().id}/special-case`,
      headers: { 'x-user-id': narrowUser.json().user.id },
      payload: { isSpecialCase: true, expectedVersion: created.json().version },
    });
    expect(flagged.statusCode, flagged.body).toBe(409);
    expect(flagged.json()).toMatchObject({ code: 'SPECIAL_CASE_LOCKED_AFTER_SUBMISSION' });
  });
});
