import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

async function createBranchUser(role: 'BRANCH_INPUT' | 'BRANCH_CONTROLLER', branchCode: string, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/users',
    headers: adminHeaders,
    payload: {
      fullName: `${role} ${branchCode}`,
      email,
      portal: 'BRANCH',
      roles: [role],
      primaryRole: role,
      branchCode,
      branchName: 'Chi nhánh Bình Tây Sài Gòn',
      department: 'Phòng Kiểm soát chi nhánh',
      isActive: true,
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().user.id;
}

describe('automatic approval routing + special-case flag', () => {
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

  it('locks the special-case flag once the finding has left the branch', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/findings/find-002/special-case',
      headers: adminHeaders,
      payload: { isSpecialCase: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'SPECIAL_CASE_LOCKED_AFTER_SUBMISSION' });
  });

  it('applies the star to the whole customer and automatically follows that customer', async () => {
    const base = {
      channelId: 'chan-audit-bgs', campaignId: 'campaign-regular-2026',
      cif: 'STAR-CUSTOMER-001', customerName: 'Khách hàng đánh dấu toàn hồ sơ',
      clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
      department: 'Phòng QLKH 1', errorGroup: 'TD01', exposureAmount: 0,
    };
    const first = await app.inject({ method: 'POST', url: '/api/v1/findings', headers: { 'x-user-id': 'user-internal-officer' }, payload: { ...base, errorCode: 'STAR.01', errorTitle: 'Mã lỗi thứ nhất', description: 'Nội dung sai sót thứ nhất đủ độ dài.' } });
    const second = await app.inject({ method: 'POST', url: '/api/v1/findings', headers: { 'x-user-id': 'user-internal-officer' }, payload: { ...base, errorCode: 'STAR.02', errorTitle: 'Mã lỗi thứ hai', description: 'Nội dung sai sót thứ hai đủ độ dài.' } });
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);

    const flagged = await app.inject({ method: 'PUT', url: `/api/v1/findings/${first.json().id}/special-case`, headers: { 'x-user-id': 'user-internal-officer' }, payload: { isSpecialCase: true } });
    expect(flagged.statusCode, flagged.body).toBe(200);

    const customer = await app.inject({ method: 'GET', url: `/api/v1/customers/${base.cif}/case?branchCode=635`, headers: { 'x-user-id': 'user-internal-officer' } });
    expect(customer.statusCode, customer.body).toBe(200);
    expect(customer.json().findings).toHaveLength(2);
    expect(customer.json().findings.every((item: { isSpecialCase?: boolean }) => item.isSpecialCase)).toBe(true);

    const work = await app.inject({ method: 'GET', url: '/api/v1/workspace/my-work', headers: { 'x-user-id': 'user-internal-officer' } });
    expect(work.json().watchTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetType: 'CUSTOMER', branchCode: '635', cif: base.cif }),
    ]));
  });

  it('star ON inserts a mandatory Lãnh đạo chi nhánh approval step before Hội sở; star OFF skips it', async () => {
    const branchInput = await createBranchUser('BRANCH_INPUT', '428', 'route.input.428@bank.com.vn');
    const branchController = await createBranchUser('BRANCH_CONTROLLER', '428', 'route.controller.428@bank.com.vn');

    // find-002 is SUBMITTED_BRANCH v2 with an available evidence. Return it so the branch can re-drive it.
    const returned = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-reject',
      headers: { 'x-user-id': branchController, 'idempotency-key': 'route-return-1' },
      payload: { expectedVersion: 2, reason: 'Trả để kiểm thử tuyến duyệt tự động.' },
    });
    expect(returned.statusCode, returned.body).toBe(200);
    let version = returned.json().version as number;

    // --- No star: Chi nhánh -> Kiểm soát CN -> Hội sở (bỏ qua Lãnh đạo CN) ---
    const submitPlain = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/submit-branch',
      headers: { 'x-user-id': branchInput, 'idempotency-key': 'route-submit-plain' },
      payload: { expectedVersion: version, resolutionNotes: 'Nộp lại không đánh dấu trường hợp đặc biệt.' },
    });
    expect(submitPlain.statusCode, submitPlain.body).toBe(200);
    expect(submitPlain.json().approvalRoute).toMatchObject({ requiresBranchLeaderApproval: false });
    version = submitPlain.json().version;

    const approvePlain = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-approve',
      headers: { 'x-user-id': branchController, 'idempotency-key': 'route-approve-plain' },
      payload: { expectedVersion: version, notes: 'Kiểm soát chi nhánh chuyển thẳng Hội sở.' },
    });
    expect(approvePlain.statusCode, approvePlain.body).toBe(200);
    expect(approvePlain.json().workflowStatus).toBe('SUBMITTED_INTERNAL');
    version = approvePlain.json().version;

    // Send it back to the branch to run the starred path.
    const returnAgain = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/internal-reject',
      headers: { 'x-user-id': 'user-internal-supervisor', 'idempotency-key': 'route-internal-return' },
      payload: { expectedVersion: version, reason: 'Trả để kiểm thử nhánh có dấu sao.' },
    });
    expect(returnAgain.statusCode, returnAgain.body).toBe(200);
    version = returnAgain.json().version;

    // --- Star ON: Chi nhánh -> Kiểm soát CN -> Lãnh đạo CN (bắt buộc) -> Hội sở ---
    const flag = await app.inject({
      method: 'PUT',
      url: '/api/v1/findings/find-002/special-case',
      headers: { 'x-user-id': branchInput },
      payload: { isSpecialCase: true },
    });
    expect(flag.statusCode, flag.body).toBe(200);
    expect(flag.json().isSpecialCase).toBe(true);
    expect(flag.json().history.at(-1)).toMatchObject({ command: 'SET_SPECIAL_CASE' });
    version = flag.json().version;

    const submitStar = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/submit-branch',
      headers: { 'x-user-id': branchInput, 'idempotency-key': 'route-submit-star' },
      payload: { expectedVersion: version, resolutionNotes: 'Nộp lại với dấu sao trường hợp đặc biệt.' },
    });
    expect(submitStar.statusCode, submitStar.body).toBe(200);
    expect(submitStar.json().approvalRoute).toMatchObject({ requiresBranchLeaderApproval: true });
    version = submitStar.json().version;

    const approveStar = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-approve',
      headers: { 'x-user-id': branchController, 'idempotency-key': 'route-approve-star' },
      payload: { expectedVersion: version, notes: 'Kiểm soát chi nhánh chuyển Lãnh đạo chi nhánh.' },
    });
    expect(approveStar.statusCode, approveStar.body).toBe(200);
    expect(approveStar.json().workflowStatus).toBe('SUBMITTED_BRANCH_LEADER');
  });
});
