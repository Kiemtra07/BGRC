import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { acceptAllSubItems } from './review-helpers';

const adminHeaders = { 'x-user-id': 'user-admin' };
let createdUsers = 0;

async function createBranchUser(
  role: 'BRANCH_INPUT' | 'BRANCH_CONTROLLER' | 'BRANCH_LEADER',
  fullName: string,
  department = 'Phòng Kiểm soát chi nhánh',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/users',
    headers: adminHeaders,
    payload: {
      fullName,
      email: `handover.${role.toLowerCase()}.${++createdUsers}@bank.com.vn`,
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
const openItems = (userId: string, viewer = 'user-admin', toUserId?: string) => app.inject({
  method: 'GET',
  url: `/api/v1/admin/users/${userId}/open-items${toUserId ? `?toUserId=${toUserId}` : ''}`,
  headers: { 'x-user-id': viewer },
});
const handover = (payload: unknown, viewer = 'user-admin') => app.inject({
  method: 'POST', url: '/api/v1/admin/handovers', headers: { 'x-user-id': viewer }, payload: payload as object,
});

describe('bàn giao hồ sơ khi một người rời vị trí', () => {
  let input = '';
  let controllerA = '';
  let controllerB = '';
  let version = 0;

  afterAll(async () => {
    await app.close();
  });

  it('chuẩn bị: hồ sơ find-002 đang chờ Kiểm soát A', async () => {
    input = await createBranchUser('BRANCH_INPUT', 'Bàn giao nộp 428', 'Phòng QLKH 2');
    controllerA = await createBranchUser('BRANCH_CONTROLLER', 'Bàn giao kiểm soát A');
    controllerB = await createBranchUser('BRANCH_CONTROLLER', 'Bàn giao kiểm soát B');

    const current = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders });
    const returned = await post('/api/v1/findings/find-002/actions/branch-control-reject', controllerA, 'handover-return', {
      expectedVersion: current.json().version, reason: 'Trả về để dựng tình huống bàn giao.',
    });
    expect(returned.statusCode, returned.body).toBe(200);
    const submitted = await post('/api/v1/findings/find-002/actions/submit-branch', input, 'handover-submit', {
      expectedVersion: returned.json().version,
      resolutionNotes: 'Nộp lại và chọn Kiểm soát A làm người nhận.',
      nextApproverUserId: controllerA,
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().approvalRoute.branchControllerUserId).toBe(controllerA);
    version = submitted.json().version;
  });

  it('kiểm kê hồ sơ đang giữ và gợi ý người nhận đủ điều kiện', async () => {
    const response = await openItems(controllerA);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ userId: controllerA, total: 1, hiddenOutOfScope: 0 });
    expect(body.items).toEqual([expect.objectContaining({
      findingId: 'find-002', stage: 'BRANCH_CONTROLLER', isCurrentStage: true, version,
    })]);
    const optionIds = body.recipientOptions.map((option: { id: string }) => option.id);
    expect(optionIds).toContain(controllerB);
    expect(optionIds).not.toContain(controllerA);
    expect(optionIds).not.toContain(input);

    const toB = (await openItems(controllerA, 'user-admin', controllerB)).json();
    expect(toB.items[0]).toMatchObject({ transferable: true });
    const toInput = (await openItems(controllerA, 'user-admin', input)).json();
    expect(toInput.items[0]).toMatchObject({ transferable: false });
    expect(toInput.items[0].blockedReason).toContain('không đủ điều kiện');
  });

  it('chỉ quản trị viên được kiểm kê và bàn giao', async () => {
    expect((await openItems(controllerA, controllerA)).statusCode).toBe(403);
    const attempt = await handover({
      fromUserId: controllerA, toUserId: controllerB, reason: 'Người không phải quản trị viên.',
      items: [{ findingId: 'find-002', stage: 'BRANCH_CONTROLLER', expectedVersion: version }],
    }, controllerA);
    expect(attempt.statusCode).toBe(403);
  });

  it('chặn khóa, xóa và chuyển chi nhánh khi còn hồ sơ đang giữ', async () => {
    const lock = await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${controllerA}`, headers: adminHeaders, payload: { isActive: false } });
    expect(lock.statusCode, lock.body).toBe(409);
    expect(lock.json()).toMatchObject({ code: 'USER_HAS_OPEN_ITEMS' });
    expect(lock.json().detail).toContain('1 hồ sơ');

    const move = await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${controllerA}`, headers: adminHeaders, payload: { branchCode: '635' } });
    expect(move.statusCode, move.body).toBe(409);
    expect(move.json()).toMatchObject({ code: 'USER_HAS_OPEN_ITEMS' });

    const remove = await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${controllerA}`, headers: adminHeaders });
    expect(remove.statusCode, remove.body).toBe(409);
    expect(remove.json()).toMatchObject({ code: 'USER_HAS_OPEN_ITEMS' });

    const idle = await createBranchUser('BRANCH_CONTROLLER', 'Bàn giao kiểm soát rảnh');
    const lockIdle = await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${idle}`, headers: adminHeaders, payload: { isActive: false } });
    expect(lockIdle.statusCode, lockIdle.body).toBe(200);
  });

  it('bỏ qua hồ sơ đã đổi phiên bản, người nhận sai và yêu cầu tự bàn giao cho mình', async () => {
    const stale = await handover({
      fromUserId: controllerA, toUserId: controllerB, reason: 'Phiên bản đã cũ sau khi xem trước.',
      items: [{ findingId: 'find-002', stage: 'BRANCH_CONTROLLER', expectedVersion: version - 1 }],
    });
    expect(stale.statusCode, stale.body).toBe(200);
    expect(stale.json()).toMatchObject({ moved: 0, remaining: 1 });
    expect(stale.json().skipped[0]).toMatchObject({ findingId: 'find-002', code: 'HANDOVER_ITEM_CHANGED' });

    const wrongRole = await handover({
      fromUserId: controllerA, toUserId: input, reason: 'Người nhận thiếu vai trò kiểm soát.',
      items: [{ findingId: 'find-002', stage: 'BRANCH_CONTROLLER', expectedVersion: version }],
    });
    expect(wrongRole.json()).toMatchObject({ moved: 0, remaining: 1 });
    expect(wrongRole.json().skipped[0]).toMatchObject({ code: 'HANDOVER_RECIPIENT_INELIGIBLE' });

    const same = await handover({
      fromUserId: controllerA, toUserId: controllerA, reason: 'Người nhận trùng người bàn giao.',
      items: [{ findingId: 'find-002', stage: 'BRANCH_CONTROLLER', expectedVersion: version }],
    });
    expect(same.statusCode, same.body).toBe(422);
    expect(same.json()).toMatchObject({ code: 'HANDOVER_SAME_USER' });
  });

  it('bàn giao một lần ghi, ghi lịch sử và đổi đúng người được duyệt', async () => {
    const result = await handover({
      fromUserId: controllerA, toUserId: controllerB, reason: 'Kiểm soát A chuyển công tác.',
      items: [{ findingId: 'find-002', stage: 'BRANCH_CONTROLLER', expectedVersion: version }],
    });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json()).toEqual({ moved: 1, skipped: [], remaining: 0 });

    const detail = (await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders })).json();
    expect(detail.version).toBe(version + 1);
    expect(detail.approvalRoute.branchControllerUserId).toBe(controllerB);
    expect(detail.approvalRoute.assignmentHistory.at(-1)).toMatchObject({
      stage: 'BRANCH_CONTROLLER', previousUserId: controllerA, assignedUserId: controllerB, assignedByUserId: 'user-admin',
    });
    expect(detail.approvalRoute.assignmentHistory.at(-1).reason).toBe('Bàn giao: Kiểm soát A chuyển công tác.');
    expect(detail.history.at(-1)).toMatchObject({ command: 'HANDOVER_APPROVAL', actorUserId: 'user-admin' });
    expect(detail.history.at(-1).notes).toContain('Bàn giao kiểm soát A');

    const audit = await app.inject({ method: 'GET', url: '/api/v1/admin/audit-events', headers: adminHeaders });
    expect(JSON.stringify(audit.json())).toContain('ADMIN_HANDOVER_EXECUTED');
  });

  it('người cũ hết quyền duyệt, người mới duyệt được, chạy lại không làm gì và khóa được tài khoản cũ', async () => {
    const oldApprover = await post('/api/v1/findings/find-002/actions/branch-control-approve', controllerA, 'handover-old', { expectedVersion: version + 1 });
    expect(oldApprover.statusCode, oldApprover.body).toBe(403);
    expect(oldApprover.json()).toMatchObject({ code: 'APPROVER_NOT_ASSIGNED' });

    const retry = await handover({
      fromUserId: controllerA, toUserId: controllerB, reason: 'Gửi lại cùng yêu cầu bàn giao.',
      items: [{ findingId: 'find-002', stage: 'BRANCH_CONTROLLER', expectedVersion: version }],
    });
    expect(retry.json()).toMatchObject({ moved: 0, remaining: 0 });

    const reviewedVersion = await acceptAllSubItems(app, 'find-002', controllerB);
    const newApprover = await post('/api/v1/findings/find-002/actions/branch-control-approve', controllerB, 'handover-new', { expectedVersion: reviewedVersion });
    expect(newApprover.statusCode, newApprover.body).toBe(200);

    const lock = await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${controllerA}`, headers: adminHeaders, payload: { isActive: false } });
    expect(lock.statusCode, lock.body).toBe(200);
  });
});
