import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { acceptAllSubItems } from './review-helpers';

const admin = { 'x-user-id': 'user-admin' };
const officer = { 'x-user-id': 'user-internal-officer' };
let created = 0;

async function createBranchUser(role: 'BRANCH_INPUT' | 'BRANCH_CONTROLLER' | 'BRANCH_LEADER', fullName: string, department = 'Phòng Kiểm soát chi nhánh'): Promise<string> {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/admin/users', headers: admin,
    payload: {
      fullName, email: `route.select.${++created}@bank.com.vn`, portal: 'BRANCH', roles: [role], primaryRole: role,
      branchCode: '428', branchName: 'Chi nhánh Bình Tây Sài Gòn', department, isActive: true,
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().user.id;
}

async function pendingFindingWithEvidence(inputUserId: string, cif: string): Promise<{ id: string; version: number }> {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/findings', headers: officer,
    payload: {
      channelId: 'chan-audit-bgs', campaignId: 'campaign-regular-2026', cif, customerName: `Khách hàng ${cif}`,
      clusterName: 'Cụm TP. Hồ Chí Minh', branchCode: '428', branchName: 'Chi nhánh Bình Tây Sài Gòn',
      department: 'Phòng QLKH 2', errorGroup: 'TD01', exposureAmount: 0,
      errorCode: 'ROUTE.01', errorTitle: 'Mã lỗi chọn tuyến', description: 'Nội dung sai sót dùng để thử chọn tuyến duyệt.',
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  const finding = response.json();
  const boundary = 'auditbgs-route-selection';
  const upload = await app.inject({
    method: 'POST', url: `/api/v1/findings/${finding.id}/evidence`,
    headers: { 'x-user-id': inputUserId, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.from([`--${boundary}`, 'Content-Disposition: form-data; name="file"; filename="chung-tu.pdf"', 'Content-Type: application/pdf', '', '%PDF-1.7 chung tu', `--${boundary}--`, ''].join('\r\n')),
  });
  expect(upload.statusCode, upload.body).toBe(200);
  return { id: finding.id, version: finding.version };
}

afterAll(async () => {
  await app.close();
});

describe('chọn cả tuyến duyệt khi nộp hồ sơ', () => {
  it('liệt kê từng bước của tuyến với người nhận hợp lệ, chỉ cho người nộp', async () => {
    const input = await createBranchUser('BRANCH_INPUT', 'Cán bộ nộp chọn tuyến', 'Phòng QLKH 2');
    const controllerA = await createBranchUser('BRANCH_CONTROLLER', 'Kiểm soát chọn tuyến A');
    const controllerB = await createBranchUser('BRANCH_CONTROLLER', 'Kiểm soát chọn tuyến B');
    const finding = await pendingFindingWithEvidence(input, 'ROUTE-CIF-001');

    const options = await app.inject({ method: 'GET', url: `/api/v1/findings/${finding.id}/submit-route-options`, headers: { 'x-user-id': input } });
    expect(options.statusCode, options.body).toBe(200);
    const steps = options.json().steps as Array<{ stage: string; stageName: string; options: Array<{ id: string }>; allowSharedQueue: boolean }>;
    expect(steps.map(step => step.stage)).toEqual(['BRANCH_CONTROLLER', 'INTERNAL_APPROVER']);
    expect(steps[0].stageName).toBeTruthy();
    expect(steps[0].options.map(option => option.id)).toEqual(expect.arrayContaining([controllerA, controllerB]));
    expect(steps[0].options.map(option => option.id)).not.toContain(input);
    expect(steps[0].allowSharedQueue).toBe(false);
    expect(steps[1].allowSharedQueue).toBe(true);
    expect((options.json().addableSteps as Array<{ stage: string }>).map(step => step.stage)).toEqual(['BRANCH_LEADER']);
    expect(options.json().addedStages).toEqual([]);

    const outsider = await app.inject({ method: 'GET', url: `/api/v1/findings/${finding.id}/submit-route-options`, headers: officer });
    expect(outsider.statusCode, outsider.body).toBe(200);
    expect(outsider.json()).toEqual({ steps: [], addableSteps: [], addedStages: [] });
  });

  it('ghim người đã chọn ở từng bước và từ chối lựa chọn không hợp lệ', async () => {
    const input = await createBranchUser('BRANCH_INPUT', 'Cán bộ nộp ghim tuyến', 'Phòng QLKH 2');
    const controllerA = await createBranchUser('BRANCH_CONTROLLER', 'Kiểm soát ghim tuyến A');
    const controllerB = await createBranchUser('BRANCH_CONTROLLER', 'Kiểm soát ghim tuyến B');
    const finding = await pendingFindingWithEvidence(input, 'ROUTE-CIF-002');
    const submit = (approverSelections: Record<string, string>, key: string) => app.inject({
      method: 'POST', url: `/api/v1/findings/${finding.id}/actions/submit-branch`,
      headers: { 'x-user-id': input, 'idempotency-key': key },
      payload: { expectedVersion: finding.version, resolutionNotes: 'Đã khắc phục đủ chứng từ.', approverSelections },
    });

    const wrongRole = await submit({ BRANCH_CONTROLLER: 'user-internal-officer' }, 'route-select-wrong-role');
    expect(wrongRole.statusCode, wrongRole.body).toBe(422);
    expect(wrongRole.json()).toMatchObject({ code: 'APPROVAL_ASSIGNEE_INELIGIBLE' });

    const selfAssigned = await submit({ BRANCH_CONTROLLER: input }, 'route-select-self');
    expect(selfAssigned.statusCode, selfAssigned.body).toBe(422);

    const accepted = await submit({ BRANCH_CONTROLLER: controllerB, INTERNAL_APPROVER: 'user-internal-supervisor' }, 'route-select-ok');
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().workflowStatus).toBe('SUBMITTED_BRANCH');
    expect(accepted.json().approvalRoute).toMatchObject({
      branchControllerUserId: controllerB,
      internalApproverUserId: 'user-internal-supervisor',
      assignedByUserId: input,
    });
  });

  it('cho thêm bước Lãnh đạo chi nhánh vào luồng hai cấp và đưa hồ sơ qua bước đó', async () => {
    const input = await createBranchUser('BRANCH_INPUT', 'Cán bộ nộp thêm bước', 'Phòng QLKH 2');
    const controller = await createBranchUser('BRANCH_CONTROLLER', 'Kiểm soát thêm bước');
    const leader = await createBranchUser('BRANCH_LEADER', 'Lãnh đạo thêm bước');
    const finding = await pendingFindingWithEvidence(input, 'ROUTE-CIF-003');

    const submitted = await app.inject({
      method: 'POST', url: `/api/v1/findings/${finding.id}/actions/submit-branch`,
      headers: { 'x-user-id': input, 'idempotency-key': 'route-select-extra-step' },
      payload: {
        expectedVersion: finding.version, resolutionNotes: 'Đã khắc phục đủ chứng từ.',
        approverSelections: { BRANCH_CONTROLLER: controller, BRANCH_LEADER: leader, INTERNAL_APPROVER: 'user-internal-supervisor' },
      },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().approvalRoute).toMatchObject({ branchControllerUserId: controller, branchLeaderUserId: leader, requiresBranchLeaderApproval: true });
    expect(submitted.json().routeWorkflowType).toBe('THREE_TIER');

    const route = await app.inject({ method: 'GET', url: `/api/v1/findings/${finding.id}/approval-route`, headers: { 'x-user-id': input } });
    expect(route.json().steps.map((step: { statusCode: string }) => step.statusCode)).toEqual(['PENDING', 'SUBMITTED_BRANCH', 'SUBMITTED_BRANCH_LEADER', 'SUBMITTED_INTERNAL']);

    const version = await acceptAllSubItems(app, finding.id, controller);
    const forwarded = await app.inject({
      method: 'POST', url: `/api/v1/findings/${finding.id}/actions/branch-control-approve`,
      headers: { 'x-user-id': controller, 'idempotency-key': 'route-select-extra-forward' },
      payload: { expectedVersion: version, notes: 'Chuyển lãnh đạo chi nhánh.' },
    });
    expect(forwarded.statusCode, forwarded.body).toBe(200);
    expect(forwarded.json().workflowStatus).toBe('SUBMITTED_BRANCH_LEADER');
    // Duyệt xong tự chuyển theo tuyến đã chọn lúc nộp, không cần người duyệt chọn lại người nhận.
    expect(forwarded.json().approvalRoute).toMatchObject({ branchLeaderUserId: leader });

    const leaderVersion = await acceptAllSubItems(app, finding.id, leader);
    const upward = await app.inject({
      method: 'POST', url: `/api/v1/findings/${finding.id}/actions/branch-leader-approve`,
      headers: { 'x-user-id': leader, 'idempotency-key': 'route-select-extra-upward' },
      payload: { expectedVersion: leaderVersion, notes: 'Chuyển phê duyệt HT.' },
    });
    expect(upward.statusCode, upward.body).toBe(200);
    expect(upward.json().workflowStatus).toBe('SUBMITTED_INTERNAL');
    expect(upward.json().approvalRoute).toMatchObject({ internalApproverUserId: 'user-internal-supervisor' });
  });
});
