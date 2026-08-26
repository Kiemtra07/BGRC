import { describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('audit campaign APIs', () => {
  it('creates, scopes and filters findings by campaign', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/admin/campaigns', headers: adminHeaders,
      payload: {
        code: 'CD-TD-2026', name: 'Chuyên đề tín dụng 2026', decisionNo: '99/QĐ-KTNB',
        startDate: '2026-08-01', endDate: '2026-09-30', leadUserId: 'user-internal-supervisor',
        members: [
          { userId: 'user-internal-supervisor', memberRole: 'LEAD', assignedBranchCodes: ['635'] },
          { userId: 'user-internal-officer', memberRole: 'MEMBER', assignedBranchCodes: ['635'] },
        ],
        branchCodes: ['635'], reportChannelIds: ['chan-audit-bgs'],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe('DRAFT');

    const officer = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: { 'x-user-id': 'user-internal-officer' } });
    expect(officer.statusCode).toBe(200);
    expect(officer.json().some((item: { id: string }) => item.id === created.json().id)).toBe(true);

    const branchOutside = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: { 'x-user-id': 'user-branch-controller-635' } });
    expect(branchOutside.json().some((item: { id: string }) => item.id === created.json().id)).toBe(true);

    const filtered = await app.inject({ method: 'GET', url: `/api/v1/findings?campaignId=${created.json().id}`, headers: adminHeaders });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items).toHaveLength(0);
  });

  it('rejects invalid membership and non-admin mutation', async () => {
    const payload = {
      code: 'BAD-CD', name: 'Chuyên đề sai', decisionNo: '01/QĐ', startDate: '2026-09-01', endDate: '2026-08-01',
      leadUserId: 'user-internal-supervisor', members: [], branchCodes: ['635'], reportChannelIds: ['chan-audit-bgs'],
    };
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/admin/campaigns', headers: adminHeaders, payload });
    expect(invalid.statusCode).toBe(422);
    const forbidden = await app.inject({ method: 'POST', url: '/api/v1/admin/campaigns', headers: { 'x-user-id': 'user-internal-officer' }, payload: { ...payload, endDate: '2026-10-01' } });
    expect(forbidden.statusCode).toBe(403);
  });

  it('fails closed instead of pretending Drive is ready when Apps Script is not configured', async () => {
    const campaigns = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: adminHeaders });
    const campaign = campaigns.json().find((item: { id: string }) => item.id === 'campaign-regular-2026');
    const provisioned = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/campaigns/${campaign.id}/provision-drive`,
      headers: adminHeaders,
    });

    expect(provisioned.statusCode).toBe(503);
    expect(provisioned.json().code).toBe('DRIVE_NOT_CONFIGURED');
    const refreshed = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: adminHeaders });
    expect(refreshed.json().find((item: { id: string }) => item.id === campaign.id).driveProvisionStatus).toBe('NOT_CONFIGURED');
  });
});
