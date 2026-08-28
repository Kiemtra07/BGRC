import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { FindingApprovalRouteView } from '../../shared/contracts';

const adminHeaders = { 'x-user-id': 'user-admin' };
const branchHeaders = { 'x-user-id': 'user-branch-635' };

const routeOf = async (findingId: string, headers = adminHeaders): Promise<FindingApprovalRouteView> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/findings/${findingId}/approval-route`, headers });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
};

const controllerHeaders = { 'x-user-id': 'user-branch-controller-635' };
const approverHeaders = { 'x-user-id': 'user-internal-supervisor' };

type ListedFinding = { id: string; workflowStatus: string; branchCode: string; cif: string; isSpecialCase?: boolean };

const versionOf = async (findingId: string): Promise<number> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/findings/${findingId}`, headers: adminHeaders });
  expect(response.statusCode).toBe(200);
  return response.json().version;
};

const act = async (findingId: string, action: string, headers: Record<string, string>, payload: Record<string, unknown>) => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/findings/${findingId}/actions/${action}`,
    headers: { ...headers, 'idempotency-key': `route-test-${findingId}-${action}` },
    payload: { expectedVersion: await versionOf(findingId), ...payload },
  });
  expect(response.statusCode, `${action}: ${response.body}`).toBe(200);
};

const findingsFor = async (headers = adminHeaders, workflowStatus?: string): Promise<ListedFinding[]> => {
  const query = workflowStatus ? `?workflowStatus=${workflowStatus}&limit=100` : '?limit=100';
  const response = await app.inject({ method: 'GET', url: `/api/v1/findings${query}`, headers });
  expect(response.statusCode).toBe(200);
  const body = response.json();
  return (Array.isArray(body) ? body : body.items ?? body.findings) as ListedFinding[];
};

describe('finding approval route view', () => {
  afterAll(async () => {
    await app.close();
  });

  it('describes an ordered route whose steps come from the configured stages', async () => {
    const [finding] = await findingsFor();
    const route = await routeOf(finding.id);

    expect(route.steps.length).toBeGreaterThanOrEqual(2);
    expect(route.steps[0].statusCode).toBe('PENDING');
    expect(route.steps.at(-1)!.statusCode).toBe('SUBMITTED_INTERNAL');
    // Stage names are the administrator's, not a second hard-coded list in the client.
    route.steps.forEach(step => {
      expect(step.stageName.length).toBeGreaterThan(1);
      expect(step.allowedRoles.length).toBeGreaterThan(0);
    });
    expect(route.steps.filter(step => step.state === 'CURRENT').length).toBeLessThanOrEqual(1);
  });

  it('marks exactly the step the finding is waiting at, and the ones already passed', async () => {
    const [waiting] = await findingsFor(adminHeaders, 'SUBMITTED_INTERNAL');
    expect(waiting, 'cần một hồ sơ đang chờ Hội sở trong dữ liệu mẫu').toBeDefined();

    const route = await routeOf(waiting!.id);
    const current = route.steps[route.currentStepIndex];
    expect(current.statusCode).toBe('SUBMITTED_INTERNAL');
    expect(current.state).toBe('CURRENT');
    route.steps.slice(0, route.currentStepIndex).forEach(step => expect(step.state).toBe('DONE'));
    route.steps.slice(route.currentStepIndex + 1).forEach(step => expect(step.state).toBe('UPCOMING'));
  });

  it('reports a closed finding with no waiting step', async () => {
    const [waiting] = await findingsFor(adminHeaders, 'SUBMITTED_INTERNAL');
    expect(waiting, 'cần một hồ sơ đang chờ Hội sở').toBeDefined();
    await act(waiting!.id, 'internal-waive', approverHeaders, { decisionNumber: 'QD-TEST-01' });

    const route = await routeOf(waiting!.id);
    expect(route.isClosed).toBe(true);
    expect(route.currentStepIndex).toBe(-1);
    route.steps.forEach(step => expect(step.state).toBe('DONE'));
  });

  it('puts a returned finding back at the branch and names the stage that returned it', async () => {
    const atControl = (await findingsFor(adminHeaders, 'SUBMITTED_BRANCH')).find(item => item.branchCode === '635');
    expect(atControl, 'cần một hồ sơ đang ở kiểm soát chi nhánh 635').toBeDefined();
    await act(atControl!.id, 'branch-control-reject', controllerHeaders, { reason: 'Thiếu chứng từ giải ngân' });

    const route = await routeOf(atControl!.id);
    expect(route.currentStepIndex).toBe(0);
    expect(route.steps[0].state).toBe('CURRENT');
    expect(route.returnedFromStageName).toBeTruthy();
  });

  it('splices the branch-leader step into a two-tier route only for a starred finding', async () => {
    const all = await findingsFor();
    const editable = all.find(item => item.workflowStatus === 'PENDING' && !item.isSpecialCase);
    expect(editable, 'cần một hồ sơ chưa gửi').toBeDefined();
    const blocking = all.filter(item => item.branchCode === editable!.branchCode
      && item.cif === editable!.cif
      && item.workflowStatus === 'SUBMITTED_BRANCH');
    for (const sibling of blocking) {
      await act(sibling.id, 'branch-control-reject', controllerHeaders, { reason: 'Thiếu chứng từ giải ngân' });
    }

    const before = await routeOf(editable!.id);
    expect(before.steps.some(step => step.statusCode === 'SUBMITTED_BRANCH_LEADER')).toBe(false);

    const flagged = await app.inject({
      method: 'PUT',
      url: `/api/v1/findings/${editable!.id}/special-case`,
      headers: adminHeaders,
      payload: { isSpecialCase: true },
    });
    expect(flagged.statusCode, flagged.body).toBe(200);

    const after = await routeOf(editable!.id);
    const leader = after.steps.find(step => step.statusCode === 'SUBMITTED_BRANCH_LEADER');
    expect(leader, 'dấu sao phải chèn bước Lãnh đạo chi nhánh').toBeDefined();
    // The star-driven step is the one the admin diagram draws as conditional.
    expect(leader!.conditional).toBe(true);
    expect(after.isSpecialCase).toBe(true);
    // It must land before head office, never after it.
    expect(after.steps.findIndex(step => step.statusCode === 'SUBMITTED_BRANCH_LEADER'))
      .toBeLessThan(after.steps.findIndex(step => step.statusCode === 'SUBMITTED_INTERNAL'));

    const cleared = await app.inject({
      method: 'PUT',
      url: `/api/v1/findings/${editable!.id}/special-case`,
      headers: adminHeaders,
      payload: { isSpecialCase: false },
    });
    expect(cleared.statusCode).toBe(200);
    expect((await routeOf(editable!.id)).steps.some(step => step.statusCode === 'SUBMITTED_BRANCH_LEADER')).toBe(false);
  });

  it('refuses a route for a finding outside the caller data scope', async () => {
    const [ownFinding] = await findingsFor(branchHeaders);
    const foreignFinding = (await findingsFor()).find(item => item.branchCode !== ownFinding.branchCode);
    expect(foreignFinding, 'cần một hồ sơ ngoài chi nhánh 635').toBeDefined();

    const own = await app.inject({ method: 'GET', url: `/api/v1/findings/${ownFinding.id}/approval-route`, headers: branchHeaders });
    const foreign = await app.inject({ method: 'GET', url: `/api/v1/findings/${foreignFinding!.id}/approval-route`, headers: branchHeaders });

    expect(own.statusCode).toBe(200);
    expect(foreign.statusCode).toBe(404);
  });
});
