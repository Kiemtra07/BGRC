import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };
let createdUsers = 0;

async function createBranchUser(
  role: 'BRANCH_INPUT' | 'BRANCH_CONTROLLER' | 'BRANCH_LEADER',
  branchCode: string,
  fullName: string,
  department = 'Phòng Kiểm soát chi nhánh',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/users',
    headers: adminHeaders,
    payload: {
      fullName,
      email: `choice.${role.toLowerCase()}.${++createdUsers}@bank.com.vn`,
      portal: 'BRANCH',
      roles: [role],
      primaryRole: role,
      branchCode,
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

describe('chọn người nhận ở từng chặng của tuyến duyệt', () => {
  afterAll(async () => {
    await app.close();
  });

  it('chỉ cho chọn người đúng vai trò, đúng chi nhánh và không phải người đang chuyển', async () => {
    const input = await createBranchUser('BRANCH_INPUT', '428', 'Cán bộ nộp 428', 'Phòng QLKH 2');
    const controllerA = await createBranchUser('BRANCH_CONTROLLER', '428', 'Kiểm soát A 428');
    const controllerB = await createBranchUser('BRANCH_CONTROLLER', '428', 'Kiểm soát B 428');

    const current = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders });
    const returned = await post('/api/v1/findings/find-002/actions/branch-control-reject', controllerA, 'choice-return', {
      expectedVersion: current.json().version, reason: 'Trả về để kiểm thử chọn người nhận.',
    });
    expect(returned.statusCode, returned.body).toBe(200);
    const version = returned.json().version as number;

    const options = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002/next-approvers', headers: { 'x-user-id': input } });
    expect(options.statusCode, options.body).toBe(200);
    const listed = options.json();
    expect(listed.stage).toBe('BRANCH_CONTROLLER');
    expect(listed.allowSharedQueue).toBe(false);
    const listedIds = listed.options.map((option: { id: string }) => option.id);
    expect(listedIds).toEqual(expect.arrayContaining([controllerA, controllerB]));
    expect(listedIds).not.toContain(input);
    expect(listedIds).not.toContain('user-branch-controller-635');
    expect(listed.options[0]).not.toHaveProperty('email');

    const wrongBranch = await post('/api/v1/findings/find-002/actions/submit-branch', input, 'choice-submit-wrong-branch', {
      expectedVersion: version,
      resolutionNotes: 'Nộp lại và chọn người kiểm soát của chi nhánh khác.',
      nextApproverUserId: 'user-branch-controller-635',
    });
    expect(wrongBranch.statusCode, wrongBranch.body).toBe(422);
    expect(wrongBranch.json()).toMatchObject({ code: 'APPROVAL_ASSIGNEE_INELIGIBLE' });
    const untouched = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders });
    expect(untouched.json().workflowStatus).toBe('REJECTED');

    const submitted = await post('/api/v1/findings/find-002/actions/submit-branch', input, 'choice-submit-b', {
      expectedVersion: version,
      resolutionNotes: 'Nộp lại và chọn Kiểm soát B làm người nhận.',
      nextApproverUserId: controllerB,
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().approvalRoute.branchControllerUserId).toBe(controllerB);
    const detail = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders });
    expect(detail.json().history.at(-1).notes).toContain('Người nhận: Kiểm soát B 428');

    const notChosen = await post('/api/v1/findings/find-002/actions/branch-control-approve', controllerA, 'choice-approve-a', {
      expectedVersion: submitted.json().version,
    });
    expect(notChosen.statusCode, notChosen.body).toBe(403);
    expect(notChosen.json()).toMatchObject({ code: 'APPROVER_NOT_ASSIGNED' });
  });

  it('Kiểm soát chọn người nhận ở Hội sở và hồ sơ giữ người đã chọn khi nộp lại', async () => {
    const controllerB = (await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders }))
      .json().approvalRoute.branchControllerUserId as string;
    const input = (await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: adminHeaders }))
      .json().find((user: { fullName: string }) => user.fullName === 'Cán bộ nộp 428').id as string;

    const options = await app.inject({ method: 'GET', url: '/api/v1/findings/find-002/next-approvers', headers: { 'x-user-id': controllerB } });
    expect(options.statusCode, options.body).toBe(200);
    expect(options.json()).toMatchObject({ stage: 'INTERNAL_APPROVER', allowSharedQueue: true });
    expect(options.json().options.map((option: { id: string }) => option.id)).toContain('user-internal-supervisor');
    expect(options.json().options.map((option: { id: string }) => option.id)).not.toContain(controllerB);

    const version = (await app.inject({ method: 'GET', url: '/api/v1/findings/find-002', headers: adminHeaders })).json().version as number;
    const ineligible = await post('/api/v1/findings/find-002/actions/branch-control-approve', controllerB, 'choice-hq-ineligible', {
      expectedVersion: version, nextApproverUserId: input,
    });
    expect(ineligible.statusCode, ineligible.body).toBe(422);
    expect(ineligible.json()).toMatchObject({ code: 'APPROVAL_ASSIGNEE_INELIGIBLE' });

    const forwarded = await post('/api/v1/findings/find-002/actions/branch-control-approve', controllerB, 'choice-hq-ok', {
      expectedVersion: version, nextApproverUserId: 'user-internal-supervisor',
    });
    expect(forwarded.statusCode, forwarded.body).toBe(200);
    expect(forwarded.json().workflowStatus).toBe('SUBMITTED_INTERNAL');
    expect(forwarded.json().approvalRoute.internalApproverUserId).toBe('user-internal-supervisor');

    const returned = await post('/api/v1/findings/find-002/actions/internal-reject', 'user-internal-supervisor', 'choice-hq-return', {
      expectedVersion: forwarded.json().version, reason: 'Trả về để kiểm thử việc nộp lại.',
    });
    expect(returned.statusCode, returned.body).toBe(200);

    const resubmitted = await post('/api/v1/findings/find-002/actions/submit-branch', input, 'choice-resubmit', {
      expectedVersion: returned.json().version,
      resolutionNotes: 'Nộp lại không chọn người nhận, giữ người đã chọn.',
    });
    expect(resubmitted.statusCode, resubmitted.body).toBe(200);
    expect(resubmitted.json().approvalRoute).toMatchObject({
      branchControllerUserId: controllerB,
      internalApproverUserId: 'user-internal-supervisor',
    });
  });

  it('không có bước nào để chuyển khi hồ sơ đã ở Hội sở', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/v1/findings/find-003/next-approvers', headers: adminHeaders,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ options: [], allowSharedQueue: false });
  });
});
