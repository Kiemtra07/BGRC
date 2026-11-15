import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { acceptAllSubItems } from './review-helpers';

const adminHeaders = { 'x-user-id': 'user-admin' };
let createdUsers = 0;

async function createBranchUser(role: 'BRANCH_INPUT' | 'BRANCH_CONTROLLER', fullName: string, department = 'Phòng Kiểm soát chi nhánh'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/users',
    headers: adminHeaders,
    payload: {
      fullName,
      email: `guard.${role.toLowerCase()}.${++createdUsers}@bank.com.vn`,
      portal: 'BRANCH',
      roles: [role],
      primaryRole: role,
      branchCode: '428',
      branchName: 'Chi nhánh Bình Tây Sài Gòn',
      department,
      isActive: true,
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().user.id;
}

const post = (url: string, userId: string, key: string, payload: unknown) => app.inject({
  method: 'POST', url, headers: { 'x-user-id': userId, 'idempotency-key': key }, payload: payload as object,
});
const detailOf = async (findingId: string) => (await app.inject({ method: 'GET', url: `/api/v1/findings/${findingId}`, headers: adminHeaders })).json();

describe('chặn duyệt sai ở máy chủ', () => {
  afterAll(async () => {
    await app.close();
  });

  it('không cho Kiểm soát chuyển tiếp khi còn ý sai sót chưa được chấp nhận', async () => {
    const input = await createBranchUser('BRANCH_INPUT', 'Guard nộp', 'Phòng QLKH 2');
    const controller = await createBranchUser('BRANCH_CONTROLLER', 'Guard kiểm soát');
    const returned = await post('/api/v1/findings/find-002/actions/branch-control-reject', controller, 'guard-return', {
      expectedVersion: (await detailOf('find-002')).version, reason: 'Trả về để kiểm thử chặn duyệt.',
    });
    expect(returned.statusCode, returned.body).toBe(200);
    const submitted = await post('/api/v1/findings/find-002/actions/submit-branch', input, 'guard-submit', {
      expectedVersion: returned.json().version, resolutionNotes: 'Nộp lại để kiểm thử chặn duyệt.', nextApproverUserId: controller,
    });
    expect(submitted.statusCode, submitted.body).toBe(200);

    const blocked = await post('/api/v1/findings/find-002/actions/branch-control-approve', controller, 'guard-approve-open', {
      expectedVersion: submitted.json().version,
    });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'SUB_ITEMS_NOT_ACCEPTED' });
    expect((await detailOf('find-002')).workflowStatus).toBe('SUBMITTED_BRANCH');

    const subItems = (await detailOf('find-002')).subItems as Array<{ id: string }>;
    const partial = await app.inject({
      method: 'POST', url: '/api/v1/findings/find-002/sub-items/review', headers: { 'x-user-id': controller },
      payload: { decisions: subItems.map(item => ({ subItemId: item.id, decision: 'RETURN' })), reviewNote: 'Chưa đủ căn cứ.' },
    });
    expect(partial.statusCode, partial.body).toBe(200);
    const stillBlocked = await post('/api/v1/findings/find-002/actions/branch-control-approve', controller, 'guard-approve-returned', {
      expectedVersion: partial.json().version,
    });
    expect(stillBlocked.statusCode).toBe(409);

    const accepted = await acceptAllSubItems(app, 'find-002', controller);
    const approved = await post('/api/v1/findings/find-002/actions/branch-control-approve', controller, 'guard-approve-ok', { expectedVersion: accepted });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json().workflowStatus).toBe('SUBMITTED_INTERNAL');
  });

  it('không cho Hội sở đóng lỗi khi còn ý sai sót chưa được chấp nhận', async () => {
    const version = (await detailOf('find-003')).version;
    const blocked = await post('/api/v1/findings/find-003/actions/internal-waive', 'user-internal-supervisor', 'guard-waive-open', {
      expectedVersion: version, decisionNumber: 'CV-GUARD-01',
    });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'SUB_ITEMS_NOT_ACCEPTED' });
    expect((await detailOf('find-003')).workflowStatus).toBe('SUBMITTED_INTERNAL');
  });

  it('chỉ người được giao mới đánh giá được các ý sai sót', async () => {
    const input = await createBranchUser('BRANCH_INPUT', 'Guard nộp hai', 'Phòng QLKH 2');
    const assigned = await createBranchUser('BRANCH_CONTROLLER', 'Guard kiểm soát được giao');
    const other = await createBranchUser('BRANCH_CONTROLLER', 'Guard kiểm soát khác');
    const current = await detailOf('find-002');
    expect(current.workflowStatus).toBe('SUBMITTED_INTERNAL');
    const returned = await post('/api/v1/findings/find-002/actions/internal-reject', 'user-internal-supervisor', 'guard-hq-return', {
      expectedVersion: current.version, reason: 'Trả về để dựng bước kiểm soát.',
    });
    expect(returned.statusCode, returned.body).toBe(200);
    const submitted = await post('/api/v1/findings/find-002/actions/submit-branch', input, 'guard-submit-2', {
      expectedVersion: returned.json().version, resolutionNotes: 'Nộp lại cho người kiểm soát được giao.', nextApproverUserId: assigned,
    });
    expect(submitted.statusCode, submitted.body).toBe(200);

    const subItems = (await detailOf('find-002')).subItems as Array<{ id: string }>;
    const review = await app.inject({
      method: 'POST', url: '/api/v1/findings/find-002/sub-items/review', headers: { 'x-user-id': other },
      payload: { decisions: subItems.map(item => ({ subItemId: item.id, decision: 'ACCEPT' })), reviewNote: 'Người không được giao.' },
    });
    expect(review.statusCode, review.body).toBe(403);
    expect(review.json()).toMatchObject({ code: 'APPROVER_NOT_ASSIGNED' });
  });
});
